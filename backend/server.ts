import { Application, Router } from "./dependencies.ts";
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
        await crawlerService.startCrawling(data.url);
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
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204;
    return;
  }
  
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

const port = 8000;
console.log(`Server running on http://localhost:${port}`);

await app.listen({ port });
