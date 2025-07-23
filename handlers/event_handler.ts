import { ChannelMentionEvent, EventType } from "../types";
import { logEvent } from "../utils/logging";
import { WebClient } from "@slack/web-api";
import { fetchThreadHistory, getChannelName } from "../utils/utils";
import { processMessage } from "../operators/event_operator";

async function handleChannelMention(
  event: ChannelMentionEvent,
  client: WebClient,
) {
  const channelName = await getChannelName(client, event);

  if (channelName === "ask-ai") {
    return;
  }

  logEvent({ event, eventType: EventType.APP_CHANNEL_MENTION });

  const contextMessage = await fetchThreadHistory(
    client,
    event.channel,
    event.ts,
  );

  let finalMessage = event.text;

  if (contextMessage) {
    finalMessage = `${contextMessage}\n\nThis is the user's current message: ${finalMessage}`;
  }

  try {
    await processMessage(
      client,
      finalMessage,
      event.channel,
      event.thread_ts,
      event.ts,
    );
  } catch (error) {
    logEvent({ event: error, eventType: EventType.APP_ERROR });

    client.chat.postMessage({
      channel: event.channel,
      text: "Sorry, I encountered an error processing your request.",
      thread_ts: event.ts,
    });
  }
}

async function handleChannelMessage(
  event: ChannelMentionEvent,
  client: WebClient,
) {
  const channelName = await getChannelName(client, event);

  if (channelName === "ask-ai") {
    logEvent({ event, eventType: EventType.APP_CHANNEL_MESSAGE });

    let messageText = event.text || "";

    if (event.thread_ts) {
      const threadContext = await fetchThreadHistory(
        client,
        event.channel,
        event.thread_ts,
      );

      if (threadContext) {
        messageText = `${threadContext}\n\nCurrent message: ${messageText}`;
      }
    }

    try {
      await processMessage(
        client,
        messageText,
        event.channel,
        event.thread_ts,
        event.ts,
      );
    } catch (error) {
      logEvent({ event: error, eventType: EventType.APP_ERROR });

      client.chat.postMessage({
        channel: event.channel,
        text: "Hey there! I'm Mintie, your Mintlify documentation assistant. How can I help you today?",
        thread_ts: event.ts,
      });
    }
  }
}

export { handleChannelMention, handleChannelMessage };
