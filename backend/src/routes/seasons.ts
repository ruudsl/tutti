import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { cacheMiddleware, cacheInvalidator } from '../middleware/cache';
import logger from '../utils/logger';

const router = Router();

// Seasons and season templates change rarely; responses are association-scoped,
// so the cache varies by association (default). The invalidation pattern covers
// both /api/seasons and /api/seasons/templates cache entries.
const CACHE_PATH = '/api/seasons';
const seasonsCache = cacheMiddleware({ ttlSeconds: 600 });

// Roles that can manage seasons
const SEASON_MANAGERS = ['admin', 'music_committee', 'conductor'];

// ========================
// SEASON TEMPLATES
// ========================

/**
 * GET /seasons/templates - List all season templates
 */
router.get(
  '/templates',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  seasonsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const templates = db
      .prepare(
        `
    SELECT st.*, u.first_name || ' ' || u.last_name as created_by_name
    FROM season_templates st
    LEFT JOIN users u ON st.created_by = u.id
    WHERE st.association_id = ?
    ORDER BY st.name
  `,
      )
      .all(req.user!.associationId);

    res.json(
      templates.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        defaultRehearsalDay: t.default_rehearsal_day,
        defaultRehearsalTime: t.default_rehearsal_time,
        defaultRehearsalDuration: t.default_rehearsal_duration,
        defaultRehearsalLocation: t.default_rehearsal_location,
        typicalConcertsCount: t.typical_concerts_count,
        templateData: t.template_data ? JSON.parse(t.template_data) : null,
        createdBy: t.created_by_name,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
    );
  }),
);

/**
 * POST /seasons/templates - Create a season template
 */
router.post(
  '/templates',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      name,
      description,
      defaultRehearsalDay,
      defaultRehearsalTime,
      defaultRehearsalDuration,
      defaultRehearsalLocation,
      typicalConcertsCount,
      templateData,
    } = req.body;

    if (!name) {
      throw new ApiError(400, 'Naam is verplicht.');
    }

    const id = uuidv4();
    db.prepare(
      `
    INSERT INTO season_templates (
      id, association_id, name, description, default_rehearsal_day, default_rehearsal_time,
      default_rehearsal_duration, default_rehearsal_location, typical_concerts_count, template_data, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      req.user!.associationId,
      name,
      description || null,
      defaultRehearsalDay ?? null,
      defaultRehearsalTime || null,
      defaultRehearsalDuration || 120,
      defaultRehearsalLocation || null,
      typicalConcertsCount || 4,
      templateData ? JSON.stringify(templateData) : null,
      req.user!.id,
    );

    logger.info('Season template created', { id, name, associationId: req.user!.associationId });

    res.status(201).json({ id, message: 'Seizoenstemplate aangemaakt.' });
  }),
);

/**
 * PUT /seasons/templates/:id - Update a season template
 */
router.put(
  '/templates/:id',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      name,
      description,
      defaultRehearsalDay,
      defaultRehearsalTime,
      defaultRehearsalDuration,
      defaultRehearsalLocation,
      typicalConcertsCount,
      templateData,
    } = req.body;

    const existing = db
      .prepare('SELECT id FROM season_templates WHERE id = ? AND association_id = ?')
      .get(id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Seizoenstemplate niet gevonden.');
    }

    db.prepare(
      `
    UPDATE season_templates SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      default_rehearsal_day = COALESCE(?, default_rehearsal_day),
      default_rehearsal_time = COALESCE(?, default_rehearsal_time),
      default_rehearsal_duration = COALESCE(?, default_rehearsal_duration),
      default_rehearsal_location = COALESCE(?, default_rehearsal_location),
      typical_concerts_count = COALESCE(?, typical_concerts_count),
      template_data = COALESCE(?, template_data),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
    ).run(
      name ?? null,
      description ?? null,
      defaultRehearsalDay ?? null,
      defaultRehearsalTime ?? null,
      defaultRehearsalDuration ?? null,
      defaultRehearsalLocation ?? null,
      typicalConcertsCount ?? null,
      templateData ? JSON.stringify(templateData) : null,
      id,
    );

    res.json({ message: 'Seizoenstemplate bijgewerkt.' });
  }),
);

/**
 * DELETE /seasons/templates/:id - Delete a season template
 */
router.delete(
  '/templates/:id',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const result = db
      .prepare('DELETE FROM season_templates WHERE id = ? AND association_id = ?')
      .run(id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Seizoenstemplate niet gevonden.');
    }

    res.json({ message: 'Seizoenstemplate verwijderd.' });
  }),
);

