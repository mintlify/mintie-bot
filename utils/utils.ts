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

export function formatMarkdownForSlack(content: string): string {
  let text = content;

  // First handle bold text (including at start of lines)
  text = text
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/__([^_]+)__/g, "*$1*");

  // Then convert headers
  text = text.replace(/^#{1,6} (.+)$/gm, "*$1*");

  // Convert lists - must be done before converting remaining single asterisks
  text = text
    .replace(/^[\*\-] (.+)$/gm, "• $1")
    .replace(/^\d+\. (.+)$/gm, "• $1");

  // Convert the rest
  text = text
    // Italic (only for single asterisks/underscores not at start of line)
    .replace(/(?<!^)\*([^*\n]+)\*/g, "_$1_")
    .replace(/(?<!^)_([^_\n]+)_/g, "_$1_")
    // Strikethrough
    .replace(/~~(.+?)~~/g, "~$1~")
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      return match.replace(/```(\w+)?\n?/g, "```");
    })
    // Inline code
    .replace(/`(.+?)`/g, "`$1`")
    // Standard markdown links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
    // Reverse markdown links (text)[url]
    .replace(/\(([^)]+)\)\[([^\]]+)\]/g, "<$2|$1>")
    // Blockquotes
    .replace(/^> (.+)$/gm, "> $1")
    // Improve paragraph separation - ensure double newlines become proper paragraph breaks
    .replace(/\n\n/g, "\n\n")
    // Remove excessive newlines but preserve paragraph breaks
    .replace(/\n{3,}/g, "\n\n")
    // Ensure proper sentence flow
    .replace(/([.!?])\n([A-Z])/g, "$1\n\n$2"); // Add paragraph break after sentences that start new thoughts

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
  const cleanMessage = fullMessage
    .trim()
    .replace(/\\n/g, "\n") // Convert escaped newlines to actual newlines
    .replace(/\\t/g, " ") // Convert tabs to spaces
    // Add proper sentence separation when sentences run together
    .replace(/(\w)\.(\w)/g, "$1. $2") // Add space after periods before words
    .replace(/(\w)\?(\w)/g, "$1? $2") // Add space after question marks before words
    .replace(/(\w)!(\w)/g, "$1! $2") // Add space after exclamation marks before words
    // Preserve intentional line breaks and paragraph breaks
    .replace(/\n\n+/g, "\n\n") // Normalize multiple newlines to double newlines
    // Clean up whitespace but preserve line structure
    .replace(/[ \t]+/g, " ") // Normalize horizontal whitespace within lines
    .replace(/\n +/g, "\n") // Remove spaces after newlines
    .replace(/ +\n/g, "\n") // Remove spaces before newlines
    // Ensure sentences end with proper punctuation spacing
    .replace(/([.!?])([A-Z])/g, "$1 $2"); // Add space between sentence endings and capital letters

  return cleanMessage || "Sorry, I couldn't process the response properly.";
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
  private channel: string;
  private messageTs: string;
  private threadTs?: string;

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
    try {
      this.currentIndex = (this.currentIndex + 1) % this.statuses.length;
      await this.slackClient.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: this.statuses[this.currentIndex],
      });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  }

  async finalUpdate(content: string): Promise<void> {
    this.stop();
    try {
      const parsedContent = parseStreamingResponse(content);
      const formattedContent = formatMarkdownForSlack(parsedContent);

      await this.slackClient.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: formattedContent,
      });
    } catch (error) {
      console.error("Error with final update:", error);
      throw error;
    }
  }
}

export async function createInitialMessage(
  slackClient: WebClient,
  channel: string,
  threadTs?: string,
): Promise<string> {
  try {
    const result = await slackClient.chat.postMessage({
      channel,
      text: "🤔 Thinking...",
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
    });

    return result.ts as string;
  } catch (error) {
    console.error("Error creating initial message:", error);
    throw error;
  }
}

export async function updateSlackMessage(
  slackClient: WebClient,
  channel: string,
  content: string,
  threadTs?: string,
): Promise<void> {
  try {
    const parsedContent = parseStreamingResponse(content);
    const formattedContent = formatMarkdownForSlack(parsedContent);

    await slackClient.chat.postMessage({
      channel,
      text: formattedContent,
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (error) {
    console.error("Error updating Slack message:", error);
    throw error;
  }
}

export function generateFingerprint(
  channel: string,
  threadTs?: string,
): string {
  const base = `${channel}-${threadTs || "main"}`;
  const timestamp = Date.now();
  return `${base}-${timestamp}`;
}
