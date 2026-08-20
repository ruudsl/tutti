import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError, isUniekheidsfout } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createTourSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  destination: z.string().optional(),
  country: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  projectId: z.string().uuid().optional(),
  budget: z.number().optional(),
  costPerPerson: z.number().optional(),
  maxParticipants: z.number().optional(),
  registrationDeadline: z.string().optional(),
  notes: z.string().optional(),
});

const updateTourSchema = createTourSchema.partial();

const registerParticipantSchema = z.object({
  roomPreference: z.string().optional(),
  dietaryRequirements: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  notes: z.string().optional(),
});

const tourDaySchema = z.object({
  dayDate: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const activitySchema = z.object({
  activityType: z.enum([
    'travel',
    'rehearsal',
    'concert',
    'meal',
    'accommodation',
    'sightseeing',
    'free_time',
    'meeting',
    'other',
  ]),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isMandatory: z.boolean().default(true),
  cost: z.number().optional(),
  notes: z.string().optional(),
});

const accommodationSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  roomCount: z.number().optional(),
  costPerNight: z.number().optional(),
  totalCost: z.number().optional(),
  confirmationNumber: z.string().optional(),
  notes: z.string().optional(),
});

const transportSchema = z.object({
  type: z.enum(['bus', 'train', 'plane', 'ferry', 'car', 'other']),
  departureTime: z.string(),
  arrivalTime: z.string(),
  from: z.string().min(1),
  to: z.string().min(1),
  details: z.string().optional(),
});

// GET /tours - List all tours
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { status, year } = req.query;

    let query = `
      SELECT t.*, p.name as project_name,
        (SELECT COUNT(*) FROM tour_participants WHERE tour_id = t.id) as participant_count,
        (SELECT COUNT(*) FROM tour_days WHERE tour_id = t.id) as day_count
      FROM tours t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.association_id = ? AND t.deleted_at IS NULL
    `;
    const params: any[] = [associationId];

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    if (year) {
      query += ' AND strftime("%Y", t.start_date) = ?';
      params.push(year);
    }

    query += ' ORDER BY t.start_date DESC';

    const tours = db.prepare(query).all(...params);

    res.json(
      tours.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        destination: t.destination,
        country: t.country,
        startDate: t.start_date,
        endDate: t.end_date,
        status: t.status,
        projectId: t.project_id,
        projectName: t.project_name,
        budget: t.budget,
        costPerPerson: t.cost_per_person,
        maxParticipants: t.max_participants,
        registrationDeadline: t.registration_deadline,
        participantCount: t.participant_count,
        dayCount: t.day_count,
        createdAt: t.created_at,
      })),
    );
  }),
);

