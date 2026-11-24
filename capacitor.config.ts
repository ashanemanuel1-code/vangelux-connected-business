import type { CapacitorConfig } from '@capacitor/cli';

/**
 * VANGELUX Admin — Android app for the owner.
 * The app opens your live admin (the same one on GitHub Pages), so every update
 * to the website appears in the app automatically — no reinstall needed.
 * If you move the site to a new address, change `url` below and rebuild the app.
 */
const config: CapacitorConfig = {
  appId: 'com.vangelux.admin',
  appName: 'VANGELUX Admin',
  webDir: 'dist',
  server: {
    url: 'https://ashanemanuel1-code.github.io/vangelux-connected-business/',
    errorPath: 'offline.html', // shown when there is no internet
  },
  android: {
    backgroundColor: '#0B0B0B',
  },
};

export default config;
