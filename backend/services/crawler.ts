import { HTMLRewriter } from "https://deno.land/x/html_rewriter@v0.1.0-pre.17/index.ts";
import { ResourceManager } from "./resource_manager.ts";

export class CrawlerService {
  private visitedUrls = new Set<string>();
  private queue: string[] = [];
  private processing = new Set<string>();
  private baseUrl = "";
  private domain = "";
  private maxConcurrent = 5;
  private activeRequests = 0;
  private ws: WebSocket;
  private resourceManager: ResourceManager | null = null;
  private domainLastCrawled = new Map<string, number>();
  private crawlDelay = 1000; // 1 second
  private allowedDomains: string[] = [
    'mail-order-brides-reviews.com',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'stackpath.bootstrapcdn.com',
    'unpkg.com'
  ];

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  private sendUpdate(type: "link" | "error" | "info" | "manifest" | "processed_content" | "crawling_complete" | "css_analysis" | "css_manifest" | "css_found", data: unknown) {
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

  private isAllowedDomain(domain: string): boolean {
    return this.allowedDomains.includes(domain);
  }

  private async processHtml(html: string, url: string) {
    try {
      // 1. Remove all JavaScript
      html = html
        // Remove script tags with src attribute
        .replace(/<script\b[^>]*src="[^"]*"[^>]*>.*?<\/script>/gi, '')
        // Remove inline script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove onclick and other JS events
        .replace(/ on\w+="[^"]*"/g, '');

      // 2. Remove all comments
      html = html
        .replace(/<!--[\s\S]*?-->/g, '')
        // Remove conditional comments
        .replace(/<!--\[[\s\S]*?]-->/g, '');

      // 3. Remove cookie notices, popups, and unnecessary elements
      const removeSelectors = [
        // Cookie related
        'cookie-banner',
        'cookie-notice',
        'cookie-popup',
        'cookie-consent',
        // Popups and modals
        'modal',
        'popup',
        'dialog',
        // Social widgets
        'social-share',
        'social-buttons',
        // Chat widgets
        'chat-widget',
        'live-chat',
        // Newsletter
        'newsletter-popup',
        'subscribe-form'
      ];

      // Remove elements with these classes or IDs
      removeSelectors.forEach(selector => {
        const classRegex = new RegExp(`<div[^>]*class="[^"]*${selector}[^"]*"[^>]*>.*?<\/div>`, 'gi');
        const idRegex = new RegExp(`<div[^>]*id="[^"]*${selector}[^"]*"[^>]*>.*?<\/div>`, 'gi');
        html = html
          .replace(classRegex, '')
          .replace(idRegex, '');
      });

      // 4. Remove empty lines and normalize whitespace
      html = html
        .replace(/^\s*[\r\n]/gm, '')  // Remove empty lines
        .replace(/\s+/g, ' ')         // Normalize whitespace
        .replace(/>\s+</g, '><');     // Remove whitespace between tags

      // 5. Add base URL for proper resource resolution
      html = html.replace('</head>',
        `<base href="${url}">
         </head>`);

      // Send optimized HTML
      this.sendUpdate("processed_content", {
        url,
        html,
        resources: {}
      });

    } catch (error) {
      console.error('Error optimizing HTML:', error);
      // If optimization fails, send original HTML
      this.sendUpdate("processed_content", {
        url,
        html,
        resources: {}
      });
    }
  }

  public async crawl(url: string) {
    try {
      const parsedUrl = new URL(url);
      this.baseUrl = url;
      this.domain = parsedUrl.hostname;
      
      // Reset state for new crawl
      this.queue = [url];
      this.visitedUrls = new Set([url]);
      this.processing = new Set();
      this.activeRequests = 0;
      this.resourceManager = new ResourceManager(url);

      console.log(`Starting new crawl for ${url}`);
      await this.processQueue();
    } catch (error) {
      console.error('Crawl error:', error);
      this.sendUpdate("error", `Crawl error: ${error.message}`);
    }
  }

  private async processUrl(url: string) {
    this.activeRequests++;
    if (!this.resourceManager) {
      this.resourceManager = new ResourceManager(url);
    }

    try {
      const domain = new URL(url).hostname;
      if (!this.resourceManager.isAllowedDomain(url)) {
        console.log(`⛔ Blocked crawling of non-allowed domain: ${domain}`);
        this.sendUpdate("error", `Blocked crawling of non-allowed domain: ${domain}`);
        return;
      }

      console.log('🔍 Processing:', url);

      const fetchOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow'
      };

      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      
      // Extract and add new links to queue
      const links = await this.extractLinks(html, url);
      for (const link of links) {
        const normalizedLink = this.normalizeUrl(link);
        if (normalizedLink && this.isValidUrl(normalizedLink) && !this.visitedUrls.has(normalizedLink)) {
          console.log('Found new link:', normalizedLink);
          this.queue.push(normalizedLink);
          this.visitedUrls.add(normalizedLink);
        }
      }

      await this.processHtml(html, url);

    } catch (error) {
      console.error('Error processing content:', error);
      this.sendUpdate("error", `Error processing ${url}: ${error.message}`);
    } finally {
      this.activeRequests--;
      // Continue processing queue
      await this.processQueue();
    }
  }

