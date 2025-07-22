export const preConfiguredMintlifyMessage = (
  channel: string,
  domain: string,
  url: string,
) => {
  return {
    channel: channel,
    text: "🎉 Welcome to Mintie! I've configured your Mintlify domain and URL. Please add your API key to complete setup.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎉 *Welcome to Mintie!*\n\nGreat news! I've automatically configured your Mintlify settings:\n\n• *Domain:* ${domain}\n• *URL:* ${url}\n\nTo complete your setup, please add your Mintlify API key by clicking the button below.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Add API Key",
            },
            action_id: "configure_mintlify",
            style: "primary",
          },
        ],
      },
    ],
  };
};

export const fullConfigureMintlifyMessage = (channel: string) => {
  return {
    channel: channel,
    text: "🎉 Welcome to Mintie! To get started, please configure your Mintlify settings.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "🎉 *Welcome to Mintie!*\n\nTo help you with your documentation, I need to know about your Mintlify documentation setup. Please click the button below to configure your settings.",
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
  };
};
