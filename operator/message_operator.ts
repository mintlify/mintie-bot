import { WebClient } from "@slack/web-api";
import { StatusManager, createInitialMessage, generateFingerprint } from "../utils/utils";

interface MintlifyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: Array<{
    type: "text";
    text: string;
  }>;
}

interface MintlifyApiRequest {
  fp: string;
  messages: MintlifyMessage[];
}

interface StreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}

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
  ): Promise<void> {
    let statusManager: StatusManager | null = null;
    
    try {
      const fingerprint = generateFingerprint(channel, threadTs);
      const apiRequest = this.formatApiRequest(userMessage, fingerprint);
      
      // Create initial message and start status cycling
      const messageTs = await createInitialMessage(this.client, channel, threadTs);
      statusManager = new StatusManager(this.client, channel, messageTs, threadTs);
      statusManager.start();

      await this.streamResponse(apiRequest, statusManager);
    } catch (error) {
      console.error("Error in message operator:", error);
      
      if (statusManager) {
        statusManager.stop();
      }
      
      await this.client.chat.postMessage({
        channel,
        text: "Sorry, I encountered an error while processing your request.",
        thread_ts: threadTs,
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

  private async streamResponse(
    apiRequest: MintlifyApiRequest,
    statusManager: StatusManager,
  ): Promise<void> {
    try {
      const response = await this.makeApiRequest(
        apiRequest,
        this.apiUrl,
        this.authToken,
      );

      if (response) {
        await statusManager.finalUpdate(response);
      }
    } catch (error) {
      console.error("Error streaming response:", error);
      throw error;
    }
  }

  private async makeApiRequest(
    apiRequest: MintlifyApiRequest,
    apiUrl: string,
    authToken: string,
  ): Promise<string> {
    try {
      const requestBody = JSON.stringify(apiRequest);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
          "User-Agent": "Mintlify-Slack-Bot/1.0",
        },
        body: requestBody,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const responseText = await response.text();
      return responseText;
    } catch (error) {
      console.error("Error making API request:", error);
      throw new Error(
        `Failed to call Mintlify API: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }
}

export { MintlifyApiRequest, MintlifyMessage, StreamChunk };
