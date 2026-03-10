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
        secure: true,
        rewrite: (path) => path.replace(/^\/jira-api/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Reapuntamos Origin y Referer para que Jira crea que es una petición interna
            const target = 'https://latinia.atlassian.net';
            proxyReq.setHeader('Origin', target);
            proxyReq.setHeader('Referer', target + '/');

            // Forzar los headers de bypass de XSRF que Jira Cloud espera
            proxyReq.setHeader('X-Atlassian-Token', 'no-check');
            proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest');

            // Cambiamos el User-Agent para que no parezca un navegador Chrome/Firefox estándar
            proxyReq.setHeader('User-Agent', 'Atlassian-Reporter-Tool/1.0');
          });
        }
      }
    }
  }
})
