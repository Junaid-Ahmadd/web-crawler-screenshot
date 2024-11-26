import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { CrawlerService } from "./services/crawler.ts";

const app = new Application();
const router = new Router();

// WebSocket connections store
const connections = new Map<string, WebSocket>();

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(400, "Connection is not upgradable to WebSocket");
    return;
  }

  const ws = await ctx.upgrade();
  const connectionId = crypto.randomUUID();
  connections.set(connectionId, ws);

  console.log(`WebSocket connection established (ID: ${connectionId})`);

  // Set up heartbeat interval
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, HEARTBEAT_INTERVAL);

  const crawlerService = new CrawlerService(ws);

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log(`Received message: ${event.data}`);
      
      if (data.type === "pong") {
        // Handle heartbeat response
        return;
      }
      
      if (data.type === "start_crawl") {
        console.log(`Starting crawl for URL: ${data.url}`);
        await crawlerService.crawl(data.url);
      } else if (data.type === "request_content") {
        console.log(`Processing content for URL: ${data.url}`);
        await crawlerService.processAndSendContent(data.url);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ type: "error", data: error.message }));
    }
  };

  ws.onclose = () => {
    console.log(`WebSocket connection closed (ID: ${connectionId})`);
    connections.delete(connectionId);
    clearInterval(heartbeatInterval);
  };

  ws.onerror = (error) => {
    console.error(`WebSocket error (ID: ${connectionId}):`, error);
  };
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

await app.listen({ port });
