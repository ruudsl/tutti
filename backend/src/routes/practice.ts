import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { createPracticeLogSchema } from '../validation/schemas';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /practice:
 *   get:
 *     summary: Get user's practice logs
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: musicTitleId
 *         schema:
 *           type: string
 *         description: Filter by music title
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *         description: Filter from date (ISO 8601)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *         description: Filter to date (ISO 8601)
 *     responses:
 *       200:
 *         description: List of practice logs
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { musicTitleId, fromDate, toDate } = req.query;

    let query = `
        SELECT pl.id, pl.duration_minutes, pl.notes, pl.practiced_at,
               mt.id as music_title_id, mt.title, mt.arranger
        FROM practice_logs pl
        JOIN music_titles mt ON pl.music_title_id = mt.id
        WHERE pl.user_id = ?
    `;
    const params: any[] = [req.user!.id];

    if (musicTitleId) {
        query += ' AND pl.music_title_id = ?';
        params.push(musicTitleId);
    }
    if (fromDate) {
        query += ' AND pl.practiced_at >= ?';
        params.push(fromDate);
    }
    if (toDate) {
        query += ' AND pl.practiced_at <= ?';
        params.push(toDate);
    }

    query += ' ORDER BY pl.practiced_at DESC LIMIT 100';

    const logs = db.prepare(query).all(...params);

    res.json(logs.map((l: any) => ({
        id: l.id,
        durationMinutes: l.duration_minutes,
        notes: l.notes,
        practicedAt: l.practiced_at,
        musicTitle: {
            id: l.music_title_id,
            title: l.title,
            arranger: l.arranger,
        },
    })));
}));

/**
 * @swagger
 * /practice/stats:
 *   get:
 *     summary: Get practice statistics
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Practice statistics
 */
router.get('/stats', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    // Total practice time
    const totalTime = db.prepare(`
        SELECT COALESCE(SUM(duration_minutes), 0) as total
        FROM practice_logs WHERE user_id = ?
    `).get(req.user!.id) as { total: number };

    // Practice time this week
    const weekTime = db.prepare(`
        SELECT COALESCE(SUM(duration_minutes), 0) as total
        FROM practice_logs
        WHERE user_id = ? AND practiced_at >= date('now', '-7 days')
    `).get(req.user!.id) as { total: number };

    // Practice time this month
    const monthTime = db.prepare(`
        SELECT COALESCE(SUM(duration_minutes), 0) as total
        FROM practice_logs
        WHERE user_id = ? AND practiced_at >= date('now', '-30 days')
    `).get(req.user!.id) as { total: number };

    // Most practiced pieces
    const mostPracticed = db.prepare(`
        SELECT mt.id, mt.title, mt.arranger, SUM(pl.duration_minutes) as total_minutes, COUNT(*) as session_count
        FROM practice_logs pl
        JOIN music_titles mt ON pl.music_title_id = mt.id
        WHERE pl.user_id = ?
        GROUP BY mt.id
        ORDER BY total_minutes DESC
        LIMIT 10
    `).all(req.user!.id);

    // Practice streak (consecutive days)
    const practiceStreak = db.prepare(`
        SELECT DISTINCT DATE(practiced_at) as practice_date
        FROM practice_logs
        WHERE user_id = ?
        ORDER BY practice_date DESC
        LIMIT 365
    `).all(req.user!.id) as { practice_date: string }[];

    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let currentDate = today;

    for (const row of practiceStreak) {
        if (row.practice_date === currentDate) {
            streak++;
            const date = new Date(currentDate);
            date.setDate(date.getDate() - 1);
            currentDate = date.toISOString().split('T')[0];
        } else if (row.practice_date === new Date(new Date(currentDate).setDate(new Date(currentDate).getDate() - 1)).toISOString().split('T')[0]) {
            // Allow for yesterday if we haven't practiced today yet
            if (streak === 0) {
                streak++;
                currentDate = row.practice_date;
                const date = new Date(currentDate);
                date.setDate(date.getDate() - 1);
                currentDate = date.toISOString().split('T')[0];
            } else {
                break;
            }
        } else {
            break;
        }
    }

    res.json({
        totalMinutes: totalTime.total,
        weekMinutes: weekTime.total,
        monthMinutes: monthTime.total,
        currentStreak: streak,
        mostPracticed: mostPracticed.map((p: any) => ({
            id: p.id,
            title: p.title,
            arranger: p.arranger,
            totalMinutes: p.total_minutes,
            sessionCount: p.session_count,
        })),
    });
}));

