import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';

// Import configuration
import config from './config';

// Import database
import db from './database/connection';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Import Swagger
import { swaggerSpec } from './swagger';

// Import logger
import logger from './utils/logger';

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
import musicaInfoRoutes from './routes/musicainfo';
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
import practiceSchedulesRoutes from './routes/practice-schedules';
import { startScheduler as startSeatingScheduler } from './scheduler/seating-notifications';
import { startScheduler as startEmailForwardingScheduler } from './scheduler/email-forwarding-retry';

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: config.isProduction ? undefined : false, // Disable CSP in development for hot reload
    crossOriginEmbedderPolicy: false, // Allow embedding YouTube videos
}));

// CORS
app.use(cors({
    origin: config.frontendUrl,
    credentials: true,
}));

// Body parsing
app.use(express.json());

// General rate limiting
const generalLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    message: { error: 'Te veel verzoeken. Probeer het later opnieuw.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed requests toward the limit
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
app.use('/api/equipment', equipmentRoutes);
app.use('/api/uniforms', uniformsRoutes);
app.use('/api/concerts', concertsRoutes);
app.use('/api/entra', entraSyncRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/seating', seatingRoutes);
app.use('/api/seating-notifications', seatingNotificationsRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/recent', recentRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/audio-recordings', audioRecordingsRoutes);
app.use('/api/section-chat', sectionChatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/practice-schedules', practiceSchedulesRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Changelog endpoint (language-aware)
app.get('/api/changelog', (req, res) => {
    const lang = (req.query.lang as string) || 'nl';
    const suffix = lang === 'nl' ? '' : `_${lang}`;
    const changelogPath = path.join(__dirname, `../../CHANGELOG${suffix}.md`);
    const fallbackPath = path.join(__dirname, '../../CHANGELOG.md');

    if (fs.existsSync(changelogPath)) {
        const content = fs.readFileSync(changelogPath, 'utf-8');
        res.json({ content });
    } else if (fs.existsSync(fallbackPath)) {
        const content = fs.readFileSync(fallbackPath, 'utf-8');
        res.json({ content });
    } else {
        res.json({ content: '# Changelog\n\nNo changelog available.' });
    }
});

// Swagger API documentation
if (config.isDevelopment) {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Harmonie API Docs',
    }));
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

// 404 handler for unknown API routes
app.use('/api/*', notFoundHandler);

// Central error handling middleware
app.use(errorHandler);

// Start server (after database initialization)
async function startServer() {
    try {
        // Initialize database
        await db.init();
        logger.info('Database initialized successfully');

        // Initialize default data
        const { initializeDatabase } = await import('./database/init');
        await initializeDatabase();

        app.listen(config.port, () => {
            logger.info(`🎵 Harmonie Muziek Server draait op http://localhost:${config.port}`);
            logger.info(`   API beschikbaar op http://localhost:${config.port}/api`);
            if (config.isDevelopment) {
                logger.info(`   Swagger docs: http://localhost:${config.port}/api/docs`);
            }

            // Start schedulers
            startSeatingScheduler();
            startEmailForwardingScheduler();
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Global error handlers for safety net
process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Promise Rejection:', { reason });
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', { message: error.message, stack: error.stack });
    // Give logger time to flush, then exit
    setTimeout(() => process.exit(1), 1000);
});

startServer();

export default app;
