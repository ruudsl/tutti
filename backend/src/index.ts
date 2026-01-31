import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';

// Import configuration
import config from './config';

// Import database
import db from './database/connection';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import instrumentsRoutes from './routes/instruments';
import orchestrasRoutes from './routes/orchestras';
import musicListsRoutes from './routes/music-lists';
import musicPiecesRoutes from './routes/music-pieces';
import associationsRoutes from './routes/associations';
import genresRoutes from './routes/genres';

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/instruments', instrumentsRoutes);
app.use('/api/orchestras', orchestrasRoutes);
app.use('/api/music-lists', musicListsRoutes);
app.use('/api/music-pieces', musicPiecesRoutes);
app.use('/api/associations', associationsRoutes);
app.use('/api/genres', genresRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (config.isProduction) {
    const frontendPath = path.join(__dirname, '../../frontend/dist');
    app.use(express.static(frontendPath));

    app.get('*', (req, res, next) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendPath, 'index.html'));
        } else {
            next();
        }
    });
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
        console.log('Database initialized successfully');

        // Initialize default data
        const { initializeDatabase } = await import('./database/init');
        await initializeDatabase();

        app.listen(config.port, () => {
            console.log(`🎵 Harmonie Muziek Server draait op http://localhost:${config.port}`);
            console.log(`   API beschikbaar op http://localhost:${config.port}/api`);
            if (config.isDevelopment) {
                console.log(`   Mode: development`);
            }
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;
