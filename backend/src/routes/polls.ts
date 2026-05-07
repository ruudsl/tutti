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

const CACHE_PATH = '/api/polls';

// Validation schemas
const createPollSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht.'),
    description: z.string().optional(),
    pollType: z.enum(['single', 'multiple', 'ranked']).default('single'),
    isAnonymous: z.boolean().default(false),
    showResultsBeforeClose: z.boolean().default(false),
    allowComments: z.boolean().default(true),
    maxSelections: z.number().min(1).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    targetOrchestras: z.array(z.string().uuid()).optional(),
    targetRoles: z.array(z.string()).optional(),
    options: z.array(z.object({
        text: z.string().min(1),
        description: z.string().optional(),
    })).min(2, 'Minimaal 2 opties vereist.'),
});

const updatePollSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    pollType: z.enum(['single', 'multiple', 'ranked']).optional(),
    isAnonymous: z.boolean().optional(),
    showResultsBeforeClose: z.boolean().optional(),
    allowComments: z.boolean().optional(),
    maxSelections: z.number().min(1).optional().nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    targetOrchestras: z.array(z.string().uuid()).optional(),
    targetRoles: z.array(z.string()).optional(),
});

const addOptionSchema = z.object({
    text: z.string().min(1, 'Optietekst is verplicht.'),
    description: z.string().optional(),
});

const voteSchema = z.object({
    optionIds: z.array(z.string().uuid()).min(1, 'Selecteer minimaal één optie.'),
    ranks: z.record(z.string().uuid(), z.number()).optional(),
});

const commentSchema = z.object({
    content: z.string().min(1, 'Reactie mag niet leeg zijn.'),
    parentId: z.string().uuid().optional(),
});

// Helper to check if user can see poll based on targeting
function canUserSeePoll(poll: any, user: any): boolean {
    if (!poll.target_orchestras && !poll.target_roles) {
        return true;
    }

    const targetOrchestras = poll.target_orchestras ? JSON.parse(poll.target_orchestras) : null;
    const targetRoles = poll.target_roles ? JSON.parse(poll.target_roles) : null;

    if (targetRoles && targetRoles.length > 0) {
        if (!targetRoles.includes(user.role)) {
            return false;
        }
    }

    if (targetOrchestras && targetOrchestras.length > 0) {
        const userOrchestras = db.prepare(
            'SELECT orchestra_id FROM user_orchestras WHERE user_id = ?'
        ).all(user.id).map((r: any) => r.orchestra_id);

        const hasMatch = targetOrchestras.some((o: string) => userOrchestras.includes(o));
        if (!hasMatch) {
            return false;
        }
    }

    return true;
}

// =====================================================
// POLL ROUTES
// =====================================================

// Get all polls (with filters)
router.get('/', authenticateToken, cacheMiddleware({ ttlSeconds: 60 }), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const { status, createdBy, search } = req.query;
    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);

    let query = `
        SELECT p.*,
            u.first_name || ' ' || u.last_name AS created_by_name,
            (SELECT COUNT(*) FROM poll_options WHERE poll_id = p.id) AS option_count,
            (SELECT COUNT(DISTINCT user_id) FROM poll_votes WHERE poll_id = p.id) AS vote_count
        FROM polls p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.association_id = ?
    `;
    const params: any[] = [associationId];

    if (status) {
        query += ' AND p.status = ?';
        params.push(status);
    }

    if (createdBy) {
        query += ' AND p.created_by = ?';
        params.push(createdBy);
    }

    if (search) {
        query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }

    if (!isAdmin) {
        query += ' AND p.status IN (?, ?)';
        params.push('active', 'closed');
    }

    query += ' ORDER BY p.created_at DESC';

    const polls = db.prepare(query).all(...params);

    // Filter by targeting and check user's vote status
    const result = polls
        .filter((p: any) => canUserSeePoll(p, req.user!))
        .map((p: any) => {
            const hasVoted = db.prepare(
                'SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ? LIMIT 1'
            ).get(p.id, req.user!.id);

            return {
                id: p.id,
                title: p.title,
                description: p.description,
                pollType: p.poll_type,
                status: p.status,
                isAnonymous: !!p.is_anonymous,
                showResultsBeforeClose: !!p.show_results_before_close,
                allowComments: !!p.allow_comments,
                maxSelections: p.max_selections,
                startsAt: p.starts_at,
                endsAt: p.ends_at,
                targetOrchestras: p.target_orchestras ? JSON.parse(p.target_orchestras) : null,
                targetRoles: p.target_roles ? JSON.parse(p.target_roles) : null,
                createdBy: p.created_by,
                createdByName: p.created_by_name,
                createdAt: p.created_at,
                closedAt: p.closed_at,
                optionCount: p.option_count,
                voteCount: p.vote_count,
                hasVoted: !!hasVoted,
            };
        });

    res.json(result);
}));

