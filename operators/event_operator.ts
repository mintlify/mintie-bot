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

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "slack_webapi_platform_error" && "data" in error) {
        const slackError = error.data as { error?: string };
        if (slackError?.error === "not_in_channel") {
          logEvent({
            text: `Bot not in channel ${channel}. Please add the bot to the channel.`,
            eventType: EventType.APP_ERROR,
          });
          return;
        }
      }
    }

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
  const requestBody = JSON.stringify(apiRequest);

  logEvent({
    text: `API Request - Subdomain: ${
      mintlifyConfig.subdomain
    }, API Key present: ${!!mintlifyConfig.encryptedApiKey}, API Key length: ${
      mintlifyConfig.encryptedApiKey?.length || 0
    }`,
    eventType: EventType.APP_DEBUG,
  });

  let responseText =
    "Please try again, there was an error processing your request.";

  try {
    const baseUrl = process.env.BASE_URL || "https://leaves.mintlify.com";
    const res = await fetch(
      `${baseUrl}/api/discovery/v1/assistant/${mintlifyConfig.subdomain}/message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${mintlifyConfig.encryptedApiKey}`,
          "User-Agent": "Mintlify-Slack-Bot/1.0",
        },
        body: requestBody,
      },
    );

    const responseBody = await res.text();

    if (!res.ok) {
      logEvent({
        text: `API Error: ${responseBody}`,
        eventType: EventType.APP_GENERATE_MESSAGE_ERROR,
      });
    }

    responseText = responseBody;
  } catch (error) {
    console.error(error);
  }

  if (responseText) {
    await statusManager.finalUpdate(responseText);
  }
}

export { processMessage };
