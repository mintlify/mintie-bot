import { WebClient } from "@slack/web-api";
import {
  DocsLink,
  EventType,
  ParseStreamingRequest,
  ParseStreamingResult,
  ChannelMentionEvent,
} from "../types";
import { logEvent } from "./logging";
import db from "../database/db";

export function parseStreamingResponse(
  request: ParseStreamingRequest,
): ParseStreamingResult {
  let fullMessage = "";
  let sources: DocsLink[] = [];

  try {
    const jsonResponse = JSON.parse(request.streamData);
    if (jsonResponse.message) {
      fullMessage = jsonResponse.message;
    } else if (jsonResponse.content) {
      fullMessage = jsonResponse.content;
    } else if (typeof jsonResponse === "string") {
      fullMessage = jsonResponse;
    }

    if (jsonResponse.sources) {
      sources = jsonResponse.sources;
    }
  } catch {
    const lines = request.streamData.split("\n").filter((line) => line.trim());

    const messageBlocks: string[][] = [];
    let currentBlock: string[] = [];

    for (const line of lines) {
      if (line.match(/^f:\{"messageId":/)) {
        if (currentBlock.length > 0) {
          messageBlocks.push(currentBlock);
        }
        currentBlock = [line];
      } else {
        currentBlock.push(line);
      }
    }

    if (currentBlock.length > 0) {
      messageBlocks.push(currentBlock);
    }

    const finalBlock = messageBlocks[messageBlocks.length - 1] || [];

    for (const line of finalBlock) {
      try {
        if (line.match(/^\d+:\[/)) {
          const jsonMatch = line.match(/^\d+:\[(.+)\]$/);
          if (jsonMatch) {
            let jsonString = jsonMatch[1];

            if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
              jsonString = jsonString
                .slice(1, -1)
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");
            }

            const parsed = JSON.parse(jsonString);

            if (parsed.type === "text-delta" && parsed.textDelta) {
              fullMessage += parsed.textDelta;
            } else if (parsed.type === "sources" && parsed.sources) {
              sources = parsed.sources;
            }
          }
        } else if (line.match(/^0:"/)) {
          const textMatch = line.match(/^0:"(.*)"/);
          if (textMatch) {
            fullMessage += textMatch[1];
          }
        }
      } catch (parseError) {
        logEvent({
          text: `Error parsing streaming response: ${parseError}`,
          eventType: EventType.APP_ERROR,
        });
      }
    }
  }

  if (!fullMessage.trim()) {
    fullMessage = request.streamData;
  }

  const cleanResponse = fullMessage
    .trim()
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(
      /(^|\n)~~~\s*(\w+)?\s*\n/g,
      (_match, p1, lang) => `${p1}\`\`\`${lang ? lang : ""}\n`,
    )
    .replace(/(^|\n)~~~\s*(?=\n|$)/g, `$1\`\`\`\n`)
    .replace(/~~~+/g, "```")
    .replace(
      /```([^`]*)\[([^\]]+)\]\(([^)]+)\)([^`]*)```/g,
      (match, before, text, url, after) => {
        return `\`\`\`${before}${text}${after}\`\`\``;
      },
    );

  const finalResponse = cleanResponse
    .replace(/\[([^\]]+)\]\(\/([^)]+)\)/g, (_, text, path) => {
      const effectiveBaseUrl = request.baseUrl || "https://mintlify.com/docs/";
      const normalizedBaseUrl = effectiveBaseUrl.endsWith("/")
        ? effectiveBaseUrl
        : effectiveBaseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    })
    .replace(/\(([^)]+)\)\[\/([^\]]+)\]/g, (_, text, path) => {
      const effectiveBaseUrl = request.baseUrl || "https://mintlify.com/docs/";
      const normalizedBaseUrl = effectiveBaseUrl.endsWith("/")
        ? effectiveBaseUrl
        : effectiveBaseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    })
    .replace(/\(([^)]+)\)\[([^\]]+)\]/g, (_, text, path) => {
      const effectiveBaseUrl = request.baseUrl || "https://mintlify.com/docs/";
      const normalizedBaseUrl = effectiveBaseUrl.endsWith("/")
        ? effectiveBaseUrl
        : effectiveBaseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    });

  return {
    content:
      finalResponse || "Sorry, I couldn't process the response properly.",
    sources,
  };
}

export async function createInitialMessage(
  slackClient: WebClient,
  channel: string,
  threadTs?: string,
): Promise<string> {
  const result = await slackClient.chat.postMessage({
    channel,
    text: "Thinking.",
    thread_ts: threadTs,
    unfurl_links: false,
    unfurl_media: false,
  });

  return result.ts as string;
}

export function generateFingerprint(
  channel: string,
  threadTs?: string,
): string {
  const base = `${channel}-${threadTs || "main"}`;
  const timestamp = Date.now();
  return `${base}-${timestamp}`;
}

export async function getChannelName(
  client: WebClient,
  event: ChannelMentionEvent,
) {
  if (event.subtype || event.bot_id) {
    return null;
  }

  const channelInfo = await client.conversations.info({
    channel: event.channel,
  });

  return channelInfo.channel?.name;
}

export async function fetchThreadHistory(
  client: WebClient,
  channel: string,
  threadTs: string,
): Promise<string> {
  try {
    const threadHistory = await client.conversations.replies({
      channel: channel,
      ts: threadTs,
      limit: 50,
    });

    if (threadHistory.messages && threadHistory.messages.length > 1) {
      const contextMessages = threadHistory.messages
        .slice(0, -1)
        .map((msg: { bot_id?: string; subtype?: string; text?: string }) => {
          const sender =
            msg.bot_id || msg.subtype === "bot_message" ? "Assistant" : "User";
          const content = msg.text || "";
          return `${sender}: ${content}`;
        })
        .join("\n");

      return `Previous conversation context:\n${contextMessages}`;
    }
  } catch (error) {
    logEvent({
      event: error,
      eventType: EventType.APP_ERROR,
    });
  }

  return "";
}

export const constructDocumentationURL = async (
  subdomain: string,
): Promise<string> => {
  const dbInstance = await db.getDB();

  const deployment = await dbInstance?.collection("deployments").findOne({
    subdomain: subdomain,
  });

  if (deployment) {
    if (deployment.customDomains && deployment.customDomains.length > 0) {
      return `https://${deployment.customDomains[0]}${
        deployment.basePath || ""
      }`;
    } else {
      return `https://${subdomain}.mintlify.app${deployment.basePath || ""}`;
    }
  } else {
    throw new Error("Docs deployment not found");
  }
};
