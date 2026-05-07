import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { z } from 'zod';

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

export default router;
