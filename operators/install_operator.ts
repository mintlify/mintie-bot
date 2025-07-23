import { Installation, InstallURLOptions } from "@slack/bolt";
import { IncomingMessage, ServerResponse } from "http";
import { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import { randomUUID } from "crypto";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";
import model from "../database/db";
import { MintlifyConfig } from "../types";

const domainConfigStore = new Map<
  string,
  { id: string; subdomain: string; apiKey: string; timestamp: number }
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

  let foundConfig = findConfigFromCookie(req.headers.cookie);
  if (!foundConfig) {
    foundConfig = findAnyConfig();
  }

  if (foundConfig) {
    const { config, configId } = foundConfig;
    await updateTeamConfig(
      teamId,
      { subdomain: config.subdomain, apiKey: config.apiKey },
      configId,
    );
  } else {
    logEvent({
      text: `No domain configuration found in memory for team ${teamId}`,
      eventType: EventType.APP_INFO,
    });
  }

  logEvent({
    text: `Installation successful for team ${teamId}`,
    eventType: EventType.APP_INFO,
  });

  res?.writeHead(200, { "Content-Type": "text/html" });
  res?.end(getSuccessPageHTML());
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

function findAnyConfig(): { config: MintlifyConfig; configId: string } | null {
  for (const [id, config] of domainConfigStore.entries()) {
    return { config, configId: id };
  }
  return null;
}

async function updateTeamConfig(
  teamId: string,
  config: { subdomain: string; apiKey: string },
  configId: string,
): Promise<void> {
  await model.SlackUser.updateOne(
    { _id: teamId },
    { $set: config },
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
