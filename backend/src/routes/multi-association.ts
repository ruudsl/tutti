import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest, generateToken } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createAssociationSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    displayName: z.string().optional(),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug mag alleen kleine letters, cijfers en streepjes bevatten').optional(),
    website: z.string().url().optional().or(z.literal('')),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    billingEmail: z.string().email().optional().or(z.literal('')),
    kvkNumber: z.string().optional(),
    iban: z.string().optional(),
    parentId: z.string().uuid().optional().nullable(),
});

const inviteUserSchema = z.object({
    email: z.string().email('Ongeldig e-mailadres'),
    role: z.enum(['member', 'board', 'admin']).default('member'),
});

const partnershipRequestSchema = z.object({
    targetAssociationId: z.string().uuid(),
    shareMusic: z.boolean().optional(),
    shareEvents: z.boolean().optional(),
    shareMembers: z.boolean().optional(),
    notes: z.string().optional(),
});

// ===========================================
// SUPER ADMIN CHECK MIDDLEWARE
// ===========================================

async function requireSuperAdmin(req: AuthRequest, res: Response, next: Function) {
    const superAdmin = db.prepare(
        'SELECT id FROM super_admins WHERE user_id = ?'
    ).get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    next();
}

// ===========================================
// SUPER ADMIN ROUTES
// ===========================================

router.get('/super-admin/associations', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const associations = db.prepare(`
        SELECT a.*,
               (SELECT COUNT(*) FROM users WHERE association_id = a.id) as member_count,
               (SELECT COUNT(*) FROM orchestras WHERE association_id = a.id) as orchestra_count,
               pa.name as parent_name
        FROM associations a
        LEFT JOIN associations pa ON a.parent_id = pa.id
        ORDER BY a.name
    `).all();

    res.json((associations as any[]).map(mapAssociation));
}));

router.post('/super-admin/associations', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const data = createAssociationSchema.parse(req.body);

    const existing = db.prepare(
        'SELECT id FROM associations WHERE LOWER(name) = LOWER(?)'
    ).get(data.name.trim());

    if (existing) {
        throw new ApiError(409, 'Vereniging met deze naam bestaat al.');
    }

    if (data.slug) {
        const slugExists = db.prepare('SELECT id FROM associations WHERE slug = ?').get(data.slug);
        if (slugExists) {
            throw new ApiError(409, 'Slug is al in gebruik.');
        }
    }

    const id = uuidv4();
    const slug = data.slug || generateSlug(data.name);

    db.prepare(`
        INSERT INTO associations (
            id, name, display_name, slug, website, phone, email,
            address, city, postal_code, country, billing_email,
            kvk_number, iban, parent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        data.name.trim(),
        data.displayName ?? null,
        slug,
        data.website || null,
        data.phone ?? null,
        data.email || null,
        data.address ?? null,
        data.city ?? null,
        data.postalCode ?? null,
        data.country ?? 'Nederland',
        data.billingEmail || null,
        data.kvkNumber ?? null,
        data.iban ?? null,
        data.parentId ?? null
    );

    logActivity(id, req.user!.id, 'association_created', 'association', id, { name: data.name });

    logger.info(`Association created by super admin: ${data.name}`, { id, createdBy: req.user!.id });

    res.status(201).json({ id, slug, message: 'Vereniging aangemaakt.' });
}));

router.put('/super-admin/associations/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const data = createAssociationSchema.partial().parse(req.body);

    const existing = db.prepare('SELECT id FROM associations WHERE id = ?').get(req.params.id);

    if (!existing) {
        throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    if (data.slug) {
        const slugExists = db.prepare('SELECT id FROM associations WHERE slug = ? AND id != ?').get(data.slug, req.params.id);
        if (slugExists) {
            throw new ApiError(409, 'Slug is al in gebruik.');
        }
    }

    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
        name: 'name', displayName: 'display_name', slug: 'slug',
        website: 'website', phone: 'phone', email: 'email',
        address: 'address', city: 'city', postalCode: 'postal_code',
        country: 'country', billingEmail: 'billing_email',
        kvkNumber: 'kvk_number', iban: 'iban', parentId: 'parent_id'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
        if (key in data) {
            updates.push(`${dbField} = ?`);
            values.push((data as any)[key] ?? null);
        }
    }

    if (updates.length > 0) {
        values.push(req.params.id);
        db.prepare(`UPDATE associations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    logger.info(`Association updated by super admin: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Vereniging bijgewerkt.' });
}));

router.put('/super-admin/associations/:id/subscription', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const { subscriptionTier, subscriptionExpires, maxMembers, maxOrchestras, maxStorageMb, isActive } = req.body;

    db.prepare(`
        UPDATE associations SET
            subscription_tier = COALESCE(?, subscription_tier),
            subscription_expires = COALESCE(?, subscription_expires),
            max_members = COALESCE(?, max_members),
            max_orchestras = COALESCE(?, max_orchestras),
            max_storage_mb = COALESCE(?, max_storage_mb),
            is_active = COALESCE(?, is_active)
        WHERE id = ?
    `).run(
        subscriptionTier ?? null,
        subscriptionExpires ?? null,
        maxMembers ?? null,
        maxOrchestras ?? null,
        maxStorageMb ?? null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        req.params.id
    );

    logActivity(req.params.id, req.user!.id, 'subscription_updated', 'association', req.params.id, { subscriptionTier });

    res.json({ message: 'Abonnement bijgewerkt.' });
}));

router.delete('/super-admin/associations/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const memberCount = db.prepare(
        'SELECT COUNT(*) as count FROM users WHERE association_id = ?'
    ).get(req.params.id) as { count: number };

    if (memberCount.count > 0) {
        throw new ApiError(400, `Kan vereniging niet verwijderen: er zijn nog ${memberCount.count} leden gekoppeld.`);
    }

    db.prepare('DELETE FROM associations WHERE id = ?').run(req.params.id);

    logger.info(`Association deleted by super admin: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Vereniging verwijderd.' });
}));

