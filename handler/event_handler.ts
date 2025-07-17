import { EventType, logEvent } from "../utils/logging";
import { SlackMessageHandler } from "./slack_handler";
import { envVars } from "../types";
import { WebClient } from "@slack/web-api";

export class MentionHandler {
  private handler: SlackMessageHandler;

  constructor(envConfig: envVars) {
    this.handler = new SlackMessageHandler(envConfig);
  }

  async handleChannelMention(event: any, client: WebClient) {
    logEvent({ event, eventType: EventType.APP_CHANNEL_MENTION });

    const messageText = await this.handler.fetchThreadHistory(event, {
      client: client,
    });

    try {
      await this.handler.handleMessage({
        text: messageText,
        channel: event.channel,
        thread_ts: event.thread_ts,
        ts: event.ts,
        context: { client: client },
      });
    } catch (error) {
      logEvent({ event: error, eventType: EventType.APP_ERROR });

      client.chat.postMessage({
        channel: event.channel,
        text: "Sorry, I encountered an error processing your request.",
        thread_ts: event.ts,
      });
    }
  }

  async handleChannelMessage(event: any, client: WebClient) {
    if (event.subtype || event.bot_id) return;

    const channelInfo = await client.conversations.info({
      channel: event.channel,
    });

    if (channelInfo.channel?.name === "ask-ai") {
      logEvent({ event, eventType: EventType.APP_CHANNEL_MESSAGE });

      const messageText = await this.handler.fetchThreadHistory(event, {
        client,
      });

      try {
        await this.handler.handleMessage({
          text: messageText,
          channel: event.channel,
          thread_ts: event.thread_ts,
          ts: event.ts,
          context: { client },
        });
      } catch (error) {
        logEvent({ event: error, eventType: EventType.APP_ERROR });

        client.chat.postMessage({
          channel: event.channel,
          text: "Hey there! I'm Mintie, your Mintlify documentation assistant. How can I help you today?",
          thread_ts: event.ts,
        });
      }
    }
  }
}
