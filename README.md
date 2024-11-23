# Web Crawler and Screenshot Tool

A high-performance web crawling and screenshot application built with Deno, Node.js, and Svelte.

## Features

- Web crawling with concurrent requests (5 at a time)
- Real-time link discovery with WebSocket updates
- Full-page screenshots using Playwright
- Optimized performance and memory usage
- Detailed logging and error handling

## Project Structure

- `/backend` - Deno backend for web crawling (Deno + Oak)
- `/frontend` - Svelte frontend (Svelte + Vite + TypeScript)
- `/screenshot-service` - Node.js service for taking screenshots (Playwright)

## Prerequisites

- Deno 2.x
- Node.js 18+
- npm or yarn
- Playwright browsers

## Setup Instructions

1. Install Deno: https://deno.land/manual/getting_started/installation
2. Install Node.js: https://nodejs.org/
3. Install project dependencies:

```bash
# Frontend setup
cd frontend
npm install

# Screenshot service setup
cd ../screenshot-service
npm install
npx playwright install

# Backend setup (no installation needed, Deno manages dependencies)
cd ../backend
```

## Running the Application

1. Start the Deno backend:
```bash
cd backend
deno run --allow-net --allow-read server.ts
```

2. Start the screenshot service:
```bash
cd screenshot-service
npm start
```

3. Start the frontend development server:
```bash
cd frontend
npm run dev
```

## Development

- Backend runs on port 8000
- Screenshot service runs on port 3000
- Frontend development server runs on port 5173

## Docker Deployment

### Local Development with Docker

1. Make sure you have Docker and Docker Compose installed on your system.
2. Build and start the containers:
```bash
docker-compose up --build
```
3. Access the application:
   - Frontend: http://localhost
   - Backend API: http://localhost:8000
   - Screenshot Service: http://localhost:3000

### Deployment to Render

1. Push your code to GitHub:
```bash
git init
git add .
git commit -m "Initial commit with Docker support"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. On Render:
   - Create a new "Web Service"
   - Connect your GitHub repository
   - Choose "Docker" as the runtime
   - Set the following:
     - Root Directory: ./
     - Docker Command: docker-compose up
   - Click "Create Web Service"

### Environment Variables (if needed)
Create a `.env` file in the root directory:
```
BACKEND_URL=http://localhost:8000
SCREENSHOT_SERVICE_URL=http://localhost:3000
```

Note: When deploying to Render, set these environment variables in the Render dashboard.
