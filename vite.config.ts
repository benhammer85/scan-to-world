import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { host: true },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Atlas Minor, and the volcano and tree-ring prototypes beside it (volcano.html, rings.html).
      input: { main: resolve(__dirname, 'index.html'), volcano: resolve(__dirname, 'volcano.html'), rings: resolve(__dirname, 'rings.html'), press: resolve(__dirname, 'press.html'), challenge: resolve(__dirname, 'challenge.html') },
    },
  },
});
