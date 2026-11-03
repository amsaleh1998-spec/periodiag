import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Relative base so the build works from any sub-path (GitHub Pages) or a local folder.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'fonts/*.ttf'],
      manifest: {
        name: 'PerioDiag: periodontal charting & diagnosis',
        short_name: 'PerioDiag',
        description: 'Offline periodontal charting and 2017 AAP/EFP classification',
        theme_color: '#1f4e79',
        background_color: '#f4f6f9',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything, including the lazily loaded PDF chunks and fonts, so export works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,txt}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
