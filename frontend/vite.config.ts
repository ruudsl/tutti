import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Zet de stylesheet van het schild rechtstreeks in de HTML.
 *
 * Een <link rel="stylesheet"> in de <head> houdt het tekenen tegen tot het
 * bestand binnen is, en dat is een eigen rondgang naar de server. Lighthouse
 * rekende daar 600 ms voor - niet vanwege de omvang (22 KB ingepakt) maar
 * vanwege die rondgang. De stijlen staan in één bestand voor de hele
 * applicatie; ze opsplitsen in "wat het inlogscherm nodig heeft" en "de rest"
 * is een grotere verbouwing dan dit werkpakket toestaat, en dan nog blijft er
 * een blokkerend deel over.
 *
 * Inpakken in de HTML haalt die rondgang helemaal weg. Dat mag hier: de
 * backend staat 'unsafe-inline' toe in style-src, en de applicatie heeft maar
 * één HTML-document, dus er is geen tweede pagina die de stylesheet opnieuw
 * uit de cache zou kunnen halen.
 *
 * Het losse .css-bestand wordt uit de bundel gehaald nadat het is ingepakt.
 * Bleef het staan, dan zette de service worker het in zijn precache: een
 * bestand van 118 KB dat niemand meer opvraagt.
 */
function stijlenInlijnen(): Plugin {
  return {
    name: 'tutti-stijlen-inlijnen',
    enforce: 'post',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;

        return html.replace(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (heleTag, href: string) => {
          const naam = href.replace(/^\//, '');
          const bestand = bundle[naam];
          if (!bestand || bestand.type !== 'asset') return heleTag;

          const inhoud = String(bestand.source);
          delete bundle[naam];
          return `<style>${inhoud}</style>`;
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    stijlenInlijnen(),
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
        // Hier stond `additionalManifestEntries: [{ url: '/offline.html',
        // revision: '1' }]`, en dat maakte de service worker onbruikbaar.
        //
        // offline.html staat in `includeAssets` hierboven en komt daardoor al
        // in dist terecht, waar het globpatroon `**/*.html` hem oppikt - met
        // een revisie die uit de inhoud van het bestand is berekend. De regel
        // hierboven zette hem er een tweede keer bij, met revisie '1'.
        // Workbox weigert dezelfde URL met twee verschillende revisies en
        // gooit `add-to-cache-list-conflicting-entries` - niet bij het
        // installeren, maar al bij het evalueren van het script. Registreren
        // liep daarmee altijd stuk op "ServiceWorker script evaluation
        // failed", in elke browser, ook in productie.
        //
        // Wat daar allemaal aan vastzat: geen precache, dus geen offline
        // gebruik, geen offline bladmuziek, geen achtergrondmeldingen en geen
        // installatie als app. De applicatie logde de fout in de console en
        // werkte verder gewoon, dus het viel niemand op.
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
          // Deze vier stonden samen in één 'vendor-utils'-chunk, en dat
          // kostte meer dan het opleverde. Een gedeelde chunk wordt geladen
          // zodra iets erin nodig is: axios heeft het inlogscherm nodig, dus
          // kwamen date-fns, ua-parser-js en idb ongevraagd mee - samen 215 KB
          // broncode die op het inlogscherm niets doet. Elk zijn eigen chunk,
          // dan haalt de browser alleen op wat er werkelijk wordt aangeroepen.
          if (/[\\/]axios[\\/]/.test(id)) return 'vendor-http';
          if (/[\\/]date-fns[\\/]/.test(id)) return 'vendor-datum';
          if (/[\\/]ua-parser-js[\\/]/.test(id)) return 'vendor-ua';
          if (/[\\/]idb[\\/]/.test(id)) return 'vendor-idb';

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
