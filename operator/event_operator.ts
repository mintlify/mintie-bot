import { WebClient } from "@slack/web-api";
import { createInitialMessage, generateFingerprint } from "../utils/utils";
import { StatusManager } from "../utils/status_manager";
import { EventType, MintlifyApiRequest, MintlifyConfig } from "../types";
import { logEvent } from "../utils/logging";
import dbQuery from "../database/get_user";

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
    const mintlifyConfig = teamData?.mintlify as MintlifyConfig;

    if (!mintlifyConfig?.isConfigured) {
      await client.chat.postMessage({
        channel,
        text: "Hi! I'm Mintie, your AI documentation assistant. To get started, please complete your setup by clicking the `Add API Key` button that was sent when you installed the app.",
        thread_ts: threadTs || originalMessageTs,
      });
      return;
    }

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
      mintlifyConfig.url,
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

    const errorThreadTs = statusManager?.messageTs;

    await client.chat.postMessage({
      channel,
      text: "Sorry, I encountered an error while processing your request.",
      thread_ts: errorThreadTs,
    });
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

  const response = await fetch(
    `https://api-dsc.mintlify.com/v1/assistant/${mintlifyConfig.domain}/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${mintlifyConfig.authKey}`,
        "User-Agent": "Mintlify-Slack-Bot/1.0",
      },
      body: requestBody,
    },
  )
    .then(async (res) => {
      if (!res.ok) {
        const errorText = await res.text();
        logEvent({
          event: errorText,
          eventType: EventType.APP_GENERATE_MESSAGE_ERROR,
        });
        return errorText;
      }
      return res.text();
    })
    .catch((err) => {
      throw new Error(`Failed to call Mintlify API: ${err.message}`);
    });

  return response;
}

export { processMessage };
