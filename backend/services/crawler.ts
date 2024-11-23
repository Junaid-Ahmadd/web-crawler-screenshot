import { HTMLRewriter } from "../dependencies.ts";

export class CrawlerService {
  private visitedUrls = new Set<string>();
  private queue: string[] = [];
  private processing = new Set<string>();
  private baseUrl = "";
  private domain = "";
  private maxConcurrent = 5;
  private activeRequests = 0;
  private ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  private sendUpdate(type: "link" | "error" | "info", data: unknown) {
    this.ws.send(JSON.stringify({ type, data }));
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url, this.baseUrl);
      // Skip common non-HTML resource extensions
      if (parsedUrl.pathname.match(/\.(jpg|jpeg|png|gif|css|js|ico|svg|woff|woff2|ttf|eot|pdf|zip|rar|exe|mp[34]|avi|mkv)$/i)) {
        return false;
      }
      return parsedUrl.hostname === this.domain;
    } catch {
      return false;
    }
  }

  private normalizeUrl(url: string): string {
    try {
      // Handle relative URLs by using the base URL
      const parsedUrl = new URL(url, this.baseUrl);
      parsedUrl.hash = ""; // Remove fragments
      parsedUrl.search = ""; // Remove query parameters for deduplication
      // Ensure trailing slash consistency
      if (!parsedUrl.pathname.includes(".")) {
        parsedUrl.pathname = parsedUrl.pathname.replace(/\/?$/, "/");
      }
      return parsedUrl.href;
    } catch {
      return "";
    }
  }

  private async processUrl(url: string) {
    if (this.processing.has(url)) return;
    this.processing.add(url);
    this.activeRequests++;

    try {
      this.sendUpdate("info", `Crawling: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const links = await this.extractLinks(html, url);

      for (const link of links) {
        const normalizedLink = this.normalizeUrl(link);
        if (normalizedLink && !this.visitedUrls.has(normalizedLink) && this.isValidUrl(normalizedLink)) {
          this.visitedUrls.add(normalizedLink);
          this.queue.push(normalizedLink);
          this.sendUpdate("link", normalizedLink);
        }
      }
    } catch (error) {
      this.sendUpdate("error", `Error processing ${url}: ${error.message}`);
    } finally {
      this.processing.delete(url);
      this.activeRequests--;
      this.processQueue();
    }
  }

  private async extractLinks(html: string, baseUrl: string): Promise<string[]> {
    const links: string[] = [];
    
    const rewriter = new HTMLRewriter();
    rewriter.on("a", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) {
          links.push(href);
        }
      }
    });

    await rewriter.transform(new Response(html)).text();
    return links;
  }

  private async processQueue() {
    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const url = this.queue.shift();
      if (url) {
        this.processUrl(url);
      }
    }

    if (this.queue.length === 0 && this.activeRequests === 0) {
      this.sendUpdate("info", "Crawling completed");
    }
  }

  public async startCrawling(url: string) {
    try {
      const parsedUrl = new URL(url);
      this.baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      this.domain = parsedUrl.hostname;
      
      this.visitedUrls.clear();
      this.queue = [];
      this.processing.clear();
      this.activeRequests = 0;

      this.visitedUrls.add(url);
      this.queue.push(url);
      this.processQueue();
    } catch (error) {
      this.sendUpdate("error", `Invalid URL: ${error.message}`);
    }
  }
}