// Get single poll with options and results
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const poll = db.prepare(`
        SELECT p.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM polls p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.id = ? AND p.association_id = ?
    `).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);
    const isCreator = poll.created_by === req.user!.id;

    if (!isAdmin && !isCreator && !canUserSeePoll(poll, req.user!)) {
        throw new ApiError(403, 'Je hebt geen toegang tot deze poll.');
    }

    // Get options
    const options = db.prepare(`
        SELECT * FROM poll_options WHERE poll_id = ? ORDER BY sort_order, id
    `).all(req.params.id);

    // Get user's votes
    const userVotes = db.prepare(`
        SELECT option_id, rank_position FROM poll_votes
        WHERE poll_id = ? AND user_id = ?
    `).all(req.params.id, req.user!.id);

    // Determine if results should be shown
    const canSeeResults = poll.status === 'closed' || poll.show_results_before_close || isAdmin || isCreator;

    // Get vote counts per option
    let optionResults: Record<string, any> = {};
    if (canSeeResults) {
        const voteCounts = db.prepare(`
            SELECT option_id, COUNT(*) as count FROM poll_votes
            WHERE poll_id = ?
            GROUP BY option_id
        `).all(req.params.id);

        voteCounts.forEach((vc: any) => {
            optionResults[vc.option_id] = { count: vc.count };
        });

        // For non-anonymous polls, also get voter names
        if (!poll.is_anonymous && (isAdmin || isCreator)) {
            const voters = db.prepare(`
                SELECT pv.option_id, u.id AS user_id, u.first_name || ' ' || u.last_name AS name
                FROM poll_votes pv
                JOIN users u ON pv.user_id = u.id
                WHERE pv.poll_id = ?
            `).all(req.params.id);

            voters.forEach((v: any) => {
                if (!optionResults[v.option_id]) {
                    optionResults[v.option_id] = { count: 0, voters: [] };
                }
                if (!optionResults[v.option_id].voters) {
                    optionResults[v.option_id].voters = [];
                }
                optionResults[v.option_id].voters.push({ id: v.user_id, name: v.name });
            });
        }
    }

    // Get total unique voters
    const totalVoters = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM poll_votes WHERE poll_id = ?
    `).get(req.params.id) as any;

    // Get comments if allowed
    let comments: any[] = [];
    if (poll.allow_comments) {
        comments = db.prepare(`
            SELECT pc.*, u.first_name || ' ' || u.last_name AS author_name
            FROM poll_comments pc
            JOIN users u ON pc.user_id = u.id
            WHERE pc.poll_id = ? AND pc.deleted_at IS NULL
            ORDER BY pc.created_at ASC
        `).all(req.params.id);
    }

    res.json({
        id: poll.id,
        title: poll.title,
        description: poll.description,
        pollType: poll.poll_type,
        status: poll.status,
        isAnonymous: !!poll.is_anonymous,
        showResultsBeforeClose: !!poll.show_results_before_close,
        allowComments: !!poll.allow_comments,
        maxSelections: poll.max_selections,
        startsAt: poll.starts_at,
        endsAt: poll.ends_at,
        targetOrchestras: poll.target_orchestras ? JSON.parse(poll.target_orchestras) : null,
        targetRoles: poll.target_roles ? JSON.parse(poll.target_roles) : null,
        createdBy: poll.created_by,
        createdByName: poll.created_by_name,
        createdAt: poll.created_at,
        closedAt: poll.closed_at,
        options: options.map((o: any) => ({
            id: o.id,
            text: o.option_text,
            description: o.option_description,
            sortOrder: o.sort_order,
            ...(canSeeResults && optionResults[o.id] ? {
                voteCount: optionResults[o.id].count || 0,
                voters: optionResults[o.id].voters,
            } : {}),
        })),
        totalVoters: totalVoters.count,
        userVotes: userVotes.map((v: any) => ({
            optionId: v.option_id,
            rank: v.rank_position,
        })),
        hasVoted: userVotes.length > 0,
        canSeeResults,
        comments: comments.map((c: any) => ({
            id: c.id,
            content: c.content,
            authorId: c.user_id,
            authorName: c.author_name,
            parentId: c.parent_id,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        })),
    });
}));

// Create poll
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createPollSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const pollId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO polls (
            id, association_id, title, description, poll_type, status,
            is_anonymous, show_results_before_close, allow_comments, max_selections,
            starts_at, ends_at, target_orchestras, target_roles, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        pollId,
        associationId,
        data.title,
        data.description || null,
        data.pollType,
        data.isAnonymous ? 1 : 0,
        data.showResultsBeforeClose ? 1 : 0,
        data.allowComments ? 1 : 0,
        data.maxSelections || null,
        data.startsAt || null,
        data.endsAt || null,
        data.targetOrchestras ? JSON.stringify(data.targetOrchestras) : null,
        data.targetRoles ? JSON.stringify(data.targetRoles) : null,
        req.user!.id,
        now,
        now
    );

    // Add options
    const insertOption = db.prepare(`
        INSERT INTO poll_options (id, poll_id, option_text, option_description, sort_order)
        VALUES (?, ?, ?, ?, ?)
    `);

    data.options.forEach((opt, index) => {
        insertOption.run(uuidv4(), pollId, opt.text, opt.description || null, index);
    });

    logAuditEvent(
        req.user!.id,
        'poll_created',
        'poll',
        pollId,
        data.title,
        { optionCount: data.options.length }
    );

    logger.info(`Poll created: ${data.title}`, { pollId, createdBy: req.user!.id });

    res.status(201).json({
        id: pollId,
        message: 'Poll succesvol aangemaakt.',
    });
}));

// Update poll
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updatePollSchema.parse(req.body);
    const associationId = req.user!.associationId;
    if (!associationId) {
        throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (poll.status === 'closed') {
        throw new ApiError(400, 'Een gesloten poll kan niet worden bewerkt.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.title !== undefined) {
        updates.push('title = ?');
        params.push(data.title);
    }
    if (data.description !== undefined) {
        updates.push('description = ?');
        params.push(data.description);
    }
    if (data.pollType !== undefined) {
        updates.push('poll_type = ?');
        params.push(data.pollType);
    }
    if (data.isAnonymous !== undefined) {
        updates.push('is_anonymous = ?');
        params.push(data.isAnonymous ? 1 : 0);
    }
    if (data.showResultsBeforeClose !== undefined) {
        updates.push('show_results_before_close = ?');
        params.push(data.showResultsBeforeClose ? 1 : 0);
    }
    if (data.allowComments !== undefined) {
        updates.push('allow_comments = ?');
        params.push(data.allowComments ? 1 : 0);
    }
    if (data.maxSelections !== undefined) {
        updates.push('max_selections = ?');
        params.push(data.maxSelections);
    }
    if (data.startsAt !== undefined) {
        updates.push('starts_at = ?');
        params.push(data.startsAt);
    }
    if (data.endsAt !== undefined) {
        updates.push('ends_at = ?');
        params.push(data.endsAt);
    }
    if (data.targetOrchestras !== undefined) {
        updates.push('target_orchestras = ?');
        params.push(data.targetOrchestras ? JSON.stringify(data.targetOrchestras) : null);
    }
    if (data.targetRoles !== undefined) {
        updates.push('target_roles = ?');
        params.push(data.targetRoles ? JSON.stringify(data.targetRoles) : null);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(req.params.id, associationId);

        db.prepare(`
            UPDATE polls SET ${updates.join(', ')}
            WHERE id = ? AND association_id = ?
        `).run(...params);
    }

    res.json({ message: 'Poll bijgewerkt.' });
}));

// Change poll status
router.post('/:id/status', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = req.body;
    const associationId = req.user!.associationId;

    if (!['draft', 'active', 'closed', 'archived'].includes(status)) {
        throw new ApiError(400, 'Ongeldige status.');
    }

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    const now = new Date().toISOString();
    const closedAt = status === 'closed' ? now : null;

    db.prepare(`
        UPDATE polls SET status = ?, closed_at = ?, updated_at = ?
        WHERE id = ? AND association_id = ?
    `).run(status, closedAt, now, req.params.id, associationId);

    logAuditEvent(
        req.user!.id,
        'poll_status_changed',
        'poll',
        req.params.id,
        poll.title,
        { oldStatus: poll.status, newStatus: status }
    );

    res.json({ message: `Poll status gewijzigd naar ${status}.` });
}));

// Delete poll
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee'), cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    db.prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);

    logAuditEvent(
        req.user!.id,
        'poll_deleted',
        'poll',
        req.params.id,
        poll.title
    );

    res.json({ message: 'Poll verwijderd.' });
}));

// =====================================================
// OPTIONS ROUTES
// =====================================================

// Add option to poll
router.post('/:id/options', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addOptionSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (poll.status !== 'draft') {
        throw new ApiError(400, 'Opties kunnen alleen worden toegevoegd aan concept polls.');
    }

    const maxOrder = db.prepare(
        'SELECT MAX(sort_order) as max FROM poll_options WHERE poll_id = ?'
    ).get(req.params.id) as any;

    const optionId = uuidv4();
    db.prepare(`
        INSERT INTO poll_options (id, poll_id, option_text, option_description, sort_order)
        VALUES (?, ?, ?, ?, ?)
    `).run(optionId, req.params.id, data.text, data.description || null, (maxOrder.max || 0) + 1);

    res.status(201).json({
        id: optionId,
        text: data.text,
        description: data.description,
        message: 'Optie toegevoegd.',
    });
}));

// Update option
router.put('/:pollId/options/:optionId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addOptionSchema.partial().parse(req.body);
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.pollId, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (poll.status !== 'draft') {
        throw new ApiError(400, 'Opties kunnen alleen worden bewerkt in concept polls.');
    }

    const option = db.prepare(
        'SELECT * FROM poll_options WHERE id = ? AND poll_id = ?'
    ).get(req.params.optionId, req.params.pollId);

    if (!option) {
        throw new ApiError(404, 'Optie niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.text !== undefined) {
        updates.push('option_text = ?');
        params.push(data.text);
    }
    if (data.description !== undefined) {
        updates.push('option_description = ?');
        params.push(data.description);
    }

    if (updates.length > 0) {
        params.push(req.params.optionId);
        db.prepare(`UPDATE poll_options SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Optie bijgewerkt.' });
}));