// GET /tours/:id - Get tour details
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;
    const userId = req.user!.id;

    const tour = db
      .prepare(
        `
      SELECT t.*, p.name as project_name, u.first_name || ' ' || u.last_name as created_by_name
      FROM tours t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ? AND t.association_id = ? AND t.deleted_at IS NULL
    `,
      )
      .get(id, associationId) as any;

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const participants = db
      .prepare(
        `
      SELECT tp.*, u.first_name, u.last_name, u.email
      FROM tour_participants tp
      JOIN users u ON tp.user_id = u.id
      WHERE tp.tour_id = ?
      ORDER BY tp.status, u.last_name
    `,
      )
      .all(id);

    const days = db
      .prepare(
        `
      SELECT * FROM tour_days WHERE tour_id = ? ORDER BY day_date
    `,
      )
      .all(id);

    const dayIds = days.map((d: any) => d.id);
    let activities: any[] = [];
    if (dayIds.length > 0) {
      activities = db
        .prepare(
          `
        SELECT * FROM tour_activities
        WHERE tour_day_id IN (${dayIds.map(() => '?').join(',')})
        ORDER BY sort_order, start_time
      `,
        )
        .all(...dayIds);
    }

    const accommodations = db
      .prepare(
        `
      SELECT * FROM tour_accommodations WHERE tour_id = ? ORDER BY check_in_date
    `,
      )
      .all(id);

    const transport = db
      .prepare(
        `
      SELECT * FROM tour_transport WHERE tour_id = ? ORDER BY departure_time
    `,
      )
      .all(id);

    const myRegistration = db
      .prepare(
        `
      SELECT * FROM tour_participants WHERE tour_id = ? AND user_id = ?
    `,
      )
      .get(id, userId) as any;

    res.json({
      id: tour.id,
      name: tour.name,
      description: tour.description,
      destination: tour.destination,
      country: tour.country,
      startDate: tour.start_date,
      endDate: tour.end_date,
      status: tour.status,
      projectId: tour.project_id,
      projectName: tour.project_name,
      budget: tour.budget,
      costPerPerson: tour.cost_per_person,
      maxParticipants: tour.max_participants,
      registrationDeadline: tour.registration_deadline,
      notes: tour.notes,
      coverImagePath: tour.cover_image_path,
      createdBy: tour.created_by,
      createdByName: tour.created_by_name,
      createdAt: tour.created_at,
      myRegistration: myRegistration
        ? {
            status: myRegistration.status,
            paymentStatus: myRegistration.payment_status,
            paidAmount: myRegistration.paid_amount,
            registrationDate: myRegistration.registration_date,
          }
        : null,
      participants: participants.map((p: any) => ({
        id: p.id,
        userId: p.user_id,
        firstName: p.first_name,
        lastName: p.last_name,
        email: p.email,
        status: p.status,
        paymentStatus: p.payment_status,
        paidAmount: p.paid_amount,
        registrationDate: p.registration_date,
      })),
      days: days.map((d: any) => ({
        id: d.id,
        dayDate: d.day_date,
        dayNumber: d.day_number,
        title: d.title,
        description: d.description,
        activities: activities
          .filter((a: any) => a.tour_day_id === d.id)
          .map((a: any) => ({
            id: a.id,
            activityType: a.activity_type,
            title: a.title,
            description: a.description,
            location: a.location,
            address: a.address,
            startTime: a.start_time,
            endTime: a.end_time,
            isMandatory: a.is_mandatory,
            cost: a.cost,
            notes: a.notes,
            sortOrder: a.sort_order,
          })),
      })),
      accommodations: accommodations.map((a: any) => ({
        id: a.id,
        name: a.name,
        address: a.address,
        city: a.city,
        country: a.country,
        phone: a.phone,
        email: a.email,
        website: a.website,
        checkInDate: a.check_in_date,
        checkOutDate: a.check_out_date,
        roomCount: a.room_count,
        costPerNight: a.cost_per_night,
        totalCost: a.total_cost,
        confirmationNumber: a.confirmation_number,
        notes: a.notes,
      })),
      transport: transport.map((t: any) => ({
        id: t.id,
        transportType: t.transport_type,
        provider: t.provider,
        departureLocation: t.departure_location,
        departureTime: t.departure_time,
        arrivalLocation: t.arrival_location,
        arrivalTime: t.arrival_time,
        vehicleInfo: t.vehicle_info,
        bookingReference: t.booking_reference,
        cost: t.cost,
        notes: t.notes,
      })),
    });
  }),
);

// POST /tours - Create tour
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createTourSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const userId = req.user!.id;
    const id = uuidv4();

    db.prepare(
      `
      INSERT INTO tours (id, association_id, project_id, name, description, destination, country,
        start_date, end_date, budget, cost_per_person, max_participants, registration_deadline, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.projectId || null,
      data.name,
      data.description || null,
      data.destination || null,
      data.country || null,
      data.startDate,
      data.endDate,
      data.budget || null,
      data.costPerPerson || null,
      data.maxParticipants || null,
      data.registrationDeadline || null,
      data.notes || null,
      userId,
    );

    // Create tour days automatically
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    let dayNumber = 1;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayId = uuidv4();
      const dateStr = d.toISOString().split('T')[0];
      db.prepare(
        `
        INSERT INTO tour_days (id, tour_id, day_date, day_number)
        VALUES (?, ?, ?, ?)
      `,
      ).run(dayId, id, dateStr, dayNumber++);
    }

    res.status(201).json({ id, message: 'Tour aangemaakt' });
  }),
);

// PATCH /tours/:id - Update tour
router.patch(
  '/:id',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateTourSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.destination !== undefined) {
      updates.push('destination = ?');
      params.push(data.destination);
    }
    if (data.country !== undefined) {
      updates.push('country = ?');
      params.push(data.country);
    }
    if (data.startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      updates.push('end_date = ?');
      params.push(data.endDate);
    }
    if (data.budget !== undefined) {
      updates.push('budget = ?');
      params.push(data.budget);
    }
    if (data.costPerPerson !== undefined) {
      updates.push('cost_per_person = ?');
      params.push(data.costPerPerson);
    }
    if (data.maxParticipants !== undefined) {
      updates.push('max_participants = ?');
      params.push(data.maxParticipants);
    }
    if (data.registrationDeadline !== undefined) {
      updates.push('registration_deadline = ?');
      params.push(data.registrationDeadline);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      db.prepare(`UPDATE tours SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    }

    res.json({ message: 'Tour bijgewerkt' });
  }),
);

