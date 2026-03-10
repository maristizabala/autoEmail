import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/jira-api': {
        target: 'https://latinia.atlassian.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jira-api/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            const target = 'https://latinia.atlassian.net';
            proxyReq.setHeader('Origin', target);
            proxyReq.setHeader('Referer', target + '/');
            proxyReq.setHeader('X-Atlassian-Token', 'no-check');
            proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');
          });
        }
      }
    }
  }
})
