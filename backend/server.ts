import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { CrawlerService } from "./services/crawler.ts";

const app = new Application();
const router = new Router();

// WebSocket connections store
const connections = new Map<string, WebSocket>();

// Heartbeat interval (15 seconds)
const HEARTBEAT_INTERVAL = 15000;
// Maximum time to wait for pong response (5 seconds)
const PONG_TIMEOUT = 5000;

router.get("/ws", async (ctx) => {
  try {
    if (!ctx.isUpgradable) {
      ctx.throw(400, "Connection is not upgradable to WebSocket");
      return;
    }

    const ws = await ctx.upgrade();
    const connectionId = crypto.randomUUID();

    // Wait for the connection to be established
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        connections.set(connectionId, ws);
        console.log(`WebSocket connection established (ID: ${connectionId})`);
        
        // Send initial connection success message
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: "connection_status", 
            status: "connected",
            connectionId 
          }));
        }
        resolve();
      };
    });

    let pongReceived = true;
    let pongTimeoutId: number | undefined;
    let heartbeatInterval: number | undefined;

    // Set up heartbeat interval
    const startHeartbeat = () => {
      heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          if (!pongReceived) {
            console.log(`No pong received for connection ${connectionId}, closing...`);
            ws.close(1000, "Heartbeat timeout");
            return;
          }

          pongReceived = false;
          ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));

          // Set timeout for pong response
          pongTimeoutId = setTimeout(() => {
            if (!pongReceived) {
              console.log(`Pong timeout for connection ${connectionId}`);
              ws.close(1000, "Pong timeout");
            }
          }, PONG_TIMEOUT);
        }
      }, HEARTBEAT_INTERVAL);
    };

    startHeartbeat();

    const crawlerService = new CrawlerService(ws);

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`Received message from ${connectionId}:`, data);
        
        if (data.type === "pong") {
          pongReceived = true;
          if (pongTimeoutId) {
            clearTimeout(pongTimeoutId);
          }
          return;
        }
        
        if (data.type === "start_crawl") {
          if (!data.url) {
            throw new Error("URL is required for crawling");
          }
          console.log(`Starting crawl for URL: ${data.url}`);
          await crawlerService.crawl(data.url);
        } else if (data.type === "request_content") {
          if (!data.url) {
            throw new Error("URL is required for content processing");
          }
          console.log(`Processing content for URL: ${data.url}`);
          await crawlerService.processAndSendContent(data.url);
        }
      } catch (error) {
        console.error(`WebSocket message error (ID: ${connectionId}):`, error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: "error", 
            data: error.message,
            timestamp: Date.now()
          }));
        }
      }
    };

    ws.onclose = (event) => {
      console.log(`WebSocket connection closed (ID: ${connectionId})`, {
        code: event.code,
        reason: event.reason
      });
      connections.delete(connectionId);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (pongTimeoutId) {
        clearTimeout(pongTimeoutId);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error (ID: ${connectionId}):`, error);
      // Try to send error to client if connection is still open
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: "error", 
          data: "Internal WebSocket error occurred",
          timestamp: Date.now()
        }));
      }
    };

  } catch (error) {
    console.error("WebSocket upgrade error:", error);
    ctx.throw(500, "Failed to establish WebSocket connection");
  }
});

// CORS middleware with proper WebSocket support
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = parseInt(Deno.env.get("PORT") || "10000");
console.log(`Backend server running on port ${port}`);

// Log initial memory usage
console.log("Initial memory usage:", {
  rss: Math.round(Deno.memoryUsage().rss / 1024 / 1024 * 100) / 100,
  heapTotal: Math.round(Deno.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
  heapUsed: Math.round(Deno.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
  external: Math.round(Deno.memoryUsage().external / 1024 / 1024 * 100) / 100
});

await app.listen({ port });
