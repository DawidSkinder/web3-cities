import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { handleTopCoinsApiRequest } from './server/binanceProxy';

export default defineConfig({
  base: '/dawidskinder.pl-2026/',
  plugins: [
    react(),
    {
      name: 'top-coins-api-dev-proxy',
      configureServer(server) {
        server.middlewares.use('/api/top-coins', async (req, res) => {
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'method-not-allowed' }));
            return;
          }

          const host = req.headers.host ?? 'localhost';
          const rawUrl = `http://${host}${req.url ?? '/api/top-coins'}`;
          const result = await handleTopCoinsApiRequest(rawUrl);

          res.statusCode = result.status;
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
          }
          res.end(result.body);
        });
      }
    }
  ],
  server: {
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  }
});
