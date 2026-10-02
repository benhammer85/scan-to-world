import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { renameSync } from 'node:fs';

/**
 * The volcano game alone, built for the iPhone app (Capacitor serves `dist-app`, see
 * capacitor.config.ts): one page, everything bundled in, so it runs with no network at all.
 */
const asIndex: Plugin = {
  name: 'volcano-as-index',
  // (Capacitor opens index.html: the game's page is renamed so, once it's written.)
  writeBundle(options) {
    const dir = options.dir ?? 'dist-app';
    renameSync(resolve(dir, 'volcano.html'), resolve(dir, 'index.html'));
  },
};

export default defineConfig({
  base: './',
  // (The web app's icons, manifest and service worker aren't wanted inside the app.)
  publicDir: false,
  plugins: [asIndex],
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    rollupOptions: { input: { volcano: resolve(__dirname, 'volcano.html') } },
  },
});
