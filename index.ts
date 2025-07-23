import dotenv from "dotenv";
dotenv.config();

import { App, LogLevel, InstallURLOptions } from "@slack/bolt";
import { getEnvs } from "./env_manager";
import { createAssistant } from "./handler/assistant_handler";
import { EventType } from "./types";
import { logEvent } from "./utils/logging";
import workspaceAuth from "./database/auth/workspace_install";
import dbQuery from "./database/get_user";
import db from "./database/db";
import model from "./database/db";
import { Installation, InstallationQuery, CodedError } from "@slack/bolt";
import { IncomingMessage, ServerResponse } from "http";
import { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import { randomUUID } from "crypto";
import { handleAppMention } from "./listeners/listeners";

const envConfig = getEnvs();

const domainConfigStore = new Map<
  string,
  { id: string; subdomain: string; apiKey: string; timestamp: number }
>();

setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of domainConfigStore.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      domainConfigStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

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
      handler: async (req: ParamsIncomingMessage, res: ServerResponse) => {
        try {
          const encodedParams = req.params?.encodedParams;

          logEvent({
            text: `Custom install route called with encoded params: ${encodedParams}`,
            eventType: EventType.APP_INFO,
          });

          const decodedParams = Buffer.from(
            encodedParams || "",
            "base64",
          ).toString("utf8");

          const { subdomain, apiKey } = JSON.parse(decodedParams);

          logEvent({
            text: `Decoded install params: subdomain=${subdomain}, apiKey=${apiKey}`,
            eventType: EventType.APP_INFO,
          });

          if (subdomain && apiKey) {
            const configId = randomUUID();

            await model.SlackUser.create({
              _id: configId,
              subdomain: subdomain,
              apiKey: apiKey,
            });

            domainConfigStore.set(configId, {
              id: configId,
              subdomain,
              apiKey,
              timestamp: Date.now(),
            });
            res.setHeader(
              "Set-Cookie",
              `mintie_config_id=${configId}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
            );
            res.writeHead(302, { Location: "/slack/install" });
            res.end();
          } else {
            res.writeHead(400);
            res.end("Missing subdomain or apiKey parameter");
          }
        } catch (error) {
          logEvent({
            text: `Error in custom install route: ${error}`,
            eventType: EventType.APP_ERROR,
          });
          res.writeHead(400);
          res.end("Invalid encoded parameters");
        }
      },
    },
  ],
  installerOptions: {
    stateVerification: true,
    directInstall: true,
    callbackOptions: {
      success: async (
        installation: Installation<"v1" | "v2", boolean>,
        installOptions: InstallURLOptions,
        _req: IncomingMessage,
        res: ServerResponse,
      ) => {
        let stateData: { subdomain?: string; apiKey?: string } = {};

        const teamId = installation.team?.id;
        let foundDomainConfig = null;
        let configId = null;

        const cookies = _req.headers.cookie;
        if (cookies) {
          const cookieMatch = cookies.match(/mintie_config_id=([^;]+)/);
          if (cookieMatch) {
            configId = cookieMatch[1];
            foundDomainConfig = domainConfigStore.get(configId);
          }
        }

        if (!foundDomainConfig) {
          for (const [id, config] of domainConfigStore.entries()) {
            foundDomainConfig = config;
            configId = id;
            break;
          }
        }

        if (foundDomainConfig && teamId && configId) {
          stateData = {
            subdomain: foundDomainConfig.subdomain,
            apiKey: foundDomainConfig.apiKey,
          };

          const updateData: {
            subdomain: string;
            apiKey: string;
          } = {
            subdomain: foundDomainConfig.subdomain,
            apiKey: foundDomainConfig.apiKey,
          };

          await model.SlackUser.updateOne(
            { _id: teamId },
            { $set: updateData },
            { upsert: true },
          );

          await model.SlackUser.deleteOne({ _id: configId });

          domainConfigStore.delete(configId);

          logEvent({
            text: `Updated team ${teamId} with domain config: ${JSON.stringify(
              stateData,
            )}`,
            eventType: EventType.APP_INFO,
          });
        } else {
          logEvent({
            text: `No domain configuration found in memory for team ${installation.team?.id}`,
            eventType: EventType.APP_INFO,
          });
        }
        try {
          logEvent({
            text: `Installation successful for team ${installation.team?.id}`,
            eventType: EventType.APP_INFO,
          });

          res?.writeHead(200, { "Content-Type": "text/html" });
          res?.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Mintie Installation Complete</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .container { max-width: 500px; margin: 0 auto; }
                .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
                .message { color: #333; font-size: 16px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="success">Installation Successful!</div>
                <div class="message">Please check your Slack for next steps.</div>
              </div>
            </body>
            </html>
          `);

          setTimeout(async () => {
            try {
              const teamId = installation.team?.id;
              if (teamId && stateData.subdomain && stateData.apiKey) {
                await model.SlackUser.updateOne({ _id: teamId }, { $set: stateData });
              } else if (teamId && (stateData.subdomain || stateData.apiKey)) {
                logEvent({
                  text: `Saved partial installation state for team ${teamId}: ${JSON.stringify(
                    stateData,
                  )}`,
                  eventType: EventType.APP_INFO,
                });
              }
            } catch (error) {
              logEvent({
                text: `Error sending welcome message: ${error}`,
                eventType: EventType.APP_ERROR,
              });
            }
          }, 1000);
        } catch (error) {
          logEvent({
            text: `Error in installation success callback: ${error}`,
            eventType: EventType.APP_ERROR,
          });
        }
      },
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
        return (await dbQuery.findUser(installQuery.teamId)) as Installation<
          "v1" | "v2",
          boolean
        >;
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
  console.log("⚡️ Bolt app is running!");
})();