// Delete option
router.delete('/:pollId/options/:optionId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.pollId, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (poll.status !== 'draft') {
        throw new ApiError(400, 'Opties kunnen alleen worden verwijderd in concept polls.');
    }

    const optionCount = db.prepare(
        'SELECT COUNT(*) as count FROM poll_options WHERE poll_id = ?'
    ).get(req.params.pollId) as any;

    if (optionCount.count <= 2) {
        throw new ApiError(400, 'Een poll moet minimaal 2 opties hebben.');
    }

    db.prepare('DELETE FROM poll_options WHERE id = ? AND poll_id = ?')
        .run(req.params.optionId, req.params.pollId);

    res.json({ message: 'Optie verwijderd.' });
}));

// Reorder options
router.put('/:id/options/reorder', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { optionIds } = req.body;
    const associationId = req.user!.associationId;

    if (!Array.isArray(optionIds)) {
        throw new ApiError(400, 'optionIds moet een array zijn.');
    }

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    const updateOrder = db.prepare('UPDATE poll_options SET sort_order = ? WHERE id = ? AND poll_id = ?');
    optionIds.forEach((optionId: string, index: number) => {
        updateOrder.run(index, optionId, req.params.id);
    });

    res.json({ message: 'Volgorde bijgewerkt.' });
}));

