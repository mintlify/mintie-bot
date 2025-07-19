import { LogEvent } from "../types";


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
