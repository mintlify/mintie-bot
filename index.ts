require("dotenv").config();
import { App, Assistant } from "@slack/bolt";
import { MessageHandler } from "./handler/message_handler";
import { MessageOperator } from "./operator/message_operator";
import { extractUserMessage, validateEnvironment } from "./utils/utils";

let envConfig;
try {
  envConfig = validateEnvironment();
  console.log("%cenvironment variables set successfully", "color: green");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const app = new App({
  token: envConfig.SLACK_BOT_TOKEN,
  signingSecret: envConfig.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: envConfig.SLACK_APP_TOKEN,
});

const messageHandler = new MessageHandler();
const messageOperator = new MessageOperator(
  app.client,
  envConfig.MINTLIFY_AUTH_TOKEN,
  envConfig.MINTLIFY_DOCS_DOMAIN || "mintlify",
);

app.event("app_mention", async ({ event, client }) => {
  try {
    const userMessage = extractUserMessage(event.text);

    if (!userMessage) {
      await client.chat.postMessage({
        channel: event.channel,
        text: "Please include a message after mentioning me!",
        thread_ts: event.ts,
      });
      return;
    }

    await messageOperator.processMessage(userMessage, event.channel, event.ts);
  } catch (error) {
    console.error("Error handling mention:", error);

    await client.chat.postMessage({
      channel: event.channel,
      text: "Sorry, I encountered an error processing your request.",
      thread_ts: event.ts,
    });
  }
});

const assistant = new Assistant({
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
    try {
      await setStatus("is thinking...");

      const messageText = "text" in message ? message.text : "";
      const threadTs = "thread_ts" in message ? message.thread_ts : undefined;

      if (messageText) {
        await messageOperator.processMessage(
          messageText,
          message.channel,
          threadTs,
        );
      }
    } catch (error) {
      console.error("Error in assistant message handler:", error);
      await say("Sorry, I encountered an error. Please try again.");
    }
  },
});

app.assistant(assistant);

app.message(/.*/, async ({ message, say }) => {
  try {
    if (
      "channel_type" in message &&
      message.channel_type === "im" &&
      "text" in message &&
      message.text
    ) {
      await messageOperator.processMessage(message.text, message.channel);
    }
  } catch (error) {
    console.error("Error in fallback message handler:", error);
    await say("Sorry, I encountered an error processing your message.");
  }
});

(async () => {
  try {
    const port = envConfig.PORT || 3000;
    await app.start(port);
    console.log(`mintie bot is running on port ${port}!`);
    console.log("ready to help with Mintlify documentation queries");
  } catch (error) {
    console.error("failed to start the app:", error);
    process.exit(1);
  }
})();

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