// ========================
// SEASONS
// ========================

/**
 * GET /seasons - List all seasons for association
 */
router.get(
  '/',
  authenticateToken,
  seasonsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status } = req.query;

    let sql = `
    SELECT s.*, st.name as template_name, u.first_name || ' ' || u.last_name as created_by_name,
      (SELECT COUNT(*) FROM season_events se WHERE se.season_id = s.id) as event_count,
      (SELECT COUNT(*) FROM season_events se WHERE se.season_id = s.id AND se.event_type = 'concert') as concert_count,
      (SELECT COUNT(*) FROM season_events se WHERE se.season_id = s.id AND se.event_type = 'rehearsal') as rehearsal_count
    FROM seasons s
    LEFT JOIN season_templates st ON s.template_id = st.id
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.association_id = ?
  `;
    const params: any[] = [req.user!.associationId];

    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY s.start_date DESC';

    const seasons = db.prepare(sql).all(...params);

    res.json(
      seasons.map((s: any) => ({
        id: s.id,
        name: s.name,
        startDate: s.start_date,
        endDate: s.end_date,
        templateId: s.template_id,
        templateName: s.template_name,
        status: s.status,
        budgetTotal: s.budget_total,
        budgetAllocated: s.budget_allocated,
        notes: s.notes,
        eventCount: s.event_count,
        concertCount: s.concert_count,
        rehearsalCount: s.rehearsal_count,
        createdBy: s.created_by_name,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    );
  }),
);

/**
 * GET /seasons/:id - Get a single season with events
 */
router.get(
  '/:id',
  authenticateToken,
  seasonsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const season = db
      .prepare(
        `
    SELECT s.*, st.name as template_name, u.first_name || ' ' || u.last_name as created_by_name
    FROM seasons s
    LEFT JOIN season_templates st ON s.template_id = st.id
    LEFT JOIN users u ON s.created_by = u.id
    WHERE s.id = ? AND s.association_id = ?
  `,
      )
      .get(id, req.user!.associationId) as any;

    if (!season) {
      throw new ApiError(404, 'Seizoen niet gevonden.');
    }

    // Get events
    const events = db
      .prepare(
        `
    SELECT se.*,
      CASE
        WHEN se.event_type = 'concert' THEN (SELECT name FROM concerts WHERE id = se.event_id)
        WHEN se.event_type = 'rehearsal' THEN (SELECT location FROM rehearsals WHERE id = se.event_id)
        ELSE NULL
      END as event_name
    FROM season_events se
    WHERE se.season_id = ?
    ORDER BY se.planned_date
  `,
      )
      .all(id);

    res.json({
      id: season.id,
      name: season.name,
      startDate: season.start_date,
      endDate: season.end_date,
      templateId: season.template_id,
      templateName: season.template_name,
      status: season.status,
      budgetTotal: season.budget_total,
      budgetAllocated: season.budget_allocated,
      notes: season.notes,
      createdBy: season.created_by_name,
      createdAt: season.created_at,
      updatedAt: season.updated_at,
      events: events.map((e: any) => ({
        id: e.id,
        eventType: e.event_type,
        eventId: e.event_id,
        eventName: e.event_name,
        plannedDate: e.planned_date,
        budgetAmount: e.budget_amount,
        notes: e.notes,
        createdAt: e.created_at,
      })),
    });
  }),
);

/**
 * POST /seasons - Create a new season
 */
