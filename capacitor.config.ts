import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iPhone app, Warm to the Touch: the volcano game (built by `npm run build:app` into dist-app)
 * inside a native shell. Under its icon it's "Warm" (Info.plist). The bundle id must be settled for
 * good before the app's App Store record is made (see IOS.md).
 */
const config: CapacitorConfig = {
  appId: 'app.warmtothetouch',
  appName: 'Warm to the Touch',
  webDir: 'dist-app',
  backgroundColor: '#f4efe4',
  // (The page's host, which iOS names when it asks to read the tilt: it said "localhost".)
  server: { hostname: 'warm' },
  ios: {
    contentInset: 'never',
    // (No bounce, no long-press menus: the world is all there is.)
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
};

export default config;
