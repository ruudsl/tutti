import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { sendEmail } from '../utils/email';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';

const sanitizeForLog = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .trim();

const uploadsDir = path.join(process.cwd(), 'uploads', 'email-attachments');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

const router = Router();

const CACHE_PATH = '/api/email-campaigns';
const TEMPLATES_CACHE_PATH = '/api/email-campaigns/templates';

// Validation schemas
const createTemplateSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    subject: z.string().min(1, 'Onderwerp is verplicht.'),
    bodyHtml: z.string().min(1, 'Inhoud is verplicht.'),
    bodyText: z.string().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial();

const createCampaignSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    subject: z.string().min(1, 'Onderwerp is verplicht.'),
    bodyHtml: z.string().min(1, 'Inhoud is verplicht.'),
    bodyText: z.string().optional(),
    templateId: z.string().uuid().optional(),
    targetType: z.enum(['all', 'orchestras', 'roles', 'custom']),
    targetOrchestras: z.array(z.string().uuid()).optional(),
    targetRoles: z.array(z.string()).optional(),
    targetUserIds: z.array(z.string().uuid()).optional(),
    scheduledAt: z.string().datetime().optional(),
});

const updateCampaignSchema = createCampaignSchema.partial();

// =====================================================
// TEMPLATE ROUTES
// =====================================================

router.get('/templates', authenticateToken, requireRole('admin', 'music_committee'), cacheMiddleware({ ttlSeconds: 300 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const templates = db.prepare(`
        SELECT et.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        WHERE et.association_id = ?
        ORDER BY et.is_system DESC, et.name ASC
    `).all(associationId);

    res.json(templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        bodyHtml: t.body_html,
        bodyText: t.body_text,
        isSystem: !!t.is_system,
        createdBy: t.created_by,
        createdByName: t.created_by_name,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
    })));
}));

router.get('/templates/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const template = db.prepare(`
        SELECT et.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        WHERE et.id = ? AND et.association_id = ?
    `).get(req.params.id, associationId) as any;

    if (!template) {
        throw new ApiError(404, 'Template niet gevonden.');
    }

    res.json({
        id: template.id,
        name: template.name,
        subject: template.subject,
        bodyHtml: template.body_html,
        bodyText: template.body_text,
        isSystem: !!template.is_system,
        createdBy: template.created_by,
        createdByName: template.created_by_name,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
    });
}));

router.post('/templates', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(TEMPLATES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createTemplateSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO email_templates (id, association_id, name, subject, body_html, body_text, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.name, data.subject, data.bodyHtml, data.bodyText || null, req.user!.id, now, now);

    res.status(201).json({
        id,
        message: 'Template aangemaakt.',
    });
}));

router.put('/templates/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(TEMPLATES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateTemplateSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const template = db.prepare(
        'SELECT * FROM email_templates WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!template) {
        throw new ApiError(404, 'Template niet gevonden.');
    }

    if (template.is_system) {
        throw new ApiError(400, 'Systeemtemplates kunnen niet worden bewerkt.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
    }
    if (data.subject !== undefined) {
        updates.push('subject = ?');
        params.push(data.subject);
    }
    if (data.bodyHtml !== undefined) {
        updates.push('body_html = ?');
        params.push(data.bodyHtml);
    }
    if (data.bodyText !== undefined) {
        updates.push('body_text = ?');
        params.push(data.bodyText);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.params.id);

        db.prepare(`UPDATE email_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Template bijgewerkt.' });
}));

router.delete('/templates/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(TEMPLATES_CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const template = db.prepare(
        'SELECT * FROM email_templates WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!template) {
        throw new ApiError(404, 'Template niet gevonden.');
    }

    if (template.is_system) {
        throw new ApiError(400, 'Systeemtemplates kunnen niet worden verwijderd.');
    }

    db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);

    res.json({ message: 'Template verwijderd.' });
}));

// =====================================================
// CAMPAIGN ROUTES
// =====================================================

router.get('/', authenticateToken, requireRole('admin', 'music_committee'), cacheMiddleware({ ttlSeconds: 60 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { status } = req.query;

    let query = `
        SELECT ec.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM email_campaigns ec
        LEFT JOIN users u ON ec.created_by = u.id
        WHERE ec.association_id = ?
    `;
    const params: any[] = [associationId];

    if (status) {
        query += ' AND ec.status = ?';
        params.push(status);
    }

    query += ' ORDER BY ec.created_at DESC';

    const campaigns = db.prepare(query).all(...params);

    res.json(campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        status: c.status,
        targetType: c.target_type,
        scheduledAt: c.scheduled_at,
        sentAt: c.sent_at,
        totalRecipients: c.total_recipients,
        deliveredCount: c.delivered_count,
        openedCount: c.opened_count,
        clickedCount: c.clicked_count,
        bouncedCount: c.bounced_count,
        createdBy: c.created_by,
        createdByName: c.created_by_name,
        createdAt: c.created_at,
    })));
}));

