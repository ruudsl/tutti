import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import database
import db from './database/connection';

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
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

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
if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.join(__dirname, '../../frontend/dist');
    app.use(express.static(frontendPath));

    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(frontendPath, 'index.html'));
        }
    });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server error:', err);

    if (err.message === 'Alleen PDF bestanden zijn toegestaan.') {
        return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'Interne serverfout.' });
});

// Start server (after database initialization)
async function startServer() {
    try {
        // Initialize database
        await db.init();
        console.log('Database initialized successfully');

        // Initialize default data
        const { initializeDatabase } = await import('./database/init');
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`🎵 Harmonie Muziek Server draait op http://localhost:${PORT}`);
            console.log(`   API beschikbaar op http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;
