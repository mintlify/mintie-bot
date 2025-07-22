import dotenv from "dotenv";
dotenv.config();

import { App, LogLevel, InstallURLOptions } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
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
import {
  openMintlifyConfigModal,
  handleMintlifyConfigSubmission,
} from "./handler/mintlify_modal";
import { handleAppMention } from "./listeners/listeners";
import {
  fullConfigureMintlifyMessage,
  preConfiguredMintlifyMessage,
} from "./start_messages";

const envConfig = getEnvs();

const domainConfigStore = new Map<
  string,
  { id: string; domain: string; url: string; timestamp: number }
>();

setInterval(
  () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of domainConfigStore.entries()) {
      if (value.timestamp < tenMinutesAgo) {
        domainConfigStore.delete(key);
      }
    }
  },
  10 * 60 * 1000,
);

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

          const { domain, url } = JSON.parse(decodedParams);

          logEvent({
            text: `Decoded install params: domain=${domain}, url=${url}`,
            eventType: EventType.APP_INFO,
          });

          if (domain && url) {
            const configId = randomUUID();

            await model.SlackUser.create({
              _id: configId,
              "installationState.configId": configId,
              "installationState.domain": domain,
              "installationState.url": url,
              "installationState.savedAt": new Date(),
              "installationState.isPartial": true,
            });

            domainConfigStore.set(configId, {
              id: configId,
              domain,
              url,
              timestamp: Date.now(),
            });

            logEvent({
              text: `Stored in-memory config for domain: ${domain}, url: ${url}`,
              eventType: EventType.APP_INFO,
            });

            res.setHeader(
              "Set-Cookie",
              `mintie_config_id=${configId}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
            );

            res.writeHead(302, { Location: "/slack/install" });
            res.end();
          } else {
            logEvent({
              text: `Missing domain or url parameter: domain=${domain}, url=${url}`,
              eventType: EventType.APP_ERROR,
            });
            res.writeHead(400);
            res.end("Missing domain or url parameter");
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
        let stateData: { domain?: string; url?: string } = {};

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
            domain: foundDomainConfig.domain,
            url: foundDomainConfig.url,
          };

          await model.SlackUser.updateOne(
            { _id: teamId },
            {
              $set: {
                "mintlify.domain": foundDomainConfig.domain,
                "mintlify.url": foundDomainConfig.url,
                "mintlify.isConfigured": false,
                "installationState.domain": foundDomainConfig.domain,
                "installationState.url": foundDomainConfig.url,
                "installationState.configId": configId,
                "installationState.savedAt": new Date(),
              },
            },
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
              const client = new WebClient(installation.bot?.token);

              const teamId = installation.team?.id;
              if (teamId && stateData.domain && stateData.url) {
                await model.SlackUser.updateOne(
                  { _id: teamId },
                  {
                    $set: {
                      "mintlify.domain": stateData.domain,
                      "mintlify.url": stateData.url,
                      "mintlify.isConfigured": false,
                    },
                  },
                );

                logEvent({
                  text: `Pre-configured Mintlify for team ${teamId}: domain=${stateData.domain}, url=${stateData.url}`,
                  eventType: EventType.APP_INFO,
                });
              } else if (teamId && (stateData.domain || stateData.url)) {
                logEvent({
                  text: `Saved partial installation state for team ${teamId}: ${JSON.stringify(
                    stateData,
                  )}`,
                  eventType: EventType.APP_INFO,
                });
              }

              if (stateData.domain && stateData.url) {
                logEvent({
                  text: `Sending welcome message with pre-configured settings to user ${installation.user?.id}`,
                  eventType: EventType.APP_INFO,
                });

                await client.chat.postMessage(
                  preConfiguredMintlifyMessage(
                    installation.user?.id,
                    stateData.domain,
                    stateData.url,
                  ),
                );
              } else {
                await client.chat.postMessage(
                  fullConfigureMintlifyMessage(installation.user?.id),
                );
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

app.action("configure_mintlify", async ({ ack, body, client, context }) => {
  await ack();
  const teamId = context.teamId;
  if (!teamId) {
    throw new Error("Team ID not found in context");
  }

  const triggerId = "trigger_id" in body ? body.trigger_id : "";
  await openMintlifyConfigModal(client, triggerId, teamId);
});

app.view("mintlify_config_modal", async ({ ack, view, client }) => {
  try {
    const response = await handleMintlifyConfigSubmission({ view });

    if (response.response_action === "errors") {
      await ack({
        response_action: "errors" as const,
        errors: response.errors,
      });
    } else {
      await ack();
    }

    if (response.response_action === "clear") {
      const { private_metadata } = view;
      const { teamId } = JSON.parse(private_metadata);

      const installation = await dbQuery.findUser(teamId);
      if (installation?.user?.id) {
        await client.chat.postMessage({
          channel: installation.user.id,
          text: "Mintlify configuration saved successfully! You're all set to use Mintie for your documentation needs.",
        });
      }
    }
  } catch (error) {
    logEvent({
      text: `Error updating Mintlify config: ${error}`,
      eventType: EventType.APP_ERROR,
    });
    await ack({
      response_action: "errors" as const,
      errors: {
        domain_block:
          "An error occurred while saving your configuration. Please try again.",
      },
    });
  }
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