router.get('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(`
        SELECT ec.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM email_campaigns ec
        LEFT JOIN users u ON ec.created_by = u.id
        WHERE ec.id = ? AND ec.association_id = ?
    `).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    // Get recipients summary
    const recipients = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM email_campaign_recipients
        WHERE campaign_id = ?
        GROUP BY status
    `).all(req.params.id);

    res.json({
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        bodyHtml: campaign.body_html,
        bodyText: campaign.body_text,
        templateId: campaign.template_id,
        status: campaign.status,
        targetType: campaign.target_type,
        targetOrchestras: campaign.target_orchestras ? JSON.parse(campaign.target_orchestras) : null,
        targetRoles: campaign.target_roles ? JSON.parse(campaign.target_roles) : null,
        targetUserIds: campaign.target_user_ids ? JSON.parse(campaign.target_user_ids) : null,
        scheduledAt: campaign.scheduled_at,
        sentAt: campaign.sent_at,
        totalRecipients: campaign.total_recipients,
        deliveredCount: campaign.delivered_count,
        openedCount: campaign.opened_count,
        clickedCount: campaign.clicked_count,
        bouncedCount: campaign.bounced_count,
        createdBy: campaign.created_by,
        createdByName: campaign.created_by_name,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
        recipientStats: recipients.reduce((acc: any, r: any) => {
            acc[r.status] = r.count;
            return acc;
        }, {}),
    });
}));

router.post('/', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createCampaignSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const campaignId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO email_campaigns (
            id, association_id, name, subject, body_html, body_text, template_id,
            status, target_type, target_orchestras, target_roles, target_user_ids,
            scheduled_at, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        campaignId,
        associationId,
        data.name,
        data.subject,
        data.bodyHtml,
        data.bodyText || null,
        data.templateId || null,
        data.targetType,
        data.targetOrchestras ? JSON.stringify(data.targetOrchestras) : null,
        data.targetRoles ? JSON.stringify(data.targetRoles) : null,
        data.targetUserIds ? JSON.stringify(data.targetUserIds) : null,
        data.scheduledAt || null,
        req.user!.id,
        now,
        now
    );

    logAuditEvent(
        req.user!.id,
        'email_campaign_created',
        'email_campaign',
        campaignId,
        data.name
    );

    logger.info(`Email campaign created: ${data.name}`, { campaignId, createdBy: req.user!.id });

    res.status(201).json({
        id: campaignId,
        message: 'Campagne aangemaakt.',
    });
}));

