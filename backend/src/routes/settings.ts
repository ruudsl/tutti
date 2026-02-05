import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import config from '../config';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

// Logo upload configuration
const logoDir = path.join(config.uploadDir, 'logos');
if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, logoDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `logo-${Date.now()}${ext}`);
    },
});

const logoUpload = multer({
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Alleen PNG, JPG, SVG of WebP bestanden zijn toegestaan.'));
        }
    },
});

/**
 * GET /settings - Get association settings (any authenticated user)
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db.prepare(`
        SELECT id, name, display_name, logo_path
        FROM associations
        WHERE id = ?
    `).get(req.user!.associationId) as any;

    if (!association) {
        throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
        name: association.name,
        displayName: association.display_name || association.name,
        logoPath: association.logo_path || null,
        logoUrl: association.logo_path ? `/api/settings/logo/${path.basename(association.logo_path)}` : null,
    });
}));

/**
 * PUT /settings - Update association settings (admin only)
 */
router.put('/', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { displayName } = req.body;

    if (displayName !== undefined && typeof displayName !== 'string') {
        throw new ApiError(400, 'displayName moet een tekst zijn.');
    }

    if (displayName !== undefined && displayName.trim().length > 100) {
        throw new ApiError(400, 'displayName mag maximaal 100 tekens bevatten.');
    }

    db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run(
        displayName?.trim() || null,
        req.user!.associationId
    );

    logger.info(`Association settings updated`, { associationId: req.user!.associationId, updatedBy: req.user!.id });

    res.json({ message: 'Instellingen succesvol bijgewerkt.' });
}));

/**
 * POST /settings/logo - Upload association logo (admin only)
 */
router.post('/logo', authenticateToken, requireRole('admin'), (req: AuthRequest, res: Response) => {
    logoUpload.single('logo')(req, res, async (err: any) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ error: 'Bestand is te groot. Maximaal 2MB.' });
                }
            }
            return res.status(400).json({ error: err.message || 'Upload mislukt.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Geen bestand geüpload.' });
        }

        try {
            // Remove old logo if exists
            const association = db.prepare('SELECT logo_path FROM associations WHERE id = ?').get(req.user!.associationId) as any;
            if (association?.logo_path) {
                const oldPath = path.resolve(association.logo_path);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            // Save new logo path
            const logoPath = req.file.path;
            db.prepare('UPDATE associations SET logo_path = ? WHERE id = ?').run(
                logoPath,
                req.user!.associationId
            );

            logger.info(`Logo uploaded for association`, { associationId: req.user!.associationId, uploadedBy: req.user!.id });

            res.json({
                message: 'Logo succesvol geüpload.',
                logoUrl: `/api/settings/logo/${path.basename(logoPath)}`,
            });
        } catch (error) {
            // Clean up uploaded file on error
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            throw error;
        }
    });
});

/**
 * DELETE /settings/logo - Remove association logo (admin only)
 */
router.delete('/logo', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db.prepare('SELECT logo_path FROM associations WHERE id = ?').get(req.user!.associationId) as any;

    if (association?.logo_path) {
        const filePath = path.resolve(association.logo_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    db.prepare('UPDATE associations SET logo_path = NULL WHERE id = ?').run(req.user!.associationId);

    logger.info(`Logo removed for association`, { associationId: req.user!.associationId, removedBy: req.user!.id });

    res.json({ message: 'Logo succesvol verwijderd.' });
}));

/**
 * GET /settings/logo/:filename - Serve logo file (public, no auth needed for img tags)
 */
router.get('/logo/:filename', asyncHandler(async (req: AuthRequest, res: Response) => {
    const { filename } = req.params;

    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(logoDir, safeFilename);

    if (!fs.existsSync(filePath)) {
        throw new ApiError(404, 'Logo niet gevonden.');
    }

    // Cache logo for 1 hour
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
}));

export default router;
