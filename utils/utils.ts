import { WebClient } from "@slack/web-api";
import { envVars, DocsLink } from "../types";

export function validateEnvironment(): envVars {
  const requiredVars: (keyof envVars)[] = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
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

  for (const line of lines) {
    try {
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
    .replace(/```[^`]*\[([^\]]+)\]\(([^)]+)\)[^`]*```/g, (match, text, url) => {
      const content = match.replace(/```[^\n]*\n?/g, "").replace(/\n?```/g, "");
      return content;
    });

  const finalResponse = cleanResponse
    .replace(/\[([^\]]+)\]\(\/([^)]+)\)/g, (match, text, path) => {
      const baseUrl =
        process.env.MINTLIFY_DOCS_DOMAIN_URL || "https://mintlify.com/docs/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    })
    .replace(/\(([^)]+)\)\[\/([^\]]+)\]/g, (match, text, path) => {
      const baseUrl =
        process.env.MINTLIFY_DOCS_DOMAIN_URL || "https://mintlify.com/docs/";
      const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
      const fullUrl = normalizedBaseUrl + path.replace(/^\//, "");
      return `[${text}](${fullUrl})`;
    })
    .replace(/\(([^)]+)\)\[([^\]]+)\]/g, (match, text, path) => {
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

export class StatusManager {
  private statuses = [
    "🤔 Thinking...",
    "🔍 Searching...",
    "💡 Discovering...",
    "✍️ Writing...",
  ];
  private currentIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private slackClient: WebClient;
  public channel: string;
  public messageTs: string;
  private docsDomainURL?: string;
  constructor(
    slackClient: WebClient,
    channel: string,
    messageTs: string,
    docsDomainURL?: string,
  ) {
    this.slackClient = slackClient;
    this.channel = channel;
    this.messageTs = messageTs;
    this.docsDomainURL = docsDomainURL;
  }

  start(): void {
    this.interval = setInterval(() => {
      this.updateStatus();
    }, 2500);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async updateStatus(): Promise<void> {
    this.currentIndex = (this.currentIndex + 1) % this.statuses.length;

    await this.slackClient.chat.update({
      channel: this.channel,
      ts: this.messageTs,
      text: this.statuses[this.currentIndex],
    });
  }

  async finalUpdate(content: string): Promise<void> {
    this.stop();
    const { content: parsedContent, sources } = parseStreamingResponse(content);

    if (parsedContent.length > 3000) {
      const splitPoint = this.findSafeSplitPoint(parsedContent);
      const firstPart = parsedContent.substring(0, splitPoint).trim();
      const secondPart = parsedContent.substring(splitPoint).trim();

      const firstBlocks = [
        {
          type: "markdown",
          text: firstPart,
        },
      ];

      await this.slackClient.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: firstPart,
        blocks: firstBlocks,
      });

      const secondBlocks = this.buildSecondMessageBlocks(secondPart, sources);
      await this.slackClient.chat.postMessage({
        channel: this.channel,
        thread_ts: this.messageTs,
        text: secondPart,
        blocks: secondBlocks,
      });
    } else {
      const blocks = this.buildMessageBlocks(parsedContent, sources);
      await this.slackClient.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: parsedContent,
        blocks: blocks,
      });
    }
  }

  private findSafeSplitPoint(content: string): number {
    const midPoint = Math.floor(content.length / 2);

    for (let i = midPoint; i < content.length && i < midPoint + 200; i++) {
      if (content[i] === "\n" && content[i + 1] === "\n") {
        return i + 2;
      }
    }

    for (let i = midPoint; i > 0 && i > midPoint - 200; i--) {
      if (content[i] === "\n" && content[i + 1] === "\n") {
        return i + 2;
      }
    }

    return content.lastIndexOf(" ", midPoint) + 1;
  }

  private buildSecondMessageBlocks(
    content: string,
    sources: DocsLink[],
  ): any[] {
    const blocks: any[] = [];

    blocks.push({
      type: "markdown",
      text: content,
    });

    if (sources && sources.length > 0) {
      blocks.push({
        type: "divider",
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: this.formatSourcesForBlocks(sources),
        },
      });
    }

    return blocks;
  }

  private buildMessageBlocks(content: string, sources: DocsLink[]): any[] {
    const blocks: any[] = [];

    blocks.push({
      type: "markdown",
      text: content,
    });

    if (sources && sources.length > 0) {
      blocks.push({
        type: "divider",
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: this.formatSourcesForBlocks(sources),
        },
      });
    }

    return blocks;
  }

  private formatSourcesForBlocks(sources: DocsLink[]): string {
    const baseUrl = this.docsDomainURL || "https://mintlify.com/docs/";

    const links = sources.map((source, idx) => {
      let url: string;

      if (
        source.link.startsWith("</") &&
        source.link.includes("|") &&
        source.link.endsWith(">")
      ) {
        const match = source.link.match(/<\/([^|]+)\|([^>]+)>/);
        if (match) {
          const [, rawPath] = match;
          const path = rawPath.replace(/^\//, "");
          url = baseUrl.endsWith("/") ? baseUrl + path : baseUrl + "/" + path;
        } else {
          url = source.link;
        }
      } else {
        url = source.link.startsWith("http")
          ? source.link
          : baseUrl + source.link.replace(/^\//, "");
      }

      return `<${url}|${idx + 1}>`;
    });

    return `*Sources:* ${links.join(" • ")}`;
  }
}

export async function createInitialMessage(
  slackClient: WebClient,
  channel: string,
  threadTs?: string,
): Promise<string> {
  const result = await slackClient.chat.postMessage({
    channel,
    text: "🤔 Thinking...",
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