router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateCampaignSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (campaign.status !== 'draft') {
        throw new ApiError(400, 'Alleen conceptcampagnes kunnen worden bewerkt.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
    }
    if (data.subject !== undefined) {
        updates.push('subject = ?');
        params.push(data.subject);
    }
    if (data.bodyHtml !== undefined) {
        updates.push('body_html = ?');
        params.push(data.bodyHtml);
    }
    if (data.bodyText !== undefined) {
        updates.push('body_text = ?');
        params.push(data.bodyText);
    }
    if (data.targetType !== undefined) {
        updates.push('target_type = ?');
        params.push(data.targetType);
    }
    if (data.targetOrchestras !== undefined) {
        updates.push('target_orchestras = ?');
        params.push(data.targetOrchestras ? JSON.stringify(data.targetOrchestras) : null);
    }
    if (data.targetRoles !== undefined) {
        updates.push('target_roles = ?');
        params.push(data.targetRoles ? JSON.stringify(data.targetRoles) : null);
    }
    if (data.targetUserIds !== undefined) {
        updates.push('target_user_ids = ?');
        params.push(data.targetUserIds ? JSON.stringify(data.targetUserIds) : null);
    }
    if (data.scheduledAt !== undefined) {
        updates.push('scheduled_at = ?');
        params.push(data.scheduledAt);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.params.id);

        db.prepare(`UPDATE email_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Campagne bijgewerkt.' });
}));

router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (campaign.status === 'sending') {
        throw new ApiError(400, 'Campagne wordt momenteel verzonden en kan niet worden verwijderd.');
    }

    db.prepare('DELETE FROM email_campaigns WHERE id = ?').run(req.params.id);

    logAuditEvent(
        req.user!.id,
        'email_campaign_deleted',
        'email_campaign',
        req.params.id,
        campaign.name
    );

    res.json({ message: 'Campagne verwijderd.' });
}));

// Get preview of recipients
router.get('/:id/preview-recipients', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    let recipients: any[] = [];

    if (campaign.target_type === 'all') {
        recipients = db.prepare(`
            SELECT id, email, first_name, last_name
            FROM users
            WHERE association_id = ? AND status = 'active'
            ORDER BY last_name, first_name
        `).all(associationId);
    } else if (campaign.target_type === 'orchestras') {
        const orchestras = campaign.target_orchestras ? JSON.parse(campaign.target_orchestras) : [];
        if (orchestras.length > 0) {
            recipients = db.prepare(`
                SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
                FROM users u
                JOIN user_orchestras uo ON u.id = uo.user_id
                WHERE u.association_id = ? AND u.status = 'active'
                  AND uo.orchestra_id IN (${orchestras.map(() => '?').join(',')})
                ORDER BY u.last_name, u.first_name
            `).all(associationId, ...orchestras);
        }
    } else if (campaign.target_type === 'roles') {
        const roles = campaign.target_roles ? JSON.parse(campaign.target_roles) : [];
        if (roles.length > 0) {
            recipients = db.prepare(`
                SELECT id, email, first_name, last_name
                FROM users
                WHERE association_id = ? AND status = 'active'
                  AND role IN (${roles.map(() => '?').join(',')})
                ORDER BY last_name, first_name
            `).all(associationId, ...roles);
        }
    } else if (campaign.target_type === 'custom') {
        const userIds = campaign.target_user_ids ? JSON.parse(campaign.target_user_ids) : [];
        if (userIds.length > 0) {
            recipients = db.prepare(`
                SELECT id, email, first_name, last_name
                FROM users
                WHERE association_id = ? AND status = 'active'
                  AND id IN (${userIds.map(() => '?').join(',')})
                ORDER BY last_name, first_name
            `).all(associationId, ...userIds);
        }
    }

    res.json({
        count: recipients.length,
        recipients: recipients.map((r: any) => ({
            id: r.id,
            email: r.email,
            name: `${r.first_name} ${r.last_name}`,
        })),
    });
}));

// Schedule campaign for sending
router.post('/:id/schedule', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { scheduledAt } = req.body;
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (campaign.status !== 'draft') {
        throw new ApiError(400, 'Alleen conceptcampagnes kunnen worden ingepland.');
    }

    db.prepare(`
        UPDATE email_campaigns
        SET status = 'scheduled', scheduled_at = ?, updated_at = ?
        WHERE id = ?
    `).run(scheduledAt || new Date().toISOString(), new Date().toISOString(), req.params.id);

    logAuditEvent(
        req.user!.id,
        'email_campaign_scheduled',
        'email_campaign',
        req.params.id,
        campaign.name
    );

    res.json({ message: 'Campagne ingepland.' });
}));

// Cancel scheduled campaign
router.post('/:id/cancel', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (campaign.status !== 'scheduled') {
        throw new ApiError(400, 'Alleen ingeplande campagnes kunnen worden geannuleerd.');
    }

    db.prepare(`
        UPDATE email_campaigns
        SET status = 'cancelled', updated_at = ?
        WHERE id = ?
    `).run(new Date().toISOString(), req.params.id);

    res.json({ message: 'Campagne geannuleerd.' });
}));

// Send campaign immediately
router.post('/:id/send', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (!['draft', 'scheduled'].includes(campaign.status)) {
        throw new ApiError(400, 'Deze campagne kan niet worden verzonden.');
    }

    // Start sending process
    await sendCampaign(campaign.id, associationId);

    res.json({ message: 'Campagne wordt verzonden.' });
}));

// Send test email
router.post('/:id/test', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email } = req.body;
    const associationId = req.user!.associationId;

    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    if (!email) {
        throw new ApiError(400, 'E-mailadres is verplicht.');
    }

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    const html = personalizeEmail(campaign.body_html, {
        firstName: 'Test',
        lastName: 'Gebruiker',
        email: email,
    });

    const text = personalizeEmail(campaign.body_text || sanitizeHtml(campaign.body_html, { allowedTags: [], allowedAttributes: {} }), {
        firstName: 'Test',
        lastName: 'Gebruiker',
        email: email,
    });

    // Get attachments for test email
    const attachments = getCampaignAttachments(req.params.id);

    const success = await sendEmail({
        to: sanitizeForLog(email),
        subject: `[TEST] ${campaign.subject}`,
        text,
        html,
        associationId,
        attachments,
    });

    if (success) {
        res.json({ message: 'Test-e-mail verzonden.' });
    } else {
        throw new ApiError(500, 'Test-e-mail kon niet worden verzonden.');
    }
}));

// Helper: Personalize email content
function personalizeEmail(content: string, recipient: { firstName: string; lastName: string; email: string }): string {
    return content
        .replace(/\{\{firstName\}\}/g, recipient.firstName)
        .replace(/\{\{lastName\}\}/g, recipient.lastName)
        .replace(/\{\{email\}\}/g, recipient.email)
        .replace(/\{\{fullName\}\}/g, `${recipient.firstName} ${recipient.lastName}`);
}

// Helper: Get recipients for a campaign
function getCampaignRecipients(campaign: any, associationId: string): { id: string; email: string; firstName: string; lastName: string }[] {
    let query = `
        SELECT DISTINCT u.id, u.email, u.first_name AS firstName, u.last_name AS lastName
        FROM users u
        WHERE u.association_id = ?
        AND u.is_active = 1
        AND u.email IS NOT NULL
        AND u.email != ''
    `;
    const params: any[] = [associationId];

    if (campaign.target_type === 'orchestras' && campaign.target_orchestras) {
        const orchestraIds = JSON.parse(campaign.target_orchestras);
        if (orchestraIds.length > 0) {
            const placeholders = orchestraIds.map(() => '?').join(', ');
            query += ` AND EXISTS (
                SELECT 1 FROM user_orchestras uo WHERE uo.user_id = u.id AND uo.orchestra_id IN (${placeholders})
            )`;
            params.push(...orchestraIds);
        }
    } else if (campaign.target_type === 'roles' && campaign.target_roles) {
        const roles = JSON.parse(campaign.target_roles);
        if (roles.length > 0) {
            const placeholders = roles.map(() => '?').join(', ');
            query += ` AND u.role IN (${placeholders})`;
            params.push(...roles);
        }
    } else if (campaign.target_type === 'custom' && campaign.target_user_ids) {
        const userIds = JSON.parse(campaign.target_user_ids);
        if (userIds.length > 0) {
            const placeholders = userIds.map(() => '?').join(', ');
            query += ` AND u.id IN (${placeholders})`;
            params.push(...userIds);
        }
    }

    return db.prepare(query).all(...params) as any[];
}

// Helper: Get attachments for sending
function getCampaignAttachments(campaignId: string): { filename: string; path: string; contentType: string }[] {
    const attachments = db.prepare(
        'SELECT filename, original_filename, mime_type FROM email_campaign_attachments WHERE campaign_id = ?'
    ).all(campaignId) as any[];

    return attachments.map((a: any) => ({
        filename: a.original_filename,
        path: path.join(uploadsDir, a.filename),
        contentType: a.mime_type,
    }));
}

// Helper: Send campaign emails
async function sendCampaign(campaignId: string, associationId: string): Promise<void> {
    const campaign = db.prepare('SELECT * FROM email_campaigns WHERE id = ?').get(campaignId) as any;

    if (!campaign) {
        logger.error(`Campaign ${campaignId} not found`);
        return;
    }

    // Mark as sending
    db.prepare(`
        UPDATE email_campaigns
        SET status = 'sending', sent_at = ?, updated_at = ?
        WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), campaignId);

    const recipients = getCampaignRecipients(campaign, associationId);
    const totalRecipients = recipients.length;

    // Get attachments for this campaign
    const attachments = getCampaignAttachments(campaignId);

    // Update total count
    db.prepare('UPDATE email_campaigns SET total_recipients = ? WHERE id = ?').run(totalRecipients, campaignId);

    let deliveredCount = 0;
    let bouncedCount = 0;

    // Create recipient records and send emails
    for (const recipient of recipients) {
        const recipientId = uuidv4();

        // Create recipient record
        db.prepare(`
            INSERT INTO email_campaign_recipients (id, campaign_id, user_id, email, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?)
        `).run(recipientId, campaignId, recipient.id, recipient.email, new Date().toISOString());

        try {
            const html = personalizeEmail(campaign.body_html, recipient);
            const text = personalizeEmail(
                campaign.body_text ||
                    sanitizeHtml(campaign.body_html, { allowedTags: [], allowedAttributes: {} }),
                recipient
            );

            const success = await sendEmail({
                to: recipient.email,
                subject: campaign.subject,
                text,
                html,
                associationId,
                attachments,
            });

            if (success) {
                deliveredCount++;
                db.prepare(`
                    UPDATE email_campaign_recipients
                    SET status = 'sent', sent_at = ?
                    WHERE id = ?
                `).run(new Date().toISOString(), recipientId);
            } else {
                bouncedCount++;
                db.prepare(`
                    UPDATE email_campaign_recipients
                    SET status = 'failed'
                    WHERE id = ?
                `).run(recipientId);
            }
        } catch (error) {
            bouncedCount++;
            db.prepare(`
                UPDATE email_campaign_recipients
                SET status = 'failed'
                WHERE id = ?
            `).run(recipientId);
            logger.error(`Failed to send email to ${recipient.email}:`, error);
        }

        // Update counts periodically
        if ((deliveredCount + bouncedCount) % 10 === 0) {
            db.prepare(`
                UPDATE email_campaigns
                SET delivered_count = ?, bounced_count = ?, updated_at = ?
                WHERE id = ?
            `).run(deliveredCount, bouncedCount, new Date().toISOString(), campaignId);
        }
    }

    // Mark as completed
    db.prepare(`
        UPDATE email_campaigns
        SET status = 'sent', delivered_count = ?, bounced_count = ?, updated_at = ?
        WHERE id = ?
    `).run(deliveredCount, bouncedCount, new Date().toISOString(), campaignId);

    logger.info(`Campaign ${campaignId} sent: ${deliveredCount} delivered, ${bouncedCount} bounced`);

    logAuditEvent(
        campaign.created_by,
        'email_campaign_sent',
        'email_campaign',
        campaignId,
        campaign.name
    );
}

