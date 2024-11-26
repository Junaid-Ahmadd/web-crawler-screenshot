<script lang="ts">
  import { onMount } from 'svelte';

  let url = "";
  let crawledLinks: string[] = [];
  let screenshots: Map<string, string> = new Map();
  let logs: string[] = [];
  let crawlerWs: WebSocket | null = null;
  let isProcessing = false;
  let reconnectAttempts = 0;
  let connectionId: string | null = null;
  let selectedScreenshot: string | null = null;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 5000;

  function addLog(message: string) {
    logs = [...logs, `[${new Date().toLocaleTimeString()}] ${message}`];
    console.log(message);
  }

  function initWebSocket() {
    // Get WebSocket URL from environment variable or fallback to a default
    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || 'wss://backend-re92.onrender.com/ws';
    if (!wsUrl) {
      addLog('Error: Backend WebSocket URL not configured');
      return;
    }

    console.log('Connecting to WebSocket:', wsUrl);
    addLog(`Connecting to WebSocket: ${wsUrl}`);
    
    try {
      if (crawlerWs) {
        if (crawlerWs.readyState === WebSocket.OPEN || crawlerWs.readyState === WebSocket.CONNECTING) {
          crawlerWs.close();
        }
        crawlerWs = null;
      }

      crawlerWs = new WebSocket(wsUrl);

      // Set a connection timeout
      const connectionTimeout = setTimeout(() => {
        if (crawlerWs && crawlerWs.readyState === WebSocket.CONNECTING) {
          addLog('Connection timeout, retrying...');
          crawlerWs.close();
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => {
              reconnectAttempts++;
              initWebSocket();
            }, RECONNECT_DELAY);
          } else {
            addLog('Max reconnection attempts reached. Please refresh the page.');
          }
        }
      }, 10000); // 10 second timeout

      crawlerWs.onopen = () => {
        console.log('WebSocket connection opened');
        addLog('Connecting to server...');
        clearTimeout(connectionTimeout);
      };

      crawlerWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);
          
          switch (data.type) {
            case 'connection_status':
              if (data.status === 'connected') {
                connectionId = data.connectionId;
                addLog('Connected to server');
                reconnectAttempts = 0;
              }
              break;
            case 'ping':
              if (crawlerWs?.readyState === WebSocket.OPEN) {
                crawlerWs.send(JSON.stringify({ 
                  type: "pong",
                  timestamp: data.timestamp
                }));
              }
              break;
            case 'link':
              crawledLinks = [...crawledLinks, data.data];
              addLog(`Found link: ${data.data}`);
              break;
            case 'screenshot':
              const imageUrl = URL.createObjectURL(new Blob([new Uint8Array(data.data.image)], { type: 'image/jpeg' }));
              screenshots.set(data.data.url, imageUrl);
              screenshots = screenshots; // trigger reactivity
              addLog(`Screenshot captured: ${data.data.url}`);
              break;
            case 'error':
              addLog(`Error: ${data.data}`);
              isProcessing = false;
              break;
            case 'info':
              addLog(data.data);
              break;
            case 'crawling_complete':
              isProcessing = false;
              addLog('Crawling completed');
              break;
          }
        } catch (error) {
          console.error('Error processing message:', error);
          addLog(`Error processing message: ${error.message}`);
        }
      };

      crawlerWs.onclose = (event) => {
        console.log('WebSocket connection closed:', event);
        addLog(`Connection closed (${event.code}): ${event.reason || 'No reason provided'}`);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setTimeout(() => {
            reconnectAttempts++;
            initWebSocket();
          }, RECONNECT_DELAY);
        } else {
          addLog('Max reconnection attempts reached. Please refresh the page.');
        }
      };

      crawlerWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLog('Connection error occurred');
      };

    } catch (error) {
      console.error('Error initializing WebSocket:', error);
      addLog(`Error initializing WebSocket: ${error.message}`);
    }
  }

  function startCrawl() {
    if (!url) {
      addLog('Please enter a URL');
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      new URL(url); // validate URL
    } catch (error) {
      addLog('Invalid URL format');
      return;
    }

    if (!crawlerWs || crawlerWs.readyState !== WebSocket.OPEN) {
      addLog('Not connected to server');
      return;
    }

    isProcessing = true;
    crawledLinks = [];
    screenshots = new Map();
    logs = [];
    selectedScreenshot = null;
    addLog(`Starting crawl for: ${url}`);

    crawlerWs.send(JSON.stringify({
      type: 'start_crawl',
      url
    }));
  }

  function viewScreenshot(url: string) {
    selectedScreenshot = screenshots.get(url) || null;
  }

  onMount(() => {
    initWebSocket();
    return () => {
      if (crawlerWs) {
        crawlerWs.close();
      }
    };
  });
</script>

<main class="container">
  <h1>Web Crawler & Screenshot Tool</h1>
  
  <div class="input-section">
    <input
      type="text"
      bind:value={url}
      placeholder="Enter URL to crawl (e.g., https://example.com)"
      disabled={isProcessing}
    />
    <button on:click={startCrawl} disabled={isProcessing}>
      {isProcessing ? 'Crawling...' : 'Start Crawl'}
    </button>
  </div>

  <div class="content">
    <div class="links-section">
      <h2>Crawled Links ({crawledLinks.length})</h2>
      <div class="links-list">
        {#each crawledLinks as link}
          <div class="link-item">
            <span class="link-text">{link}</span>
            {#if screenshots.has(link)}
              <button class="view-screenshot" on:click={() => viewScreenshot(link)}>
                View Screenshot
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="screenshot-section">
      <h2>Screenshot Preview</h2>
      {#if selectedScreenshot}
        <img src={selectedScreenshot} alt="Page screenshot" />
      {:else}
        <div class="no-screenshot">
          No screenshot selected
        </div>
      {/if}
    </div>

    <div class="logs-section">
      <h2>Logs</h2>
      <div class="logs-list">
        {#each logs as log}
          <div class="log-item">{log}</div>
        {/each}
      </div>
    </div>
  </div>
</main>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
  }

  .input-section {
    display: flex;
    gap: 10px;
    margin-bottom: 30px;
  }

  input {
    flex: 1;
    padding: 10px;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  button {
    padding: 10px 20px;
    font-size: 16px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  .content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .links-section {
    grid-column: 1;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .screenshot-section {
    grid-column: 2;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .logs-section {
    grid-column: 1 / -1;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .links-list, .logs-list {
    max-height: 400px;
    overflow-y: auto;
  }

  .link-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid #eee;
  }

  .link-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-right: 10px;
  }

  .view-screenshot {
    background-color: #28a745;
    padding: 5px 10px;
    font-size: 14px;
  }

  .log-item {
    padding: 5px;
    border-bottom: 1px solid #eee;
    font-family: monospace;
  }

  .no-screenshot {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 400px;
    background: #f8f9fa;
    color: #6c757d;
    font-size: 18px;
  }

  img {
    max-width: 100%;
    height: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
</style>
