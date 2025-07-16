import { WebClient } from "@slack/web-api";
import { envVars, DocsLink } from "../types";

export function validateEnvironment(): envVars {
  const requiredVars: (keyof envVars)[] = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
    "SLACK_APP_TOKEN",
    "MINTLIFY_AUTH_TOKEN",
    "MINTLIFY_DOCS_DOMAIN",
  ];

  const optionalVars: (keyof envVars)[] = ["MINTLIFY_DOCS_DOMAIN_URL", "PORT"];

  const missing: string[] = [];
  const config: Partial<envVars> = {};

  for (const varName of requiredVars) {
    const value = process.env[varName];

    if (!value || value.trim() === "") {
      missing.push(varName);
    } else {
      config[varName] = value;
    }
  }

  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value && value.trim() !== "") {
      config[varName] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Please ensure all required environment variables are set in your .env file.",
    );
  }

  return {
    ...(config as envVars),
  };
}

export function extractUserMessage(text: string): string {
  const botMentionPattern = /<@[UW][A-Z0-9]+>/g;
  return text.replace(botMentionPattern, "").trim();
}

export function parseStreamingResponse(streamData: string): {
  content: string;
  sources: DocsLink[];
} {
  const lines = streamData.split("\n").filter((line) => line.trim());
  let fullMessage = "";
  let sources: DocsLink[] = [];
  let lastToolResultIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      if (line.match(/^\d+:\[.*"type":"tool-result"/)) {
        lastToolResultIndex = i;
        continue;
      }

      if (line.match(/^\d+:\[/)) {
        const jsonMatch = line.match(/^\d+:\["(.*)"\]$/);
        if (jsonMatch) {
          const jsonString = jsonMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");

          const parsed = JSON.parse(jsonString);

          if (parsed.type === "text-delta" && parsed.textDelta) {
            fullMessage += parsed.textDelta;
          } else if (parsed.type === "sources" && parsed.sources) {
            sources = parsed.sources;
          }
        }
      } else if (line.match(/^0:"/)) {
        if (!fullMessage.trim()) {
          const textMatch = line.match(/^0:"(.*)"/);
          if (textMatch) {
            fullMessage = textMatch[1];
          }
        }
      }
    } catch (parseError) {
      console.debug("Skipping unparseable line:", line);
    }
  }

  if (lastToolResultIndex >= 0) {
    let postToolContent = "";
    for (let i = lastToolResultIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      try {
        if (line.match(/^\d+:\[/)) {
          const jsonMatch = line.match(/^\d+:\["(.*)"\]$/);
          if (jsonMatch) {
            const jsonString = jsonMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, "\\");

            const parsed = JSON.parse(jsonString);

            if (parsed.type === "text-delta" && parsed.textDelta) {
              postToolContent += parsed.textDelta;
            }
          }
        }
      } catch (parseError) {
        console.debug("Skipping unparseable line:", line);
      }
    }
    fullMessage = postToolContent;
  }

  const cleanResponse = fullMessage
    .trim()
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(
      /(^|\n)~~~\s*(\w+)?\s*\n/g,
      (match, p1, lang) => `${p1}\`\`\`${lang ? lang : ""}\n`,
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
      const baseUrl =
        process.env.MINTLIFY_DOCS_DOMAIN_URL || "https://mintlify.com/docs/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    })
    .replace(/\(([^)]+)\)\[\/([^\]]+)\]/g, (_, text, path) => {
      const baseUrl =
        process.env.MINTLIFY_DOCS_DOMAIN_URL || "https://mintlify.com/docs/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    })
    .replace(/\(([^)]+)\)\[([^\]]+)\]/g, (_, text, path) => {
      const baseUrl =
        process.env.MINTLIFY_DOCS_DOMAIN_URL || "https://mintlify.com/docs/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
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
        .map((msg: any) => {
          const sender =
            msg.bot_id || msg.subtype === "bot_message" ? "Assistant" : "User";
          const content = msg.text || "";
          return `${sender}: ${content}`;
        })
        .join("\n");

      return `Previous conversation context:\n${contextMessages}`;
    }
  } catch (error) {
    console.warn("Failed to fetch thread history:", error);
  }

  return "";
}