// =====================================================
// ATTACHMENT ROUTES
// =====================================================

// Get attachments for a campaign
router.get('/:id/attachments', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId);

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    const attachments = db.prepare(`
        SELECT a.*, u.first_name || ' ' || u.last_name AS uploaded_by_name
        FROM email_campaign_attachments a
        LEFT JOIN users u ON a.uploaded_by = u.id
        WHERE a.campaign_id = ?
        ORDER BY a.uploaded_at DESC
    `).all(req.params.id);

    res.json(attachments.map((a: any) => ({
        id: a.id,
        filename: a.filename,
        originalFilename: a.original_filename,
        mimeType: a.mime_type,
        fileSize: a.file_size,
        uploadedBy: a.uploaded_by,
        uploadedByName: a.uploaded_by_name,
        uploadedAt: a.uploaded_at,
    })));
}));

// Upload attachment
router.post('/:id/attachments', authenticateToken, requireRole('admin', 'music_committee'), upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (campaign.status !== 'draft') {
        throw new ApiError(400, 'Bijlagen kunnen alleen worden toegevoegd aan conceptcampagnes.');
    }

    if (!req.file) {
        throw new ApiError(400, 'Geen bestand geüpload.');
    }

    const attachmentId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO email_campaign_attachments (id, campaign_id, filename, original_filename, mime_type, file_size, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        attachmentId,
        req.params.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.user!.id,
        now
    );

    res.status(201).json({
        id: attachmentId,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        message: 'Bijlage geüpload.',
    });
}));