// PATCH /tours/:id/status - Update tour status
router.patch(
  '/:id/status',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const associationId = req.user!.associationId;

    const validStatuses = ['planning', 'confirmed', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, 'Ongeldige status');
    }

    const result = db
      .prepare(
        `
      UPDATE tours SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .run(status, id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    res.json({ message: 'Status bijgewerkt' });
  }),
);

// DELETE /tours/:id - Soft delete tour
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const result = db
      .prepare(
        `
      UPDATE tours SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .run(id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    res.json({ message: 'Tour verwijderd' });
  }),
);

// POST /tours/:id/register - Register for tour
router.post(
  '/:id/register',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = registerParticipantSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const userId = req.user!.id;

    const tour = db
      .prepare(
        `
      SELECT * FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(id, associationId) as any;

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    if (tour.registration_deadline && new Date(tour.registration_deadline) < new Date()) {
      throw new ApiError(400, 'Registratiedeadline is verstreken');
    }

    const currentCount = db
      .prepare(
        'SELECT COUNT(*) as count FROM tour_participants WHERE tour_id = ? AND status IN ("registered", "confirmed")',
      )
      .get(id) as any;

    let status = 'registered';
    if (tour.max_participants && currentCount.count >= tour.max_participants) {
      status = 'waitlist';
    }

    const participantId = uuidv4();
    try {
      db.prepare(
        `
        INSERT INTO tour_participants (id, tour_id, user_id, status, registration_date,
          room_preference, dietary_requirements, emergency_contact, emergency_phone, notes)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
      `,
      ).run(
        participantId,
        id,
        userId,
        status,
        data.roomPreference || null,
        data.dietaryRequirements || null,
        data.emergencyContact || null,
        data.emergencyPhone || null,
        data.notes || null,
      );
    } catch (err: any) {
      if (isUniekheidsfout(err)) {
        throw new ApiError(409, 'Je bent al geregistreerd voor deze tour');
      }
      throw err;
    }

    res.status(201).json({
      id: participantId,
      status,
      message: status === 'waitlist' ? 'Je staat op de wachtlijst' : 'Registratie succesvol',
    });
  }),
);

// DELETE /tours/:id/register - Cancel registration
router.delete(
  '/:id/register',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const result = db
      .prepare(
        `
      UPDATE tour_participants SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE tour_id = ? AND user_id = ?
    `,
      )
      .run(id, userId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Registratie niet gevonden');
    }

    res.json({ message: 'Registratie geannuleerd' });
  }),
);

// POST /tours/:id/days - Add tour day
router.post(
  '/:id/days',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = tourDaySchema.parse(req.body);
    const associationId = req.user!.associationId;

    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const maxDay = db.prepare('SELECT MAX(day_number) as max FROM tour_days WHERE tour_id = ?').get(id) as any;

    const dayId = uuidv4();
    db.prepare(
      `
      INSERT INTO tour_days (id, tour_id, day_date, day_number, title, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(dayId, id, data.dayDate, (maxDay?.max || 0) + 1, data.title || null, data.description || null);

    res.status(201).json({ id: dayId, message: 'Dag toegevoegd' });
  }),
);