router.get('/super-admin/super-admins', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const admins = db.prepare(`
        SELECT sa.*, u.email, u.first_name, u.last_name
        FROM super_admins sa
        JOIN users u ON sa.user_id = u.id
        ORDER BY sa.created_at
    `).all();

    res.json((admins as any[]).map(a => ({
        id: a.id,
        userId: a.user_id,
        email: a.email,
        name: `${a.first_name} ${a.last_name}`,
        permissions: JSON.parse(a.permissions || '["all"]'),
        createdAt: a.created_at,
    })));
}));

router.post('/super-admin/super-admins', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const { userId, permissions } = req.body;

    if (!userId) {
        throw new ApiError(400, 'User ID is verplicht.');
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
        throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const existing = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(userId);
    if (existing) {
        throw new ApiError(409, 'Gebruiker is al super admin.');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO super_admins (id, user_id, permissions) VALUES (?, ?, ?)
    `).run(id, userId, JSON.stringify(permissions || ['all']));

    logger.info(`Super admin added: ${userId}`, { addedBy: req.user!.id });

    res.status(201).json({ id, message: 'Super admin toegevoegd.' });
}));

router.delete('/super-admin/super-admins/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        throw new ApiError(403, 'Super admin rechten vereist.');
    }

    const count = db.prepare('SELECT COUNT(*) as count FROM super_admins').get() as { count: number };

    if (count.count <= 1) {
        throw new ApiError(400, 'Er moet minimaal één super admin blijven.');
    }

    db.prepare('DELETE FROM super_admins WHERE id = ?').run(req.params.id);

    res.json({ message: 'Super admin verwijderd.' });
}));

// ===========================================
// USER MULTI-ASSOCIATION ROUTES
// ===========================================

router.get('/am-i-super-admin', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);
    res.json({ isSuperAdmin: !!superAdmin });
}));

router.get('/my-associations', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Check if user is a super admin
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    let associations: any[];

    if (superAdmin) {
        // Super admins see all associations
        associations = db.prepare(`
            SELECT a.*, 'super_admin' as my_role,
                   CASE WHEN a.id = ? THEN 1 ELSE 0 END as is_primary
            FROM associations a
            ORDER BY a.name
        `).all(req.user!.associationId);
    } else {
        // Regular users see only their memberships
        associations = db.prepare(`
            SELECT a.*, ua.role as my_role, ua.is_primary, ua.joined_at
            FROM associations a
            JOIN user_associations ua ON a.id = ua.association_id
            WHERE ua.user_id = ? AND ua.status = 'active'
            ORDER BY ua.is_primary DESC, a.name
        `).all(req.user!.id);

        // Include current association if not already in the list
        const currentAssoc = db.prepare(`
            SELECT a.*, 'admin' as my_role, 1 as is_primary
            FROM associations a
            WHERE a.id = ?
        `).get(req.user!.associationId) as any;

        const assocIds = new Set((associations as any[]).map(a => a.id));
        if (currentAssoc && !assocIds.has(currentAssoc.id)) {
            associations.unshift(currentAssoc);
        }
    }

    res.json((associations as any[]).map(a => ({
        id: a.id,
        name: a.name,
        displayName: a.display_name,
        slug: a.slug,
        myRole: a.my_role,
        isPrimary: !!a.is_primary,
        joinedAt: a.joined_at,
    })));
}));

router.post('/switch-association', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { associationId } = req.body;

    if (!associationId) {
        throw new ApiError(400, 'Association ID is verplicht.');
    }

    // Check if association exists
    const association = db.prepare('SELECT id FROM associations WHERE id = ?').get(associationId);
    if (!association) {
        throw new ApiError(404, 'Vereniging niet gevonden.');
    }

    // Check if user is a super admin (can switch to any association)
    const superAdmin = db.prepare('SELECT id FROM super_admins WHERE user_id = ?').get(req.user!.id);

    if (!superAdmin) {
        // Regular user: check membership or current association
        const membership = db.prepare(`
            SELECT * FROM user_associations
            WHERE user_id = ? AND association_id = ? AND status = 'active'
        `).get(req.user!.id, associationId);

        const isCurrentAssoc = req.user!.associationId === associationId;

        if (!membership && !isCurrentAssoc) {
            throw new ApiError(403, 'Je bent geen lid van deze vereniging.');
        }
    }

    // Update user's current association
    db.prepare('UPDATE users SET association_id = ? WHERE id = ?').run(associationId, req.user!.id);

    // Get updated user data for new token
    const updatedUser = db.prepare(`
        SELECT id, email, role, association_id
        FROM users WHERE id = ?
    `).get(req.user!.id) as { id: string; email: string; role: string; association_id: string | null };

    // Generate new token with updated association
    const token = generateToken(updatedUser);

    // Get association name for the response
    const assocInfo = db.prepare('SELECT name, display_name FROM associations WHERE id = ?')
        .get(associationId) as { name: string; display_name: string | null } | undefined;

    res.json({
        message: 'Vereniging gewisseld.',
        associationId,
        associationName: assocInfo?.display_name || assocInfo?.name,
        token,
    });
}));

// ===========================================
// INVITATION ROUTES
// ===========================================

router.get('/invitations', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const invitations = db.prepare(`
        SELECT ai.*, u.first_name, u.last_name as invited_by_name
        FROM association_invitations ai
        JOIN users u ON ai.invited_by = u.id
        WHERE ai.association_id = ?
        ORDER BY ai.created_at DESC
    `).all(req.user!.associationId);

    res.json((invitations as any[]).map(i => ({
        id: i.id,
        email: i.email,
        role: i.role,
        invitedBy: `${i.first_name} ${i.invited_by_name}`,
        expiresAt: i.expires_at,
        acceptedAt: i.accepted_at,
        createdAt: i.created_at,
        status: i.accepted_at ? 'accepted' : new Date(i.expires_at) < new Date() ? 'expired' : 'pending',
    })));
}));

router.post('/invitations', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = inviteUserSchema.parse(req.body);

    const existingUser = db.prepare(`
        SELECT u.id FROM users u
        JOIN user_associations ua ON u.id = ua.user_id
        WHERE u.email = ? AND ua.association_id = ?
    `).get(data.email, req.user!.associationId);

    if (existingUser) {
        throw new ApiError(409, 'Gebruiker is al lid van deze vereniging.');
    }

    const existingInvite = db.prepare(`
        SELECT id FROM association_invitations
        WHERE email = ? AND association_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')
    `).get(data.email, req.user!.associationId);

    if (existingInvite) {
        throw new ApiError(409, 'Er staat al een uitnodiging open voor dit e-mailadres.');
    }

    const id = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO association_invitations (id, association_id, email, role, invited_by, token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user!.associationId, data.email, data.role, req.user!.id, token, expiresAt);

    logActivity(req.user!.associationId, req.user!.id, 'invitation_sent', 'invitation', id, { email: data.email, role: data.role });

    logger.info(`Invitation sent to ${data.email}`, { associationId: req.user!.associationId, invitedBy: req.user!.id });

    res.status(201).json({
        id,
        inviteUrl: `/invite/${token}`,
        message: 'Uitnodiging verstuurd.',
    });
}));

router.delete('/invitations/:id', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM association_invitations WHERE id = ? AND association_id = ?
    `).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Uitnodiging niet gevonden.');
    }

    res.json({ message: 'Uitnodiging verwijderd.' });
}));

