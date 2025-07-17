require("dotenv").config();
import { App } from "@slack/bolt";
import { createAssistant } from "./handler/assistant_handler";
import { EventType, logEvent } from "./utils/logging";
import {
  handleChannelMention,
  handleChannelMessage,
} from "./handler/event_handler";
import { validateEnvironment } from "./env_manager";
import { envVars } from "./types";

let envConfig: envVars;
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

const assistant = createAssistant(app.client);

app.event("app_mention", async ({ event }) => {
  await handleChannelMention(event, app.client);
});

app.event("message", async ({ event }) => {
  await handleChannelMessage(event, app.client);
});

(async () => {
  try {
    app.assistant(await assistant);
    await app.start();
    logEvent({
      text: "Mintie bot is running in socket mode",
      eventType: EventType.APP_INFO,
    });
    logEvent({
      text: "Mintie bot is ready to help you with your documentation",
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