// POST /tours/:id/days/:dayId/activities - Add activity
router.post(
  '/:id/days/:dayId/activities',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, dayId } = req.params;
    const data = activitySchema.parse(req.body);
    const associationId = req.user!.associationId;

    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const day = db.prepare('SELECT id FROM tour_days WHERE id = ? AND tour_id = ?').get(dayId, id);
    if (!day) {
      throw new ApiError(404, 'Dag niet gevonden');
    }

    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM tour_activities WHERE tour_day_id = ?')
      .get(dayId) as any;

    const activityId = uuidv4();
    db.prepare(
      `
      INSERT INTO tour_activities (id, tour_day_id, activity_type, title, description, location,
        address, start_time, end_time, is_mandatory, cost, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      activityId,
      dayId,
      data.activityType,
      data.title,
      data.description || null,
      data.location || null,
      data.address || null,
      data.startTime || null,
      data.endTime || null,
      data.isMandatory ? 1 : 0,
      data.cost || null,
      data.notes || null,
      (maxOrder?.max || 0) + 1,
    );

    res.status(201).json({ id: activityId, message: 'Activiteit toegevoegd' });
  }),
);

// POST /tours/:id/accommodations - Add accommodation
router.post(
  '/:id/accommodations',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = accommodationSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const accommodationId = uuidv4();
    db.prepare(
      `
      INSERT INTO tour_accommodations (id, tour_id, name, address, city, country, phone, email,
        website, check_in_date, check_out_date, room_count, cost_per_night, total_cost,
        confirmation_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      accommodationId,
      id,
      data.name,
      data.address || null,
      data.city || null,
      data.country || null,
      data.phone || null,
      data.email || null,
      data.website || null,
      data.checkInDate || null,
      data.checkOutDate || null,
      data.roomCount || null,
      data.costPerNight || null,
      data.totalCost || null,
      data.confirmationNumber || null,
      data.notes || null,
    );

    res.status(201).json({ id: accommodationId, message: 'Accommodatie toegevoegd' });
  }),
);

// DELETE /tours/:id/accommodations/:accId - Remove accommodation
router.delete(
  '/:id/accommodations/:accId',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, accId } = req.params;
    const associationId = req.user!.associationId;

    // Deze route keek alleen naar het id van de tour, niet naar de vereniging.
    // Een beheerder van vereniging A kon zo de accommodatie van een reis van
    // vereniging B verwijderen. Alle andere routes hieronder doen deze
    // controle wel; deze bleef achter.
    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const result = db.prepare('DELETE FROM tour_accommodations WHERE id = ? AND tour_id = ?').run(accId, id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Accommodatie niet gevonden');
    }

    res.json({ message: 'Accommodatie verwijderd' });
  }),
);

// POST /tours/:id/transport - Add transport
router.post(
  '/:id/transport',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = transportSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const transportId = uuidv4();
    db.prepare(
      `
      INSERT INTO tour_transport (id, tour_id, transport_type, departure_location, departure_time,
        arrival_location, arrival_time, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(transportId, id, data.type, data.from, data.departureTime, data.to, data.arrivalTime, data.details || null);

    res.status(201).json({ id: transportId, message: 'Transport toegevoegd' });
  }),
);

// DELETE /tours/:id/transport/:transportId - Remove transport
router.delete(
  '/:id/transport/:transportId',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, transportId } = req.params;
    const associationId = req.user!.associationId;

    // Verify the tour belongs to the user's association
    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const result = db.prepare('DELETE FROM tour_transport WHERE id = ? AND tour_id = ?').run(transportId, id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Transport niet gevonden');
    }

    res.json({ message: 'Transport verwijderd' });
  }),
);

// DELETE /tours/:id/days/:dayId - Delete tour day
router.delete(
  '/:id/days/:dayId',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, dayId } = req.params;
    const associationId = req.user!.associationId;

    // Verify the tour belongs to the user's association
    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    const result = db.prepare('DELETE FROM tour_days WHERE id = ? AND tour_id = ?').run(dayId, id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Dag niet gevonden');
    }

    res.json({ message: 'Dag verwijderd' });
  }),
);

// DELETE /tours/:id/days/:dayId/activities/:activityId - Delete activity from tour day
router.delete(
  '/:id/days/:dayId/activities/:activityId',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, dayId, activityId } = req.params;
    const associationId = req.user!.associationId;

    // Verify the tour belongs to the user's association
    const tour = db
      .prepare('SELECT id FROM tours WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!tour) {
      throw new ApiError(404, 'Tour niet gevonden');
    }

    // Verify the day belongs to the tour
    const day = db.prepare('SELECT id FROM tour_days WHERE id = ? AND tour_id = ?').get(dayId, id);
    if (!day) {
      throw new ApiError(404, 'Dag niet gevonden');
    }

    const result = db.prepare('DELETE FROM tour_activities WHERE id = ? AND tour_day_id = ?').run(activityId, dayId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Activiteit niet gevonden');
    }

    res.json({ message: 'Activiteit verwijderd' });
  }),
);

export default router;
