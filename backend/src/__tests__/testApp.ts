/**
 * Test application for integration tests
 * Creates an Express app instance without starting the server
 */

import express from 'express';
import cors from 'cors';

// Import routes
import authRoutes from '../routes/auth';
import usersRoutes from '../routes/users';
import orchestrasRoutes from '../routes/orchestras';
import rehearsalRoutes from '../routes/rehearsals';

// Import middleware
import { errorHandler, notFoundHandler } from '../middleware/errorHandler';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/orchestras', orchestrasRoutes);
app.use('/api/rehearsals', rehearsalRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for unknown API routes
app.use('/api/*', notFoundHandler);

// Central error handling middleware
app.use(errorHandler);

export default app;
