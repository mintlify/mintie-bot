import { WebClient } from "@slack/web-api";
import { Block, DocsLink } from "../types";
import { parseStreamingResponse } from "./utils";

export class StatusManager {
  private statuses = ["Thinking.", "Thinking..", "Thinking..."];
  private currentIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private slackClient: WebClient;
  public channel: string;
  public messageTs: string;
  private docsDomainURL?: string;
  constructor(
    slackClient: WebClient,
    channel: string,
    messageTs: string,
    docsDomainURL?: string,
  ) {
    this.slackClient = slackClient;
    this.channel = channel;
    this.messageTs = messageTs;
    this.docsDomainURL = docsDomainURL;
  }

  start(): void {
    this.interval = setInterval(() => {
      this.updateStatus();
    }, 1000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async updateStatus(): Promise<void> {
    this.currentIndex = (this.currentIndex + 1) % this.statuses.length;

    await this.slackClient.chat.update({
      channel: this.channel,
      ts: this.messageTs,
      text: this.statuses[this.currentIndex],
    });
  }

  async finalUpdate(content: string): Promise<void> {
    this.stop();
    const { content: parsedContent, sources } = parseStreamingResponse(content);

    if (parsedContent.length > 3000) {
      const splitPoint = this.findSafeSplitPoint(parsedContent);
      const firstPart = parsedContent.substring(0, splitPoint).trim();
      const secondPart = parsedContent.substring(splitPoint).trim();

      const firstBlocks = [
        {
          type: "markdown",
          text: firstPart,
        },
      ];

      await this.slackClient.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: firstPart,
        blocks: firstBlocks,
      });

      const secondBlocks = this.buildSecondMessageBlocks(secondPart, sources);
      await this.slackClient.chat.postMessage({
        channel: this.channel,
        thread_ts: this.messageTs,
        text: secondPart,
        blocks: secondBlocks,
      });
    } else {
      const blocks = this.buildMessageBlocks(parsedContent, sources);
      await this.slackClient.chat.update({
        channel: this.channel,
        ts: this.messageTs,
        text: parsedContent,
        blocks: blocks,
      });
    }
  }

  private findSafeSplitPoint(content: string): number {
    const midPoint = Math.floor(content.length / 2);

    for (let i = midPoint; i < content.length && i < midPoint + 200; i++) {
      if (content[i] === "\n" && content[i + 1] === "\n") {
        return i + 2;
      }
    }

    for (let i = midPoint; i > 0 && i > midPoint - 200; i--) {
      if (content[i] === "\n" && content[i + 1] === "\n") {
        return i + 2;
      }
    }

    return content.lastIndexOf(" ", midPoint) + 1;
  }

  private buildSecondMessageBlocks(
    content: string,
    sources: DocsLink[],
  ): Block[] {
    const blocks: Block[] = [];

    blocks.push({
      type: "markdown",
      text: content,
    });

    if (sources && sources.length > 0) {
      blocks.push({
        type: "divider",
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: this.formatSourcesForBlocks(sources),
        },
      });
    }

    return blocks;
  }

  private buildMessageBlocks(content: string, sources: DocsLink[]): Block[] {
    const blocks: Block[] = [];

    blocks.push({
      type: "markdown",
      text: content,
    });

    if (sources && sources.length > 0) {
      blocks.push({
        type: "divider",
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: this.formatSourcesForBlocks(sources),
        },
      });
    }

    return blocks;
  }

  private formatSourcesForBlocks(sources: DocsLink[]): string {
    const baseUrl = this.docsDomainURL || "https://mintlify.com/docs/";

    const links = sources.map((source, idx) => {
      let url: string;

      if (
        source.link.startsWith("</") &&
        source.link.includes("|") &&
        source.link.endsWith(">")
      ) {
        const match = source.link.match(/<\/([^|]+)\|([^>]+)>/);
        if (match) {
          const [, rawPath] = match;
          const path = rawPath.replace(/^\//, "");
          url = baseUrl.endsWith("/") ? baseUrl + path : baseUrl + "/" + path;
        } else {
          url = source.link;
        }
      } else {
        url = source.link.startsWith("http")
          ? source.link
          : baseUrl + source.link.replace(/^\//, "");
      }

      return `<${url}|${idx + 1}>`;
    });

    return `*Sources:* ${links.join(" • ")}`;
  }
}
