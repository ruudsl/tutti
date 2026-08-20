import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

/**
 * Rollen die een oefenschema mogen inrichten.
 */
const SCHEMABEHEERDERS = ['admin', 'conductor', 'music_committee'];

/**
 * Haal een oefenschema op dat aan de eigen vereniging hangt.
 *
 * Een oefenschema hangt via zijn orkest aan een vereniging. Het overzicht,
 * het bijwerken en het verwijderen legden dat verband wel, maar het toevoegen
 * van een mijlpaal niet - die schreef gewoon op het schema-id uit het pad.
 */
function haalEigenSchema(req: AuthRequest, schemaId: string): any {
  const schema = db
    .prepare(
      `
        SELECT ps.*, o.association_id
        FROM practice_schedules ps
        JOIN orchestras o ON ps.orchestra_id = o.id
        WHERE ps.id = ? AND o.association_id = ?
    `,
    )
    .get(schemaId, req.user!.associationId) as any;

  if (!schema) {
    throw new ApiError(404, 'Oefenschema niet gevonden');
  }

  return schema;
}

/**
 * Haal een mijlpaal op die bij een schema van de eigen vereniging hoort.
 *
 * Bewerken en verwijderen van een mijlpaal keken alleen naar de rol. Elke
 * beheerder, dirigent of commissielid kon daarmee een mijlpaal van een andere
 * vereniging aanpassen of weggooien - het id uit het pad ging rechtstreeks de
 * UPDATE of DELETE in.
 */
function haalEigenMijlpaal(req: AuthRequest, mijlpaalId: string): any {
  const mijlpaal = db
    .prepare(
      `
        SELECT psm.*, ps.orchestra_id
        FROM practice_schedule_milestones psm
        JOIN practice_schedules ps ON psm.schedule_id = ps.id
        JOIN orchestras o ON ps.orchestra_id = o.id
        WHERE psm.id = ? AND o.association_id = ?
    `,
    )
    .get(mijlpaalId, req.user!.associationId) as any;

  if (!mijlpaal) {
    throw new ApiError(404, 'Mijlpaal niet gevonden');
  }

  return mijlpaal;
}

