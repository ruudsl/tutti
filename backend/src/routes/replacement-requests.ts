import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import logger from '../logging/logger';

const router = Router();

// Validation schemas
const createRequestSchema = z.object({
  eventType: z.enum(['concert', 'rehearsal']),
  eventId: z.string().uuid(),
  eventDate: z.string(),
  instrumentId: z.string().uuid(),
  positionsNeeded: z.number().min(1).default(1),
  urgency: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  notes: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
});

const updateRequestSchema = z.object({
  positionsNeeded: z.number().min(1).optional(),
  urgency: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  status: z.enum(['open', 'partially_filled', 'filled', 'cancelled']).optional(),
  notes: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
});

const inviteSchema = z.object({
  externalMusicianId: z.string().uuid(),
  notes: z.string().optional().nullable(),
  feeAmount: z.number().optional().nullable(),
});

const updateAssignmentSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'declined', 'completed', 'no_show']),
  notes: z.string().optional().nullable(),
  feeAmount: z.number().optional().nullable(),
});

// GET /api/replacement-requests - List all requests
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { status, eventType, instrumentId, urgency } = req.query;

    let query = `
      SELECT rr.*, i.name as instrument_name, i.tuning as instrument_tuning,
        u.first_name || ' ' || u.last_name as created_by_name,
        (SELECT COUNT(*) FROM replacement_assignments WHERE request_id = rr.id) as assignment_count,
        (SELECT COUNT(*) FROM replacement_assignments WHERE request_id = rr.id AND status = 'confirmed') as confirmed_count,
        CASE
          WHEN rr.event_type = 'concert' THEN (SELECT title FROM concerts WHERE id = rr.event_id)
          WHEN rr.event_type = 'rehearsal' THEN (SELECT location FROM rehearsal_instances WHERE id = rr.event_id)
        END as event_name,
        CASE
          WHEN rr.event_type = 'concert' THEN (SELECT location FROM concerts WHERE id = rr.event_id)
          ELSE NULL
        END as event_location
      FROM replacement_requests rr
      JOIN instruments i ON rr.instrument_id = i.id
      LEFT JOIN users u ON rr.created_by = u.id
      WHERE rr.association_id = ?
    `;
    const params: any[] = [associationId];

    if (status) {
      query += ' AND rr.status = ?';
      params.push(status);
    }

    if (eventType) {
      query += ' AND rr.event_type = ?';
      params.push(eventType);
    }

    if (instrumentId) {
      query += ' AND rr.instrument_id = ?';
      params.push(instrumentId);
    }

    if (urgency) {
      query += ' AND rr.urgency = ?';
      params.push(urgency);
    }

    query += ' ORDER BY rr.event_date ASC, rr.urgency DESC';

    const requests = db.prepare(query).all(...params);

    res.json(requests.map((r: any) => ({
      id: r.id,
      eventType: r.event_type,
      eventId: r.event_id,
      eventDate: r.event_date,
      eventName: r.event_name,
      eventLocation: r.event_location,
      instrumentId: r.instrument_id,
      instrumentName: r.instrument_name,
      instrumentTuning: r.instrument_tuning,
      positionsNeeded: r.positions_needed,
      positionsFilled: r.positions_filled,
      urgency: r.urgency,
      status: r.status,
      notes: r.notes,
      deadline: r.deadline,
      assignmentCount: r.assignment_count,
      confirmedCount: r.confirmed_count,
      createdBy: r.created_by,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })));
  })
);