router.post(
  '/',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, startDate, endDate, templateId, budgetTotal, notes } = req.body;

    if (!name || !startDate || !endDate) {
      throw new ApiError(400, 'Naam, startdatum en einddatum zijn verplicht.');
    }

    // Validate template if provided
    if (templateId) {
      const template = db
        .prepare('SELECT id FROM season_templates WHERE id = ? AND association_id = ?')
        .get(templateId, req.user!.associationId);
      if (!template) {
        throw new ApiError(400, 'Ongeldig template ID.');
      }
    }

    const id = uuidv4();
    db.prepare(
      `
    INSERT INTO seasons (id, association_id, name, start_date, end_date, template_id, budget_total, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      id,
      req.user!.associationId,
      name,
      startDate,
      endDate,
      templateId || null,
      budgetTotal || null,
      notes || null,
      req.user!.id,
    );

    logger.info('Season created', { id, name, associationId: req.user!.associationId });

    res.status(201).json({ id, message: 'Seizoen aangemaakt.' });
  }),
);

/**
 * PUT /seasons/:id - Update a season
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, startDate, endDate, templateId, status, budgetTotal, budgetAllocated, notes } = req.body;

    const existing = db
      .prepare('SELECT id FROM seasons WHERE id = ? AND association_id = ?')
      .get(id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Seizoen niet gevonden.');
    }

    // Validate status
    const validStatuses = ['draft', 'active', 'completed'];
    if (status && !validStatuses.includes(status)) {
      throw new ApiError(400, 'Ongeldige status. Gebruik draft, active of completed.');
    }

    db.prepare(
      `
    UPDATE seasons SET
      name = COALESCE(?, name),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      template_id = COALESCE(?, template_id),
      status = COALESCE(?, status),
      budget_total = COALESCE(?, budget_total),
      budget_allocated = COALESCE(?, budget_allocated),
      notes = COALESCE(?, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
    ).run(
      name ?? null,
      startDate ?? null,
      endDate ?? null,
      templateId ?? null,
      status ?? null,
      budgetTotal ?? null,
      budgetAllocated ?? null,
      notes ?? null,
      id,
    );

    res.json({ message: 'Seizoen bijgewerkt.' });
  }),
);

/**
 * DELETE /seasons/:id - Delete a season
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const result = db
      .prepare('DELETE FROM seasons WHERE id = ? AND association_id = ?')
      .run(id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Seizoen niet gevonden.');
    }

    res.json({ message: 'Seizoen verwijderd.' });
  }),
);

/**
 * POST /seasons/:id/events - Add an event to a season
 */
router.post(
  '/:id/events',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { eventType, eventId, plannedDate, budgetAmount, notes } = req.body;

    const season = db
      .prepare('SELECT id FROM seasons WHERE id = ? AND association_id = ?')
      .get(id, req.user!.associationId);

    if (!season) {
      throw new ApiError(404, 'Seizoen niet gevonden.');
    }

    if (!eventType || !plannedDate) {
      throw new ApiError(400, 'Event type en geplande datum zijn verplicht.');
    }

    const validTypes = ['concert', 'rehearsal', 'other'];
    if (!validTypes.includes(eventType)) {
      throw new ApiError(400, 'Ongeldig event type. Gebruik concert, rehearsal of other.');
    }

    const eventRowId = uuidv4();
    db.prepare(
      `
    INSERT INTO season_events (id, season_id, event_type, event_id, planned_date, budget_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(eventRowId, id, eventType, eventId || null, plannedDate, budgetAmount || null, notes || null);

    // Update budget_allocated on season
    if (budgetAmount) {
      db.prepare(
        `
      UPDATE seasons SET budget_allocated = COALESCE(budget_allocated, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
      ).run(budgetAmount, id);
    }

    res.status(201).json({ id: eventRowId, message: 'Event toegevoegd aan seizoen.' });
  }),
);

/**
 * DELETE /seasons/:id/events/:eventId - Remove an event from a season
 */
