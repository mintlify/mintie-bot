import { WebClient } from "@slack/web-api";
import {
  StatusManager,
  createInitialMessage,
  formatMarkdownForSlack,
  generateFingerprint,
  parseStreamingResponse,
} from "../utils/utils";
import { MintlifyApiRequest } from "../types";

export class MessageOperator {
  private client: WebClient;
  private apiUrl: string;
  private authToken: string;

  constructor(client: WebClient, authToken: string, domain: string) {
    this.client = client;
    this.apiUrl = `https://leaves.mintlify.com/api/discovery/v1/assistant/${domain}/message`;
    this.authToken = authToken;
  }

  async processMessage(
    userMessage: string,
    channel: string,
    threadTs?: string,
    isDirectMessage = true,
    originalMessageTs?: string,
  ): Promise<void> {
    let statusManager: StatusManager | null = null;

    try {
      const fingerprint = generateFingerprint(channel, threadTs);
      const apiRequest = this.formatApiRequest(userMessage, fingerprint);

      const effectiveThreadTs = isDirectMessage
        ? threadTs
        : threadTs || originalMessageTs;
      const messageTs = await createInitialMessage(
        this.client,
        channel,
        effectiveThreadTs,
      );

      const replyThreadTs = isDirectMessage
        ? effectiveThreadTs
        : threadTs || messageTs;
      statusManager = new StatusManager(
        this.client,
        channel,
        messageTs,
        replyThreadTs,
      );

      statusManager.start();

      await this.generateResponse(apiRequest, statusManager);
    } catch (error) {
      console.error("Error in message operator:", error);

      if (statusManager) {
        statusManager.stop();
      }

      const errorThreadTs = isDirectMessage
        ? threadTs
        : statusManager?.messageTs;

      await this.client.chat.postMessage({
        channel,
        text: "Sorry, I encountered an error while processing your request.",
        thread_ts: errorThreadTs,
      });
    }
  }

  private formatApiRequest(
    userMessage: string,
    fingerprint: string,
  ): MintlifyApiRequest {
    const messageId = `msg-${Date.now()}`;

    return {
      fp: fingerprint,
      messages: [
        {
          id: messageId,
          role: "user",
          content: userMessage,
          parts: [
            {
              type: "text",
              text: userMessage,
            },
          ],
        },
      ],
    };
  }

  private async generateResponse(
    apiRequest: MintlifyApiRequest,
    statusManager: StatusManager,
  ): Promise<void> {
    const response = await this.createMessage(
      apiRequest,
      this.apiUrl,
      this.authToken,
    );

    if (response) {
      await statusManager.finalUpdate(response);
      const parsedContent = parseStreamingResponse(response);
      const formattedContent = formatMarkdownForSlack(parsedContent);

      await this.client.chat.update({
        channel: statusManager.channel,
        ts: statusManager.messageTs,
        text: formattedContent,
      });
    }
  }

  private async createMessage(
    apiRequest: MintlifyApiRequest,
    apiUrl: string,
    authToken: string,
  ): Promise<string> {
    const requestBody = JSON.stringify(apiRequest);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authToken,
        "User-Agent": "Mintlify-Slack-Bot/1.0",
      },
      body: requestBody,
    })
      .then((res) => res.text())
      .catch((err) => {
        console.error("Error making API request:", err);
        throw new Error(`Failed to call Mintlify API: ${err.message}`);
      });

    return response;
  }
}
