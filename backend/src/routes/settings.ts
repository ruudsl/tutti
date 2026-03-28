import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import nodemailer from 'nodemailer';
import db from '../database/connection';
import config from '../config';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { ipWhitelistMiddleware } from '../middleware/ipWhitelist';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

const router = Router();

// Logo upload configuration - use absolute path for res.sendFile compatibility
const logoDir = path.resolve(config.uploadDir, 'logos');
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
        SELECT id, name, display_name, logo_path, theme_json
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
        theme: association.theme_json ? JSON.parse(association.theme_json) : null,
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

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'update',
        'settings',
        req.user!.associationId || '',
        'Instellingen',
        { displayName: displayName?.trim() },
        req.ip,
        req.get('user-agent')
    );

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

            // Log audit event
            logAuditEvent(
                req.user!.id,
                'upload',
                'settings',
                req.user!.associationId || '',
                'Logo',
                { filename: path.basename(logoPath) },
                req.ip,
                req.get('user-agent')
            );

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

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'delete',
        'settings',
        req.user!.associationId || '',
        'Logo',
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Logo succesvol verwijderd.' });
}));

// Allowed theme keys for validation
const ALLOWED_THEME_KEYS = [
    'primaryColor', 'primaryDarkColor', 'secondaryColor', 'successColor', 'dangerColor', 'warningColor',
    'backgroundColor', 'surfaceColor', 'textColor', 'textLightColor', 'borderColor',
    'fontFamily', 'fontSizeBase', 'borderRadius',
];

const FONT_FAMILIES: Record<string, string> = {
    system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
    inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    roboto: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
    georgia: "Georgia, 'Times New Roman', serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
};

/**
 * GET /settings/theme - Get theme (public, needed before auth for login page styling)
 */
router.get('/theme', asyncHandler(async (_req: AuthRequest, res: Response) => {
    // Get first association's theme (for login page before we know which user)
    const association = db.prepare(`
        SELECT theme_json FROM associations LIMIT 1
    `).get() as any;

    res.json({
        theme: association?.theme_json ? JSON.parse(association.theme_json) : null,
        fontFamilies: FONT_FAMILIES,
    });
}));

/**
 * GET /settings/branding - Get public branding (logo + name, no auth needed for login page)
 */
router.get('/branding', asyncHandler(async (_req: AuthRequest, res: Response) => {
    const association = db.prepare(`
        SELECT name, display_name, logo_path FROM associations LIMIT 1
    `).get() as any;

    res.json({
        displayName: association?.display_name || association?.name || 'Harmonie',
        logoUrl: association?.logo_path ? `/api/settings/logo/${path.basename(association.logo_path)}` : null,
    });
}));

/**
 * PUT /settings/theme - Update theme (admin only)
 */
router.put('/theme', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { theme } = req.body;

    if (theme !== null && typeof theme !== 'object') {
        throw new ApiError(400, 'Ongeldig thema formaat.');
    }

    if (theme !== null) {
        // Validate that only allowed keys are present
        const keys = Object.keys(theme);
        const invalidKeys = keys.filter(k => !ALLOWED_THEME_KEYS.includes(k));
        if (invalidKeys.length > 0) {
            throw new ApiError(400, `Ongeldige thema-instellingen: ${invalidKeys.join(', ')}`);
        }

        // Validate color values (must be valid hex colors)
        const colorKeys = keys.filter(k => k.endsWith('Color'));
        for (const key of colorKeys) {
            if (theme[key] && !/^#[0-9a-fA-F]{6}$/.test(theme[key])) {
                throw new ApiError(400, `Ongeldige kleurwaarde voor ${key}. Gebruik hex formaat (bijv. #2563eb).`);
            }
        }

        // Validate fontFamily
        if (theme.fontFamily && !Object.keys(FONT_FAMILIES).includes(theme.fontFamily)) {
            throw new ApiError(400, 'Ongeldig lettertype.');
        }

        // Validate fontSizeBase (12-24px)
        if (theme.fontSizeBase !== undefined) {
            const size = Number(theme.fontSizeBase);
            if (isNaN(size) || size < 12 || size > 24) {
                throw new ApiError(400, 'Lettergrootte moet tussen 12 en 24 zijn.');
            }
        }

        // Validate borderRadius (0-2rem)
        if (theme.borderRadius !== undefined) {
            const radius = Number(theme.borderRadius);
            if (isNaN(radius) || radius < 0 || radius > 2) {
                throw new ApiError(400, 'Hoekafronding moet tussen 0 en 2 zijn.');
            }
        }
    }

    const themeJson = theme ? JSON.stringify(theme) : null;
    db.prepare('UPDATE associations SET theme_json = ? WHERE id = ?').run(
        themeJson,
        req.user!.associationId
    );

    logger.info(`Theme updated`, { associationId: req.user!.associationId, updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'update',
        'settings',
        req.user!.associationId || '',
        'Thema',
        theme ? { keys: Object.keys(theme) } : { reset: true },
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'Thema succesvol bijgewerkt.' });
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

/**
 * GET /settings/smtp - Get SMTP configuration (admin only)
 */
router.get('/smtp', authenticateToken, requireRole('admin'), ipWhitelistMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db.prepare(`
        SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_from, smtp_enabled
        FROM associations WHERE id = ?
    `).get(req.user!.associationId) as any;

    if (!association) {
        throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    res.json({
        host: association.smtp_host || '',
        port: association.smtp_port || 587,
        secure: !!association.smtp_secure,
        user: association.smtp_user || '',
        from: association.smtp_from || '',
        enabled: !!association.smtp_enabled,
        configured: !!association.smtp_host,
    });
}));

