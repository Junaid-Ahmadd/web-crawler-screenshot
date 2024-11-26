<script lang="ts">
  let url = "";
  let crawledLinks: string[] = [];
  let screenshots: Map<string, string> = new Map();
  let logs: string[] = [];
  let crawlerWs: WebSocket;
  let isProcessing = false;
  let resourceManifests: Map<string, {
    scripts: string[];
    styles: string[];
    images: string[];
    fonts: string[];
  }> = new Map();
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 5000;

  function addLog(message: string) {
    logs = [...logs, `[${new Date().toLocaleTimeString()}] ${message}`];
  }

  function initWebSocket() {
    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || 'ws://localhost:10000/ws';
    console.log('Connecting to WebSocket:', wsUrl);
    
    try {
      crawlerWs = new WebSocket(wsUrl);

      crawlerWs.onopen = () => {
        console.log('WebSocket connection established');
        addLog('Connected to server');
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      };

      crawlerWs.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        
        if (data.type === "ping") {
          crawlerWs.send(JSON.stringify({ type: "pong" }));
          return;
        }
        
        switch (data.type) {
          case 'link':
            crawledLinks = [...crawledLinks, data.data];
            // Request screenshot for the new link
            try {
              console.log('Requesting screenshot for URL:', data.data);
              const response = await fetch('/api/screenshot', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: data.data })
              });
              
              if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('image/')) {
                  const blob = await response.blob();
                  const imageUrl = URL.createObjectURL(blob);
                  screenshots.set(data.data, imageUrl);
                  screenshots = screenshots; // Trigger reactivity
                  addLog(`Screenshot taken: ${data.data}`);
                } else {
                  const text = await response.text();
                  addLog(`Screenshot error: Invalid response type - ${contentType}`);
                  console.error('Invalid response:', text);
                }
              } else {
                const text = await response.text();
                try {
                  const error = JSON.parse(text);
                  addLog(`Screenshot error: ${error.error || text}`);
                } catch {
                  addLog(`Screenshot error: ${text}`);
                }
              }
            } catch (error) {
              console.error('Screenshot request error:', error);
              addLog(`Screenshot error: ${error.message}`);
            }
            break;
          case 'error':
            addLog(`Error: ${data.data}`);
            break;
          case 'info':
            addLog(data.data);
            break;
          case 'crawling_complete':
            isProcessing = false;
            addLog('Crawling completed');
            break;
          case 'processed_content':
            // Handle processed content...
            break;
        }
      };

      crawlerWs.onclose = () => {
        console.log('WebSocket connection closed');
        addLog('Connection closed');
        
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          addLog(`Reconnecting in ${RECONNECT_DELAY/1000} seconds...`);
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
      addLog(`Connection error: ${error.message}`);
    }
  }

  function startCrawl() {
    if (!url) {
      addLog('Please enter a URL');
      return;
    }

    try {
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
  
  <div class="input-section">
    <input
      type="text"
      bind:value={url}
      placeholder="Enter website URL"
      disabled={isProcessing}
    />
    <button on:click={startCrawl} disabled={isProcessing}>
      {isProcessing ? 'Processing...' : 'Start Crawling'}
    </button>
  </div>

  <div class="results-container">
    <div class="links-section">
      <h2>Found Links ({crawledLinks.length})</h2>
      <div class="links-list">
        {#each crawledLinks as link}
          <div class="link-item">
            <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
            {#if screenshots.has(link)}
              <img
                src={screenshots.get(link)}
                alt={`Screenshot of ${link}`}
                loading="lazy"
              />
            {/if}
          </div>
        {/each}
      </div>
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
    padding: 2rem;
  }

  h1 {
    text-align: center;
    margin-bottom: 2rem;
  }

  .input-section {
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
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  .results-container {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 2rem;
  }

  .links-section, .logs-section {
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 1rem;
  }

  .links-list, .logs-list {
    max-height: 600px;
    overflow-y: auto;
  }

  .link-item {
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid #eee;
    border-radius: 4px;
  }

  .link-item img {
    max-width: 100%;
    margin-top: 1rem;
    border: 1px solid #eee;
    border-radius: 4px;
  }

  .log-item {
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
    font-family: monospace;
  }

  a {
    color: #2196F3;
    text-decoration: none;
    word-break: break-all;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
