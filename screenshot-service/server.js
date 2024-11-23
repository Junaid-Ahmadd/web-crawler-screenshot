import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotsDir = join(__dirname, 'screenshots');

const wss = new WebSocketServer({ port: 3000 });

let browser;

async function initBrowser() {
  browser = await chromium.launch();
  console.log('Browser initialized');
}

async function takeScreenshot(url) {
  if (!browser) {
    await initBrowser();
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'jpeg',
      quality: 80
    });

    return screenshot;
  } catch (error) {
    throw new Error(`Failed to take screenshot of ${url}: ${error.message}`);
  } finally {
    await context.close();
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'take_screenshot') {
        const url = data.url;
        console.log(`Taking screenshot of ${url}`);
        
        try {
          const screenshot = await takeScreenshot(url);
          ws.send(JSON.stringify({
            type: 'screenshot_complete',
            url,
            data: screenshot.toString('base64')
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            url,
            error: error.message
          }));
        }
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Initialize browser on startup
initBrowser().catch(console.error);

process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});
