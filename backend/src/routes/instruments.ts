import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import { createInstrumentSchema, updateInstrumentSchema, addAliasSchema } from '../validation/schemas';
import { withTransaction } from '../utils/database';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';

const router = Router();

// Cache path for invalidation
const CACHE_PATH = '/api/instruments';

/**
 * @swagger
 * /instruments:
 *   get:
 *     summary: Get all instruments with aliases
 *     tags: [Instruments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of instruments
 */
router.get(
  '/',
  authenticateToken,
  cacheMiddleware({ ttlSeconds: 300 }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const instruments = db
      .prepare(
        `
        SELECT id, name, tuning, clef, created_at
        FROM instruments
        ORDER BY name, tuning
    `,
      )
      .all();

    // Get aliases for all instruments in one batch query
    const instrumentIds = instruments.map((i: any) => i.id);
    const aliasesByInstrument = new Map<string, any[]>();

    if (instrumentIds.length > 0) {
      const placeholders = instrumentIds.map(() => '?').join(',');
      const allAliases = db
        .prepare(
          `
            SELECT id, alias, instrument_id
            FROM instrument_aliases
            WHERE instrument_id IN (${placeholders})
            ORDER BY alias
        `,
        )
        .all(...instrumentIds) as any[];

      for (const row of allAliases) {
        const list = aliasesByInstrument.get(row.instrument_id) || [];
        list.push(row);
        aliasesByInstrument.set(row.instrument_id, list);
      }
    }

    const result = instruments.map((instrument: any) => {
      const aliases = aliasesByInstrument.get(instrument.id) || [];

      return {
        id: instrument.id,
        name: instrument.name,
        tuning: instrument.tuning,
        clef: instrument.clef || 'sol',
        createdAt: instrument.created_at,
        aliases: aliases.map((a: any) => ({ id: a.id, name: a.alias })),
      };
    });

    res.json(result);
  }),
);

/**
 * @swagger
 * /instruments:
 *   post:
 *     summary: Create new instrument
 *     tags: [Instruments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               tuning:
 *                 type: string
 *               clef:
 *                 type: string
 *                 enum: [sol, fa, ut]
 *               aliases:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Instrument created successfully
 */
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createInstrumentSchema.parse(req.body);

    const tuningValue = data.tuning || null;
    const clefValue = data.clef || 'sol';

    // Check if instrument with same name, tuning and clef already exists
    const existing = db
      .prepare(
        `SELECT id FROM instruments WHERE LOWER(name) = LOWER(?)
         AND (tuning = ? OR (tuning IS NULL AND ? IS NULL))
         AND clef = ?`,
      )
      .get(data.name, tuningValue, tuningValue, clefValue);

    if (existing) {
      throw new ApiError(
        409,
        `Instrument "${data.name}" met stemming "${data.tuning || 'geen'}" en sleutel "${clefValue}" bestaat al.`,
      );
    }

    const instrumentId = uuidv4();

    withTransaction(() => {
      db.prepare('INSERT INTO instruments (id, name, tuning, clef) VALUES (?, ?, ?, ?)').run(
        instrumentId,
        data.name,
        tuningValue,
        clefValue,
      );

      // Add aliases
      if (data.aliases && data.aliases.length > 0) {
        const insertAlias = db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)');
        for (const alias of data.aliases) {
          if (alias && alias.trim()) {
            insertAlias.run(uuidv4(), instrumentId, alias.trim());
          }
        }
      }
    });

    logger.info(`Instrument created: ${data.name}`, { instrumentId, createdBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'create',
      'instrument',
      instrumentId,
      data.name,
      { tuning: data.tuning, clef: clefValue },
      req.ip,
      req.get('user-agent'),
    );

    res.status(201).json({
      id: instrumentId,
      name: data.name,
      tuning: data.tuning,
      clef: clefValue,
      message: 'Instrument succesvol aangemaakt.',
    });
  }),
);

