import { WebClient } from "@slack/web-api";
import { envVars } from "../types";
import { MessageOperator } from "../operator/message_operator";
import { extractUserMessage } from "../utils/utils";

export class SlackMessageHandler {
  private client: WebClient;
  private messageOperator: MessageOperator;
  private env: envVars;

  constructor(env: envVars) {
    this.env = env;
    this.client = new WebClient(env.SLACK_BOT_TOKEN);
    this.messageOperator = new MessageOperator(
      this.client,
      env.MINTLIFY_AUTH_TOKEN,
      env.MINTLIFY_DOCS_DOMAIN || "mintlify",
    );
  }

  async fetchThreadHistory(payload: any, context: any): Promise<string> {
    try {
      const userMessage = extractUserMessage(payload.text);

      if (!userMessage) {
        throw new Error("No message content provided after mention");
      }

      return userMessage;
    } catch (error) {
      throw error;
    }
  }

  async handleMessage(params: {
    text: string;
    channel: string;
    thread_ts?: string;
    ts: string;
    context: any;
  }): Promise<void> {
    try {
      const { text, channel, thread_ts, ts } = params;
      const isDirectMessage = channel.startsWith("D");

      await this.messageOperator.processMessage(
        text,
        channel,
        thread_ts,
        isDirectMessage,
        ts,
      );
    } catch (error) {
      await this.client.chat.postMessage({
        channel: params.channel,
        text: "Sorry, I encountered an error processing your request.",
        thread_ts: params.thread_ts || params.ts,
      });
    }
  }
}
