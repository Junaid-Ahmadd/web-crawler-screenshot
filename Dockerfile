# Build stage for frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build stage for backend
FROM mcr.microsoft.com/playwright:v1.40.1-focal AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci && \
    npm prune --production

# Final stage
FROM mcr.microsoft.com/playwright:v1.40.1-focal
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy backend files and dependencies
COPY --from=backend-builder /app/node_modules ./node_modules
COPY backend/ ./backend/
COPY server.js .
COPY package.json .

# Set environment variables
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=3000

# Create a non-root user
RUN adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "server.js"]
