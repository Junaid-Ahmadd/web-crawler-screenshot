const express = require('express');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for local development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files from the frontend build directory
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use(express.json());

// Screenshot service endpoint
app.post('/api/screenshot', async (req, res) => {
    console.log('Received screenshot request');
    const { url } = req.body;
    
    if (!url) {
        console.log('URL is missing in request');
        return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing screenshot for URL: ${url}`);
    let browser;
    try {
        console.log('Launching browser...');
        browser = await chromium.launch({
            headless: true
        });
        console.log('Browser launched successfully');

        console.log('Creating browser context...');
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        console.log('Browser context created');

        console.log('Creating new page...');
        const page = await context.newPage();
        console.log('Page created');

        console.log(`Navigating to ${url}...`);
        await page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        console.log('Page loaded');

        console.log('Taking screenshot...');
        const screenshot = await page.screenshot({ 
            fullPage: true,
            type: 'png'
        });
        console.log('Screenshot taken');

        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': screenshot.length
        });
        res.end(screenshot);
        console.log('Screenshot sent to client');

    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).json({ 
            error: 'Failed to take screenshot',
            details: error.message 
        });
    } finally {
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
            console.log('Browser closed');
        }
    }
});

// Handle frontend routes - serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Frontend URL: http://localhost:${port}`);
});