router.get('/invitations/accept/:token', asyncHandler(async (req: AuthRequest, res: Response) => {
    const invitation = db.prepare(`
        SELECT ai.*, a.name as association_name
        FROM association_invitations ai
        JOIN associations a ON ai.association_id = a.id
        WHERE ai.token = ? AND ai.accepted_at IS NULL
    `).get(req.params.token) as any;

    if (!invitation) {
        throw new ApiError(404, 'Uitnodiging niet gevonden of al gebruikt.');
    }

    if (new Date(invitation.expires_at) < new Date()) {
        throw new ApiError(400, 'Uitnodiging is verlopen.');
    }

    res.json({
        email: invitation.email,
        associationName: invitation.association_name,
        role: invitation.role,
        expiresAt: invitation.expires_at,
    });
}));

router.post('/invitations/accept/:token', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const invitation = db.prepare(`
        SELECT * FROM association_invitations
        WHERE token = ? AND accepted_at IS NULL
    `).get(req.params.token) as any;

    if (!invitation) {
        throw new ApiError(404, 'Uitnodiging niet gevonden of al gebruikt.');
    }

    if (new Date(invitation.expires_at) < new Date()) {
        throw new ApiError(400, 'Uitnodiging is verlopen.');
    }

    if (invitation.email.toLowerCase() !== req.user!.email?.toLowerCase()) {
        throw new ApiError(403, 'Deze uitnodiging is voor een ander e-mailadres.');
    }

    withTransaction(() => {
        db.prepare(`
            INSERT INTO user_associations (user_id, association_id, role, invited_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, association_id) DO UPDATE SET
                role = excluded.role,
                status = 'active'
        `).run(req.user!.id, invitation.association_id, invitation.role, invitation.invited_by);

        db.prepare(`
            UPDATE association_invitations SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(invitation.id);
    });

    logActivity(invitation.association_id, req.user!.id, 'invitation_accepted', 'user', req.user!.id, { role: invitation.role });

    res.json({ message: 'Uitnodiging geaccepteerd. Je bent nu lid van de vereniging.' });
}));

// ===========================================
// PARTNERSHIP ROUTES
// ===========================================

router.get('/partnerships', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const partnerships = db.prepare(`
        SELECT ap.*,
               aa.name as association_a_name,
               ab.name as association_b_name,
               ur.first_name || ' ' || ur.last_name as requested_by_name,
               ua.first_name || ' ' || ua.last_name as approved_by_name
        FROM association_partnerships ap
        JOIN associations aa ON ap.association_a_id = aa.id
        JOIN associations ab ON ap.association_b_id = ab.id
        JOIN users ur ON ap.requested_by = ur.id
        LEFT JOIN users ua ON ap.approved_by = ua.id
        WHERE ap.association_a_id = ? OR ap.association_b_id = ?
        ORDER BY ap.created_at DESC
    `).all(req.user!.associationId, req.user!.associationId);

    res.json((partnerships as any[]).map(p => ({
        id: p.id,
        partnerAssociationId: p.association_a_id === req.user!.associationId ? p.association_b_id : p.association_a_id,
        partnerAssociationName: p.association_a_id === req.user!.associationId ? p.association_b_name : p.association_a_name,
        partnershipType: p.partnership_type,
        shareMusic: !!p.share_music,
        shareEvents: !!p.share_events,
        shareMembers: !!p.share_members,
        status: p.status,
        requestedByName: p.requested_by_name,
        approvedByName: p.approved_by_name,
        approvedAt: p.approved_at,
        notes: p.notes,
        isOutgoing: p.association_a_id === req.user!.associationId,
        createdAt: p.created_at,
    })));
}));

router.post('/partnerships', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = partnershipRequestSchema.parse(req.body);

    if (data.targetAssociationId === req.user!.associationId) {
        throw new ApiError(400, 'Kan geen partnerschap met eigen vereniging aanvragen.');
    }

    const targetAssoc = db.prepare('SELECT id, name FROM associations WHERE id = ?').get(data.targetAssociationId) as any;

    if (!targetAssoc) {
        throw new ApiError(404, 'Doel vereniging niet gevonden.');
    }

    const existing = db.prepare(`
        SELECT id FROM association_partnerships
        WHERE (association_a_id = ? AND association_b_id = ?)
           OR (association_a_id = ? AND association_b_id = ?)
    `).get(req.user!.associationId, data.targetAssociationId, data.targetAssociationId, req.user!.associationId);

    if (existing) {
        throw new ApiError(409, 'Er bestaat al een partnerschap (verzoek) met deze vereniging.');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO association_partnerships (
            id, association_a_id, association_b_id, partnership_type,
            share_music, share_events, share_members, status, requested_by, notes
        ) VALUES (?, ?, ?, 'sharing', ?, ?, ?, 'pending', ?, ?)
    `).run(
        id,
        req.user!.associationId,
        data.targetAssociationId,
        data.shareMusic ?? 0,
        data.shareEvents ?? 0,
        data.shareMembers ?? 0,
        req.user!.id,
        data.notes ?? null
    );

    logActivity(req.user!.associationId, req.user!.id, 'partnership_requested', 'partnership', id, { targetAssociationName: targetAssoc.name });

    logger.info(`Partnership requested with ${targetAssoc.name}`, { from: req.user!.associationId, to: data.targetAssociationId });

    res.status(201).json({ id, message: 'Partnerschap aangevraagd.' });
}));

