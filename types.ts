export interface envVars {
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  SLACK_APP_TOKEN: string;
  MINTLIFY_AUTH_TOKEN: string;
  MINTLIFY_DOCS_DOMAIN: string;
  PORT?: string;
}

export interface MentionMessageRequest {
  text: string;
  user: string;
  channel: string;
  ts: string;
}

export interface MentionMessageResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: MentionMessageRequest;
}

export interface MintlifyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: Array<{
    type: "text";
    text: string;
  }>; 
}

export interface MintlifyApiRequest {
  fp: string;
  messages: MintlifyMessage[];
}
