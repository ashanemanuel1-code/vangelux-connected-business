import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' + HashRouter = works at https://<user>.github.io/<repo>/ with no 404 tricks,
// including deep links such as /#/admin/products.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' = we decide when to switch (see src/lib/appUpdate.ts), so an update never interrupts typing.
      registerType: 'prompt',
      manifest: false, // we ship two manifests in /public (showroom + admin)
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'brand/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // The service worker only caches the app shell (code, icons). It has NO runtime
        // routes, so every Supabase request (database, auth, storage, realtime) goes
        // straight to the network — business data is never served from a device cache.
        navigateFallbackDenylist: [/^\/(rest|auth|storage|realtime)\//],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1600 },
});
