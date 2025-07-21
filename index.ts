import dotenv from "dotenv";
dotenv.config();

import { App, LogLevel } from "@slack/bolt";
import { getEnvs } from "./env_manager";
import { createAssistant } from "./handler/assistant_handler";
import { EventType } from "./types";
import { logEvent } from "./utils/logging";
import workspaceAuth from "./database/auth/workspace_install";
import dbQuery from "./database/get_user";
import db from "./database/db";
import model from "./database/db";
import {
  Installation,
  InstallationQuery,
  InstallURLOptions,
  CodedError,
} from "@slack/bolt";
import { IncomingMessage, ServerResponse } from "http";
import {
  openMintlifyConfigModal,
  handleMintlifyConfigSubmission,
} from "./handler/mintlify_modal";
import { handleAppMention } from "./listeners/listeners";

const envConfig = getEnvs();

const installParamsStore = new Map<
  string,
  { domain?: string; url?: string; timestamp: number }
>();

setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of installParamsStore.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      installParamsStore.delete(key);
    }
  }
}, 60000);

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
      handler: async (req: any, res: any) => {
        try {
          const encodedParams = req.params.encodedParams;
          const decodedParams = Buffer.from(encodedParams, "base64").toString(
            "utf8",
          );
          const { domain, url } = JSON.parse(decodedParams);

          if (domain && url) {
            await workspaceAuth.saveInstallationState("pending", {
              domain,
              url,
            });

            res.writeHead(302, { Location: "/slack/install" });
            res.end();
          } else {
            res.writeHead(400);
            res.end("Missing domain or url parameter");
          }
        } catch {
          res.writeHead(400);
          res.end("Invalid encoded parameters");
        }
      },
    },
  ],
  installerOptions: {
    stateVerification: true,
    callbackOptions: {
      success: async (
        installation: Installation<"v1" | "v2", boolean>,
        installOptions: InstallURLOptions,
        req: IncomingMessage,
        res: ServerResponse,
      ) => {
        let stateData: { domain?: string; url?: string } = {};

        try {
          const pendingData = await workspaceAuth.getInstallationState(
            "pending",
          );
          if (pendingData) {
            stateData = {
              domain: pendingData.domain || "",
              url: pendingData.url || "",
            };

            await workspaceAuth.clearInstallationState("pending");

            logEvent({
              text: `Retrieved install parameters from database: ${JSON.stringify(
                stateData,
              )}`,
              eventType: EventType.APP_INFO,
            });
          } else {
            logEvent({
              text: `No pending install parameters found in database`,
              eventType: EventType.APP_INFO,
            });
          }
        } catch (error) {
          logEvent({
            text: `Error retrieving install parameters: ${error}`,
            eventType: EventType.APP_ERROR,
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
              const { WebClient } = await import("@slack/web-api");
              const client = new WebClient(installation.bot?.token);

              const teamId = installation.team?.id;
              if (teamId && stateData.domain && stateData.url) {
                await model.SlackUser.updateOne(
                  { _id: teamId },
                  {
                    $set: {
                      "mintlify.domain": stateData.domain,
                      "mintlify.url": stateData.url,
                      "mintlify.isConfigured": true,
                    },
                  },
                );

                logEvent({
                  text: `Auto-configured Mintlify for team ${teamId}: domain=${stateData.domain}, url=${stateData.url}`,
                  eventType: EventType.APP_INFO,
                });
              } else if (teamId && (stateData.domain || stateData.url)) {
                await workspaceAuth.saveInstallationState(teamId, stateData);
                logEvent({
                  text: `Saved partial installation state for team ${teamId}: ${JSON.stringify(
                    stateData,
                  )}`,
                  eventType: EventType.APP_INFO,
                });
              }

              if (stateData.domain && stateData.url) {
                await client.chat.postMessage({
                  channel: installation.user?.id,
                  text: "🎉 Welcome to Mintie! Your Mintlify settings have been automatically configured.",
                  blocks: [
                    {
                      type: "section",
                      text: {
                        type: "mrkdwn",
                        text: `🎉 *Welcome to Mintie!*\n\nGreat news! I've automatically configured your Mintlify settings:\n\n• *Domain:* ${stateData.domain}\n• *URL:* ${stateData.url}\n\nYou're all set to start using Mintie for your documentation needs! Just add and mention me in any channel or send me a DM to get help with your docs.`,
                      },
                    },
                  ],
                });
              } else {
                await client.chat.postMessage({
                  channel: installation.user?.id,
                  text: "🎉 Welcome to Mintie! To get started, please configure your Mintlify settings.",
                  blocks: [
                    {
                      type: "section",
                      text: {
                        type: "mrkdwn",
                        text: "🎉 *Welcome to Mintie!*\n\nTo help you with your documentation, I need to know about your Mintlify setup. Please click the button below to configure your settings.",
                      },
                    },
                    {
                      type: "actions",
                      elements: [
                        {
                          type: "button",
                          text: {
                            type: "plain_text",
                            text: "Configure Mintlify",
                          },
                          action_id: "configure_mintlify",
                          style: "primary",
                        },
                      ],
                    },
                  ],
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
          res?.writeHead(500);
          res?.end(
            "Installation completed but there was an error setting up the configuration.",
          );
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

  try {
    const teamId = context.teamId;
    if (!teamId) {
      throw new Error("Team ID not found in context");
    }

    const triggerId = "trigger_id" in body ? body.trigger_id : "";
    await openMintlifyConfigModal(client, triggerId, teamId);

    logEvent({
      text: `User clicked configure Mintlify button for team ${teamId}`,
      eventType: EventType.APP_INFO,
    });
  } catch (error) {
    logEvent({
      text: `Error handling configure Mintlify action: ${error}`,
      eventType: EventType.APP_ERROR,
    });
  }
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
      text: `Error handling Mintlify config modal submission: ${error}`,
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
