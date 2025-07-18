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
import workspaceAuth from "./database/auth/workspace_install";
import uninstallApp from "./database/auth/uninstall_app";
import dbQuery from "./database/get_user";
import db from "./database/db";
import { Installation, InstallationQuery } from "@slack/bolt";

const envConfig = getEnvs();

const app = new App({
  signingSecret: envConfig.SLACK_SIGNING_SECRET,
  clientId: envConfig.SLACK_CLIENT_ID,
  clientSecret: envConfig.SLACK_CLIENT_SECRET,
  stateSecret: "my-secret",
  logLevel: LogLevel.ERROR,
  scopes: [
    "app_mentions:read",
    "assistant:write",
    "channels:history",
    "chat:write",
    "chat:write.customize",
    "commands",
    "groups:history",
    "im:history",
    "im:read",
    "im:write",
    "mpim:history",
    "channels:read",
  ],
  installerOptions: {
    stateVerification: false,
  },
  installationStore: {
    storeInstallation: async (
      installation: Installation<"v1" | "v2", boolean>,
    ) => {
      try {
        await workspaceAuth.saveUserWorkspaceInstall(installation);
      } catch {
        throw new Error("Failed saving installation data to installationStore");
      }
    },
    fetchInstallation: async (installQuery: InstallationQuery<boolean>) => {
      if (installQuery.teamId) {
        return (await dbQuery.findUser(installQuery.teamId)) as Installation<
          "v1" | "v2",
          boolean
        >;
      }
      throw new Error("Failed fetching installation");
    },
  },
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

app.event("tokens_revoked", async ({ event }) => {
  try {
    logEvent({
      text: `Tokens revoked event received: ${JSON.stringify(event)}`,
      eventType: EventType.APP_INFO,
    });

    if (event.tokens?.oauth) {
      const teamIds = event.tokens.oauth;
      for (const teamId of teamIds) {
        await uninstallApp.uninstallApp(teamId);
        logEvent({
          text: `Removed installation for revoked team: ${teamId}`,
          eventType: EventType.APP_INFO,
        });
      }
    }
  } catch (error) {
    logEvent({
      text: `Error handling token revocation: ${error}`,
      eventType: EventType.APP_ERROR,
    });
  }
});

app.event("app_uninstalled", async ({ event, context }) => {
  try {
    logEvent({
      text: `App uninstalled event received: ${JSON.stringify(event)}`,
      eventType: EventType.APP_INFO,
    });

    const teamId = context.teamId;
    if (teamId) {
      await uninstallApp.uninstallApp(teamId);
      logEvent({
        text: `Removed installation for uninstalled team: ${teamId}`,
        eventType: EventType.APP_INFO,
      });
    } else {
      logEvent({
        text: "App uninstalled but no team ID found in context",
        eventType: EventType.APP_ERROR,
      });
    }
  } catch (error) {
    logEvent({
      text: `Error handling app uninstallation: ${error}`,
      eventType: EventType.APP_ERROR,
    });
  }
});

(async () => {
  await db.connect();

  const assistant = await createAssistant();
  app.assistant(assistant);

  await app.start(Number(envConfig.PORT) || 3000);

  logEvent({
    text: "Connected to MongoDB",
    eventType: EventType.APP_INFO,
  });

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