/**
 * @swagger
 * /practice-schedules:
 *   get:
 *     summary: Get practice schedules for an orchestra
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId, musicTitleId, upcoming } = req.query;

    let query = `
        SELECT ps.*,
               mt.title as music_title,
               mt.composer,
               mt.arranger,
               o.name as orchestra_name,
               u.first_name || ' ' || u.last_name as created_by_name,
               (SELECT COUNT(*) FROM practice_schedule_milestones WHERE schedule_id = ps.id) as milestone_count,
               (SELECT COUNT(*) FROM practice_schedule_milestones WHERE schedule_id = ps.id AND is_completed = 1) as completed_milestones
        FROM practice_schedules ps
        JOIN music_titles mt ON ps.music_title_id = mt.id
        JOIN orchestras o ON ps.orchestra_id = o.id
        LEFT JOIN users u ON ps.created_by = u.id
        WHERE o.association_id = ?
    `;
    const params: any[] = [req.user!.associationId];

    if (orchestraId) {
      query += ' AND ps.orchestra_id = ?';
      params.push(orchestraId);
    }
    if (musicTitleId) {
      query += ' AND ps.music_title_id = ?';
      params.push(musicTitleId);
    }
    if (upcoming === 'true') {
      query += ' AND ps.target_date >= date("now")';
    }

    query += ' ORDER BY ps.target_date ASC, ps.priority DESC';

    const schedules = db.prepare(query).all(...params);

    res.json(
      schedules.map((s: any) => ({
        id: s.id,
        targetDate: s.target_date,
        priority: s.priority,
        notes: s.notes,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        musicTitle: {
          id: s.music_title_id,
          title: s.music_title,
          composer: s.composer,
          arranger: s.arranger,
        },
        orchestra: {
          id: s.orchestra_id,
          name: s.orchestra_name,
        },
        createdBy: {
          name: s.created_by_name,
        },
        milestoneCount: s.milestone_count,
        completedMilestones: s.completed_milestones,
        progress: s.milestone_count > 0 ? Math.round((s.completed_milestones / s.milestone_count) * 100) : 0,
      })),
    );
  }),
);

/**
 * @swagger
 * /practice-schedules/{id}:
 *   get:
 *     summary: Get a practice schedule with milestones
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const schedule = db
      .prepare(
        `
        SELECT ps.*,
               mt.title as music_title,
               mt.composer,
               mt.arranger,
               o.name as orchestra_name,
               u.first_name || ' ' || u.last_name as created_by_name
        FROM practice_schedules ps
        JOIN music_titles mt ON ps.music_title_id = mt.id
        JOIN orchestras o ON ps.orchestra_id = o.id
        LEFT JOIN users u ON ps.created_by = u.id
        WHERE ps.id = ? AND o.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!schedule) {
      throw new ApiError(404, 'Oefenschema niet gevonden');
    }

    // Get milestones with section progress
    const milestones = db
      .prepare(
        `
        SELECT psm.*,
               (SELECT COUNT(*) FROM practice_section_progress psp
                WHERE psp.milestone_id = psm.id AND psp.status = 'completed') as sections_completed,
               (SELECT COUNT(*) FROM practice_section_progress psp
                WHERE psp.milestone_id = psm.id) as total_sections
        FROM practice_schedule_milestones psm
        WHERE psm.schedule_id = ?
        ORDER BY psm.sort_order, psm.target_date
    `,
      )
      .all(req.params.id) as any[];

    // Get section progress for each milestone
    const milestonesWithProgress = milestones.map((m) => {
      const sectionProgress = db
        .prepare(
          `
            SELECT psp.*, i.name as instrument_name, i.tuning,
                   u.first_name || ' ' || u.last_name as updated_by_name
            FROM practice_section_progress psp
            JOIN instruments i ON psp.instrument_id = i.id
            LEFT JOIN users u ON psp.updated_by = u.id
            WHERE psp.milestone_id = ?
            ORDER BY i.name
        `,
        )
        .all(m.id) as any[];

      return {
        id: m.id,
        title: m.title,
        description: m.description,
        targetDate: m.target_date,
        isCompleted: !!m.is_completed,
        completedAt: m.completed_at,
        sortOrder: m.sort_order,
        sectionsCompleted: m.sections_completed,
        totalSections: m.total_sections,
        sectionProgress: sectionProgress.map((sp) => ({
          id: sp.id,
          instrument: {
            id: sp.instrument_id,
            name: sp.instrument_name,
            tuning: sp.tuning,
          },
          status: sp.status,
          notes: sp.notes,
          updatedBy: sp.updated_by_name,
          updatedAt: sp.updated_at,
        })),
      };
    });

    res.json({
      id: schedule.id,
      targetDate: schedule.target_date,
      priority: schedule.priority,
      notes: schedule.notes,
      createdAt: schedule.created_at,
      updatedAt: schedule.updated_at,
      musicTitle: {
        id: schedule.music_title_id,
        title: schedule.music_title,
        composer: schedule.composer,
        arranger: schedule.arranger,
      },
      orchestra: {
        id: schedule.orchestra_id,
        name: schedule.orchestra_name,
      },
      createdBy: {
        name: schedule.created_by_name,
      },
      milestones: milestonesWithProgress,
    });
  }),
);

/**
 * @swagger
 * /practice-schedules:
 *   post:
 *     summary: Create a practice schedule
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Only conductors and music committee can create schedules
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, "Geen rechten om oefenschema's aan te maken");
    }

    const { musicTitleId, orchestraId, targetDate, priority, notes, milestones } = req.body;

    if (!musicTitleId || !orchestraId || !targetDate) {
      throw new ApiError(400, 'Muziekstuk, orkest en doeldatum zijn verplicht');
    }

    // Zonder deze twee controles kon een schema worden aangemaakt op het orkest
    // en het muziekstuk van een andere vereniging. Het overzicht filtert op de
    // vereniging van het orkest, dus zo'n schema verscheen daarna in de
    // planning van die andere vereniging.
    const stuk = db
      .prepare('SELECT id FROM music_titles WHERE id = ? AND association_id = ?')
      .get(musicTitleId, req.user!.associationId);

    if (!stuk) {
      throw new ApiError(404, 'Muziekstuk niet gevonden');
    }

    const orkest = db
      .prepare('SELECT id FROM orchestras WHERE id = ? AND association_id = ?')
      .get(orchestraId, req.user!.associationId);

    if (!orkest) {
      throw new ApiError(404, 'Orkest niet gevonden');
    }

    // Check if schedule already exists
    const existing = db
      .prepare(
        `
        SELECT id FROM practice_schedules WHERE music_title_id = ? AND orchestra_id = ?
    `,
      )
      .get(musicTitleId, orchestraId);

    if (existing) {
      throw new ApiError(409, 'Er bestaat al een oefenschema voor dit stuk');
    }

    const id = uuidv4();
    db.prepare(
      `
        INSERT INTO practice_schedules (id, music_title_id, orchestra_id, target_date, priority, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(id, musicTitleId, orchestraId, targetDate, priority || 2, notes || null, req.user!.id);

    // Create milestones if provided
    if (milestones && Array.isArray(milestones)) {
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        db.prepare(
          `
                INSERT INTO practice_schedule_milestones (id, schedule_id, title, description, target_date, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            `,
        ).run(uuidv4(), id, m.title, m.description || null, m.targetDate, i);
      }
    }

    logger.info(`Practice schedule created: ${id} by user ${req.user!.id}`);

    res.status(201).json({
      id,
      message: 'Oefenschema aangemaakt',
    });
  }),
);

/**
 * @swagger
 * /practice-schedules/{id}:
 *   patch:
 *     summary: Update a practice schedule
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, "Geen rechten om oefenschema's te bewerken");
    }

    const schedule = db
      .prepare(
        `
        SELECT ps.* FROM practice_schedules ps
        JOIN orchestras o ON ps.orchestra_id = o.id
        WHERE ps.id = ? AND o.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId);

    if (!schedule) {
      throw new ApiError(404, 'Oefenschema niet gevonden');
    }

    const { targetDate, priority, notes } = req.body;

    const updates: string[] = [];
    const params: any[] = [];

    if (targetDate !== undefined) {
      updates.push('target_date = ?');
      params.push(targetDate);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(req.params.id);
      db.prepare(`UPDATE practice_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Oefenschema bijgewerkt' });
  }),
);

/**
 * @swagger
 * /practice-schedules/{id}:
 *   delete:
 *     summary: Delete a practice schedule
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, "Geen rechten om oefenschema's te verwijderen");
    }

    const schedule = db
      .prepare(
        `
        SELECT ps.* FROM practice_schedules ps
        JOIN orchestras o ON ps.orchestra_id = o.id
        WHERE ps.id = ? AND o.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId);

    if (!schedule) {
      throw new ApiError(404, 'Oefenschema niet gevonden');
    }

    db.prepare('DELETE FROM practice_schedules WHERE id = ?').run(req.params.id);

    res.json({ message: 'Oefenschema verwijderd' });
  }),
);

/**
 * @swagger
 * /practice-schedules/{id}/milestones:
 *   post:
 *     summary: Add a milestone to a schedule
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/:id/milestones',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, 'Geen rechten om mijlpalen toe te voegen');
    }

    const { title, description, targetDate } = req.body;

    if (!title || !targetDate) {
      throw new ApiError(400, 'Titel en doeldatum zijn verplicht');
    }

    haalEigenSchema(req, req.params.id);

    // Get max sort order
    const maxOrder = db
      .prepare(
        `
        SELECT COALESCE(MAX(sort_order), -1) as max_order FROM practice_schedule_milestones WHERE schedule_id = ?
    `,
      )
      .get(req.params.id) as { max_order: number };

    const id = uuidv4();
    db.prepare(
      `
        INSERT INTO practice_schedule_milestones (id, schedule_id, title, description, target_date, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(id, req.params.id, title, description || null, targetDate, maxOrder.max_order + 1);

    res.status(201).json({ id, message: 'Mijlpaal toegevoegd' });
  }),
);

/**
 * @swagger
 * /practice-schedules/milestones/{id}:
 *   patch:
 *     summary: Update a milestone
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.patch(
  '/milestones/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, 'Geen rechten om mijlpalen te bewerken');
    }

    const { title, description, targetDate, isCompleted } = req.body;

    haalEigenMijlpaal(req, req.params.id);

    const updates: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (targetDate !== undefined) {
      updates.push('target_date = ?');
      params.push(targetDate);
    }
    if (isCompleted !== undefined) {
      updates.push('is_completed = ?');
      params.push(isCompleted ? 1 : 0);
      if (isCompleted) {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      } else {
        updates.push('completed_at = NULL');
      }
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE practice_schedule_milestones SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Mijlpaal bijgewerkt' });
  }),
);

/**
 * @swagger
 * /practice-schedules/milestones/{id}:
 *   delete:
 *     summary: Delete a milestone
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/milestones/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, 'Geen rechten om mijlpalen te verwijderen');
    }

    haalEigenMijlpaal(req, req.params.id);

    db.prepare('DELETE FROM practice_schedule_milestones WHERE id = ?').run(req.params.id);

    res.json({ message: 'Mijlpaal verwijderd' });
  }),
);

/**
 * @swagger
 * /practice-schedules/milestones/{id}/section-progress:
 *   post:
 *     summary: Update section progress for a milestone
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/milestones/:id/section-progress',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { instrumentId, status, notes } = req.body;

    if (!instrumentId || !status) {
      throw new ApiError(400, 'Instrument en status zijn verplicht');
    }

    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      throw new ApiError(400, 'Ongeldige status');
    }

    haalEigenMijlpaal(req, req.params.id);

    // Check if user plays this instrument (or is admin/conductor)
    const canUpdate =
      SCHEMABEHEERDERS.includes(req.user!.role) ||
      db
        .prepare(`SELECT 1 FROM user_instruments WHERE user_id = ? AND instrument_id = ?`)
        .get(req.user!.id, instrumentId);

    if (!canUpdate) {
      throw new ApiError(403, 'Geen rechten om deze sectie voortgang bij te werken');
    }

    // Upsert section progress
    const existing = db
      .prepare(
        `
        SELECT id FROM practice_section_progress WHERE milestone_id = ? AND instrument_id = ?
    `,
      )
      .get(req.params.id, instrumentId) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `
            UPDATE practice_section_progress
            SET status = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
      ).run(status, notes || null, req.user!.id, existing.id);
    } else {
      db.prepare(
        `
            INSERT INTO practice_section_progress (id, milestone_id, instrument_id, status, notes, updated_by)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(uuidv4(), req.params.id, instrumentId, status, notes || null, req.user!.id);
    }

    res.json({ message: 'Sectie voortgang bijgewerkt' });
  }),
);

/**
 * @swagger
 * /practice-schedules/{id}/initialize-sections:
 *   post:
 *     summary: Initialize section progress for all milestones with all orchestra instruments
 *     tags: [Practice Schedules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/:id/initialize-sections',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!SCHEMABEHEERDERS.includes(req.user!.role)) {
      throw new ApiError(403, 'Geen rechten');
    }

    const schedule = db
      .prepare(
        `
        SELECT ps.*, o.id as orchestra_id FROM practice_schedules ps
        JOIN orchestras o ON ps.orchestra_id = o.id
        WHERE ps.id = ? AND o.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!schedule) {
      throw new ApiError(404, 'Oefenschema niet gevonden');
    }

    // Get all instruments in this orchestra
    const instruments = db
      .prepare(
        `
        SELECT DISTINCT i.id FROM instruments i
        JOIN user_instruments ui ON ui.instrument_id = i.id
        JOIN user_orchestras uo ON uo.user_id = ui.user_id
        WHERE uo.orchestra_id = ?
    `,
      )
      .all(schedule.orchestra_id) as { id: string }[];

    // Get all milestones
    const milestones = db
      .prepare(
        `
        SELECT id FROM practice_schedule_milestones WHERE schedule_id = ?
    `,
      )
      .all(req.params.id) as { id: string }[];

    let created = 0;
    for (const milestone of milestones) {
      for (const instrument of instruments) {
        const exists = db
          .prepare(
            `
                SELECT 1 FROM practice_section_progress WHERE milestone_id = ? AND instrument_id = ?
            `,
          )
          .get(milestone.id, instrument.id);

        if (!exists) {
          db.prepare(
            `
                    INSERT INTO practice_section_progress (id, milestone_id, instrument_id, status)
                    VALUES (?, ?, ?, 'pending')
                `,
          ).run(uuidv4(), milestone.id, instrument.id);
          created++;
        }
      }
    }

    res.json({ message: `${created} sectie voortgang entries aangemaakt` });
  }),
);

export default router;
