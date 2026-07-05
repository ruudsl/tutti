import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';

// Import configuration
import config from './config';

// Import database
import db from './database/connection';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { csrfTokenMiddleware, validateCsrfToken, getCsrfToken } from './middleware/csrf';

// Import Swagger
import { swaggerSpec } from './swagger';

// Import centralized logging
import logger from './logging/logger';
import { requestIdMiddleware, requestLoggerMiddleware, errorLoggerMiddleware } from './logging/requestLogger';

// Import error monitoring (Sentry)
import { initSentry, sentryErrorHandler, setupGlobalErrorHandlers, flushSentry } from './monitoring/sentry';

// Import routes
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import instrumentsRoutes from './routes/instruments';
import orchestrasRoutes from './routes/orchestras';
import musicListsRoutes from './routes/music-lists';
import musicPiecesRoutes from './routes/music-pieces';
import associationsRoutes from './routes/associations';
import genresRoutes from './routes/genres';
import backupRoutes from './routes/backup';
import issuesRoutes from './routes/issues';
import pdfToolsRoutes from './routes/pdf-tools';
import loansRoutes from './routes/loans';
import activityRoutes from './routes/activity';
import settingsRoutes from './routes/settings';
import rehearsalRoutes from './routes/rehearsals';
import spondRoutes from './routes/spond';
import microsoftAuthRoutes from './routes/microsoft-auth';
import socialAuthRoutes from './routes/social-auth';
import musicaInfoRoutes from './routes/musicainfo';
import imslpRoutes from './routes/imslp';
import cloudImportRoutes from './routes/cloud-import';
import equipmentRoutes from './routes/equipment';
import uniformsRoutes from './routes/uniforms';
import concertsRoutes from './routes/concerts';
import entraSyncRoutes from './routes/entra-sync';
import auditLogsRoutes from './routes/audit-logs';
import seatingRoutes from './routes/seating';
import seatingNotificationsRoutes from './routes/seating-notifications';
import onboardingRoutes from './routes/onboarding';
import favoritesRoutes from './routes/favorites';
import practiceRoutes from './routes/practice';
import recentRoutes from './routes/recent';
import annotationsRoutes from './routes/annotations';
import sessionsRoutes from './routes/sessions';
import audioRecordingsRoutes from './routes/audio-recordings';
import sectionChatRoutes from './routes/section-chat';
import notificationsRoutes from './routes/notifications';
import notificationChannelsRoutes from './routes/notificationChannels';
import practiceSchedulesRoutes from './routes/practice-schedules';
import gdprRoutes from './routes/gdpr';
import searchRoutes from './routes/search';
import thumbnailsRoutes from './routes/thumbnails';
import streamingLinksRoutes from './routes/streamingLinks';
import calendarRoutes from './routes/calendar';
import ticketsRoutes from './routes/tickets';
import guestListRoutes from './routes/guest-list';
import paymentSettingsRoutes from './routes/payment-settings';
import discountCodesRoutes from './routes/discount-codes';
import venueLayoutsRoutes from './routes/venue-layouts';
import { createServer, Server as HttpServer } from 'http';
import { initWebSocket, getIO } from './websocket';
import { startScheduler as startSeatingScheduler } from './scheduler/seating-notifications';
import { startScheduler as startEmailForwardingScheduler } from './scheduler/email-forwarding-retry';
import { startScheduler as startGdprCleanupScheduler } from './scheduler/gdpr-cleanup';
import { stopAllSchedulers } from './scheduler';
import { startScheduler as startBackupScheduler } from './scheduler/backup';
import healthRoutes from './routes/health';
import analyticsRoutes from './routes/analytics';
import maintenanceRoutes from './routes/maintenance';
import vocabulariesRoutes from './routes/vocabularies';
import interopRoutes from './routes/interop';
import availabilityRoutes from './routes/availability';
import instrumentAssetsRoutes from './routes/instrument-assets';
import instrumentInsuranceRoutes from './routes/instrument-insurance';
import eventsRoutes from './routes/events';
import multiAssociationRoutes from './routes/multi-association';
import contactsRoutes from './routes/contacts';
import customFieldsRoutes from './routes/custom-fields';
import privacySettingsRoutes from './routes/privacy-settings';
import pollsRoutes from './routes/polls';
import tasksRoutes from './routes/tasks';
import postsRoutes from './routes/posts';
import emailCampaignsRoutes from './routes/email-campaigns';
import accountingRoutes from './routes/accounting';
import projectsRoutes from './routes/projects';
import toursRoutes from './routes/tours';
import resourcesRoutes from './routes/resources';
import seasonsRoutes from './routes/seasons';
import holidaysRoutes from './routes/holidays';