  private async extractLinks(html: string, baseUrl: string): Promise<string[]> {
    const links: string[] = [];
    const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;

    // Use regex to extract links (more reliable than HTMLRewriter in this case)
    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      if (href) {
        try {
          // Resolve relative URLs against the base URL
          const absoluteUrl = new URL(href, baseUrl).href;
          links.push(absoluteUrl);
        } catch (error) {
          // Invalid URL, skip it
          console.debug('Skipping invalid URL:', href);
        }
      }
    }

    return links;
  }

  private async processQueue() {
    const promises: Promise<void>[] = [];
    
    while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const url = this.queue.shift();
      if (url) {
        console.log(`Starting to process URL: ${url}. Queue size: ${this.queue.length}`);
        promises.push(this.processUrl(url));
      }
    }

    // Wait for current batch to complete
    await Promise.all(promises);

    if (this.queue.length === 0 && this.activeRequests === 0) {
      console.log('Crawling completed. Total URLs visited:', this.visitedUrls.size);
      this.sendUpdate("info", `Crawling completed. Total URLs visited: ${this.visitedUrls.size}`);
      this.sendUpdate("crawling_complete", null);
    } else if (this.queue.length > 0) {
      // Continue processing if there are more URLs
      console.log(`Continuing to process queue. Remaining URLs: ${this.queue.length}`);
      await this.processQueue();
    }
  }

  public async processAndSendContent(url: string) {
    try {
      console.log('Processing content for URL:', url);
      this.sendUpdate("info", `Processing content for: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const processedResources = new Map<string, Uint8Array>();
      
      // Initialize ResourceManager if needed
      if (!this.resourceManager) {
        const parsedUrl = new URL(url);
        this.resourceManager = new ResourceManager(parsedUrl.hostname);
      }

      // Generate resource manifest
      const manifest = await this.resourceManager.generateManifest(html, url);
      console.log('Generated manifest for URL:', url, 'Resources:', {
        styles: manifest.styles.size,
        fonts: manifest.fonts.size
      });
      
      // Process resources
      const processResource = async (resourceUrl: string) => {
        try {
          const data = await this.resourceManager.fetchAndCache(resourceUrl);
          if (data) {
            processedResources.set(resourceUrl, data);
          }
        } catch (error) {
          console.error(`Error fetching resource ${resourceUrl}:`, error);
        }
      };

      // Process all resources concurrently
      const promises = [];
      for (const styleUrl of manifest.styles) {
        promises.push(processResource(styleUrl));
      }
      for (const fontUrl of manifest.fonts) {
        promises.push(processResource(fontUrl));
      }
      await Promise.all(promises);

      console.log('Processed resources for URL:', url, 'Count:', processedResources.size);

      // Send processed content
      this.sendUpdate("processed_content", {
        url,
        html,
        resources: Object.fromEntries(
          Array.from(processedResources.entries()).map(([url, data]) => [
            url,
            Array.from(data)
          ])
        )
      });

      console.log('Sent processed content for URL:', url);
    } catch (error) {
      console.error('Error processing content:', error);
      this.sendUpdate("error", `Error processing ${url}: ${error.message}`);
    }
  }
}

export class ResourceManager {
  private allowedDomains: Set<string>;

  constructor(url: string) {
    try {
      const domain = new URL(url).hostname;
      console.log('Initializing ResourceManager with domain:', domain);
      this.allowedDomains = new Set([
        domain,
        'cdn.jsdelivr.net',
        'cdnjs.cloudflare.com',
        'fonts.googleapis.com',
        'stackpath.bootstrapcdn.com',
        'unpkg.com'
      ]);
      console.log('Allowed domains:', Array.from(this.allowedDomains).join(', '));
    } catch (error) {
      console.error('Error initializing ResourceManager:', error);
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  isAllowedDomain(url: string): boolean {
    try {
      const urlDomain = new URL(url).hostname;
      const isAllowed = this.allowedDomains.has(urlDomain);
      console.log(`Domain check for ${urlDomain}: ${isAllowed ? 'allowed' : 'blocked'}`);
      return isAllowed;
    } catch (error) {
      console.error('Error checking domain:', error);
      return false;
    }
  }
}
