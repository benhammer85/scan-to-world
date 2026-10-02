import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iPhone app: the volcano game (built by `npm run build:app` into dist-app) inside a native
 * shell. The name and the bundle id are placeholders until the game is named: the id must be set
 * for good before the app's App Store record is made (see IOS.md).
 */
const config: CapacitorConfig = {
  appId: 'com.example.volcano',
  appName: 'Volcano',
  webDir: 'dist-app',
  backgroundColor: '#f4efe4',
  ios: {
    contentInset: 'never',
    // (No bounce, no long-press menus: the world is all there is.)
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
};

export default config;
