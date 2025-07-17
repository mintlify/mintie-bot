import dotenv from "dotenv";
dotenv.config();

import { App, LogLevel } from "@slack/bolt";
import { getEnvs } from "./env_manager";
import { createAssistant } from "./handler/assistant_handler";
import {
  handleChannelMention,
  handleChannelMessage,
} from "./handler/event_handler";
import { EventType, logEvent } from "./utils/logging";

const envConfig = getEnvs();

const app = new App({
  token: envConfig.SLACK_BOT_TOKEN,
  signingSecret: envConfig.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.ERROR,
});

app.use(async ({ next }) => {
  await next();
});

app.event("app_mention", async ({ event, client }) => {
  try {
    await handleChannelMention(event, client);
  } catch (error) {
    logEvent({
      text: "Error handling app mention",
      event: error,
      eventType: EventType.APP_ERROR,
    });
  }
});

app.message(async ({ message, client }) => {
  try {
    await handleChannelMessage(message, client);
  } catch (error) {
    logEvent({
      text: "Error handling message",
      event: error,
      eventType: EventType.APP_ERROR,
    });
  }
});

(async () => {
  const assistant = await createAssistant(app.client);
  app.assistant(assistant);

  await app.start(Number(envConfig.PORT) || 3000);

  logEvent({
    text: `Mintie bot is running on port ${Number(envConfig.PORT) || 3000}`,
    eventType: EventType.APP_INFO,
  });
  logEvent({
    text: "Mintie bot is ready to help you with your documentation",
    eventType: EventType.APP_INFO,
  });
  console.log("⚡️ Bolt app is running!");
})();
