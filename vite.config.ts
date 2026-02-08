import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Use an in-app prompt instead of silently reloading mid-lesson.
      // We'll register via virtual:pwa-register in App.tsx.
      injectRegister: null,
      registerType: 'prompt',
      includeAssets: ['vite.svg', 'icons/pwa-192x192.png', 'icons/pwa-512x512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Ear Train Station',
        short_name: 'EarTrain',
        description: 'Duolingo-style ear training: scales, intervals, chords',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Cache piano soundfont JS payloads from the midi-js-soundfonts CDN.
            urlPattern: /^https:\/\/gleitz\.github\.io\/midi-js-soundfonts\/.*\.js$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'kuku-soundfonts-v1',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
