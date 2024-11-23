# Use the official Playwright image as base
FROM mcr.microsoft.com/playwright:v1.40.1-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && \
    npx playwright install chromium && \
    npx playwright install-deps chromium && \
    npm prune --production

# Copy the rest of the application
COPY . .

# Build the frontend
RUN npm run build

# Expose the port
EXPOSE 3000

# Set environment variables for Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["node", "server.js"]