// GET /api/replacement-requests/suggestions/:eventId - Get suggested musicians based on instrument needs
router.get(
  '/suggestions/:eventId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { eventId } = req.params;
    const { eventType } = req.query;
    const associationId = req.user!.associationId;

    // Get open requests for this event
    const requests = db.prepare(`
      SELECT rr.*, i.name as instrument_name
      FROM replacement_requests rr
      JOIN instruments i ON rr.instrument_id = i.id
      WHERE rr.event_id = ? AND rr.association_id = ? AND rr.status IN ('open', 'partially_filled')
    `).all(eventId, associationId);

    const suggestions = [];

    for (const request of requests as any[]) {
      // Find musicians who play this instrument and haven't been invited yet
      const musicians = db.prepare(`
        SELECT em.*, emi.skill_level, emi.is_primary
        FROM external_musicians em
        JOIN external_musician_instruments emi ON em.id = emi.external_musician_id
        WHERE em.association_id = ?
          AND emi.instrument_id = ?
          AND em.is_active = 1
          AND em.id NOT IN (
            SELECT external_musician_id FROM replacement_assignments
            WHERE request_id = ?
          )
        ORDER BY emi.is_primary DESC, em.rating DESC NULLS LAST, em.total_performances DESC
        LIMIT 10
      `).all(associationId, request.instrument_id, request.id);

      suggestions.push({
        request: {
          id: request.id,
          instrumentId: request.instrument_id,
          instrumentName: request.instrument_name,
          positionsNeeded: request.positions_needed,
          positionsFilled: request.positions_filled,
          urgency: request.urgency,
        },
        suggestedMusicians: musicians.map((m: any) => ({
          id: m.id,
          firstName: m.first_name,
          lastName: m.last_name,
          email: m.email,
          phone: m.phone,
          musicianType: m.musician_type,
          rating: m.rating,
          totalPerformances: m.total_performances,
          lastPlayedDate: m.last_played_date,
          skillLevel: m.skill_level,
          isPrimary: Boolean(m.is_primary),
        })),
      });
    }

    res.json(suggestions);
  })
);

// GET /api/replacement-requests/:id - Get request with assignments
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const request = db.prepare(`
      SELECT rr.*, i.name as instrument_name, i.tuning as instrument_tuning,
        u.first_name || ' ' || u.last_name as created_by_name,
        CASE
          WHEN rr.event_type = 'concert' THEN (SELECT title FROM concerts WHERE id = rr.event_id)
          WHEN rr.event_type = 'rehearsal' THEN (SELECT location FROM rehearsal_instances WHERE id = rr.event_id)
        END as event_name,
        CASE
          WHEN rr.event_type = 'concert' THEN (SELECT location FROM concerts WHERE id = rr.event_id)
          ELSE NULL
        END as event_location
      FROM replacement_requests rr
      JOIN instruments i ON rr.instrument_id = i.id
      LEFT JOIN users u ON rr.created_by = u.id
      WHERE rr.id = ? AND rr.association_id = ?
    `).get(id, associationId) as any;

    if (!request) {
      throw new ApiError(404, 'Verzoek niet gevonden');
    }

    const assignments = db.prepare(`
      SELECT ra.*, em.first_name, em.last_name, em.email, em.phone, em.musician_type, em.rating
      FROM replacement_assignments ra
      JOIN external_musicians em ON ra.external_musician_id = em.id
      WHERE ra.request_id = ?
      ORDER BY ra.invited_at DESC
    `).all(id);

    res.json({
      id: request.id,
      eventType: request.event_type,
      eventId: request.event_id,
      eventDate: request.event_date,
      eventName: request.event_name,
      eventLocation: request.event_location,
      instrumentId: request.instrument_id,
      instrumentName: request.instrument_name,
      instrumentTuning: request.instrument_tuning,
      positionsNeeded: request.positions_needed,
      positionsFilled: request.positions_filled,
      urgency: request.urgency,
      status: request.status,
      notes: request.notes,
      deadline: request.deadline,
      createdBy: request.created_by,
      createdByName: request.created_by_name,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
      assignments: assignments.map((a: any) => ({
        id: a.id,
        externalMusicianId: a.external_musician_id,
        firstName: a.first_name,
        lastName: a.last_name,
        email: a.email,
        phone: a.phone,
        musicianType: a.musician_type,
        rating: a.rating,
        status: a.status,
        invitedAt: a.invited_at,
        respondedAt: a.responded_at,
        feeAmount: a.fee_amount,
        notes: a.notes,
      })),
    });
  })
);

