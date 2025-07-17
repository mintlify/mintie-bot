import { App, Assistant } from "@slack/bolt";
import { SlackMessageHandler } from "./slack_handler";
import { envVars } from "../types";
import { fetchThreadHistory } from "../utils/utils";
import { EventType, logEvent } from "../utils/logging";

export class AssistantHandler {
  private handler: SlackMessageHandler;

  constructor(env: envVars) {
    this.handler = new SlackMessageHandler(env);
  }

  async createAssistant() {
    return new Assistant({
      threadStarted: async ({ say, setSuggestedPrompts }) => {
        await say(
          "Hi! I'm Mintie, your Mintlify documentation assistant. How can I help you today?",
        );
        await setSuggestedPrompts({
          prompts: [
            {
              title: "Getting Started",
              message: "What is the getting started process?",
            },
            {
              title: "Search Documentation",
              message: "How do I search for specific documentation?",
            },
            {
              title: "API Integration",
              message: "How do I integrate with the Mintlify API?",
            },
          ],
        });
      },
      userMessage: async ({ message, say, setStatus }) => {
        logEvent({
          text: `Received direct message: ${
            "text" in message ? message.text : ""
          }`,
          eventType: EventType.APP_DIRECT_MESSAGE,
        });

        try {
          await setStatus("is thinking...");

          const messageText = "text" in message ? message.text : "";
          const threadTs =
            "thread_ts" in message ? message.thread_ts : undefined;

          if (messageText) {
            let contextMessage = messageText;

            if (threadTs) {
              const threadContext = await fetchThreadHistory(
                this.handler.client,
                message.channel,
                threadTs,
              );

              if (threadContext) {
                contextMessage = `${threadContext}\n\nCurrent message: ${messageText}`;
              }
            }

            await this.handler.handleMessage({
              text: contextMessage,
              channel: message.channel,
              thread_ts: threadTs,
              ts: message.ts || Date.now().toString(),
              context: { say, setStatus },
            });
          } else {
            await say("Please provide a message to continue.");
          }
        } catch (error) {
          await say("Sorry, I encountered an error. Please try again.");
        }
      },
    });
  }
}