router.put('/partnerships/:id/approve', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const partnership = db.prepare(`
        SELECT * FROM association_partnerships WHERE id = ? AND association_b_id = ? AND status = 'pending'
    `).get(req.params.id, req.user!.associationId) as any;

    if (!partnership) {
        throw new ApiError(404, 'Partnerschap verzoek niet gevonden of al verwerkt.');
    }

    db.prepare(`
        UPDATE association_partnerships SET status = 'active', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.user!.id, req.params.id);

    logActivity(req.user!.associationId, req.user!.id, 'partnership_approved', 'partnership', req.params.id, {});

    res.json({ message: 'Partnerschap goedgekeurd.' });
}));

router.put('/partnerships/:id/reject', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const partnership = db.prepare(`
        SELECT * FROM association_partnerships WHERE id = ? AND association_b_id = ? AND status = 'pending'
    `).get(req.params.id, req.user!.associationId);

    if (!partnership) {
        throw new ApiError(404, 'Partnerschap verzoek niet gevonden of al verwerkt.');
    }

    db.prepare(`UPDATE association_partnerships SET status = 'rejected' WHERE id = ?`).run(req.params.id);

    logActivity(req.user!.associationId, req.user!.id, 'partnership_rejected', 'partnership', req.params.id, {});

    res.json({ message: 'Partnerschap afgewezen.' });
}));

router.delete('/partnerships/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM association_partnerships
        WHERE id = ? AND (association_a_id = ? OR association_b_id = ?)
    `).run(req.params.id, req.user!.associationId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Partnerschap niet gevonden.');
    }

    res.json({ message: 'Partnerschap beëindigd.' });
}));