// POST /api/replacement-requests - Create request
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createRequestSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const userId = req.user!.id;

    // Verify event exists
    if (data.eventType === 'concert') {
      const concert = db.prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?').get(data.eventId, associationId);
      if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden');
      }
    } else {
      const rehearsal = db.prepare(`
        SELECT ri.id FROM rehearsal_instances ri
        JOIN rehearsals r ON ri.rehearsal_id = r.id
        WHERE ri.id = ? AND r.association_id = ?
      `).get(data.eventId, associationId);
      if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden');
      }
    }

    // Check for duplicate request
    const existing = db.prepare(`
      SELECT id FROM replacement_requests
      WHERE event_type = ? AND event_id = ? AND instrument_id = ? AND status != 'cancelled'
    `).get(data.eventType, data.eventId, data.instrumentId);

    if (existing) {
      throw new ApiError(409, 'Er bestaat al een verzoek voor dit instrument bij dit evenement');
    }

    const requestId = uuidv4();

    db.prepare(`
      INSERT INTO replacement_requests (
        id, association_id, event_type, event_id, event_date, instrument_id,
        positions_needed, urgency, notes, deadline, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      associationId,
      data.eventType,
      data.eventId,
      data.eventDate,
      data.instrumentId,
      data.positionsNeeded,
      data.urgency,
      data.notes || null,
      data.deadline || null,
      userId
    );

    logger.info(`Replacement request created for ${data.eventType} ${data.eventId}`, {
      requestId,
      instrumentId: data.instrumentId,
      createdBy: userId,
    });

    res.status(201).json({
      id: requestId,
      message: 'Verzoek succesvol aangemaakt',
    });
  })
);

// PUT /api/replacement-requests/:id - Update request
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateRequestSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const request = db.prepare(`
      SELECT id FROM replacement_requests WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!request) {
      throw new ApiError(404, 'Verzoek niet gevonden');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.positionsNeeded !== undefined) {
      updates.push('positions_needed = ?');
      params.push(data.positionsNeeded);
    }
    if (data.urgency !== undefined) {
      updates.push('urgency = ?');
      params.push(data.urgency);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }
    if (data.deadline !== undefined) {
      updates.push('deadline = ?');
      params.push(data.deadline);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      db.prepare(`
        UPDATE replacement_requests SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);
    }

    logger.info(`Replacement request updated: ${id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Verzoek succesvol bijgewerkt' });
  })
);

// DELETE /api/replacement-requests/:id - Cancel request
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const request = db.prepare(`
      SELECT id FROM replacement_requests WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!request) {
      throw new ApiError(404, 'Verzoek niet gevonden');
    }

    db.prepare(`
      UPDATE replacement_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    logger.info(`Replacement request cancelled: ${id}`, { cancelledBy: req.user!.id });

    res.json({ message: 'Verzoek succesvol geannuleerd' });
  })
);

