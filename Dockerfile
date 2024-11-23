# Use Playwright's base image which includes browsers
FROM mcr.microsoft.com/playwright:v1.38.0-focal

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root dependencies
RUN npm install

# Copy frontend files and build
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm install && \
    npm run build

# Back to app directory
WORKDIR /app

# Copy the rest of the application
COPY . .

# Clean up dev dependencies
RUN npm prune --production

EXPOSE 3000

CMD ["node", "server.js"]
