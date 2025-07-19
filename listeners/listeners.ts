import { App } from "@slack/bolt";
import { handleChannelMention } from "../handler/event_handler";
import { ChannelMentionEvent, EventType } from "../types";
import { handleChannelMessage } from "../handler/event_handler";
import uninstallApp from "../database/auth/uninstall_app";
import { logEvent } from "../utils/logging";

export const handleAppMention = (app: App) => {
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
      await handleChannelMessage(message as ChannelMentionEvent, client);
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
};