// POST /api/replacement-requests/:id/invite - Invite external musician
router.post(
  '/:id/invite',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = inviteSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const request = db.prepare(`
      SELECT rr.*, i.name as instrument_name
      FROM replacement_requests rr
      JOIN instruments i ON rr.instrument_id = i.id
      WHERE rr.id = ? AND rr.association_id = ?
    `).get(id, associationId) as any;

    if (!request) {
      throw new ApiError(404, 'Verzoek niet gevonden');
    }

    if (request.status === 'filled' || request.status === 'cancelled') {
      throw new ApiError(400, 'Dit verzoek is al gevuld of geannuleerd');
    }

    // Verify musician exists and is active
    const musician = db.prepare(`
      SELECT em.*, emi.id as has_instrument
      FROM external_musicians em
      LEFT JOIN external_musician_instruments emi ON em.id = emi.external_musician_id AND emi.instrument_id = ?
      WHERE em.id = ? AND em.association_id = ? AND em.is_active = 1
    `).get(request.instrument_id, data.externalMusicianId, associationId) as any;

    if (!musician) {
      throw new ApiError(404, 'Muzikant niet gevonden of niet actief');
    }

    // Check if already invited
    const existingAssignment = db.prepare(`
      SELECT id FROM replacement_assignments WHERE request_id = ? AND external_musician_id = ?
    `).get(id, data.externalMusicianId);

    if (existingAssignment) {
      throw new ApiError(409, 'Deze muzikant is al uitgenodigd voor dit verzoek');
    }

    const assignmentId = uuidv4();

    db.prepare(`
      INSERT INTO replacement_assignments (id, request_id, external_musician_id, notes, fee_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      assignmentId,
      id,
      data.externalMusicianId,
      data.notes || null,
      data.feeAmount || null
    );

    logger.info(`External musician invited for replacement`, {
      assignmentId,
      requestId: id,
      musicianId: data.externalMusicianId,
      invitedBy: req.user!.id,
    });

    // TODO: Send email notification to musician
    // This would integrate with the existing notification system
    // For now, we log the invitation

    res.status(201).json({
      id: assignmentId,
      message: 'Muzikant succesvol uitgenodigd',
    });
  })
);

// PUT /api/replacement-requests/:id/assignments/:assignmentId - Update assignment status
router.put(
  '/:id/assignments/:assignmentId',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, assignmentId } = req.params;
    const data = updateAssignmentSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const request = db.prepare(`
      SELECT id FROM replacement_requests WHERE id = ? AND association_id = ?
    `).get(id, associationId);

    if (!request) {
      throw new ApiError(404, 'Verzoek niet gevonden');
    }

    const assignment = db.prepare(`
      SELECT id, status as old_status FROM replacement_assignments WHERE id = ? AND request_id = ?
    `).get(assignmentId, id) as any;

    if (!assignment) {
      throw new ApiError(404, 'Uitnodiging niet gevonden');
    }

    const updateAssignment = db.transaction(() => {
      // Update assignment
      const updates: string[] = ['status = ?'];
      const params: any[] = [data.status];

      if (data.status !== 'pending' && assignment.old_status === 'pending') {
        updates.push('responded_at = CURRENT_TIMESTAMP');
      }

      if (data.notes !== undefined) {
        updates.push('notes = ?');
        params.push(data.notes);
      }

      if (data.feeAmount !== undefined) {
        updates.push('fee_amount = ?');
        params.push(data.feeAmount);
      }

      params.push(assignmentId);

      db.prepare(`
        UPDATE replacement_assignments SET ${updates.join(', ')} WHERE id = ?
      `).run(...params);

      // Update request status based on confirmed assignments
      if (data.status === 'confirmed') {
        const confirmedCount = db.prepare(`
          SELECT COUNT(*) as count FROM replacement_assignments
          WHERE request_id = ? AND status = 'confirmed'
        `).get(id) as any;

        const requestInfo = db.prepare(`
          SELECT positions_needed FROM replacement_requests WHERE id = ?
        `).get(id) as any;

        const newPositionsFilled = confirmedCount.count;
        const newStatus = newPositionsFilled >= requestInfo.positions_needed ? 'filled' : 'partially_filled';

        db.prepare(`
          UPDATE replacement_requests
          SET positions_filled = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newPositionsFilled, newStatus, id);
      }

      // Update musician stats if completed
      if (data.status === 'completed') {
        const musicianId = db.prepare(`
          SELECT external_musician_id FROM replacement_assignments WHERE id = ?
        `).get(assignmentId) as any;

        const eventDate = db.prepare(`
          SELECT event_date FROM replacement_requests WHERE id = ?
        `).get(id) as any;

        db.prepare(`
          UPDATE external_musicians
          SET total_performances = total_performances + 1,
              last_played_date = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(eventDate.event_date, musicianId.external_musician_id);
      }
    });

    updateAssignment();

    logger.info(`Assignment status updated`, {
      assignmentId,
      requestId: id,
      newStatus: data.status,
      updatedBy: req.user!.id,
    });

    res.json({ message: 'Status succesvol bijgewerkt' });
  })
);

export default router;
