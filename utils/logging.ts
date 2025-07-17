export enum EventType {
  APP_MENTION = "APP_MENTION",
  APP_MESSAGE = "APP_MESSAGE",
  APP_ERROR = "APP_ERROR",
  APP_INFO = "APP_INFO",
  APP_DEBUG = "APP_DEBUG",
}

export const logEvent = (event: any, eventType: EventType) => {
  console.log(`[${eventType}] Received event:`, {
    channel: event.channel.name,
    user: event.user,
    text: event.text,
  });
};
