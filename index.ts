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

    console.log(`[APP_MENTION] Processing message:`, {
      originalText: event.text,
      processedText: messageText,
      channel: event.channel,
      threadTs: event.thread_ts,
      timestamp: new Date().toISOString(),
    });

    await handler.handleMessage({
      text: messageText,
      channel: event.channel,
      thread_ts: event.thread_ts,
      ts: event.ts,
      context: { client },
    });

    console.log(`[APP_MENTION] Successfully processed mention event:`, {
      eventId: event.event_ts,
      channel: event.channel,
      timestamp: new Date().toISOString(),
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

app.message(async ({ message, client }) => {
  console.log(`[MESSAGE] Received message event:`, {
    messageId: message.ts,
    channel: message.channel,
    user: "user" in message ? message.user : "unknown",
    text: "text" in message ? message.text : "no text",
    threadTs: "thread_ts" in message ? message.thread_ts : undefined,
    timestamp: new Date().toISOString(),
  });

  if (!("text" in message) || !message.text) {
    console.log(`[MESSAGE] Skipping message - no text content`);
    return;
  }

  if (message.channel.startsWith("D")) {
    console.log(`[MESSAGE] Skipping direct message`);
    return;
  }

  const botMentionPattern = /<@[UW][A-Z0-9]+>/;
  if (!botMentionPattern.test(message.text)) {
    console.log(`[MESSAGE] Skipping message - no bot mention detected`);
    return;
  }

  console.log(`[MESSAGE] Processing message with bot mention:`, {
    messageId: message.ts,
    channel: message.channel,
    text: message.text,
    timestamp: new Date().toISOString(),
  });

  try {
    const messageText = await handler.fetchThreadHistory(message, { client });

    console.log(`[MESSAGE] Processing message:`, {
      originalText: message.text,
      processedText: messageText,
      channel: message.channel,
      threadTs: "thread_ts" in message ? message.thread_ts : undefined,
      timestamp: new Date().toISOString(),
    });

    await handler.handleMessage({
      text: messageText,
      channel: message.channel,
      thread_ts: "thread_ts" in message ? message.thread_ts : undefined,
      ts: message.ts,
      context: { client },
    });

    console.log(`[MESSAGE] Successfully processed message:`, {
      messageId: message.ts,
      channel: message.channel,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[MESSAGE] Error processing message:`, {
      messageId: message.ts,
      channel: message.channel,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });

    await client.chat.postMessage({
      channel: message.channel,
      text: "Hey there! I'm Mintie, your Mintlify documentation assistant. How can I help you today?",
      thread_ts: message.ts,
    });
  }
});

const assistant = new Assistant({
  threadStarted: async ({ say, setSuggestedPrompts }) => {
    console.log(`[ASSISTANT] Thread started:`, {
      timestamp: new Date().toISOString(),
    });

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

    console.log(`[ASSISTANT] Thread started successfully`);
  },

  userMessage: async ({ message, say, setStatus }) => {
    console.log(`[ASSISTANT] Received user message:`, {
      messageId: message.ts || Date.now().toString(),
      channel: message.channel,
      text: "text" in message ? message.text : "no text",
      threadTs: "thread_ts" in message ? message.thread_ts : undefined,
      timestamp: new Date().toISOString(),
    });

    try {
      await setStatus("is thinking...");

      const messageText = "text" in message ? message.text : "";
      const threadTs = "thread_ts" in message ? message.thread_ts : undefined;

      if (messageText) {
        let contextMessage = messageText;

        if (threadTs) {
          console.log(`[ASSISTANT] Fetching thread history for context`);
          const threadContext = await fetchThreadHistory(
            app.client,
            message.channel,
            threadTs,
          );

          if (threadContext) {
            contextMessage = `${threadContext}\n\nCurrent message: ${messageText}`;
            console.log(`[ASSISTANT] Thread context added to message`);
          }
        }

        console.log(`[ASSISTANT] Processing assistant message:`, {
          originalText: messageText,
          processedText: contextMessage,
          channel: message.channel,
          threadTs: threadTs,
          timestamp: new Date().toISOString(),
        });

        await handler.handleMessage({
          text: contextMessage,
          channel: message.channel,
          thread_ts: threadTs,
          ts: message.ts || Date.now().toString(),
          context: { say, setStatus },
        });

        console.log(`[ASSISTANT] Successfully processed assistant message:`, {
          messageId: message.ts || Date.now().toString(),
          channel: message.channel,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(`[ASSISTANT] Skipping message - no text content`);
      }
    } catch (error) {
      console.error(`[ASSISTANT] Error processing assistant message:`, {
        messageId: message.ts || Date.now().toString(),
        channel: message.channel,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      await say("Sorry, I encountered an error. Please try again.");
    }
  },
});

app.assistant(assistant);

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
