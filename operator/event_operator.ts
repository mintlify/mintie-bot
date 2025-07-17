import { WebClient } from "@slack/web-api";
import { createInitialMessage, generateFingerprint } from "../utils/utils";
import { StatusManager } from "../utils/status_manager";
import { MintlifyApiRequest } from "../types";
import { EventType, logEvent } from "../utils/logging";
import { getEnvs } from "../env_manager";

async function processMessage(
  client: WebClient,
  userMessage: string,
  channel: string,
  threadTs?: string,
  originalMessageTs?: string,
): Promise<void> {
  let statusManager: StatusManager | null = null;

  try {
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
      getEnvs().MINTLIFY_DOCS_DOMAIN_URL,
    );

    statusManager.start();

    await generateResponse(apiRequest, statusManager);
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
): Promise<void> {
  const response = await createMessage(apiRequest);

  if (response) {
    await statusManager.finalUpdate(response);
  }
}

async function createMessage(apiRequest: MintlifyApiRequest): Promise<string> {
  const requestBody = JSON.stringify(apiRequest);

  const response = await fetch(
    `https://api-dsc.mintlify.com/v1/assistant/${
      getEnvs().MINTLIFY_DOCS_DOMAIN
    }/message`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${getEnvs().MINTLIFY_AUTH_TOKEN}`,
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
