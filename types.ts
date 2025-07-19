export interface envVars {
  SLACK_SIGNING_SECRET: string;
  PORT: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

export enum EventType {
  APP_CHANNEL_MENTION = "CHANNEL_MENTION",
  APP_CHANNEL_MESSAGE = "CHANNEL_MESSAGE",
  APP_DIRECT_MESSAGE = "DIRECT_MESSAGE",
  APP_GENERATE_MESSAGE_ERROR = "GENERATE_MESSAGE_ERROR",
  APP_ERROR = "ERROR",
  APP_INFO = "INFO",
  APP_DEBUG = "DEBUG",
  APP_STARTUP_ERROR = "STARTUP_ERROR",
}

export interface LogEvent {
  eventType: EventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event?: any;
  text?: string;
}

export interface MintlifyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: {
    type: "text";
    text: string;
  }[];
}

export interface MintlifyApiRequest {
  fp: string;
  messages: MintlifyMessage[];
  slackAgent: boolean;
}

export interface DocsLink {
  link: string;
  title?: string;
}

export interface MintlifyConfig {
  domain: string;
  url: string;
  authKey: string;
  isConfigured: boolean;
}

export interface ChannelMentionEvent {
  channel: string;
  ts: string;
  thread_ts?: string;
  text: string;
  subtype?: string;
  bot_id?: string;
}

export type Block = MarkdownBlock | DividerBlock | SectionBlock;

export interface MarkdownBlock {
  type: "markdown";
  text: string;
}

export interface DividerBlock {
  type: "divider";
}

export interface SectionBlock {
  type: "section";
  text: {
    type: "mrkdwn";
    text: string;
  };
}

export interface ParseStreamingRequest {
  streamData: string;
  baseUrl?: string;
}

export interface ParseStreamingResult {
  content: string;
  sources: DocsLink[];
}
