import { WebClient } from "@slack/web-api";
import { envVars } from "../types";

export function validateEnvironment(): envVars {
  const requiredVars: (keyof envVars)[] = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
    "SLACK_APP_TOKEN",
    "MINTLIFY_AUTH_TOKEN",
    "MINTLIFY_DOCS_DOMAIN",
  ];

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

// Got this function fromhttps://github.com/AnandChowdhary/mintlify-slack-assistant
export function formatMarkdownForSlack(content: string): string {
  let text = content;

  text = text
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*");

  text = text.replace(/^#{1,6} (.+)$/gm, "*$1*");

  text = text
    .replace(/^[\*\-] (.+)$/gm, "• $1")
    .replace(/^\d+\. (.+)$/gm, "• $1");

  text = text
    .replace(/(?<!^)\*([^*\n]+)\*/g, "_$1_")
    .replace(/(?<!^)_([^_\n]+)_/g, "_$1_")
    .replace(/~~(.+?)~~/g, "~$1~")
    .replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```(\w+)?\n?/g, "```");
    })
    .replace(/`(.+?)`/g, "`$1`")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    .replace(/\(([^)]+)\)\[([^\]]+)\]/g, "<$2|$1>")
    .replace(/^> (.+)$/gm, "> $1")
    .replace(/\n\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([.!?])\n([A-Z])/g, "$1\n\n$2");

  return text.trim();
}

export function extractUserMessage(text: string): string {
  const botMentionPattern = /<@[UW][A-Z0-9]+>/g;
  return text.replace(botMentionPattern, "").trim();
}

export function parseStreamingResponse(streamData: string): string {
  const lines = streamData.split("\n").filter((line) => line.trim());
  let fullMessage = "";

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
    .replace(/(\w)\.(\w)/g, "$1. $2")
    .replace(/(\w)\?(\w)/g, "$1? $2")
    .replace(/(\w)!(\w)/g, "$1! $2")
    .replace(/\n\n+/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n +/g, "\n")
    .replace(/ +\n/g, "\n")
    .replace(/([.!?])([A-Z])/g, "$1 $2");

  return cleanResponse || "Sorry, I couldn't process the response properly.";
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
  private threadTs?: string;
  public channel: string;
  public messageTs: string;

  constructor(
    slackClient: WebClient,
    channel: string,
    messageTs: string,
    threadTs?: string,
  ) {
    this.slackClient = slackClient;
    this.channel = channel;
    this.messageTs = messageTs;
    this.threadTs = threadTs;
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
    const parsedContent = parseStreamingResponse(content);
    const formattedContent = formatMarkdownForSlack(parsedContent);

    await this.slackClient.chat.update({
      channel: this.channel,
      ts: this.messageTs,
      text: formattedContent,
    });
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
