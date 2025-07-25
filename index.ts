import dotenv from "dotenv";
dotenv.config();

import { App, LogLevel, InstallURLOptions } from "@slack/bolt";
import { getEnvs } from "./env_manager";
import { createAssistant } from "./handlers/assistant_handler";
import { EventType } from "./types";
import { logEvent } from "./utils/logging";
import workspaceAuth from "./database/auth/workspace_install";
import dbQuery from "./database/get_user";
import db from "./database/db";
import { Installation, InstallationQuery, CodedError } from "@slack/bolt";
import { IncomingMessage, ServerResponse } from "http";
import { handleAppMention } from "./listeners/listeners";
import {
  handleCustomInstallRoute,
  handleInstallationSuccess,
} from "./handlers/install_handler";

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
  customRoutes: [
    {
      path: "/slack/install/:encodedParams",
      method: ["GET"],
      handler: handleCustomInstallRoute,
    },
  ],
  installerOptions: {
    stateVerification: true,
    directInstall: true,
    callbackOptions: {
      success: handleInstallationSuccess,
      failure: (
        error: CodedError,
        _installOptions: InstallURLOptions,
        _req: IncomingMessage,
        res: ServerResponse,
      ) => {
        logEvent({
          text: `Installation failed: ${error}`,
          eventType: EventType.APP_ERROR,
        });
        res?.writeHead(500);
        res?.end("Installation failed. Please try again.");
      },
    },
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
        const userData = await dbQuery.findUser(installQuery.teamId);
        if (userData?.bot?.encryptedToken) {
          const secrets = dbQuery.decryptUserSecrets(userData);
          if (secrets.botToken) {
            return {
              ...userData,
              bot: {
                ...userData.bot,
                token: secrets.botToken,
              },
            } as Installation<"v1" | "v2", boolean>;
          }
        }
        return userData as Installation<"v1" | "v2", boolean>;
      }
      throw new Error("Failed fetching installation");
    },
  },
});

(async () => {
  await db.connect();

  const assistant = await createAssistant();
  app.assistant(assistant);

  handleAppMention(app);

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
  logEvent({
    text: "⚡️ Bolt app is running!",
    eventType: EventType.APP_INFO,
  });
})();
