import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { CrawlerService } from "./services/crawler.ts";

const app = new Application();
const router = new Router();

// WebSocket connections store
const connections = new Map<string, WebSocket>();

router.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    ctx.throw(400, "Connection is not upgradable to WebSocket");
    return;
  }

  const ws = await ctx.upgrade();
  const connectionId = crypto.randomUUID();
  connections.set(connectionId, ws);

  const crawlerService = new CrawlerService(ws);

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "start_crawl") {
        await crawlerService.crawl(data.url);
      } else if (data.type === "request_content") {
        await crawlerService.processAndSendContent(data.url);
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: "error", data: error.message }));
    }
  };

  ws.onclose = () => {
    connections.delete(connectionId);
  };
});

// CORS middleware
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

const port = parseInt(Deno.env.get("PORT") || "8000");
console.log(`Backend server running on port ${port}`);

await app.listen({ port });
