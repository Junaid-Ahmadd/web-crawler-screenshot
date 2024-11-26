import { HTMLRewriter } from "../dependencies.ts";

interface ResourceManifest {
  scripts: Set<string>;
  styles: Set<string>;
  images: Set<string>;
  fonts: Set<string>;
  processedStyles: Map<string, string>;
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
      const domain = new URL(url).hostname;
      return this.allowedDomains.has(domain);
    } catch {
      return false;
    }
  }

  async generateManifest(html: string, baseUrl: string) {
    const styles = new Set<string>();
    const fonts = new Set<string>();
    
    // Extract CSS links
    const cssLinkPattern = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = cssLinkPattern.exec(html)) !== null) {
      try {
        const href = match[1];
        const absoluteUrl = new URL(href, baseUrl).href;
        styles.add(absoluteUrl);
      } catch (error) {
        console.error('Error processing CSS URL:', error);
      }
    }

    return {
      styles,
      fonts
    };
  }

  async fetchAndCache(url: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      console.error('Error fetching resource:', error);
      return null;
    }
  }
}
