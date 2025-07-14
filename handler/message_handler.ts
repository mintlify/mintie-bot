import { SlackEventMiddlewareArgs } from "@slack/bolt";
import { extractUserMessage } from "../utils/utils";
import { MentionMessageRequest, MentionMessageResponse } from "../types";

export class MessageHandler {
  async handleMention(
    args: SlackEventMiddlewareArgs<"app_mention">,
  ): Promise<MentionMessageResponse> {
    try {
      const { event } = args;
      const messageText = extractUserMessage(event.text);

      if (!messageText) {
        return {
          success: false,
          error: "No message content provided after mention",
        };
      }

      const mentionRequest: MentionMessageRequest = {
        text: messageText,
        user: event.user || "",
        channel: event.channel,
        ts: event.ts,
      };

      return {
        success: true,
        message: "Message processed successfully",
        data: mentionRequest,
      };
    } catch (error) {
      console.error("Error in message handler:", error);
      return {
        success: false,
        error: "Failed to process message",
      };
    }
  }
}
