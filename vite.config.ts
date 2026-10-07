import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { host: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Atlas Minor, and the volcano prototype beside it (volcano.html).
      input: { main: resolve(__dirname, 'index.html'), volcano: resolve(__dirname, 'volcano.html') },
    },
  },
});