// Delete attachment
router.delete('/:id/attachments/:attachmentId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const campaign = db.prepare(
        'SELECT * FROM email_campaigns WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!campaign) {
        throw new ApiError(404, 'Campagne niet gevonden.');
    }

    if (campaign.status !== 'draft') {
        throw new ApiError(400, 'Bijlagen kunnen alleen worden verwijderd van conceptcampagnes.');
    }

    const attachment = db.prepare(
        'SELECT * FROM email_campaign_attachments WHERE id = ? AND campaign_id = ?'
    ).get(req.params.attachmentId, req.params.id) as any;

    if (!attachment) {
        throw new ApiError(404, 'Bijlage niet gevonden.');
    }

    // Delete file from disk
    const filePath = path.join(uploadsDir, attachment.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    // Delete from database
    db.prepare('DELETE FROM email_campaign_attachments WHERE id = ?').run(req.params.attachmentId);

    res.json({ message: 'Bijlage verwijderd.' });
}));

// Process scheduled campaigns (call this from a cron job or background worker)
export async function processScheduledCampaigns(): Promise<void> {
    const now = new Date().toISOString();

    const campaigns = db.prepare(`
        SELECT ec.*, a.id AS association_id
        FROM email_campaigns ec
        JOIN associations a ON ec.association_id = a.id
        WHERE ec.status = 'scheduled'
        AND ec.scheduled_at <= ?
    `).all(now) as any[];

    for (const campaign of campaigns) {
        logger.info(`Processing scheduled campaign: ${campaign.name}`);
        await sendCampaign(campaign.id, campaign.association_id);
    }
}

export default router;
