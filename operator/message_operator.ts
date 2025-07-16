import { WebClient } from "@slack/web-api";
import { createInitialMessage, generateFingerprint } from "../utils/utils";
import { StatusManager } from "../utils/status_manager";
import { MintlifyApiRequest } from "../types";

export class MessageOperator {
  private client: WebClient;
  private apiUrl: string;
  private authToken: string;
  private docsDomain: string;
  private docsDomainURL?: string;

  constructor(
    client: WebClient,
    authToken: string,
    domain: string,
    docsDomainURL?: string,
  ) {
    this.client = client;
    this.apiUrl = `https://api-dsc.mintlify.com/v1/assistant/${domain}/message`;
    this.authToken = authToken;
    this.docsDomain = domain;
    this.docsDomainURL = docsDomainURL;
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
        this.docsDomainURL,
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
      slackAgent: true,
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
      .then(async (res) => {
        if (!res.ok) {
          const errorText = await res.text();
          console.error(
            `Mintlify API responded with status ${res.status}:`,
            errorText,
          );
        }
        return res.text();
      })
      .catch((err) => {
        throw new Error(`Failed to call Mintlify API: ${err.message}`);
      });

    return response;
  }
}
