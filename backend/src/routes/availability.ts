/**
 * Member Availability Routes
 *
 * Allows members to set their availability for upcoming dates.
 */

import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /availability:
 *   get:
 *     summary: Get user's availability
 *     tags: [Availability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *         description: End date (ISO 8601)
 *     responses:
 *       200:
 *         description: List of availability entries
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { fromDate, toDate } = req.query;

    let query = `
        SELECT id, date, status, notes, created_at, updated_at
        FROM member_availability
        WHERE user_id = ?
    `;
    const params: any[] = [req.user!.id];

    if (fromDate) {
      query += ' AND date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND date <= ?';
      params.push(toDate);
    }

    query += ' ORDER BY date ASC';

    const availability = db.prepare(query).all(...params);

    res.json(
      availability.map((a: any) => ({
        id: a.id,
        date: a.date,
        status: a.status,
        notes: a.notes,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
    );
  }),
);

/**
 * @swagger
 * /availability/team:
 *   get:
 *     summary: Get team availability (for conductors/admins)
 *     tags: [Availability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *         description: Date to check (ISO 8601)
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra
 *     responses:
 *       200:
 *         description: Team availability for the date
 */
router.get(
  '/team',
  authenticateToken,
  requireRole('admin', 'conductor', 'section_leader'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { date, orchestraId } = req.query;

    if (!date) {
      throw new ApiError(400, 'Datum is verplicht.');
    }

    let query = `
        SELECT
            u.id as user_id,
            u.first_name,
            u.last_name,
            ma.status,
            ma.notes
        FROM users u
        LEFT JOIN member_availability ma ON u.id = ma.user_id AND ma.date = ?
        WHERE u.association_id = ?
          AND u.status != 'inactive'
          AND u.deleted_at IS NULL
    `;
    const params: any[] = [date, req.user!.associationId];

    if (orchestraId) {
      query += ' AND u.id IN (SELECT user_id FROM user_orchestras WHERE orchestra_id = ?)';
      params.push(orchestraId);
    }

    query += ' ORDER BY u.last_name, u.first_name';

    const teamAvailability = db.prepare(query).all(...params);

    // Summary counts
    const available = teamAvailability.filter((t: any) => t.status === 'available').length;
    const unavailable = teamAvailability.filter((t: any) => t.status === 'unavailable').length;
    const maybe = teamAvailability.filter((t: any) => t.status === 'maybe').length;
    const unknown = teamAvailability.filter((t: any) => !t.status).length;

    res.json({
      date,
      summary: { available, unavailable, maybe, unknown, total: teamAvailability.length },
      members: teamAvailability.map((t: any) => ({
        userId: t.user_id,
        firstName: t.first_name,
        lastName: t.last_name,
        status: t.status || 'unknown',
        notes: t.notes,
      })),
    });
  }),
);

/**
 * @swagger
 * /availability:
 *   post:
 *     summary: Set availability for a date
 *     tags: [Availability]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - date
 *               - status
 *             properties:
 *               date:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [available, unavailable, maybe]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Availability set
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { date, status, notes } = req.body;

    if (!date || !status) {
      throw new ApiError(400, 'Datum en status zijn verplicht.');
    }

    if (!['available', 'unavailable', 'maybe'].includes(status)) {
      throw new ApiError(400, 'Ongeldige status.');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new ApiError(400, 'Ongeldig datumformaat. Gebruik YYYY-MM-DD.');
    }

    // Upsert availability
    const existing = db
      .prepare('SELECT id FROM member_availability WHERE user_id = ? AND date = ?')
      .get(req.user!.id, date) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `
            UPDATE member_availability
            SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
      ).run(status, notes || null, existing.id);

      res.json({ id: existing.id, message: 'Beschikbaarheid bijgewerkt.' });
    } else {
      const id = uuidv4();
      db.prepare(
        `
            INSERT INTO member_availability (id, user_id, date, status, notes)
            VALUES (?, ?, ?, ?, ?)
        `,
      ).run(id, req.user!.id, date, status, notes || null);

      res.status(201).json({ id, message: 'Beschikbaarheid ingesteld.' });
    }

    logger.info(`User ${req.user!.id} set availability for ${date}: ${status}`);
  }),
);

/**
 * @swagger
 * /availability/bulk:
 *   post:
 *     summary: Set availability for multiple dates
 *     tags: [Availability]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - dates
 *               - status
 *             properties:
 *               dates:
 *                 type: array
 *                 items:
 *                   type: string
 *               status:
 *                 type: string
 *                 enum: [available, unavailable, maybe]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Availability set for all dates
 */
router.post(
  '/bulk',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dates, status, notes } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      throw new ApiError(400, 'Minimaal één datum is verplicht.');
    }

    if (dates.length > 90) {
      throw new ApiError(400, 'Maximaal 90 datums tegelijk.');
    }

    if (!['available', 'unavailable', 'maybe'].includes(status)) {
      throw new ApiError(400, 'Ongeldige status.');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const date of dates) {
      if (!dateRegex.test(date)) {
        throw new ApiError(400, `Ongeldig datumformaat: ${date}`);
      }
    }

    const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO member_availability (id, user_id, date, status, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const selectStmt = db.prepare('SELECT id FROM member_availability WHERE user_id = ? AND date = ?');

    let created = 0;
    let updated = 0;

    for (const date of dates) {
      const existing = selectStmt.get(req.user!.id, date) as { id: string } | undefined;
      const id = existing?.id || uuidv4();

      insertStmt.run(id, req.user!.id, date, status, notes || null);

      if (existing) {
        updated++;
      } else {
        created++;
      }
    }

    logger.info(`User ${req.user!.id} bulk set availability: ${created} created, ${updated} updated`);

    res.json({
      message: `Beschikbaarheid ingesteld voor ${dates.length} datums.`,
      created,
      updated,
    });
  }),
);

/**
 * @swagger
 * /availability/{date}:
 *   delete:
 *     summary: Remove availability for a date
 *     tags: [Availability]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Availability removed
 */
router.delete(
  '/:date',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare('DELETE FROM member_availability WHERE user_id = ? AND date = ?')
      .run(req.user!.id, req.params.date);

    if (result.changes === 0) {
      throw new ApiError(404, 'Beschikbaarheid niet gevonden.');
    }

    res.json({ message: 'Beschikbaarheid verwijderd.' });
  }),
);

export default router;
