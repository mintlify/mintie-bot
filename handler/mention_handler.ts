import { EventType, logEvent } from "../utils/logging";
import { SlackMessageHandler } from "./slack_handler";
import { envVars } from "../types";
import { WebClient } from "@slack/web-api";

export class MentionHandler {
  private handler: SlackMessageHandler;

  constructor(envConfig: envVars) {
    this.handler = new SlackMessageHandler(envConfig);
  }

  async handleMention(event: any, client: WebClient) {
    logEvent(event, EventType.APP_MENTION);

    const messageText = await this.handler.fetchThreadHistory(event, {
      client: client,
    });

    await this.handler
      .handleMessage({
        text: messageText,
        channel: event.channel,
        thread_ts: event.thread_ts,
        ts: event.ts,
        context: { client: client },
      })
      .catch((error) => {
        logEvent(error, EventType.APP_ERROR);

        client.chat.postMessage({
          channel: event.channel,
          text: "Sorry, I encountered an error processing your request.",
          thread_ts: event.ts,
        });
      });
  }
}
