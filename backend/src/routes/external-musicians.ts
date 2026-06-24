import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import logger from '../logging/logger';

const router = Router();

// Validation schemas
const createExternalMusicianSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht'),
  lastName: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  musicianType: z.enum(['alumni', 'guest', 'substitute', 'friend']),
  notes: z.string().optional().nullable(),
  rating: z.number().min(1).max(5).optional().nullable(),
  instruments: z.array(z.object({
    instrumentId: z.string().uuid(),
    skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional().nullable(),
    isPrimary: z.boolean().optional(),
  })).optional(),
});

const updateExternalMusicianSchema = createExternalMusicianSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const addInstrumentSchema = z.object({
  instrumentId: z.string().uuid(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'professional']).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

// GET /api/external-musicians - List all external musicians
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { type, instrumentId, isActive, search } = req.query;

    let query = `
      SELECT em.*,
        (SELECT GROUP_CONCAT(i.name, ', ')
         FROM external_musician_instruments emi
         JOIN instruments i ON emi.instrument_id = i.id
         WHERE emi.external_musician_id = em.id) as instrument_names,
        u.first_name || ' ' || u.last_name as created_by_name
      FROM external_musicians em
      LEFT JOIN users u ON em.created_by = u.id
      WHERE em.association_id = ?
    `;
    const params: any[] = [associationId];

    if (type) {
      query += ' AND em.musician_type = ?';
      params.push(type);
    }

    if (instrumentId) {
      query += ` AND em.id IN (
        SELECT external_musician_id FROM external_musician_instruments WHERE instrument_id = ?
      )`;
      params.push(instrumentId);
    }

    if (isActive !== undefined) {
      query += ' AND em.is_active = ?';
      params.push(isActive === 'true' ? 1 : 0);
    }

    if (search) {
      query += ` AND (
        LOWER(em.first_name) LIKE LOWER(?) OR
        LOWER(em.last_name) LIKE LOWER(?) OR
        LOWER(em.email) LIKE LOWER(?)
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY em.last_name, em.first_name';

    const musicians = db.prepare(query).all(...params);

    res.json(musicians.map((m: any) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      email: m.email,
      phone: m.phone,
      musicianType: m.musician_type,
      notes: m.notes,
      isActive: Boolean(m.is_active),
      rating: m.rating,
      lastPlayedDate: m.last_played_date,
      totalPerformances: m.total_performances,
      instrumentNames: m.instrument_names,
      createdBy: m.created_by,
      createdByName: m.created_by_name,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })));
  })
);

// GET /api/external-musicians/search - Search by instrument
router.get(
  '/search',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { instrument, skillLevel, activeOnly } = req.query;

    if (!instrument) {
      throw new ApiError(400, 'Instrument parameter is verplicht');
    }

    let query = `
      SELECT em.*, emi.skill_level, emi.is_primary,
        i.name as instrument_name, i.tuning as instrument_tuning
      FROM external_musicians em
      JOIN external_musician_instruments emi ON em.id = emi.external_musician_id
      JOIN instruments i ON emi.instrument_id = i.id
      WHERE em.association_id = ?
        AND emi.instrument_id = ?
    `;
    const params: any[] = [associationId, instrument];

    if (skillLevel) {
      query += ' AND emi.skill_level = ?';
      params.push(skillLevel);
    }

    if (activeOnly === 'true') {
      query += ' AND em.is_active = 1';
    }

    query += ' ORDER BY emi.is_primary DESC, em.rating DESC NULLS LAST, em.total_performances DESC';

    const musicians = db.prepare(query).all(...params);

    res.json(musicians.map((m: any) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      email: m.email,
      phone: m.phone,
      musicianType: m.musician_type,
      notes: m.notes,
      isActive: Boolean(m.is_active),
      rating: m.rating,
      lastPlayedDate: m.last_played_date,
      totalPerformances: m.total_performances,
      skillLevel: m.skill_level,
      isPrimary: Boolean(m.is_primary),
      instrumentName: m.instrument_name,
      instrumentTuning: m.instrument_tuning,
      createdAt: m.created_at,
    })));
  })
);

// GET /api/external-musicians/:id - Get single musician with instruments
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const musician = db.prepare(`
      SELECT em.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM external_musicians em
      LEFT JOIN users u ON em.created_by = u.id
      WHERE em.id = ? AND em.association_id = ?
    `).get(id, associationId) as any;

    if (!musician) {
      throw new ApiError(404, 'Muzikant niet gevonden');
    }

    const instruments = db.prepare(`
      SELECT emi.*, i.name as instrument_name, i.tuning as instrument_tuning
      FROM external_musician_instruments emi
      JOIN instruments i ON emi.instrument_id = i.id
      WHERE emi.external_musician_id = ?
      ORDER BY emi.is_primary DESC, i.name
    `).all(id);

    // Get recent assignments
    const recentAssignments = db.prepare(`
      SELECT ra.*, rr.event_type, rr.event_date, i.name as instrument_name,
        CASE
          WHEN rr.event_type = 'concert' THEN (SELECT title FROM concerts WHERE id = rr.event_id)
          WHEN rr.event_type = 'rehearsal' THEN (SELECT location FROM rehearsal_instances WHERE id = rr.event_id)
        END as event_name
      FROM replacement_assignments ra
      JOIN replacement_requests rr ON ra.request_id = rr.id
      JOIN instruments i ON rr.instrument_id = i.id
      WHERE ra.external_musician_id = ?
      ORDER BY rr.event_date DESC
      LIMIT 10
    `).all(id);

    res.json({
      id: musician.id,
      firstName: musician.first_name,
      lastName: musician.last_name,
      email: musician.email,
      phone: musician.phone,
      musicianType: musician.musician_type,
      notes: musician.notes,
      isActive: Boolean(musician.is_active),
      rating: musician.rating,
      lastPlayedDate: musician.last_played_date,
      totalPerformances: musician.total_performances,
      createdBy: musician.created_by,
      createdByName: musician.created_by_name,
      createdAt: musician.created_at,
      updatedAt: musician.updated_at,
      instruments: instruments.map((i: any) => ({
        id: i.id,
        instrumentId: i.instrument_id,
        instrumentName: i.instrument_name,
        instrumentTuning: i.instrument_tuning,
        skillLevel: i.skill_level,
        isPrimary: Boolean(i.is_primary),
      })),
      recentAssignments: recentAssignments.map((a: any) => ({
        id: a.id,
        eventType: a.event_type,
        eventDate: a.event_date,
        eventName: a.event_name,
        instrumentName: a.instrument_name,
        status: a.status,
        feeAmount: a.fee_amount,
      })),
    });
  })
);

// POST /api/external-musicians - Add new external musician
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createExternalMusicianSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const userId = req.user!.id;

    const musicianId = uuidv4();

    const insertMusician = db.transaction(() => {
      db.prepare(`
        INSERT INTO external_musicians (
          id, association_id, first_name, last_name, email, phone,
          musician_type, notes, rating, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        musicianId,
        associationId,
        data.firstName,
        data.lastName,
        data.email || null,
        data.phone || null,
        data.musicianType,
        data.notes || null,
        data.rating || null,
        userId
      );

      // Add instruments if provided
      if (data.instruments && data.instruments.length > 0) {
        const insertInstrument = db.prepare(`
          INSERT INTO external_musician_instruments (id, external_musician_id, instrument_id, skill_level, is_primary)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const instrument of data.instruments) {
          insertInstrument.run(
            uuidv4(),
            musicianId,
            instrument.instrumentId,
            instrument.skillLevel || null,
            instrument.isPrimary ? 1 : 0
          );
        }
      }
    });

    insertMusician();

    logger.info(`External musician created: ${data.firstName} ${data.lastName}`, {
      musicianId,
      createdBy: userId,
    });

    res.status(201).json({
      id: musicianId,
      message: 'Externe muzikant succesvol toegevoegd',
    });
  })
);

// PUT /api/external-musicians/:id - Update musician
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateExternalMusicianSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const musician = db.prepare(`
      SELECT id FROM external_musicians WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!musician) {
      throw new ApiError(404, 'Muzikant niet gevonden');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.firstName !== undefined) {
      updates.push('first_name = ?');
      params.push(data.firstName);
    }
    if (data.lastName !== undefined) {
      updates.push('last_name = ?');
      params.push(data.lastName);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      params.push(data.phone);
    }
    if (data.musicianType !== undefined) {
      updates.push('musician_type = ?');
      params.push(data.musicianType);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    if (data.rating !== undefined) {
      updates.push('rating = ?');
      params.push(data.rating);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(data.isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`
        UPDATE external_musicians SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    // Update instruments if provided
    if (data.instruments !== undefined) {
      const updateInstruments = db.transaction(() => {
        // Remove existing instruments
        db.prepare('DELETE FROM external_musician_instruments WHERE external_musician_id = ?').run(id);

        // Add new instruments
        if (data.instruments && data.instruments.length > 0) {
          const insertInstrument = db.prepare(`
            INSERT INTO external_musician_instruments (id, external_musician_id, instrument_id, skill_level, is_primary)
            VALUES (?, ?, ?, ?, ?)
          `);

          for (const instrument of data.instruments) {
            insertInstrument.run(
              uuidv4(),
              id,
              instrument.instrumentId,
              instrument.skillLevel || null,
              instrument.isPrimary ? 1 : 0
            );
          }
        }
      });

      updateInstruments();
    }

    logger.info(`External musician updated: ${id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Externe muzikant succesvol bijgewerkt' });
  })
);

// DELETE /api/external-musicians/:id - Soft delete musician
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const musician = db.prepare(`
      SELECT id FROM external_musicians WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!musician) {
      throw new ApiError(404, 'Muzikant niet gevonden');
    }

    // Soft delete by setting is_active to false
    db.prepare(`
      UPDATE external_musicians SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    logger.info(`External musician deactivated: ${id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Externe muzikant succesvol gedeactiveerd' });
  })
);

// POST /api/external-musicians/:id/instruments - Add instrument to musician
router.post(
  '/:id/instruments',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = addInstrumentSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const musician = db.prepare(`
      SELECT id FROM external_musicians WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!musician) {
      throw new ApiError(404, 'Muzikant niet gevonden');
    }

    // Check if instrument already exists for this musician
    const existing = db.prepare(`
      SELECT id FROM external_musician_instruments
      WHERE external_musician_id = ? AND instrument_id = ?
    `).get(id, data.instrumentId);

    if (existing) {
      throw new ApiError(409, 'Instrument is al toegevoegd aan deze muzikant');
    }

    const instrumentLinkId = uuidv4();
    db.prepare(`
      INSERT INTO external_musician_instruments (id, external_musician_id, instrument_id, skill_level, is_primary)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      instrumentLinkId,
      id,
      data.instrumentId,
      data.skillLevel || null,
      data.isPrimary ? 1 : 0
    );

    res.status(201).json({
      id: instrumentLinkId,
      message: 'Instrument succesvol toegevoegd',
    });
  })
);

// DELETE /api/external-musicians/:id/instruments/:instrumentId - Remove instrument
router.delete(
  '/:id/instruments/:instrumentId',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, instrumentId } = req.params;
    const associationId = req.user!.associationId;

    const musician = db.prepare(`
      SELECT id FROM external_musicians WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!musician) {
      throw new ApiError(404, 'Muzikant niet gevonden');
    }

    const result = db.prepare(`
      DELETE FROM external_musician_instruments
      WHERE external_musician_id = ? AND instrument_id = ?
    `).run(id, instrumentId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Instrument niet gevonden bij deze muzikant');
    }

    res.json({ message: 'Instrument succesvol verwijderd' });
  })
);

export default router;