// ===========================================
// SHARED EVENTS
// ===========================================

router.post('/events/:eventId/share', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetAssociationId, canEdit, canAddMembers } = req.body;

    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const partnership = db.prepare(`
        SELECT * FROM association_partnerships
        WHERE ((association_a_id = ? AND association_b_id = ?) OR (association_a_id = ? AND association_b_id = ?))
          AND status = 'active' AND share_events = 1
    `).get(req.user!.associationId, targetAssociationId, targetAssociationId, req.user!.associationId);

    if (!partnership) {
        throw new ApiError(403, 'Geen actief partnerschap met evenement delen gevonden.');
    }

    db.prepare(`
        INSERT INTO shared_events (event_id, association_id, can_edit, can_add_members, shared_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(event_id, association_id) DO UPDATE SET
            can_edit = excluded.can_edit,
            can_add_members = excluded.can_add_members
    `).run(req.params.eventId, targetAssociationId, canEdit ?? 0, canAddMembers ?? 0, req.user!.id);

    res.json({ message: 'Evenement gedeeld.' });
}));

router.delete('/events/:eventId/share/:associationId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    db.prepare(`
        DELETE FROM shared_events WHERE event_id = ? AND association_id = ?
    `).run(req.params.eventId, req.params.associationId);

    res.json({ message: 'Evenement delen gestopt.' });
}));

// ===========================================
// ACTIVITY LOG
// ===========================================

router.get('/activity-log', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { limit = 50, offset = 0 } = req.query;

    const logs = db.prepare(`
        SELECT al.*, u.first_name, u.last_name
        FROM association_activity_log al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.association_id = ?
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
    `).all(req.user!.associationId, Number(limit), Number(offset));

    res.json((logs as any[]).map(l => ({
        id: l.id,
        userId: l.user_id,
        userName: l.first_name ? `${l.first_name} ${l.last_name}` : null,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        details: l.details ? JSON.parse(l.details) : null,
        ipAddress: l.ip_address,
        createdAt: l.created_at,
    })));
}));

// ===========================================
// ASSOCIATION MEMBERS
// ===========================================

router.get('/members', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const members = db.prepare(`
        SELECT ua.*, u.email, u.first_name, u.last_name, u.status as user_status,
               iu.first_name || ' ' || iu.last_name as invited_by_name
        FROM user_associations ua
        JOIN users u ON ua.user_id = u.id
        LEFT JOIN users iu ON ua.invited_by = iu.id
        WHERE ua.association_id = ?
        ORDER BY u.last_name, u.first_name
    `).all(req.user!.associationId);

    res.json((members as any[]).map(m => ({
        userId: m.user_id,
        email: m.email,
        name: `${m.first_name} ${m.last_name}`,
        role: m.role,
        isPrimary: !!m.is_primary,
        status: m.status,
        userStatus: m.user_status,
        invitedByName: m.invited_by_name,
        joinedAt: m.joined_at,
    })));
}));

router.put('/members/:userId/role', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { role } = req.body;

    if (!['member', 'board', 'admin'].includes(role)) {
        throw new ApiError(400, 'Ongeldige rol.');
    }

    const result = db.prepare(`
        UPDATE user_associations SET role = ? WHERE user_id = ? AND association_id = ?
    `).run(role, req.params.userId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Lid niet gevonden.');
    }

    logActivity(req.user!.associationId, req.user!.id, 'member_role_changed', 'user', req.params.userId, { newRole: role });

    res.json({ message: 'Rol bijgewerkt.' });
}));

router.delete('/members/:userId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.params.userId === req.user!.id) {
        throw new ApiError(400, 'Je kunt jezelf niet verwijderen.');
    }

    const result = db.prepare(`
        UPDATE user_associations SET status = 'removed' WHERE user_id = ? AND association_id = ?
    `).run(req.params.userId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Lid niet gevonden.');
    }

    logActivity(req.user!.associationId, req.user!.id, 'member_removed', 'user', req.params.userId, {});

    res.json({ message: 'Lid verwijderd uit vereniging.' });
}));

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function mapAssociation(a: any) {
    return {
        id: a.id,
        name: a.name,
        displayName: a.display_name,
        slug: a.slug,
        logoPath: a.logo_path,
        website: a.website,
        phone: a.phone,
        email: a.email,
        address: a.address,
        city: a.city,
        postalCode: a.postal_code,
        country: a.country,
        billingEmail: a.billing_email,
        kvkNumber: a.kvk_number,
        iban: a.iban,
        parentId: a.parent_id,
        parentName: a.parent_name,
        subscriptionTier: a.subscription_tier,
        subscriptionExpires: a.subscription_expires,
        maxMembers: a.max_members,
        maxOrchestras: a.max_orchestras,
        maxStorageMb: a.max_storage_mb,
        isActive: a.is_active !== 0,
        memberCount: a.member_count,
        orchestraCount: a.orchestra_count,
        createdAt: a.created_at,
    };
}

function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

function logActivity(
    associationId: string | null,
    userId: string | null,
    action: string,
    entityType: string | null,
    entityId: string | null,
    details: Record<string, any>
) {
    if (!associationId) return;
    db.prepare(`
        INSERT INTO association_activity_log (id, association_id, user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        uuidv4(),
        associationId,
        userId ?? null,
        action,
        entityType ?? null,
        entityId ?? null,
        JSON.stringify(details)
    );
}

export default router;
