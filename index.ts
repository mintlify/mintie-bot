require("dotenv").config();
import { App, Assistant } from "@slack/bolt";
import { SlackMessageHandler } from "./handler/slack_handler";
import { validateEnvironment, fetchThreadHistory } from "./utils/utils";

let envConfig;
try {
  envConfig = validateEnvironment();
  console.log("environment variables set successfully");
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

const handler = new SlackMessageHandler(envConfig);

app.event("app_mention", async ({ event, client }) => {
  console.log(`[APP_MENTION] Received mention event:`, {
    eventId: event.event_ts,
    channel: event.channel,
    user: event.user,
    text: event.text,
    threadTs: event.thread_ts,
    timestamp: new Date().toISOString(),
  });

  try {
    const messageText = await handler.fetchThreadHistory(event, { client });

    await handler.handleMessage({
      text: messageText,
      channel: event.channel,
      thread_ts: event.thread_ts,
      ts: event.ts,
      context: { client },
    });
  } catch (error) {
    console.error(`[APP_MENTION] Error processing mention event:`, {
      eventId: event.event_ts,
      channel: event.channel,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    await client.chat.postMessage({
      channel: event.channel,
      text: "Hey there! I'm Mintie, your Mintlify documentation assistant. How can I help you today?",
      thread_ts: event.ts,
    });
  }
});

app.event("message", async ({ event, client }) => {
  if (event.subtype || event.bot_id) return;

  const channelInfo = await client.conversations.info({
    channel: event.channel,
  });

  if (channelInfo.channel?.name === "ask-ai") {
    console.log(`[ASK_AI_CHANNEL] Received message in ask-ai channel:`, {
      eventId: event.event_ts,
      channel: event.channel,
      user: event.user,
      text: event.text,
      threadTs: event.thread_ts,
      timestamp: new Date().toISOString(),
    });

    try {
      const messageText = await handler.fetchThreadHistory(event, { client });

      await handler.handleMessage({
        text: messageText,
        channel: event.channel,
        thread_ts: event.thread_ts,
        ts: event.ts,
        context: { client },
      });
    } catch (error) {
      console.error(`[ASK_AI_CHANNEL] Error processing message:`, {
        eventId: event.event_ts,
        channel: event.channel,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      await client.chat.postMessage({
        channel: event.channel,
        text: "Hey there! I'm Mintie, your Mintlify documentation assistant. How can I help you today?",
        thread_ts: event.ts,
      });
    }
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
        let contextMessage = messageText;

        if (threadTs) {
          const threadContext = await fetchThreadHistory(
            app.client,
            message.channel,
            threadTs,
          );

          if (threadContext) {
            contextMessage = `${threadContext}\n\nCurrent message: ${messageText}`;
          }
        }

        await handler.handleMessage({
          text: contextMessage,
          channel: message.channel,
          thread_ts: threadTs,
          ts: message.ts || Date.now().toString(),
          context: { say, setStatus },
        });
      } else {
      }
    } catch (error) {
      await say("Sorry, I encountered an error. Please try again.");
    }
  },
});

app.assistant(assistant);

(async () => {
  try {
    await app.start();
    console.log(`mintie bot is running in socket mode!`);
    console.log(`Instance ID: ${process.env.HOSTNAME}`);
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