/**
 * @swagger
 * /practice:
 *   post:
 *     summary: Log a practice session
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - musicTitleId
 *               - durationMinutes
 *             properties:
 *               musicTitleId:
 *                 type: string
 *               durationMinutes:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Practice log created
 */
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createPracticeLogSchema.parse(req.body);

    // Check if title exists
    const title = db.prepare('SELECT id FROM music_titles WHERE id = ?').get(data.musicTitleId);
    if (!title) {
        throw new ApiError(404, 'Titel niet gevonden.');
    }

    const id = uuidv4();
    db.prepare(
        'INSERT INTO practice_logs (id, user_id, music_title_id, duration_minutes, notes) VALUES (?, ?, ?, ?, ?)'
    ).run(id, req.user!.id, data.musicTitleId, data.durationMinutes, data.notes || null);

    logger.info(`User ${req.user!.id} logged practice: ${data.durationMinutes} min on ${data.musicTitleId}`);

    res.status(201).json({
        id,
        message: 'Oefensessie gelogd.',
    });
}));

/**
 * @swagger
 * /practice/{id}:
 *   delete:
 *     summary: Delete a practice log
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Practice log deleted
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM practice_logs WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user!.id);

    if (result.changes === 0) {
        throw new ApiError(404, 'Oefensessie niet gevonden.');
    }

    res.json({ message: 'Oefensessie verwijderd.' });
}));

/**
 * @swagger
 * /practice/goals:
 *   get:
 *     summary: Get user's practice goals
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's practice goals
 */
router.get('/goals', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const goals = db.prepare(`
        SELECT id, goal_type, target_minutes, is_active, created_at, updated_at
        FROM practice_goals
        WHERE user_id = ?
    `).all(req.user!.id);

    // Get current progress for each goal type
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const dailyProgress = db.prepare(`
        SELECT COALESCE(SUM(duration_minutes), 0) as minutes
        FROM practice_logs
        WHERE user_id = ? AND DATE(practiced_at) = ?
    `).get(req.user!.id, today) as { minutes: number };

    const weeklyProgress = db.prepare(`
        SELECT COALESCE(SUM(duration_minutes), 0) as minutes
        FROM practice_logs
        WHERE user_id = ? AND DATE(practiced_at) >= ?
    `).get(req.user!.id, weekStartStr) as { minutes: number };

    res.json({
        goals: goals.map((g: any) => ({
            id: g.id,
            goalType: g.goal_type,
            targetMinutes: g.target_minutes,
            isActive: !!g.is_active,
            createdAt: g.created_at,
            updatedAt: g.updated_at,
        })),
        progress: {
            daily: dailyProgress.minutes,
            weekly: weeklyProgress.minutes,
        },
    });
}));

/**
 * @swagger
 * /practice/goals:
 *   post:
 *     summary: Create or update a practice goal
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goalType
 *               - targetMinutes
 *             properties:
 *               goalType:
 *                 type: string
 *                 enum: [daily, weekly]
 *               targetMinutes:
 *                 type: number
 *     responses:
 *       200:
 *         description: Goal created or updated
 */
router.post('/goals', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { goalType, targetMinutes } = req.body;

    if (!['daily', 'weekly'].includes(goalType)) {
        throw new ApiError(400, 'Ongeldig doeltype. Gebruik "daily" of "weekly".');
    }

    if (typeof targetMinutes !== 'number' || targetMinutes < 1 || targetMinutes > 1440) {
        throw new ApiError(400, 'Ongeldig aantal minuten (1-1440).');
    }

    // Upsert the goal
    const existing = db.prepare(
        'SELECT id FROM practice_goals WHERE user_id = ? AND goal_type = ?'
    ).get(req.user!.id, goalType) as { id: string } | undefined;

    if (existing) {
        db.prepare(`
            UPDATE practice_goals
            SET target_minutes = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(targetMinutes, existing.id);

        res.json({ id: existing.id, message: 'Doel bijgewerkt.' });
    } else {
        const id = uuidv4();
        db.prepare(`
            INSERT INTO practice_goals (id, user_id, goal_type, target_minutes)
            VALUES (?, ?, ?, ?)
        `).run(id, req.user!.id, goalType, targetMinutes);

        res.status(201).json({ id, message: 'Doel aangemaakt.' });
    }
}));

/**
 * @swagger
 * /practice/goals/{id}:
 *   delete:
 *     summary: Delete a practice goal
 *     tags: [Practice]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Goal deleted
 */
router.delete('/goals/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM practice_goals WHERE id = ? AND user_id = ?'
    ).run(req.params.id, req.user!.id);

    if (result.changes === 0) {
        throw new ApiError(404, 'Doel niet gevonden.');
    }

    res.json({ message: 'Doel verwijderd.' });
}));

export default router;