/**
 * PUT /settings/smtp - Save SMTP configuration (admin only)
 */
router.put('/smtp', authenticateToken, requireRole('admin'), ipWhitelistMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { host, port, secure, user, password, from, enabled } = req.body;

    if (!host || typeof host !== 'string' || !host.trim()) {
        throw new ApiError(400, 'SMTP host is verplicht.');
    }

    const portNum = Number(port) || 587;
    if (portNum < 1 || portNum > 65535) {
        throw new ApiError(400, 'Poort moet tussen 1 en 65535 liggen.');
    }

    // Check if there's an existing password stored
    const existing = db.prepare('SELECT smtp_pass FROM associations WHERE id = ?').get(req.user!.associationId) as any;

    // Only update password if a new one is provided
    const smtpPass = password?.trim() || existing?.smtp_pass || null;

    db.prepare(`
        UPDATE associations
        SET smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?, smtp_pass = ?, smtp_from = ?, smtp_enabled = ?
        WHERE id = ?
    `).run(
        host.trim(),
        portNum,
        secure ? 1 : 0,
        user?.trim() || null,
        smtpPass,
        from?.trim() || null,
        enabled ? 1 : 0,
        req.user!.associationId
    );

    logger.info('SMTP config updated', { associationId: req.user!.associationId, updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'update',
        'settings',
        req.user!.associationId || '',
        'SMTP configuratie',
        { host: host.trim(), port: portNum, enabled: !!enabled },
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'SMTP-instellingen opgeslagen.' });
}));

/**
 * DELETE /settings/smtp - Remove SMTP configuration (admin only)
 */
router.delete('/smtp', authenticateToken, requireRole('admin'), ipWhitelistMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(`
        UPDATE associations
        SET smtp_host = NULL, smtp_port = 587, smtp_secure = 0, smtp_user = NULL, smtp_pass = NULL, smtp_from = NULL, smtp_enabled = 0
        WHERE id = ?
    `).run(req.user!.associationId);

    logger.info('SMTP config removed', { associationId: req.user!.associationId, removedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
        req.user!.id,
        'delete',
        'settings',
        req.user!.associationId || '',
        'SMTP configuratie',
        undefined,
        req.ip,
        req.get('user-agent')
    );

    res.json({ message: 'SMTP-instellingen verwijderd.' });
}));

/**
 * POST /settings/smtp/test - Send a test email (admin only)
 */
router.post('/smtp/test', authenticateToken, requireRole('admin'), ipWhitelistMiddleware, asyncHandler(async (req: AuthRequest, res: Response) => {
    const association = db.prepare(`
        SELECT smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from
        FROM associations WHERE id = ?
    `).get(req.user!.associationId) as any;

    if (!association?.smtp_host) {
        throw new ApiError(400, 'SMTP is niet geconfigureerd. Sla eerst de instellingen op.');
    }

    const testTransporter = nodemailer.createTransport({
        host: association.smtp_host,
        port: association.smtp_port || 587,
        secure: !!association.smtp_secure,
        auth: association.smtp_user ? {
            user: association.smtp_user,
            pass: association.smtp_pass || '',
        } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
    });

    try {
        await testTransporter.verify();

        // Send test email to the admin's own email
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user!.id) as any;
        const fromAddress = association.smtp_from || `"Harmonie App" <${association.smtp_user}>`;

        await testTransporter.sendMail({
            from: fromAddress,
            to: user.email,
            subject: 'Harmonie App - SMTP Test',
            text: 'Dit is een testbericht. Als je dit ontvangt, werkt de SMTP-configuratie correct!',
            html: '<p>Dit is een <strong>testbericht</strong>.</p><p>Als je dit ontvangt, werkt de SMTP-configuratie correct!</p>',
        });

        logger.info('SMTP test email sent', { associationId: req.user!.associationId, to: user.email });

        res.json({ message: `Testmail verzonden naar ${user.email}.` });
    } catch (error: any) {
        logger.error('SMTP test failed', { error: error.message, associationId: req.user!.associationId });
        throw new ApiError(400, `SMTP-test mislukt: ${error.message}`);
    }
}));

export default router;
