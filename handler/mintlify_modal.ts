import { WebClient } from "@slack/web-api";
import { EventType, logEvent } from "../utils/logging";
import model from "../database/db";

export const openMintlifyConfigModal = async (
  client: WebClient,
  triggerId: string,
  teamId: string,
) => {
  try {
    const result = await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "mintlify_config_modal",
        title: {
          type: "plain_text",
          text: "Configure Mintlify",
        },
        submit: {
          type: "plain_text",
          text: "Save Configuration",
        },
        close: {
          type: "plain_text",
          text: "Cancel",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Welcome to Mintie! To get started, please provide your Mintlify configuration details.",
            },
          },
          {
            type: "divider",
          },
          {
            type: "input",
            block_id: "domain_block",
            element: {
              type: "plain_text_input",
              action_id: "domain_input",
              placeholder: {
                type: "plain_text",
                text: "e.g., mintlify",
              },
            },
            label: {
              type: "plain_text",
              text: "Domain Name",
            },
            hint: {
              type: "plain_text",
              text: "Your Mintlify domain name (found in the upper-right corner on your Mintlify dashboard)",
            },
          },
          {
            type: "input",
            block_id: "url_block",
            element: {
              type: "url_text_input",
              action_id: "url_input",
              placeholder: {
                type: "plain_text",
                text: "https://mintlify.com/docs",
              },
            },
            label: {
              type: "plain_text",
              text: "Documentation URL",
            },
            hint: {
              type: "plain_text",
              text: "The full URL to your Mintlify documentation site",
            },
          },
          {
            type: "input",
            block_id: "auth_key_block",
            element: {
              type: "plain_text_input",
              action_id: "auth_key_input",
              placeholder: {
                type: "plain_text",
                text: "Your Mintlify Auth Key",
              },
            },
            label: {
              type: "plain_text",
              text: "Mintlify Assistant API Key",
            },
            hint: {
              type: "plain_text",
              text: "Your assistant API key for accessing Mintlify APIs.",
            },
          },
        ],
        private_metadata: JSON.stringify({ teamId }),
      },
    });

    logEvent({
      text: `Opened Mintlify config modal for team ${teamId}`,
      eventType: EventType.APP_INFO,
    });

    return result;
  } catch (error) {
    logEvent({
      text: `Error opening Mintlify config modal: ${error}`,
      eventType: EventType.APP_ERROR,
    });
    throw error;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleMintlifyConfigSubmission = async (payload: any) => {
  try {
    const { private_metadata, state } = payload.view;
    const { teamId } = JSON.parse(private_metadata);

    const domain = state.values.domain_block.domain_input.value;
    const url = state.values.url_block.url_input.value;
    const authKey = state.values.auth_key_block.auth_key_input.value;

    if (!domain || !url || !authKey) {
      const errors: Record<string, string> = {};
      if (!domain) errors.domain_block = "Domain is required";
      if (!url) errors.url_block = "URL is required";
      if (!authKey) errors.auth_key_block = "Auth key is required";

      return {
        response_action: "errors" as const,
        errors,
      };
    }

    await model.SlackUser.updateOne(
      { _id: teamId },
      {
        $set: {
          "mintlify.domain": domain,
          "mintlify.url": url,
          "mintlify.authKey": authKey,
          "mintlify.isConfigured": true,
        },
      },
    );

    logEvent({
      text: `Saved Mintlify configuration for team ${teamId}`,
      eventType: EventType.APP_INFO,
    });

    return {
      response_action: "clear" as const,
    };
  } catch (error) {
    logEvent({
      text: `Error handling Mintlify config submission: ${error}`,
      eventType: EventType.APP_ERROR,
    });

    return {
      response_action: "errors" as const,
      errors: {
        domain_block: "Failed to save configuration. Please try again.",
      },
    };
  }
};
