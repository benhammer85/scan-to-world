import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { renameSync } from 'node:fs';

/**
 * The volcano game alone, built for the iPhone app (Capacitor serves `dist-app`, see
 * capacitor.config.ts): one page, everything bundled in, so it runs with no network at all.
 * (`GAME=rings` builds the tree-ring game, Well Rounded, into the same shell instead: its daily practice
 * as the index, and the first game beside it as classic.html.)
 */
const GAME = process.env.GAME === 'rings' ? 'rings' : 'volcano';
const asIndex: Plugin = {
  name: 'volcano-as-index',
  // (Capacitor opens index.html: the game's page is renamed so, once it's written. For Well Rounded
  // that's the daily practice, a ring a day (press.html); the first game is kept at classic.html.)
  writeBundle(options) {
    const dir = options.dir ?? (GAME === 'rings' ? 'dist-rings' : 'dist-app');
    if (GAME === 'rings') {
      renameSync(resolve(dir, 'rings.html'), resolve(dir, 'classic.html'));
      renameSync(resolve(dir, 'press.html'), resolve(dir, 'index.html'));
    } else renameSync(resolve(dir, `${GAME}.html`), resolve(dir, 'index.html'));
  },
};

export default defineConfig({
  base: './',
  // (Atlas Minor's icons, manifest and service worker aren't wanted inside either; Well Rounded brings its own
  // (rings-public: its manifest, offline copy, icons, privacy and support pages).)
  publicDir: GAME === 'rings' ? 'rings-public' : false,
  plugins: [asIndex],
  build: {
    // (Each its own: the two apps' shells never take up each other's game.)
    outDir: GAME === 'rings' ? 'dist-rings' : 'dist-app',
    emptyOutDir: true,
    // (Well Rounded is two pages: the daily practice and the first game.)
    rollupOptions: { input: { [GAME]: resolve(__dirname, `${GAME}.html`), ...(GAME === 'rings' ? { press: resolve(__dirname, 'press.html') } : {}) } },
  },
});
