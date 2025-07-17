require("dotenv").config();
import { App, Assistant } from "@slack/bolt";
import { validateEnvironment } from "./utils/utils";
import { MentionHandler } from "./handler/event_handler";
import { AssistantHandler } from "./handler/assistant_handler";
import { EventType, logEvent } from "./utils/logging";

let envConfig;
try {
  envConfig = validateEnvironment();
  logEvent({
    text: "Environment variables validated",
    eventType: EventType.APP_INFO,
  });
} catch (error) {
  logEvent({
    text: "Failed to validate environment variables",
    event: error,
    eventType: EventType.APP_STARTUP_ERROR,
  });
  process.exit(1);
}

const app = new App({
  token: envConfig.SLACK_BOT_TOKEN,
  signingSecret: envConfig.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: envConfig.SLACK_APP_TOKEN,
});

const eventHandler = new MentionHandler(envConfig);
const assistantHandler = new AssistantHandler(envConfig);
const assistant = assistantHandler.createAssistant();

app.event("app_mention", async ({ event, client }) => {
  await eventHandler.handleChannelMention(event, client);
});

app.event("message", async ({ event, client }) => {
  await eventHandler.handleChannelMessage(event, client);
});

(async () => {
  try {
    app.assistant(await assistant);
    await app.start();
    logEvent({
      text: "Mintie bot is running in socket mode",
      eventType: EventType.APP_INFO,
    });
  } catch (error) {
    logEvent({
      text: "Failed to start the app",
      eventType: EventType.APP_STARTUP_ERROR,
    });
    process.exit(1);
  }
})();

process.on("unhandledRejection", (reason, promise) => {
  logEvent({
    text: "Unhandled rejection",
    eventType: EventType.APP_ERROR,
  });
});

process.on("uncaughtException", (error) => {
  logEvent({
    text: "Uncaught exception",
    eventType: EventType.APP_ERROR,
  });
  process.exit(1);
});
