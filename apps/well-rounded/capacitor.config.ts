import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iPhone app, Well Rounded: the daily tree-ring practice (built by `npm run build:rings` into
 * dist-rings) inside a native shell of its own, apart from Warm to the Touch's (../../ios). The bundle
 * id must be settled for good before the app's App Store record is made (see WELL-ROUNDED-IOS.md).
 */
const config: CapacitorConfig = {
  appId: 'app.wellrounded',
  appName: 'Well Rounded',
  webDir: '../../dist-rings',
  backgroundColor: '#f7f3eb',
  server: { hostname: 'wellrounded' },
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    allowsLinkPreview: false,
  },
};

export default config;
