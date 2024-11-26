const express = require('express');
const { webkit } = require('playwright');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// Screenshot queue management
const screenshotQueue = [];
let isProcessing = false;
let browser = null;
let pendingUrls = new Set(); // Track URLs waiting for content

// Resource cache
const resourceCache = new Map();

// Function to get memory usage in MB
function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
        external: Math.round(used.external / 1024 / 1024 * 100) / 100
    };
}

async function findWebKitPath() {
    const basePath = '/ms-playwright';
    console.log('Checking WebKit in:', basePath);
    
    try {
        const files = fs.readdirSync(basePath);
        console.log('Found directories:', files);
        
        for (const file of files) {
            const fullPath = path.join(basePath, file);
            if (file.includes('webkit')) {
                console.log('Found WebKit directory:', fullPath);
                const binPath = path.join(fullPath, 'pw_run.sh');
                if (fs.existsSync(binPath)) {
                    console.log('Found WebKit executable:', binPath);
                    return binPath;
                }
            }
        }
    } catch (error) {
        console.error('Error finding WebKit:', error);
    }
    return null;
}

async function initBrowser() {
    if (!browser) {
        console.log('Initializing WebKit browser...');
        console.log('Memory usage before browser init:', getMemoryUsage());
        
        // Find WebKit path
        const webkitPath = await findWebKitPath();
        if (!webkitPath) {
            throw new Error('WebKit executable not found in /ms-playwright');
        }
        console.log('Using WebKit path:', webkitPath);
        
        browser = await webkit.launch({
            headless: true,
            executablePath: webkitPath,
            args: []
        });
        
        console.log('Browser initialized');
        console.log('Memory usage after browser init:', getMemoryUsage());
    }
    return browser;
}

// WebSocket connection for receiving processed content
let wsConnection = null;

function connectWebSocket() {
    // Use the same environment variable as frontend
    const wsUrl = process.env.VITE_BACKEND_WS_URL || 'wss://backend-re92.onrender.com/ws';
    console.log('Connecting to WebSocket:', wsUrl);
    
    wsConnection = new WebSocket(wsUrl);

    wsConnection.on('open', () => {
        console.log('WebSocket connection established');
    });

    wsConnection.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('Received WebSocket message:', message);
            
            if (message.type === 'processed_content') {
                const { url, html, resources } = message.data;
                console.log('Received processed content for URL:', url);
                
                try {
                    // Convert resources back to a Map with Uint8Array values
                    const resourceMap = new Map();
                    for (const [resourceUrl, data] of Object.entries(resources)) {
                        resourceMap.set(resourceUrl, new Uint8Array(data));
                    }
                    
                    // Store the processed content in cache
                    resourceCache.set(url, {
                        html,
                        resources: resourceMap
                    });

                    // Remove from pending URLs
                    pendingUrls.delete(url);

                    // If all URLs are processed, start taking screenshots
                    if (pendingUrls.size === 0 && screenshotQueue.length > 0) {
                        console.log('All content processed, starting screenshots');
                        if (!isProcessing) {
                            processQueue();
                        }
                    }
                } catch (error) {
                    console.error('Error processing resources:', error);
                }
            } else if (message.type === 'link') {
                // Add new link to pending URLs
                pendingUrls.add(message.data);
            } else if (message.type === 'crawling_complete') {
                console.log('Crawling complete, waiting for all content to be processed');
                // If all content is already processed, start screenshots
                if (pendingUrls.size === 0 && screenshotQueue.length > 0) {
                    console.log('All content processed, starting screenshots');
                    if (!isProcessing) {
                        processQueue();
                    }
                }
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            console.error('Raw message:', data.toString());
        }
    });

    wsConnection.on('close', () => {
        console.log('WebSocket connection closed. Reconnecting in 5 seconds...');
        wsConnection = null;
        setTimeout(connectWebSocket, 5000);
    });

    wsConnection.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
}

// Initialize WebSocket connection
connectWebSocket();

async function processQueue() {
    if (isProcessing || screenshotQueue.length === 0) return;
    
    isProcessing = true;
    const { url, res } = screenshotQueue[0]; // Peek at first item
    let context = null;
    let page = null;
    
    try {
        // Check if we have cached content
        const cachedContent = resourceCache.get(url);
        if (!cachedContent) {
            console.log('Waiting for content from backend for:', url);
            // Don't remove from queue - wait for content
            isProcessing = false;
            return;
        }

        // Remove the item from queue since we're processing it
        screenshotQueue.shift();
        
        console.log('Processing screenshot for:', url);
        const browser = await initBrowser();
        
        context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false
        });

        page = await context.newPage();
        
        // Increase timeouts to allow for resource loading
        page.setDefaultTimeout(30000);
        page.setDefaultNavigationTimeout(30000);

        // Log all requests to see what Playwright is loading
        await page.route('**/*', async route => {
            const request = route.request();
            console.log(`🌐 Network request: ${request.method()} ${request.url()}`);
            console.log(`   Resource type: ${request.resourceType()}`);
            await route.continue();
        });

        console.log('\n📄 Setting page content from crawler...');
        // Get the processed content from the crawler
        const { html } = resourceCache.get(url);

        // Set the base URL for proper resource resolution
        await page.setContent(html, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        console.log('🔗 Adding base URL for resource resolution...');
        // Set the URL to ensure proper resource path resolution
        await page.evaluate((pageUrl) => {
            // Update base URL for resource loading
            const base = document.createElement('base');
            base.href = pageUrl;
            document.head.prepend(base);
            return document.documentElement.outerHTML;
        }, url).then(resultHtml => {
            // Log the first 500 characters of the actual HTML being used
            console.log('\n📝 Current page HTML (first 500 chars):');
            console.log(resultHtml.substring(0, 500));
        });

        // Wait for any remaining resources to load
        console.log('\n⏳ Waiting for network idle...');
        await page.waitForLoadState('networkidle');
        console.log('✅ Network idle achieved');

        // Take the screenshot
        console.log('📸 Taking screenshot...');
        const screenshot = await page.screenshot({
            type: 'jpeg',
            quality: 80,
            fullPage: true
        });

        res.contentType('image/jpeg');
        res.send(screenshot);

    } catch (error) {
        console.error('Error processing screenshot:', error);
        res.status(500).json({ error: 'Failed to generate screenshot: ' + error.message });
    } finally {
        if (page) await page.close();
        if (context) await context.close();
        isProcessing = false;
        processQueue(); // Process next item in queue
    }
}

app.use(express.json()); // Add this line to parse JSON bodies

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/screenshot', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log('Screenshot requested for:', url);
        
        screenshotQueue.push({ url, res });
        console.log('Added to queue:', url);
        console.log('Queue length:', screenshotQueue.length);
        
        // Add to pending URLs
        pendingUrls.add(url);
        
        // Request content from backend if not cached
        if (!resourceCache.has(url) && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            console.log('Requesting content from backend:', url);
            wsConnection.send(JSON.stringify({
                type: 'request_content',
                url: url
            }));
        } else if (resourceCache.has(url)) {
            pendingUrls.delete(url);
            // If this was the last pending URL, start processing
            if (pendingUrls.size === 0 && !isProcessing) {
                console.log('All content available, starting screenshots');
                processQueue();
            }
        }
    } catch (error) {
        console.error('Error processing screenshot request:', error);
        res.status(500).json({ error: 'Failed to process screenshot request: ' + error.message });
    }
});

// Handle all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Initial memory usage:', getMemoryUsage());
});
