import { Assistant } from "@slack/bolt";
import { fetchThreadHistory } from "../utils/utils";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
import { processMessage } from "../operator/event_operator";

async function createAssistant() {
  return new Assistant({
    threadStarted: async ({ say }) => {
      await say(
        "Hi! I'm Mintie, your AI documentation assistant. How can I help you today?",
      );
    },
    userMessage: async ({ message, say, setStatus, client }) => {
      logEvent({
        text: `Received direct message: ${
          "text" in message ? message.text : ""
        }`,
        eventType: EventType.APP_DIRECT_MESSAGE,
      });

      try {
        await setStatus("is thinking...");

        const messageText = "text" in message ? message.text : "";
        const threadTs = "thread_ts" in message ? message.thread_ts : undefined;

        if (messageText) {
          let contextMessage = messageText;

          if (threadTs) {
            const threadContext = await fetchThreadHistory(
              client,
              message.channel,
              threadTs,
            );

            if (threadContext) {
              contextMessage = `${threadContext}\n\nCurrent message: ${messageText}`;
            }
          }

          await processMessage(
            client,
            contextMessage,
            message.channel,
            threadTs,
          );
        } else {
          await say("Please provide a message to continue.");
        }
      } catch (error) {
        logEvent({
          text: `Error processing message: ${error}`,
          eventType: EventType.APP_ERROR,
        });

        await say("Sorry, I encountered an error. Please try again.");
      }
    },
  });
}

export { createAssistant };