router.delete(
  '/:id/events/:eventId',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, eventId } = req.params;

    // Verify season belongs to association
    const season = db
      .prepare('SELECT id FROM seasons WHERE id = ? AND association_id = ?')
      .get(id, req.user!.associationId);

    if (!season) {
      throw new ApiError(404, 'Seizoen niet gevonden.');
    }

    // Get event budget to update season
    const event = db
      .prepare('SELECT budget_amount FROM season_events WHERE id = ? AND season_id = ?')
      .get(eventId, id) as any;

    if (!event) {
      throw new ApiError(404, 'Event niet gevonden.');
    }

    db.prepare('DELETE FROM season_events WHERE id = ?').run(eventId);

    // Update budget_allocated
    if (event.budget_amount) {
      db.prepare(
        `
      UPDATE seasons SET budget_allocated = COALESCE(budget_allocated, 0) - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
      ).run(event.budget_amount, id);
    }

    res.json({ message: 'Event verwijderd uit seizoen.' });
  }),
);

/**
 * POST /seasons/:id/generate - Generate rehearsals/concerts from template settings
 */
router.post(
  '/:id/generate',
  authenticateToken,
  requireRole(...SEASON_MANAGERS),
  cacheInvalidator(CACHE_PATH),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const {
      rehearsalDay,
      rehearsalTime,
      rehearsalEndTime,
      rehearsalLocation,
      orchestraId,
      concerts,
      excludeDates,
      generateRehearsals = true,
      generateConcerts = true,
    } = req.body;

    // Get season
    const season = db
      .prepare(
        `
    SELECT s.*, st.default_rehearsal_day, st.default_rehearsal_time, st.default_rehearsal_duration, st.default_rehearsal_location
    FROM seasons s
    LEFT JOIN season_templates st ON s.template_id = st.id
    WHERE s.id = ? AND s.association_id = ?
  `,
      )
      .get(id, req.user!.associationId) as any;

    if (!season) {
      throw new ApiError(404, 'Seizoen niet gevonden.');
    }

    const createdRehearsals: string[] = [];
    const createdConcerts: string[] = [];
    const createdEvents: string[] = [];

    const excludeSet = new Set(excludeDates || []);

    // Generate rehearsals
    if (generateRehearsals) {
      const day = rehearsalDay ?? season.default_rehearsal_day;
      const time = rehearsalTime || season.default_rehearsal_time || '19:30';
      const duration = season.default_rehearsal_duration || 120;
      const endTimeCalc = rehearsalEndTime || calculateEndTime(time, duration);
      const location = rehearsalLocation || season.default_rehearsal_location;

      if (day !== null && day !== undefined) {
        const start = new Date(season.start_date);
        const end = new Date(season.end_date);

        // Find first occurrence of the day
        const current = new Date(start);
        while (current.getDay() !== day && current <= end) {
          current.setDate(current.getDate() + 1);
        }

        // Get existing rehearsals to avoid duplicates
        const existingRehearsals = db
          .prepare(
            `
        SELECT date FROM rehearsals WHERE association_id = ? AND date >= ? AND date <= ?
      `,
          )
          .all(req.user!.associationId, season.start_date, season.end_date) as { date: string }[];
        const existingSet = new Set(existingRehearsals.map((r) => r.date));

        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];

          if (!existingSet.has(dateStr) && !excludeSet.has(dateStr)) {
            const rehearsalId = uuidv4();
            db.prepare(
              `
            INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'regular', ?)
          `,
            ).run(
              rehearsalId,
              req.user!.associationId,
              orchestraId || null,
              dateStr,
              time,
              endTimeCalc,
              location || null,
              req.user!.id,
            );

            // Add to season_events
            const eventId = uuidv4();
            db.prepare(
              `
            INSERT INTO season_events (id, season_id, event_type, event_id, planned_date)
            VALUES (?, ?, 'rehearsal', ?, ?)
          `,
            ).run(eventId, id, rehearsalId, dateStr);

            createdRehearsals.push(dateStr);
            createdEvents.push(eventId);
          }

          current.setDate(current.getDate() + 7);
        }
      }
    }

    // Generate concerts
    if (generateConcerts && concerts && Array.isArray(concerts)) {
      for (const concert of concerts) {
        if (!concert.name || !concert.date) continue;
        if (excludeSet.has(concert.date)) continue;

        const concertId = uuidv4();
        db.prepare(
          `
        INSERT INTO concerts (id, association_id, name, date, location, concert_type, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        ).run(
          concertId,
          req.user!.associationId,
          concert.name,
          concert.date,
          concert.location || null,
          concert.type || null,
          req.user!.id,
        );

        // Add to season_events
        const eventId = uuidv4();
        db.prepare(
          `
        INSERT INTO season_events (id, season_id, event_type, event_id, planned_date, budget_amount)
        VALUES (?, ?, 'concert', ?, ?, ?)
      `,
        ).run(eventId, id, concertId, concert.date, concert.budgetAmount || null);

        if (concert.budgetAmount) {
          db.prepare(
            `
          UPDATE seasons SET budget_allocated = COALESCE(budget_allocated, 0) + ? WHERE id = ?
        `,
          ).run(concert.budgetAmount, id);
        }

        createdConcerts.push(concert.name);
        createdEvents.push(eventId);
      }
    }

    logger.info('Season events generated', {
      seasonId: id,
      rehearsalCount: createdRehearsals.length,
      concertCount: createdConcerts.length,
      associationId: req.user!.associationId,
    });

    res.json({
      message: `Seizoen evenementen gegenereerd: ${createdRehearsals.length} repetities, ${createdConcerts.length} concerten.`,
      rehearsalCount: createdRehearsals.length,
      concertCount: createdConcerts.length,
      rehearsalDates: createdRehearsals,
      concertNames: createdConcerts,
    });
  }),
);

/**
 * Helper function to calculate end time from start time and duration
 */
function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
}

export default router;