// External Musicians Network routes
import externalMusiciansRoutes from './routes/external-musicians';
import replacementRequestsRoutes from './routes/replacement-requests';

// Phase E routes
import outfitsRoutes from './routes/outfits';
import wikiRoutes from './routes/wiki';
import workflowsRoutes from './routes/workflows';
import performancesRoutes from './routes/performances';
import stageLayoutsRoutes from './routes/stage-layouts';

// Import recovery
import failedImportsRoutes from './routes/failed-imports';

// Initialize Sentry error monitoring (must be called before app is created)
initSentry();

const app = express();

// Trust proxy - required for correct client IP detection behind reverse proxies (e.g., Render, Nginx)
// This enables express-rate-limit to work correctly with X-Forwarded-For headers
if (config.isProduction) {
  app.set('trust proxy', 1);
}

// Add request ID to each request (should be first middleware)
app.use(requestIdMiddleware);

// Request logging middleware (after request ID)
app.use(requestLoggerMiddleware);

// Content Security Policy configuration for production
const getContentSecurityPolicy = (): false | { directives: Record<string, string[]> } => {
  if (!config.isProduction) {
    // Disable CSP entirely in development: Vite dev tooling (HMR, React refresh)
    // needs eval/inline scripts. Production gets the strict policy below.
    return false;
  }

  const directives: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      // NOTE: no 'unsafe-inline' / 'unsafe-eval' here. Vite production builds
      // load only external module scripts and need neither directive; dev
      // tooling that requires eval is covered by the early return above.
      'https://www.youtube.com',
      'https://s.ytimg.com',
      'https://alcdn.msauth.net',
      'https://apis.google.com',
      'https://accounts.google.com',
    ],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // Required for styled-components / CSS-in-JS
      'https://fonts.googleapis.com',
    ],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    mediaSrc: ["'self'", 'blob:', 'https://www.youtube.com'],
    frameSrc: [
      "'self'",
      'https://www.youtube.com',
      'https://www.youtube-nocookie.com',
      'https://accounts.google.com',
      'https://docs.google.com',
      'https://login.microsoftonline.com',
    ],
    connectSrc: [
      "'self'",
      config.frontendUrl,
      'https://graph.microsoft.com',
      'https://login.microsoftonline.com',
      'https://www.googleapis.com',
      'https://accounts.google.com',
    ],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    // Kept at 'self' (not 'none'): the app has a public calendar embed feature
    // (frontend route /calendar/:slug and /api/calendar, meant for embedding on
    // external websites), so frames must not be blocked outright.
    frameAncestors: ["'self'"],
    workerSrc: ["'self'", 'blob:'], // Service workers and web workers
    childSrc: ["'self'", 'blob:'], // Web workers (legacy)
    manifestSrc: ["'self'"], // PWA manifests
    upgradeInsecureRequests: [],
  };

  // Add report-uri if configured
  if (config.cspReportUri) {
    directives.reportUri = [config.cspReportUri];
  }

  return { directives };
};

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: getContentSecurityPolicy(),
    crossOriginEmbedderPolicy: false, // Allow embedding YouTube videos
  }),
);

// Compression middleware - compress all responses
app.use(
  compression({
    filter: (req, res) => {
      // Don't compress responses if the request includes 'x-no-compression' header
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use compression filter default
      return compression.filter(req, res);
    },
    level: 6, // Compression level (0-9, default 6)
    threshold: 1024, // Only compress responses larger than 1KB
  }),
);

// CORS
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);

// Payment webhook needs the RAW request body for signature verification (Stripe
// computes the signature over the exact bytes). Mount raw parser for this path
// BEFORE express.json() so req.body is a Buffer there. Non-JSON content types
// (e.g. Mollie's form-encoded webhook) fall through to express.urlencoded below.
app.use('/api/tickets/webhooks/payment', express.raw({ type: 'application/json', limit: '1mb' }));

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing (required for CSRF)
app.use(cookieParser());

// CSRF protection middleware
app.use(csrfTokenMiddleware);
app.use(validateCsrfToken);

