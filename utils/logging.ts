export enum EventType {
  APP_CHANNEL_MENTION = "CHANNEL_MENTION",
  APP_CHANNEL_MESSAGE = "CHANNEL_MESSAGE",
  APP_DIRECT_MESSAGE = "DIRECT_MESSAGE",
  APP_ERROR = "ERROR",
  APP_INFO = "INFO",
  APP_DEBUG = "DEBUG",
  APP_STARTUP_ERROR = "STARTUP_ERROR",
}

export interface LogEvent {
  eventType: EventType;
  event?: any;
  text?: string;
}

export const logEvent = (log: LogEvent) => {
  console.log(
    `[${log.eventType}] Received event:`,
    log.event
      ? {
          channel: log.event.channel,
          user: log.event.user,
          text: log.event.text,
        }
      : log.text,
  );
};
