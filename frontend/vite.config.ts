import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png', 'icons/*.svg', 'offline.html'],
      manifest: false, // We use external manifest file
      workbox: {
        // Precache essential app shell resources
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Additional precache entries for critical resources
        additionalManifestEntries: [
          { url: '/offline.html', revision: '1' },
        ],
        // Skip waiting to activate new service worker immediately
        skipWaiting: true,
        clientsClaim: true,
        // Navigation fallback for SPA routing and offline
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // Don't fallback for API routes
          /^\/api\//,
          // Don't fallback for static assets
          /\.[^/?]+$/,
        ],
        runtimeCaching: [
          // API calls - Network First with fallback to cache
          {
            urlPattern: /^https?:\/\/.*\/api\/(?!auth).*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              },
              // Use background sync for failed requests
              backgroundSync: {
                name: 'api-queue',
                options: {
                  maxRetentionTime: 24 * 60, // 24 hours in minutes
                },
              },
            }
          },
          // User profile endpoint - StaleWhileRevalidate for faster access
          {
            urlPattern: /\/api\/auth\/me$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'user-profile-cache',
              expiration: {
                maxEntries: 1,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Music pieces/titles metadata - Cache First with network update
          {
            urlPattern: /\/api\/music-pieces(?:\/titles)?(?:\?.*)?$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'music-metadata-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Orchestras, instruments, genres - Cache with longer expiry
          {
            urlPattern: /\/api\/(orchestras|instruments|genres)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'reference-data-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Favorites and recent views
          {
            urlPattern: /\/api\/(favorites|recent)(?:\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'user-data-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Rehearsals
          {
            urlPattern: /\/api\/rehearsals(?:\/.*)?(?:\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rehearsals-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          // Music files (MP3) - Cache First
          {
            urlPattern: /\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'music-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              rangeRequests: true
            }
          },
          // PDF files - Cache First with larger limit for sheet music
          {
            urlPattern: /\.pdf$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
              }
            }
          },
          // Images - Cache First
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              }
            }
          },
          // Fonts - Cache First
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              }
            }
          },
          // Google Fonts Stylesheets
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          // Google Fonts Webfonts
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ],
        // Offline fallback for navigation requests
        offlineGoogleAnalytics: false,
      },
      // Dev options for testing
      devOptions: {
        enabled: false, // Set to true to test service worker in dev mode
      },
    })
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
})
