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
        console.log('WebSocket connection closed', event);
        connectionId = null;
        clearTimeout(connectionTimeout);
        
        const reason = event.reason || 'Unknown reason';
        addLog(`Connection closed: ${reason}`);
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), RECONNECT_DELAY);
          addLog(`Reconnecting in ${delay/1000} seconds...`);
          setTimeout(() => {
            reconnectAttempts++;
            initWebSocket();
          }, delay);
        } else {
          addLog('Max reconnection attempts reached. Please refresh the page.');
        }
      };

      crawlerWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLog('Connection error occurred');
        // Don't close here, let the onclose handler deal with reconnection
      };
    } catch (error) {
      console.error('Error initializing WebSocket:', error);
      addLog(`Connection error: ${error.message}`);
    }
  }

  function startCrawl() {
    if (!url) {
      addLog('Please enter a URL');
      return;
    }

    try {
      // Validate URL
      new URL(url);

      if (!crawlerWs || crawlerWs.readyState !== WebSocket.OPEN) {
        addLog('Reconnecting to server...');
        initWebSocket();
        // Wait for connection to establish
        setTimeout(() => startCrawl(), 1000);
        return;
      }

      isProcessing = true;
      crawledLinks = [];
      screenshots = new Map();
      logs = [];
      addLog(`Starting crawl for: ${url}`);
      
      crawlerWs.send(JSON.stringify({
        type: 'start_crawl',
        url
      }));
    } catch (error) {
      console.error('Error starting crawl:', error);
      addLog(`Error starting crawl: ${error.message}`);
      isProcessing = false;
    }
  }

  // Initialize WebSocket connection when component mounts
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
  
  <div class="input-container">
    <input
      type="text"
      bind:value={url}
      placeholder="Enter website URL"
      disabled={isProcessing}
    />
    <button on:click={startCrawl} disabled={isProcessing || !connectionId}>
      {#if !connectionId}
        Connecting...
      {:else if isProcessing}
        Processing...
      {:else}
        Start Crawling
      {/if}
    </button>
  </div>

  <div class="results-container">
    {#if crawledLinks.length > 0}
      <h2>Crawled Links ({crawledLinks.length})</h2>
      <ul>
        {#each crawledLinks as link}
          <li>{link}</li>
        {/each}
      </ul>
    {/if}

    <div class="logs">
      <h2>Logs</h2>
      <pre>
        {#each logs as log}
          {log}
        {/each}
      </pre>
    </div>
  </div>
</main>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    text-align: center;
    color: #333;
    margin-bottom: 2rem;
  }

  .input-container {
    display: flex;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    min-width: 120px;
  }

  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  .results-container {
    margin-top: 2rem;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
  }

  .logs {
    margin-top: 2rem;
    background-color: #f8f9fa;
    padding: 1rem;
    border-radius: 4px;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: monospace;
  }
</style>
