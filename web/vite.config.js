import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In der Entwicklung wird /api an das Backend (Standard: 4000) weitergeleitet,
// so dass kein CORS-Problem entsteht.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
