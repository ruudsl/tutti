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
import {
  catalogusItem,
  isSuperbeheerder,
  toon,
  verberg,
  zichtbaarParams,
  zichtbaarVoorwaarde,
} from '../services/catalogus';

/**
 * Instrumenten: een standaardlijst voor de hele installatie, plus eigen
 * instrumenten per vereniging; een vereniging kan standaardinstrumenten
 * verbergen. Zie services/catalogus.ts en de uitleg in routes/genres.ts.
 * Aliassen horen bij een instrument: bij een standaardinstrument beheert ze
 * alleen de superbeheerder, want ze gelden bij het herkennen van partijnamen
 * voor iedereen.
 */

const router = Router();

// Cache path for invalidation
const CACHE_PATH = '/api/instruments';

/** Het instrument, als de vereniging het mag beheren; anders een 403 of 404. */
function beheerbaarInstrument(req: AuthRequest, id: string) {
  const instrument = catalogusItem('instrument', id);
  if (!instrument || (instrument.association_id !== null && instrument.association_id !== req.user!.associationId)) {
    throw new ApiError(404, 'Instrument niet gevonden.');
  }
  if (instrument.association_id === null && !isSuperbeheerder(req.user!.id)) {
    throw new ApiError(
      403,
      'Dit is een standaardinstrument voor alle verenigingen. Verberg het en maak een eigen instrument als je het anders wilt.',
    );
  }
  return instrument;
}

/** Bestaat er voor deze vereniging al een zichtbaar instrument met deze naam, stemming en sleutel? */
function instrumentBezet(
  req: AuthRequest,
  naam: string,
  stemming: string | null,
  sleutel: string,
  behalve?: string,
): boolean {
  const associationId = req.user!.associationId ?? null;
  return !!db
    .prepare(
      `SELECT 1 FROM instruments i
       WHERE LOWER(i.name) = LOWER(?) AND (i.tuning = ? OR (i.tuning IS NULL AND ? IS NULL)) AND i.clef = ?
         AND i.id != ?
         AND ${associationId ? zichtbaarVoorwaarde('i') : 'i.association_id IS NULL'}`,
    )
    .get(
      naam,
      stemming,
      stemming,
      sleutel,
      behalve ?? '',
      ...(associationId ? zichtbaarParams(associationId, 'instrument') : []),
    );
}

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
    // De instrumenten die deze vereniging ziet: standaard (niet verborgen) en
    // eigen. Met ?alles=true ook de verborgen standaardinstrumenten, voor het
    // beheerscherm.
    const associationId = req.user!.associationId ?? '';
    const alles = req.query.alles === 'true';
    const instruments = db
      .prepare(
        `SELECT i.id, i.name, i.tuning, i.clef, i.created_at, i.association_id,
                EXISTS (SELECT 1 FROM catalogus_verborgen v
                        WHERE v.association_id = ? AND v.soort = 'instrument' AND v.item_id = i.id) AS verborgen
         FROM instruments i
         WHERE ${alles ? '(i.association_id IS NULL OR i.association_id = ?)' : zichtbaarVoorwaarde('i')}
         ORDER BY i.name, i.tuning`,
      )
      .all(associationId, ...(alles ? [associationId] : zichtbaarParams(associationId, 'instrument')));

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
        standaard: instrument.association_id === null,
        verborgen: !!instrument.verborgen,
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
    // Een eigen instrument voor deze vereniging; een superbeheerder zonder
    // vereniging maakt een standaardinstrument.
    const associationId = req.user!.associationId ?? null;
    if (!associationId && !isSuperbeheerder(req.user!.id)) {
      throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    }

    if (instrumentBezet(req, data.name, tuningValue, clefValue)) {
      throw new ApiError(
        409,
        `Instrument "${data.name}" met stemming "${data.tuning || 'geen'}" en sleutel "${clefValue}" bestaat al.`,
      );
    }

    const instrumentId = uuidv4();

    withTransaction(() => {
      db.prepare('INSERT INTO instruments (id, name, tuning, clef, association_id) VALUES (?, ?, ?, ?, ?)').run(
        instrumentId,
        data.name,
        tuningValue,
        clefValue,
        associationId,
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
      standaard: associationId === null,
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

    beheerbaarInstrument(req, req.params.id);

    // Check name+tuning+clef uniqueness if changed
    const tuningValue = data.tuning || null;
    const clefValue = data.clef || 'sol';
    if (instrumentBezet(req, data.name, tuningValue, clefValue, req.params.id)) {
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
    // Een eigen instrument: wat eraan hangt, hoort bij deze vereniging en gaat
    // mee (ON DELETE). Een standaardinstrument verwijdert alleen de
    // superbeheerder; een vereniging verbergt het.
    const beheerbaar = beheerbaarInstrument(req, req.params.id);
    const instrumentToDelete = db.prepare('SELECT name FROM instruments WHERE id = ?').get(req.params.id) as {
      name: string;
    };

    db.prepare('DELETE FROM instruments WHERE id = ?').run(req.params.id);
    if (beheerbaar.association_id === null) {
      db.prepare("DELETE FROM catalogus_verborgen WHERE soort = 'instrument' AND item_id = ?").run(req.params.id);
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

    beheerbaarInstrument(req, req.params.id);

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
    beheerbaarInstrument(req, req.params.id);
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
/** Een standaardinstrument verbergen of weer tonen, voor deze vereniging. */
function zetVerborgen(verbergen: boolean) {
  return asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Gebruiker heeft geen vereniging.');
    const instrument = catalogusItem('instrument', req.params.id);
    if (!instrument || instrument.association_id !== null) {
      throw new ApiError(404, 'Standaardinstrument niet gevonden.');
    }
    if (verbergen) verberg(associationId, 'instrument', instrument.id);
    else toon(associationId, 'instrument', instrument.id);
    res.json({ id: instrument.id, verborgen: verbergen });
  });
}

router.post(
  '/:id/verbergen',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  zetVerborgen(true),
);
router.delete(
  '/:id/verbergen',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  cacheInvalidator(CACHE_PATH),
  zetVerborgen(false),
);

router.get(
  '/find/:name',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const searchName = req.params.name.toLowerCase();

    // First try exact match on instrument name
    // Alleen wat deze vereniging ziet; eigen instrumenten eerst.
    const zicht = zichtbaarParams(req.user!.associationId, 'instrument');
    let instrument = db
      .prepare(
        `SELECT i.id, i.name, i.tuning
         FROM instruments i
         WHERE LOWER(i.name) = ? AND ${zichtbaarVoorwaarde('i')}
         ORDER BY i.association_id IS NULL`,
      )
      .get(searchName, ...zicht) as any;

    // If not found, try alias
    if (!instrument) {
      const alias = db
        .prepare(
          `
            SELECT i.id, i.name, i.tuning
            FROM instruments i
            JOIN instrument_aliases ia ON i.id = ia.instrument_id
            WHERE LOWER(ia.alias) = ? AND ${zichtbaarVoorwaarde('i')}
            ORDER BY i.association_id IS NULL
        `,
        )
        .get(searchName, ...zicht) as any;

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
