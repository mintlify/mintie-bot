import { WebClient } from "@slack/web-api";
import model from "../database/db";
import { EventType } from "../types";
import { logEvent } from "../utils/logging";

export const openMintlifyConfigModal = async (
  client: WebClient,
  triggerId: string,
  teamId: string,
) => {
  try {
    const userDoc = await model.SlackUser.findOne({ _id: teamId });
    const mintlifyConfig = userDoc?.mintlify;
    const installationState = userDoc?.installationState;

    const isDomainConfigured = mintlifyConfig?.domain || installationState?.domain;
    const isUrlConfigured = mintlifyConfig?.url || installationState?.url;
    const isAutoConfigured = isDomainConfigured && isUrlConfigured;

    const initialDomainValue = installationState?.domain || mintlifyConfig?.domain || "";
    const initialUrlValue = installationState?.url || mintlifyConfig?.url || "";

    const modalBlocks = [];

    if (isAutoConfigured) {
      modalBlocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🎉 *Great! Your Mintlify settings are configured:*\n\n• *Domain:* ${isDomainConfigured}\n• *URL:* ${isUrlConfigured}\n\nNow just add your API key to complete the setup.`,
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
            initial_value: isDomainConfigured,
          },
          label: {
            type: "plain_text",
            text: "Domain Name (configured)",
          },
          optional: true,
          hint: {
            type: "plain_text",
            text: "This field has been auto-configured and is read-only.",
          },
        },
        {
          type: "input",
          block_id: "url_block",
          element: {
            type: "url_text_input",
            action_id: "url_input",
            initial_value: isUrlConfigured,
          },
          label: {
            type: "plain_text",
            text: "Documentation URL (configured)",
          },
          optional: true,
          hint: {
            type: "plain_text",
            text: "This field has been auto-configured and is read-only.",
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
            ...(mintlifyConfig?.authKey && { initial_value: mintlifyConfig.authKey }),
          },
          label: {
            type: "plain_text",
            text: "Mintlify Assistant API Key",
          },
          hint: {
            type: "plain_text",
            text: "Your assistant API key for accessing Mintlify APIs.",
          },
        }
      );
    } else {
      modalBlocks.push(
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
            ...(initialDomainValue && { initial_value: initialDomainValue }),
          },
          label: {
            type: "plain_text",
            text: "Domain Name",
          },
          hint: {
            type: "plain_text",
            text: "Your Mintlify domain name (upper-right corner on your Mintlify dashboard)",
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
            ...(initialUrlValue && { initial_value: initialUrlValue }),
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
            ...(mintlifyConfig?.authKey && { initial_value: mintlifyConfig.authKey }),
          },
          label: {
            type: "plain_text",
            text: "Mintlify Assistant API Key",
          },
          hint: {
            type: "plain_text",
            text: "Your assistant API key for accessing Mintlify APIs.",
          },
        }
      );
    }

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
        blocks: modalBlocks,
        private_metadata: JSON.stringify({ teamId }),
      },
    });

    logEvent({
      text: `Opened Mintlify config modal for team ${teamId}${
        installationState
          ? " with pre-populated data from installation state"
          : ""
      }`,
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

    const userDoc = await model.SlackUser.findOne({ _id: teamId });
    const mintlifyConfig = userDoc?.mintlify;

    const domain = state.values.domain_block?.domain_input?.value || mintlifyConfig?.domain;
    const url = state.values.url_block?.url_input?.value || mintlifyConfig?.url;
    const authKey = state.values.auth_key_block.auth_key_input.value;

    const errors: Record<string, string> = {};
    if (!domain) errors.domain_block = "Domain is required";
    if (!url) errors.url_block = "URL is required";
    if (!authKey) errors.auth_key_block = "Auth key is required";

    if (Object.keys(errors).length > 0) {
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
      text: `Saved Mintlify configuration for team ${teamId}: domain=${domain}, url=${url}`,
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
        auth_key_block: "Failed to save configuration. Please try again.",
      },
    };
  }
};
