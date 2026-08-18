import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-custom.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png', 'icons/*.svg', 'offline.html'],
      manifest: false, // We use external manifest file
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB to accommodate large bundles
        additionalManifestEntries: [{ url: '/offline.html', revision: '1' }],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - core React ecosystem
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // React Query - state management
          'vendor-query': [
            '@tanstack/react-query',
            '@tanstack/react-query-persist-client',
            '@tanstack/query-sync-storage-persister',
          ],

          // PDF.js - large library for PDF handling
          'vendor-pdf': ['pdfjs-dist'],

          // Forms - react-hook-form and validation
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],

          // DnD Kit - drag and drop
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],

          // i18n - internationalization
          'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],

          // Utilities
          'vendor-utils': ['axios', 'date-fns', 'idb', 'ua-parser-js'],
        },
      },
    },
    // Increase chunk size warning limit for PDF.js
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
