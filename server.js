const express = require('express');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the frontend build directory
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use(express.json());

// Screenshot service endpoint
app.post('/api/screenshot', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(url, { waitUntil: 'networkidle' });
        const screenshot = await page.screenshot({ fullPage: true });

        await browser.close();

        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': screenshot.length
        });
        res.end(screenshot);
    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).json({ error: 'Failed to take screenshot' });
    }
});

// Handle frontend routes - serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