/**
 * @swagger
 * /instruments/{id}:
 *   put:
 *     summary: Update instrument
 *     tags: [Instruments]
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
 *         description: Instrument updated successfully
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateInstrumentSchema.parse(req.body);

    const instrument = db.prepare('SELECT id FROM instruments WHERE id = ?').get(req.params.id);
    if (!instrument) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    // Check name+tuning+clef uniqueness if changed
    const tuningValue = data.tuning || null;
    const clefValue = data.clef || 'sol';
    const existing = db
      .prepare(
        `SELECT id FROM instruments WHERE LOWER(name) = LOWER(?)
         AND (tuning = ? OR (tuning IS NULL AND ? IS NULL))
         AND clef = ?
         AND id != ?`,
      )
      .get(data.name, tuningValue, tuningValue, clefValue, req.params.id);

    if (existing) {
      throw new ApiError(
        409,
        `Instrument "${data.name}" met stemming "${data.tuning || 'geen'}" en sleutel "${clefValue}" bestaat al.`,
      );
    }

    db.prepare('UPDATE instruments SET name = ?, tuning = ?, clef = ? WHERE id = ?').run(
      data.name,
      tuningValue,
      clefValue,
      req.params.id,
    );

    logger.info(`Instrument updated: ${req.params.id}`, { updatedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'update',
      'instrument',
      req.params.id,
      data.name,
      { tuning: data.tuning, clef: clefValue },
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Instrument succesvol bijgewerkt.' });
  }),
);

/**
 * @swagger
 * /instruments/{id}:
 *   delete:
 *     summary: Delete instrument
 *     tags: [Instruments]
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
 *         description: Instrument deleted successfully
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get instrument name before deletion for audit log
    const instrumentToDelete = db.prepare('SELECT name FROM instruments WHERE id = ?').get(req.params.id) as
      { name: string } | undefined;

    if (!instrumentToDelete) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    const result = db.prepare('DELETE FROM instruments WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    logger.info(`Instrument deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    // Log audit event
    logAuditEvent(
      req.user!.id,
      'delete',
      'instrument',
      req.params.id,
      instrumentToDelete.name,
      undefined,
      req.ip,
      req.get('user-agent'),
    );

    res.json({ message: 'Instrument succesvol verwijderd.' });
  }),
);

/**
 * @swagger
 * /instruments/{id}/aliases:
 *   post:
 *     summary: Add alias to instrument
 *     tags: [Instruments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - alias
 *             properties:
 *               alias:
 *                 type: string
 *     responses:
 *       201:
 *         description: Alias added successfully
 */
router.post(
  '/:id/aliases',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = addAliasSchema.parse(req.body);

    const instrument = db.prepare('SELECT id FROM instruments WHERE id = ?').get(req.params.id);
    if (!instrument) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    // Check if alias already exists for this instrument
    const existing = db
      .prepare('SELECT id FROM instrument_aliases WHERE instrument_id = ? AND LOWER(alias) = LOWER(?)')
      .get(req.params.id, data.alias.trim());

    if (existing) {
      throw new ApiError(409, 'Alias bestaat al voor dit instrument.');
    }

    const aliasId = uuidv4();
    db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)').run(
      aliasId,
      req.params.id,
      data.alias.trim(),
    );

    res.status(201).json({
      id: aliasId,
      alias: data.alias.trim(),
      message: 'Alias succesvol toegevoegd.',
    });
  }),
);

/**
 * @swagger
 * /instruments/{id}/aliases/{aliasId}:
 *   delete:
 *     summary: Delete alias from instrument
 *     tags: [Instruments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: aliasId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alias deleted successfully
 */
router.delete(
  '/:id/aliases/:aliasId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare('DELETE FROM instrument_aliases WHERE id = ? AND instrument_id = ?')
      .run(req.params.aliasId, req.params.id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Alias niet gevonden.');
    }

    res.json({ message: 'Alias succesvol verwijderd.' });
  }),
);

/**
 * @swagger
 * /instruments/find/{name}:
 *   get:
 *     summary: Find instrument by name or alias
 *     tags: [Instruments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Instrument found
 *       404:
 *         description: Instrument not found
 */
router.get(
  '/find/:name',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const searchName = req.params.name.toLowerCase();

    // First try exact match on instrument name
    let instrument = db
      .prepare(
        `
        SELECT id, name, tuning
        FROM instruments
        WHERE LOWER(name) = ?
    `,
      )
      .get(searchName) as any;

    // If not found, try alias
    if (!instrument) {
      const alias = db
        .prepare(
          `
            SELECT i.id, i.name, i.tuning
            FROM instruments i
            JOIN instrument_aliases ia ON i.id = ia.instrument_id
            WHERE LOWER(ia.alias) = ?
        `,
        )
        .get(searchName) as any;

      instrument = alias;
    }

    if (!instrument) {
      throw new ApiError(404, 'Instrument niet gevonden.');
    }

    res.json({
      id: instrument.id,
      name: instrument.name,
      tuning: instrument.tuning,
    });
  }),
);

export default router;
