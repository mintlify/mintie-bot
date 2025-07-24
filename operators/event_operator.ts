import { WebClient } from "@slack/web-api";
import { createInitialMessage, generateFingerprint } from "../utils/utils";
import { StatusManager } from "../utils/status_manager";
import { EventType, MintlifyApiRequest, MintlifyConfig } from "../types";
import { logEvent } from "../utils/logging";
import dbQuery from "../database/get_user";
import { constructDocumentationURL } from "../utils/utils";

async function processMessage(
  client: WebClient,
  userMessage: string,
  channel: string,
  threadTs?: string,
  originalMessageTs?: string,
): Promise<void> {
  let statusManager: StatusManager | null = null;

  try {
    const authTest = await client.auth.test();
    const teamId = authTest.team_id || "";

    const teamData = await dbQuery.findUser(teamId);
    const mintlifyConfig = teamData as MintlifyConfig;

    const documentationURL = await constructDocumentationURL(
      mintlifyConfig.subdomain,
    );

    const fingerprint = generateFingerprint(channel, threadTs);
    const apiRequest = formatApiRequest(userMessage, fingerprint);

    const effectiveThreadTs = threadTs || originalMessageTs;
    const messageTs = await createInitialMessage(
      client,
      channel,
      effectiveThreadTs,
    );

    statusManager = new StatusManager(
      client,
      channel,
      messageTs,
      documentationURL,
    );

    statusManager.start();

    await generateResponse(apiRequest, statusManager, mintlifyConfig);
  } catch (error) {
    if (statusManager) {
      statusManager.stop();
    }

    logEvent({
      text: `Error processing message: ${error}`,
      eventType: EventType.APP_ERROR,
    });

    // Handle specific Slack API errors
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'slack_webapi_platform_error' && 'data' in error) {
        const slackError = error.data as any;
        if (slackError?.error === 'not_in_channel') {
          logEvent({
            text: `Bot not in channel ${channel}. Please add the bot to the channel.`,
            eventType: EventType.APP_ERROR,
          });
          return; // Don't crash, just return
        }
      }
    }

    // Only try to send error message if we have a valid channel and messageTs
    if (channel && statusManager?.messageTs) {
      try {
        await client.chat.postMessage({
          channel,
          text: "Sorry, I encountered an error while processing your request.",
          thread_ts: statusManager.messageTs,
        });
      } catch (postError) {
        logEvent({
          text: `Failed to post error message: ${postError}`,
          eventType: EventType.APP_ERROR,
        });
      }
    }
  }
}

function formatApiRequest(
  userMessage: string,
  fingerprint: string,
): MintlifyApiRequest {
  const messageId = `msg-${Date.now()}`;

  return {
    fp: fingerprint,
    messages: [
      {
        id: messageId,
        role: "user",
        content: userMessage,
        parts: [
          {
            type: "text",
            text: userMessage,
          },
        ],
      },
    ],
    slackAgent: true,
  };
}

async function generateResponse(
  apiRequest: MintlifyApiRequest,
  statusManager: StatusManager,
  mintlifyConfig: MintlifyConfig,
): Promise<void> {
  const response = await createMessage(apiRequest, mintlifyConfig);

  if (response) {
    await statusManager.finalUpdate(response);
  }
}

async function createMessage(
  apiRequest: MintlifyApiRequest,
  mintlifyConfig: MintlifyConfig,
): Promise<string> {
  const requestBody = JSON.stringify(apiRequest);

  logEvent({
    text: `API Request - Subdomain: ${
      mintlifyConfig.subdomain
    }, API Key present: ${!!mintlifyConfig.apiKey}, API Key length: ${
      mintlifyConfig.apiKey?.length || 0
    }`,
    eventType: EventType.APP_DEBUG,
  });

  const response = await fetch(
    `https://leaves.mintlify.com/api/discovery/v1/assistant/${mintlifyConfig.subdomain}/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${mintlifyConfig.apiKey}`,
        "User-Agent": "Mintlify-Slack-Bot/1.0",
      },
      body: requestBody,
    },
  )
    .then(async (res) => {
      if (!res.ok) {
        const errorText = await res.text();
        logEvent({
          text: `API Error: ${errorText}`,
          eventType: EventType.APP_GENERATE_MESSAGE_ERROR,
        });
        return errorText;
      }
      const responseText = await res.text();
      
      // Log the raw response for debugging
      console.log("=== RAW FETCH RESPONSE ===");
      console.log("Response length:", responseText.length);
      console.log("Response content:", responseText);
      console.log("=== END RAW RESPONSE ===");
      
      logEvent({
        text: `Raw API Response: ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`,
        eventType: EventType.APP_DEBUG,
      });
      
      return responseText;
    })
    .catch((err) => {
      throw new Error(`Failed to call Mintlify API: ${err.message}`);
    });

  return response;
}

export { processMessage };
