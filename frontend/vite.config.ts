import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables based on mode
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [svelte()],
    root: resolve(__dirname),
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    },
    envPrefix: 'VITE_',
    define: {
      'process.env.VITE_BACKEND_WS_URL': JSON.stringify(env.VITE_BACKEND_WS_URL)
    }
  }
})
