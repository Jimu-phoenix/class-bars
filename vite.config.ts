import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        // Raise the default ~2 MB limit so the face-api bundle is precached.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/sw\.js$/,
          /^\/manifest\.webmanifest$/,
          /^\/models\//,
        ],
        runtimeCaching: [
          // Face-api model weights (.json manifest + extensionless shards).
          // CacheFirst so returning students don't re-download models.
          {
            urlPattern: /^\/models\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'face-models-v1',
              cacheableResponse: { statuses: [200] },
              // No expiration — bump cacheName if models ever change.
            },
          },
          // Every Supabase request (REST, RPC, auth, realtime, storage):
          // NetworkOnly. Supabase responses are user-specific, authenticated,
          // and short-lived; caching them would risk stale or leaked data.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-network-only',
            },
          },
        ],
      },
      manifest: {
        name: 'Class-BARS',
        short_name: 'Class-BARS',
        description: 'Biometric attendance recording for classrooms — face-recognition check-in with PostGIS geofencing and OTP fallback.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f0f10',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
