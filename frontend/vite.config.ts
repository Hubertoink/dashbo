import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      includeAssets: ['background.jpg', 'icon.svg', 'icon-192.png', 'icon-512.png', 'maskable-icon.svg', 'maskable-192.png', 'maskable-512.png', 'favicon.ico'],
      kit: {
        includeVersionFile: true
      },
      workbox: {
        // Keep default glob patterns (incl. images) and just raise the size limit
        // so large background images don't break the build.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/'
      },
      manifest: {
        id: '/',
        name: 'Dashbo',
        short_name: 'Dashbo',
        description: 'Dashbo Familien-Dashboard mit Kalender, ToDos und Widgets',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        categories: ['productivity', 'utilities'],
        prefer_related_applications: false,
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: '/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/maskable-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