// =====================================================
// VOTING ROUTES
// =====================================================

// Submit vote
router.post('/:id/vote', authenticateToken, cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = voteSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (poll.status !== 'active') {
        throw new ApiError(400, 'Je kunt alleen stemmen op actieve polls.');
    }

    if (!canUserSeePoll(poll, req.user!)) {
        throw new ApiError(403, 'Je hebt geen toegang tot deze poll.');
    }

    // Check timing
    const now = new Date();
    if (poll.starts_at && new Date(poll.starts_at) > now) {
        throw new ApiError(400, 'Deze poll is nog niet geopend.');
    }
    if (poll.ends_at && new Date(poll.ends_at) < now) {
        throw new ApiError(400, 'Deze poll is gesloten.');
    }

    // Validate vote based on poll type
    if (poll.poll_type === 'single' && data.optionIds.length !== 1) {
        throw new ApiError(400, 'Je kunt maar één optie kiezen.');
    }

    if (poll.poll_type === 'multiple' && poll.max_selections && data.optionIds.length > poll.max_selections) {
        throw new ApiError(400, `Je kunt maximaal ${poll.max_selections} opties kiezen.`);
    }

    // Verify all options exist
    const validOptions = db.prepare(
        `SELECT id FROM poll_options WHERE poll_id = ? AND id IN (${data.optionIds.map(() => '?').join(',')})`
    ).all(req.params.id, ...data.optionIds);

    if (validOptions.length !== data.optionIds.length) {
        throw new ApiError(400, 'Eén of meer opties zijn ongeldig.');
    }

    // Check if user already voted
    const existingVote = db.prepare(
        'SELECT 1 FROM poll_votes WHERE poll_id = ? AND user_id = ?'
    ).get(req.params.id, req.user!.id);

    if (existingVote) {
        throw new ApiError(400, 'Je hebt al gestemd op deze poll.');
    }

    // Insert votes
    const insertVote = db.prepare(`
        INSERT INTO poll_votes (id, poll_id, option_id, user_id, rank_position, voted_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const votedAt = new Date().toISOString();

    data.optionIds.forEach((optionId) => {
        const rank = data.ranks ? data.ranks[optionId] : null;
        insertVote.run(uuidv4(), req.params.id, optionId, req.user!.id, rank, votedAt);
    });

    logger.info(`Vote submitted for poll ${req.params.id}`, { userId: req.user!.id });

    res.json({ message: 'Stem succesvol uitgebracht.' });
}));

// Retract vote (if allowed before poll closes)
router.delete('/:id/vote', authenticateToken, cacheInvalidator(CACHE_PATH), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (poll.status !== 'active') {
        throw new ApiError(400, 'Je kunt je stem alleen intrekken bij actieve polls.');
    }

    const result = db.prepare(
        'DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?'
    ).run(req.params.id, req.user!.id);

    if (result.changes === 0) {
        throw new ApiError(400, 'Je hebt niet gestemd op deze poll.');
    }

    res.json({ message: 'Stem ingetrokken.' });
}));

// =====================================================
// COMMENT ROUTES
// =====================================================

// Get comments for a poll
router.get('/:id/comments', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT allow_comments FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (!poll.allow_comments) {
        return res.json([]);
    }

    const comments = db.prepare(`
        SELECT pc.*, u.first_name || ' ' || u.last_name AS author_name
        FROM poll_comments pc
        JOIN users u ON pc.user_id = u.id
        WHERE pc.poll_id = ? AND pc.deleted_at IS NULL
        ORDER BY pc.created_at ASC
    `).all(req.params.id);

    res.json(comments.map((c: any) => ({
        id: c.id,
        content: c.content,
        authorId: c.user_id,
        authorName: c.author_name,
        parentId: c.parent_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
    })));
}));

// Add comment
router.post('/:id/comments', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = commentSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const poll = db.prepare(
        'SELECT * FROM polls WHERE id = ? AND association_id = ?'
    ).get(req.params.id, associationId) as any;

    if (!poll) {
        throw new ApiError(404, 'Poll niet gevonden.');
    }

    if (!poll.allow_comments) {
        throw new ApiError(400, 'Reacties zijn niet toegestaan op deze poll.');
    }

    if (!canUserSeePoll(poll, req.user!)) {
        throw new ApiError(403, 'Je hebt geen toegang tot deze poll.');
    }

    if (data.parentId) {
        const parent = db.prepare(
            'SELECT id FROM poll_comments WHERE id = ? AND poll_id = ? AND deleted_at IS NULL'
        ).get(data.parentId, req.params.id);

        if (!parent) {
            throw new ApiError(404, 'Parent reactie niet gevonden.');
        }
    }

    const commentId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO poll_comments (id, poll_id, user_id, content, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(commentId, req.params.id, req.user!.id, data.content, data.parentId || null, now, now);

    const user = db.prepare(
        'SELECT first_name, last_name FROM users WHERE id = ?'
    ).get(req.user!.id) as any;

    res.status(201).json({
        id: commentId,
        content: data.content,
        authorId: req.user!.id,
        authorName: user ? `${user.first_name} ${user.last_name}` : 'Onbekend',
        parentId: data.parentId,
        createdAt: now,
        message: 'Reactie geplaatst.',
    });
}));

// Update comment
router.put('/:pollId/comments/:commentId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
        throw new ApiError(400, 'Reactie mag niet leeg zijn.');
    }

    const comment = db.prepare(
        'SELECT * FROM poll_comments WHERE id = ? AND poll_id = ? AND deleted_at IS NULL'
    ).get(req.params.commentId, req.params.pollId) as any;

    if (!comment) {
        throw new ApiError(404, 'Reactie niet gevonden.');
    }

    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);
    if (comment.user_id !== req.user!.id && !isAdmin) {
        throw new ApiError(403, 'Je kunt alleen je eigen reacties bewerken.');
    }

    db.prepare(`
        UPDATE poll_comments SET content = ?, updated_at = ?
        WHERE id = ?
    `).run(content.trim(), new Date().toISOString(), req.params.commentId);

    res.json({ message: 'Reactie bijgewerkt.' });
}));

// Delete comment (soft delete)
router.delete('/:pollId/comments/:commentId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const comment = db.prepare(
        'SELECT * FROM poll_comments WHERE id = ? AND poll_id = ? AND deleted_at IS NULL'
    ).get(req.params.commentId, req.params.pollId) as any;

    if (!comment) {
        throw new ApiError(404, 'Reactie niet gevonden.');
    }

    const isAdmin = ['admin', 'music_committee'].includes(req.user!.role);
    if (comment.user_id !== req.user!.id && !isAdmin) {
        throw new ApiError(403, 'Je kunt alleen je eigen reacties verwijderen.');
    }

    db.prepare(`
        UPDATE poll_comments SET deleted_at = ? WHERE id = ?
    `).run(new Date().toISOString(), req.params.commentId);

    res.json({ message: 'Reactie verwijderd.' });
}));

export default router;
