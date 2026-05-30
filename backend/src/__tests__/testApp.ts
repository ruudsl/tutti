/**
 * Test application for integration tests
 * Creates an Express app instance without starting the server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Import routes
import authRoutes from '../routes/auth';
import usersRoutes from '../routes/users';
import orchestrasRoutes from '../routes/orchestras';
import rehearsalRoutes from '../routes/rehearsals';
import annotationsRoutes from '../routes/annotations';
import instrumentsRoutes from '../routes/instruments';
import notificationsRoutes from '../routes/notifications';
import musicPiecesRoutes from '../routes/music-pieces';
import concertsRoutes from '../routes/concerts';

// Import middleware
import { notFoundHandler } from '../middleware/errorHandler';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orchestras', orchestrasRoutes);
app.use('/api/rehearsals', rehearsalRoutes);
app.use('/api/annotations', annotationsRoutes);
app.use('/api/instruments', instrumentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/music-pieces', musicPiecesRoutes);
app.use('/api/concerts', concertsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for unknown API routes
app.use('/api/*', notFoundHandler);

// Custom error handling middleware for tests that captures full error
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // Log error details for debugging in tests
    console.error('Test Error Handler:', {
        message: err?.message,
        name: err?.name,
        stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    });

    // Handle known API errors
    if (err.statusCode) {
        res.status(err.statusCode).json({ error: err.message });
        return;
    }

    // Handle validation errors (from Zod)
    if (err.name === 'ZodError') {
        res.status(400).json({
            error: 'Validatiefout.',
            details: err.errors,
        });
        return;
    }

    // Handle SQLite constraint errors
    if (err.message?.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'Dit item bestaat al.' });
        return;
    }

    if (err.message?.includes('FOREIGN KEY constraint failed')) {
        res.status(400).json({ error: 'Ongeldige referentie.' });
        return;
    }

    // Default to 500 Internal Server Error
    res.status(500).json({ error: 'Interne serverfout.', details: err.message });
});

export default app;