// General rate limiting (counts ALL requests; keep the max high enough for
// legitimate SPA usage - at least 300 requests per 15 minutes)
const generalLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: Math.max(config.rateLimitMaxRequests, 300),
  message: { error: 'Te veel verzoeken. Probeer het later opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', generalLimiter);

// Stricter rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.authRateLimitMaxRequests,
  message: { error: 'Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});
app.use('/api/auth/login', authLimiter);

// API Routes (more specific prefixes first)
app.use('/api/auth/microsoft', microsoftAuthRoutes);
app.use('/api/auth/social', socialAuthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/instruments', instrumentsRoutes);
app.use('/api/orchestras', orchestrasRoutes);
app.use('/api/music-lists', musicListsRoutes);
app.use('/api/music-pieces', musicPiecesRoutes);
app.use('/api/associations', associationsRoutes);
app.use('/api/genres', genresRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/pdf-tools', pdfToolsRoutes);
app.use('/api/loans', loansRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/rehearsals', rehearsalRoutes);
app.use('/api/spond', spondRoutes);
app.use('/api/musicainfo', musicaInfoRoutes);
app.use('/api/imslp', imslpRoutes);
app.use('/api/cloud-import', cloudImportRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/instrument-assets', instrumentAssetsRoutes);
app.use('/api/instrument-insurance', instrumentInsuranceRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/multi-association', multiAssociationRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/custom-fields', customFieldsRoutes);
app.use('/api/privacy-settings', privacySettingsRoutes);
app.use('/api/polls', pollsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/email-campaigns', emailCampaignsRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tours', toursRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/seasons', seasonsRoutes);

// Phase E routes
app.use('/api/outfits', outfitsRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/performances', performancesRoutes);
app.use('/api/uniforms', uniformsRoutes);
app.use('/api/concerts', concertsRoutes);
app.use('/api/entra', entraSyncRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/seating', seatingRoutes);
app.use('/api/seating-notifications', seatingNotificationsRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/recent', recentRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/audio-recordings', audioRecordingsRoutes);
app.use('/api/section-chat', sectionChatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/notification-channels', notificationChannelsRoutes);
app.use('/api/practice-schedules', practiceSchedulesRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/thumbnails', thumbnailsRoutes);
app.use('/api/streaming', streamingLinksRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/holidays', holidaysRoutes);
app.use('/api/stage-layouts', stageLayoutsRoutes);
app.use('/api', stageLayoutsRoutes); // Also mount for /concerts/:id/stage routes

// External Musicians Network
app.use('/api/external-musicians', externalMusiciansRoutes);
app.use('/api/replacement-requests', replacementRequestsRoutes);

// Import recovery
app.use('/api/failed-imports', failedImportsRoutes);

// Health check routes (MUST be before catch-all /api routes to avoid conflicts)
app.use('/api/health', healthRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/vocabularies', vocabulariesRoutes);
app.use('/api/interop', interopRoutes);

// CSRF token endpoint (for SPAs to get/refresh their token)
app.get('/api/csrf-token', getCsrfToken);

// Changelog endpoint (language-aware, public)
// Content is memoized per language on first request to avoid sync fs I/O per request.
const changelogCache = new Map<string, string>();

async function loadChangelog(lang: string): Promise<string> {
  const suffix = lang === 'nl' ? '' : `_${lang}`;

  // In production (Render), CHANGELOG files are copied to backend/ during build
  // In development, they're in the repo root (../../ from dist/).
  // The language-less CHANGELOG.md acts as fallback for unknown languages.
  const candidates = [
    path.join(__dirname, `../CHANGELOG${suffix}.md`),
    path.join(__dirname, `../../CHANGELOG${suffix}.md`),
    path.join(__dirname, '../CHANGELOG.md'),
    path.join(__dirname, '../../CHANGELOG.md'),
  ];

  for (const candidate of candidates) {
    try {
      return await fs.promises.readFile(candidate, 'utf-8');
    } catch {
      // Try the next candidate
    }
  }

  return '# Changelog\n\nNo changelog available.';
}

app.get('/api/changelog', async (req, res) => {
  // Restrict to simple language codes so arbitrary input can't grow the cache
  const rawLang = (req.query.lang as string) || 'nl';
  const lang = /^[a-z]{2}$/i.test(rawLang) ? rawLang.toLowerCase() : 'nl';

  let content = changelogCache.get(lang);
  if (content === undefined) {
    content = await loadChangelog(lang);
    changelogCache.set(lang, content);
  }

  res.json({ content });
});

// Routes with catch-all patterns (mount these AFTER specific routes)
app.use('/api', ticketsRoutes); // Tickets routes use multiple prefixes: /concerts/:id/tickets, /tickets/...
app.use('/api', guestListRoutes); // Guest list routes: /concerts/:id/guest-list, /guest-list/...
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use('/api/discount-codes', discountCodesRoutes);
app.use('/api', venueLayoutsRoutes); // Venue layouts routes: /venue-layouts, /concerts/:id/seats

// Swagger API documentation
if (config.isDevelopment) {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Harmonie API Docs',
    }),
  );
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// Serve static files in production (only if frontend is bundled with backend)
if (config.isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  const frontendExists = fs.existsSync(path.join(frontendPath, 'index.html'));

  if (frontendExists) {
    logger.info('Serving frontend from ' + frontendPath);
    app.use(express.static(frontendPath));

    app.get('*', (req, res, next) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(frontendPath, 'index.html'));
      } else {
        next();
      }
    });
  } else {
    logger.info('Frontend not bundled - running as API-only backend');
  }
}

// Debug route for unexpected POST to root (tracking browser privacy tool interference)
app.post('/', (req, res) => {
  logger.warn('Unexpected POST to root path', {
    headers: {
      'user-agent': req.headers['user-agent'],
      referer: req.headers['referer'],
      origin: req.headers['origin'],
      'content-type': req.headers['content-type'],
    },
    body: req.body,
    query: req.query,
    ip: req.ip,
  });
  res.status(404).json({ error: 'Not found', message: 'POST to root is not a valid endpoint' });
});

// 404 handler for unknown API routes
app.use('/api/*', notFoundHandler);

// Error logging middleware (before error handler)
app.use(errorLoggerMiddleware);

// Sentry error handler (captures errors to Sentry)
app.use(sentryErrorHandler);

// Central error handling middleware
app.use(errorHandler);

// HTTP server reference for graceful shutdown
let httpServer: HttpServer | null = null;

// Start server (after database initialization)
async function startServer() {
  try {
    // Initialize database
    await db.init();
    logger.info('Database initialized successfully');

    // Initialize default data
    const { initializeDatabase } = await import('./database/init');
    await initializeDatabase();

    // Create HTTP server and initialize WebSocket
    httpServer = createServer(app);
    initWebSocket(httpServer);

    httpServer.listen(config.port, () => {
      logger.info(`🎵 Harmonie Muziek Server draait op http://localhost:${config.port}`);
      logger.info(`   API beschikbaar op http://localhost:${config.port}/api`);
      logger.info(`   WebSocket beschikbaar op ws://localhost:${config.port}`);
      if (config.isDevelopment) {
        logger.info(`   Swagger docs: http://localhost:${config.port}/api/docs`);
      }

      // Start schedulers
      startSeatingScheduler();
      startEmailForwardingScheduler();
      startGdprCleanupScheduler();
      startBackupScheduler();
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Setup global error handlers for unhandled rejections and exceptions (including Sentry)
setupGlobalErrorHandlers();

// Graceful shutdown handler
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`${signal} received, shutting down gracefully`);

  // Timeout guard: force exit if graceful shutdown takes too long
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  // 1. Stop background schedulers (clears their pending timeouts)
  try {
    stopAllSchedulers();
  } catch (err) {
    logger.error('Failed to stop schedulers on shutdown', { error: err });
  }

  // 2. Stop accepting new connections and wait for in-flight requests
  if (httpServer) {
    const server = httpServer;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Don't let idle keep-alive connections stall the shutdown
      server.closeIdleConnections?.();
    });
  }

  // 3. Close socket.io if initialized (disconnects remaining clients)
  const io = getIO();
  if (io) {
    await new Promise<void>((resolve) => {
      // The callback also fires when the underlying HTTP server is
      // already closed; shutdown proceeds regardless
      io.close(() => resolve());
    });
  }

  // 4. Persist the database (flush = cancel pending debounced save + save now)
  try {
    db.flush();
  } catch (err) {
    logger.error('Failed to flush database on shutdown', { error: err });
  }

  // 5. Flush error monitoring
  await flushSentry();

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

startServer();

export default app;
