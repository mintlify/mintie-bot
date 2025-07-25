import { Installation, InstallURLOptions } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { IncomingMessage, ServerResponse } from "http";
import { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import { randomUUID } from "crypto";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
import model from "../database/db";
import { MintlifyConfig } from "../types";
import { constructDocumentationURL } from "../utils/utils";
import dbQuery from "../database/get_user";

const domainConfigStore = new Map<
  string,
  { id: string; subdomain: string; encryptedApiKey: string; redirectUri?: string; timestamp: number }
>();

setInterval(() => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of domainConfigStore.entries()) {
    if (value.timestamp < tenMinutesAgo) {
      domainConfigStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

async function processCustomInstall(
  req: ParamsIncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const encodedParams = req.params?.encodedParams;

    logEvent({
      text: `Custom install route called with encoded params: ${encodedParams}`,
      eventType: EventType.APP_INFO,
    });

    const decodedParams = Buffer.from(encodedParams || "", "base64").toString(
      "utf8",
    );
    const { subdomain, apiKey, redirectUri } = JSON.parse(decodedParams);

    logEvent({
      text: `Decoded install params: subdomain=${subdomain}, apiKey=${apiKey}, redirectUri=${redirectUri}`,
      eventType: EventType.APP_INFO,
    });

    if (subdomain && apiKey) {
      const configId = randomUUID();

      await model.SlackUser.create({
        _id: configId,
        subdomain: subdomain,
        encryptedApiKey: model.encrypt(apiKey),
        isConfigured: false,
        createdAt: new Date(),
      });

      domainConfigStore.set(configId, {
        id: configId,
        subdomain,
        encryptedApiKey: apiKey,
        redirectUri,
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
}

async function sendCongratulationsDM(
  installation: Installation<"v1" | "v2", boolean>,
  config?: { subdomain: string; encryptedApiKey: string },
): Promise<void> {
  try {
    const client = new WebClient(installation.bot?.token);
    const userId = installation.user?.id;

    if (!userId) {
      logEvent({
        text: "Cannot send congratulations DM - no user ID found",
        eventType: EventType.APP_INFO,
      });
      return;
    }

    let messageText =
      "🎉 *Congratulations on installing mintie!*\n\nI'm your AI documentation assistant and I'm here to help you with all your Mintlify documentation needs.";

    if (config?.subdomain) {
      const documentationUrl = await constructDocumentationURL(
        config.subdomain,
      );
      messageText += `\n\n*Your Mintlify Docs Site:*\n${documentationUrl}`;
    }

    messageText +=
      "\n\n*Getting Started:*\n•  Add me to any channel where you want documentation help\n•  Simply mention @mintlify or ask questions in channels I'm added to\n•  I can help answer questions about your docs, explain concepts, and more!";

    await client.chat.postMessage({
      channel: userId,
      text: "🎉 Congratulations on installing mintie!",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: messageText,
          },
        },
      ],
    });

    logEvent({
      text: `Congratulations DM sent to user ${userId}${
        config ? ` with domain ${config.subdomain}` : ""
      }`,
      eventType: EventType.APP_INFO,
    });
  } catch (error) {
    logEvent({
      text: `Failed to send congratulations DM: ${error}`,
      eventType: EventType.APP_ERROR,
    });
  }
}

async function processInstallationSuccess(
  installation: Installation<"v1" | "v2", boolean>,
  _installOptions: InstallURLOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const teamId = installation.team?.id;
  if (!teamId) {
    logEvent({
      text: "Installation success but no team ID found",
      eventType: EventType.APP_ERROR,
    });
    res?.writeHead(500);
    res?.end("Installation failed - no team ID");
    return;
  }

  const foundConfig = findConfigFromCookie(req.headers.cookie);

  let teamConfig: MintlifyConfig | undefined;

  if (foundConfig) {
    const { config, configId } = foundConfig;
    teamConfig = {
      subdomain: config.subdomain,
      encryptedApiKey: config.encryptedApiKey,
      redirectUri: config.redirectUri,
    };
    await updateTeamConfig(teamId, teamConfig, configId);
  } else {
    logEvent({
      text: `No domain configuration found in memory for team ${teamId}`,
      eventType: EventType.APP_INFO,
    });

    try {
      const existingTeamData = await dbQuery.findUser(teamId);
      if (existingTeamData?.subdomain && existingTeamData?.encryptedApiKey) {
        teamConfig = {
          subdomain: existingTeamData.subdomain,
          encryptedApiKey: existingTeamData.encryptedApiKey,
        };
        logEvent({
          text: `Retrieved existing config from database for team ${teamId}: ${existingTeamData.subdomain}`,
          eventType: EventType.APP_INFO,
        });
      }
    } catch (error) {
      logEvent({
        text: `Could not retrieve existing config from database for team ${teamId}: ${error}`,
        eventType: EventType.APP_INFO,
      });
    }
  }

  await sendCongratulationsDM(installation, teamConfig);

  logEvent({
    text: `Installation successful for team ${teamId}`,
    eventType: EventType.APP_INFO,
  });

  if (teamConfig?.redirectUri) {
    logEvent({
      text: `Redirecting to provided redirectUri: ${teamConfig.redirectUri}`,
      eventType: EventType.APP_INFO,
    });
    res?.writeHead(302, { Location: teamConfig.redirectUri });
    res?.end();
  } else {
    res?.writeHead(200, { "Content-Type": "text/html" });
    res?.end(getSuccessPageHTML());
  }
}

function getSuccessPageHTML(): string {
  return `
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
`;
}

function findConfigFromCookie(
  cookies: string | undefined,
): { config: MintlifyConfig; configId: string } | null {
  if (!cookies) return null;

  const cookieMatch = cookies.match(/mintie_config_id=([^;]+)/);
  if (cookieMatch) {
    const configId = cookieMatch[1];
    const config = domainConfigStore.get(configId);
    if (config) return { config, configId };
  }
  return null;
}

async function updateTeamConfig(
  teamId: string,
  config: { subdomain: string; encryptedApiKey: string; redirectUri?: string },
  configId: string,
): Promise<void> {
  await model.SlackUser.updateOne(
    { _id: teamId },
    {
      $set: {
        subdomain: config.subdomain,
        encryptedApiKey: model.encrypt(config.encryptedApiKey),
        isConfigured: true,
      },
    },
    { upsert: true },
  );

  await model.SlackUser.deleteOne({ _id: configId });
  domainConfigStore.delete(configId);

  logEvent({
    text: `Updated team ${teamId} with domain config: ${JSON.stringify(
      config,
    )}`,
    eventType: EventType.APP_INFO,
  });
}

export { processCustomInstall, processInstallationSuccess };
