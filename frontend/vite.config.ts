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
  // `preview` serveert de productiebuild en erft de instellingen van `server`
  // niet. Zonder deze eigen proxy komen API-aanroepen daar nergens aan, en
  // blijft de applicatie in een laadtoestand hangen. Dat maakt elke meting aan
  // de gebouwde app onbruikbaar - Lighthouse zag een pagina die nooit afkwam.
  preview: {
    port: 4173,
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
        manualChunks(id: string) {
          // src/api.ts is een bestand van bijna vierduizend regels met alle
          // endpoints erin. Tientallen lui geladen pagina's importeren eruit,
          // en Rollup tilt een module die door meerdere chunks wordt gedeeld
          // naar de gemeenschappelijke bundel. Daardoor stond die 109 KB in de
          // hoofdbundel en haalde iemand op de inlogpagina alle endpoints van
          // de applicatie binnen voordat hij zijn e-mailadres kon typen.
          //
          // Een eigen chunk laadt hem pas als een pagina hem echt nodig heeft.
          // De inlogpagina wijst inmiddels naar de kleine modules onder
          // src/api/ en raakt dit bestand niet meer aan.
          if (id.includes('/src/api.ts')) return 'api-legacy';

          if (!id.includes('node_modules')) return undefined;

          // Kern van React
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('@tanstack/')) return 'vendor-query';
          if (id.includes('pdfjs-dist')) return 'vendor-pdf';
          if (/[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'vendor-forms';
          if (id.includes('@dnd-kit/')) return 'vendor-dnd';
          if (/[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/.test(id)) {
            return 'vendor-i18n';
          }
          if (/[\\/](axios|date-fns|idb|ua-parser-js)[\\/]/.test(id)) return 'vendor-utils';

          return undefined;
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
