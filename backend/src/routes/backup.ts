import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import config from '../config';

const router = Router();

// Get paths from config/environment
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
const MP3_UPLOAD_DIR = process.env.MP3_UPLOAD_DIR || path.join(__dirname, '../../uploads/mp3');
const DB_PATH = config.dbPath;

/**
 * @swagger
 * /backup:
 *   get:
 *     summary: Download a complete backup (database + uploads)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ZIP file containing backup
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `harmonie-backup-${timestamp}.zip`;

    logger.info(`Backup requested by user ${req.user!.id}`);

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create archive
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
        logger.error('Backup archive error', { error: err });
        throw new ApiError(500, 'Fout bij maken van backup.');
    });

    // Pipe to response
    archive.pipe(res);

    // Add database file
    if (fs.existsSync(DB_PATH)) {
        archive.file(DB_PATH, { name: 'database/harmonie.db' });
        logger.info('Added database to backup');
    }

    // Add uploaded PDF files
    if (fs.existsSync(UPLOAD_DIR)) {
        const pdfFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.pdf'));
        for (const file of pdfFiles) {
            archive.file(path.join(UPLOAD_DIR, file), { name: `uploads/${file}` });
        }
        logger.info(`Added ${pdfFiles.length} PDF files to backup`);
    }

    // Add uploaded MP3 files
    if (fs.existsSync(MP3_UPLOAD_DIR)) {
        const mp3Files = fs.readdirSync(MP3_UPLOAD_DIR).filter(f => f.endsWith('.mp3'));
        for (const file of mp3Files) {
            archive.file(path.join(MP3_UPLOAD_DIR, file), { name: `uploads/mp3/${file}` });
        }
        logger.info(`Added ${mp3Files.length} MP3 files to backup`);
    }

    // Finalize archive
    await archive.finalize();

    logger.info(`Backup completed: ${filename}`);
}));

/**
 * @swagger
 * /backup/info:
 *   get:
 *     summary: Get backup info (sizes, counts)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Backup information
 */
router.get('/info', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    let dbSize = 0;
    let pdfCount = 0;
    let pdfSize = 0;
    let mp3Count = 0;
    let mp3Size = 0;

    // Database size
    if (fs.existsSync(DB_PATH)) {
        const stats = fs.statSync(DB_PATH);
        dbSize = stats.size;
    }

    // PDF files
    if (fs.existsSync(UPLOAD_DIR)) {
        const pdfFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.pdf'));
        pdfCount = pdfFiles.length;
        for (const file of pdfFiles) {
            const stats = fs.statSync(path.join(UPLOAD_DIR, file));
            pdfSize += stats.size;
        }
    }

    // MP3 files
    if (fs.existsSync(MP3_UPLOAD_DIR)) {
        const mp3Files = fs.readdirSync(MP3_UPLOAD_DIR).filter(f => f.endsWith('.mp3'));
        mp3Count = mp3Files.length;
        for (const file of mp3Files) {
            const stats = fs.statSync(path.join(MP3_UPLOAD_DIR, file));
            mp3Size += stats.size;
        }
    }

    res.json({
        database: {
            size: dbSize,
            sizeFormatted: formatBytes(dbSize),
        },
        pdfFiles: {
            count: pdfCount,
            size: pdfSize,
            sizeFormatted: formatBytes(pdfSize),
        },
        mp3Files: {
            count: mp3Count,
            size: mp3Size,
            sizeFormatted: formatBytes(mp3Size),
        },
        total: {
            size: dbSize + pdfSize + mp3Size,
            sizeFormatted: formatBytes(dbSize + pdfSize + mp3Size),
        },
    });
}));

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
