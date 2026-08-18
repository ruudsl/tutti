import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const createResourceSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  resourceType: z.enum(['room', 'vehicle', 'equipment', 'instrument', 'service', 'other']),
  categoryId: z.string().uuid().optional(),
  location: z.string().optional(),
  capacity: z.number().optional(),
  requiresApproval: z.boolean().default(false),
  minBookingHours: z.number().optional(),
  maxBookingHours: z.number().optional(),
  advanceBookingDays: z.number().optional(),
  costPerHour: z.number().optional(),
  costPerDay: z.number().optional(),
  depositAmount: z.number().optional(),
  notes: z.string().optional(),
});

const updateResourceSchema = createResourceSchema.partial();

const createBookingSchema = z.object({
  resourceId: z.string().uuid(),
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  startDatetime: z.string(),
  endDatetime: z.string(),
  relatedRehearsalId: z.string().uuid().optional(),
  relatedConcertId: z.string().uuid().optional(),
  relatedProjectId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const availabilitySchema = z.object({
  availabilityType: z.enum(['available', 'blocked', 'maintenance']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reason: z.string().optional(),
});

// =====================================================
// RESOURCE CATEGORIES
// =====================================================

// GET /resources/categories - List categories
router.get(
  '/categories',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const categories = db
      .prepare(
        `
      SELECT rc.*, (SELECT COUNT(*) FROM resources WHERE category_id = rc.id) as resource_count
      FROM resource_categories rc
      WHERE rc.association_id = ?
      ORDER BY rc.sort_order, rc.name
    `,
      )
      .all(associationId);

    res.json(
      categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        color: c.color,
        icon: c.icon,
        sortOrder: c.sort_order,
        resourceCount: c.resource_count,
      })),
    );
  }),
);

// POST /resources/categories - Create category
router.post(
  '/categories',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createCategorySchema.parse(req.body);
    const associationId = req.user!.associationId;
    const id = uuidv4();

    try {
      db.prepare(
        `
        INSERT INTO resource_categories (id, association_id, name, description, color, icon)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(id, associationId, data.name, data.description || null, data.color || null, data.icon || null);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new ApiError(400, 'Categorie met deze naam bestaat al');
      }
      throw err;
    }

    res.status(201).json({ id, message: 'Categorie aangemaakt' });
  }),
);

// DELETE /resources/categories/:id - Delete category
router.delete(
  '/categories/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const result = db
      .prepare('DELETE FROM resource_categories WHERE id = ? AND association_id = ?')
      .run(id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Categorie niet gevonden');
    }

    res.json({ message: 'Categorie verwijderd' });
  }),
);

// =====================================================
// RESOURCES
// =====================================================

// GET /resources - List all resources
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { type, categoryId, active } = req.query;

    let query = `
      SELECT r.*, rc.name as category_name, rc.color as category_color
      FROM resources r
      LEFT JOIN resource_categories rc ON r.category_id = rc.id
      WHERE r.association_id = ? AND r.deleted_at IS NULL
    `;
    const params: any[] = [associationId];

    if (type) {
      query += ' AND r.resource_type = ?';
      params.push(type);
    }
    if (categoryId) {
      query += ' AND r.category_id = ?';
      params.push(categoryId);
    }
    if (active !== undefined) {
      query += ' AND r.is_active = ?';
      params.push(active === 'true' ? 1 : 0);
    }

    query += ' ORDER BY r.name';

    const resources = db.prepare(query).all(...params);

    res.json(
      resources.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        resourceType: r.resource_type,
        categoryId: r.category_id,
        categoryName: r.category_name,
        categoryColor: r.category_color,
        location: r.location,
        capacity: r.capacity,
        isActive: r.is_active === 1,
        requiresApproval: r.requires_approval === 1,
        costPerHour: r.cost_per_hour,
        costPerDay: r.cost_per_day,
        imagePath: r.image_path,
      })),
    );
  }),
);

// LET OP: deze letterlijke routes staan bewust boven /:id.
// Express matcht in registratievolgorde, dus met /:id ervoor kwam een
// verzoek hier terecht bij de :id-handler en antwoordde die 404.

// GET /resources/bookings - List all bookings
router.get(
  '/bookings',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { resourceId, status, startDate, endDate, myBookings } = req.query;
    const userId = req.user!.id;

    let query = `
      SELECT rb.*, r.name as resource_name, r.resource_type,
        u.first_name || ' ' || u.last_name as booked_by_name
      FROM resource_bookings rb
      JOIN resources r ON rb.resource_id = r.id
      JOIN users u ON rb.user_id = u.id
      WHERE r.association_id = ?
    `;
    const params: any[] = [associationId];

    if (resourceId) {
      query += ' AND rb.resource_id = ?';
      params.push(resourceId);
    }
    if (status) {
      query += ' AND rb.status = ?';
      params.push(status);
    }
    if (startDate) {
      query += ' AND rb.start_datetime >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND rb.end_datetime <= ?';
      params.push(endDate);
    }
    if (myBookings === 'true') {
      query += ' AND rb.user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY rb.start_datetime DESC';

    const bookings = db.prepare(query).all(...params);

    res.json(
      bookings.map((b: any) => ({
        id: b.id,
        resourceId: b.resource_id,
        resourceName: b.resource_name,
        resourceType: b.resource_type,
        userId: b.user_id,
        bookedByName: b.booked_by_name,
        title: b.title,
        description: b.description,
        startDatetime: b.start_datetime,
        endDatetime: b.end_datetime,
        status: b.status,
        notes: b.notes,
        createdAt: b.created_at,
      })),
    );
  }),
);

// GET /resources/:id - Get resource details
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const resource = db
      .prepare(
        `
      SELECT r.*, rc.name as category_name
      FROM resources r
      LEFT JOIN resource_categories rc ON r.category_id = rc.id
      WHERE r.id = ? AND r.association_id = ? AND r.deleted_at IS NULL
    `,
      )
      .get(id, associationId) as any;

    if (!resource) {
      throw new ApiError(404, 'Resource niet gevonden');
    }

    const availability = db
      .prepare(
        `
      SELECT * FROM resource_availability WHERE resource_id = ?
    `,
      )
      .all(id);

    const upcomingBookings = db
      .prepare(
        `
      SELECT rb.*, u.first_name || ' ' || u.last_name as booked_by_name
      FROM resource_bookings rb
      JOIN users u ON rb.user_id = u.id
      WHERE rb.resource_id = ? AND rb.end_datetime >= datetime('now') AND rb.status != 'cancelled'
      ORDER BY rb.start_datetime
      LIMIT 10
    `,
      )
      .all(id);

    res.json({
      id: resource.id,
      name: resource.name,
      description: resource.description,
      resourceType: resource.resource_type,
      categoryId: resource.category_id,
      categoryName: resource.category_name,
      location: resource.location,
      capacity: resource.capacity,
      isActive: resource.is_active === 1,
      requiresApproval: resource.requires_approval === 1,
      minBookingHours: resource.min_booking_hours,
      maxBookingHours: resource.max_booking_hours,
      advanceBookingDays: resource.advance_booking_days,
      costPerHour: resource.cost_per_hour,
      costPerDay: resource.cost_per_day,
      depositAmount: resource.deposit_amount,
      imagePath: resource.image_path,
      notes: resource.notes,
      createdAt: resource.created_at,
      availability: availability.map((a: any) => ({
        id: a.id,
        availabilityType: a.availability_type,
        dayOfWeek: a.day_of_week,
        startTime: a.start_time,
        endTime: a.end_time,
        startDate: a.start_date,
        endDate: a.end_date,
        reason: a.reason,
      })),
      upcomingBookings: upcomingBookings.map((b: any) => ({
        id: b.id,
        title: b.title,
        startDatetime: b.start_datetime,
        endDatetime: b.end_datetime,
        status: b.status,
        bookedByName: b.booked_by_name,
      })),
    });
  }),
);

// POST /resources - Create resource
router.post(
  '/',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createResourceSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const id = uuidv4();

    db.prepare(
      `
      INSERT INTO resources (id, association_id, category_id, name, description, resource_type,
        location, capacity, requires_approval, min_booking_hours, max_booking_hours,
        advance_booking_days, cost_per_hour, cost_per_day, deposit_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.categoryId || null,
      data.name,
      data.description || null,
      data.resourceType,
      data.location || null,
      data.capacity || null,
      data.requiresApproval ? 1 : 0,
      data.minBookingHours || null,
      data.maxBookingHours || null,
      data.advanceBookingDays || null,
      data.costPerHour || null,
      data.costPerDay || null,
      data.depositAmount || null,
      data.notes || null,
    );

    res.status(201).json({ id, message: 'Resource aangemaakt' });
  }),
);

// PATCH /resources/:id - Update resource
router.patch(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateResourceSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const resource = db
      .prepare('SELECT id FROM resources WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!resource) {
      throw new ApiError(404, 'Resource niet gevonden');
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
    if (data.resourceType !== undefined) {
      updates.push('resource_type = ?');
      params.push(data.resourceType);
    }
    if (data.categoryId !== undefined) {
      updates.push('category_id = ?');
      params.push(data.categoryId);
    }
    if (data.location !== undefined) {
      updates.push('location = ?');
      params.push(data.location);
    }
    if (data.capacity !== undefined) {
      updates.push('capacity = ?');
      params.push(data.capacity);
    }
    if (data.requiresApproval !== undefined) {
      updates.push('requires_approval = ?');
      params.push(data.requiresApproval ? 1 : 0);
    }
    if (data.minBookingHours !== undefined) {
      updates.push('min_booking_hours = ?');
      params.push(data.minBookingHours);
    }
    if (data.maxBookingHours !== undefined) {
      updates.push('max_booking_hours = ?');
      params.push(data.maxBookingHours);
    }
    if (data.advanceBookingDays !== undefined) {
      updates.push('advance_booking_days = ?');
      params.push(data.advanceBookingDays);
    }
    if (data.costPerHour !== undefined) {
      updates.push('cost_per_hour = ?');
      params.push(data.costPerHour);
    }
    if (data.costPerDay !== undefined) {
      updates.push('cost_per_day = ?');
      params.push(data.costPerDay);
    }
    if (data.depositAmount !== undefined) {
      updates.push('deposit_amount = ?');
      params.push(data.depositAmount);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      db.prepare(`UPDATE resources SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    }

    res.json({ message: 'Resource bijgewerkt' });
  }),
);

// DELETE /resources/:id - Soft delete resource
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
      UPDATE resources SET deleted_at = CURRENT_TIMESTAMP, is_active = 0
      WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .run(id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Resource niet gevonden');
    }

    res.json({ message: 'Resource verwijderd' });
  }),
);

// POST /resources/:id/availability - Add availability rule
router.post(
  '/:id/availability',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = availabilitySchema.parse(req.body);
    const associationId = req.user!.associationId;

    const resource = db
      .prepare('SELECT id FROM resources WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!resource) {
      throw new ApiError(404, 'Resource niet gevonden');
    }

    const availId = uuidv4();
    db.prepare(
      `
      INSERT INTO resource_availability (id, resource_id, availability_type, day_of_week,
        start_time, end_time, start_date, end_date, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      availId,
      id,
      data.availabilityType,
      data.dayOfWeek ?? null,
      data.startTime || null,
      data.endTime || null,
      data.startDate || null,
      data.endDate || null,
      data.reason || null,
    );

    res.status(201).json({ id: availId, message: 'Beschikbaarheid toegevoegd' });
  }),
);

// DELETE /resources/:id/availability/:availId - Remove availability rule
router.delete(
  '/:id/availability/:availId',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, availId } = req.params;

    db.prepare('DELETE FROM resource_availability WHERE id = ? AND resource_id = ?').run(availId, id);

    res.json({ message: 'Beschikbaarheid verwijderd' });
  }),
);

// =====================================================
// BOOKINGS
// =====================================================

// POST /resources/bookings - Create booking
router.post(
  '/bookings',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createBookingSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const userId = req.user!.id;

    const resource = db
      .prepare(
        `
      SELECT * FROM resources WHERE id = ? AND association_id = ? AND deleted_at IS NULL AND is_active = 1
    `,
      )
      .get(data.resourceId, associationId) as any;

    if (!resource) {
      throw new ApiError(404, 'Resource niet gevonden of niet actief');
    }

    // Check for overlapping bookings
    const overlap = db
      .prepare(
        `
      SELECT id FROM resource_bookings
      WHERE resource_id = ? AND status NOT IN ('cancelled', 'rejected')
        AND NOT (end_datetime <= ? OR start_datetime >= ?)
    `,
      )
      .get(data.resourceId, data.startDatetime, data.endDatetime);

    if (overlap) {
      throw new ApiError(400, 'Er is al een boeking in dit tijdslot');
    }

    const status = resource.requires_approval ? 'pending' : 'approved';
    const id = uuidv4();

    db.prepare(
      `
      INSERT INTO resource_bookings (id, resource_id, user_id, title, description,
        start_datetime, end_datetime, status, related_rehearsal_id, related_concert_id,
        related_project_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      data.resourceId,
      userId,
      data.title,
      data.description || null,
      data.startDatetime,
      data.endDatetime,
      status,
      data.relatedRehearsalId || null,
      data.relatedConcertId || null,
      data.relatedProjectId || null,
      data.notes || null,
    );

    res.status(201).json({
      id,
      status,
      message: status === 'pending' ? 'Boeking aangevraagd, wacht op goedkeuring' : 'Boeking bevestigd',
    });
  }),
);

// PATCH /resources/bookings/:id/approve - Approve booking
router.patch(
  '/bookings/:id/approve',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const associationId = req.user!.associationId;

    const booking = db
      .prepare(
        `
      SELECT rb.* FROM resource_bookings rb
      JOIN resources r ON rb.resource_id = r.id
      WHERE rb.id = ? AND r.association_id = ?
    `,
      )
      .get(id, associationId) as any;

    if (!booking) {
      throw new ApiError(404, 'Boeking niet gevonden');
    }

    if (booking.status !== 'pending') {
      throw new ApiError(400, 'Boeking is niet in afwachting');
    }

    db.prepare(
      `
      UPDATE resource_bookings SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(userId, id);

    res.json({ message: 'Boeking goedgekeurd' });
  }),
);

// PATCH /resources/bookings/:id/reject - Reject booking
router.patch(
  '/bookings/:id/reject',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const associationId = req.user!.associationId;

    const booking = db
      .prepare(
        `
      SELECT rb.* FROM resource_bookings rb
      JOIN resources r ON rb.resource_id = r.id
      WHERE rb.id = ? AND r.association_id = ?
    `,
      )
      .get(id, associationId) as any;

    if (!booking) {
      throw new ApiError(404, 'Boeking niet gevonden');
    }

    db.prepare(
      `
      UPDATE resource_bookings SET status = 'rejected', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(reason || null, id);

    res.json({ message: 'Boeking afgewezen' });
  }),
);

// DELETE /resources/bookings/:id - Cancel booking
router.delete(
  '/bookings/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const associationId = req.user!.associationId;

    const booking = db
      .prepare(
        `
      SELECT rb.* FROM resource_bookings rb
      JOIN resources r ON rb.resource_id = r.id
      WHERE rb.id = ? AND r.association_id = ?
    `,
      )
      .get(id, associationId) as any;

    if (!booking) {
      throw new ApiError(404, 'Boeking niet gevonden');
    }

    // Only allow cancellation by the booker or admin
    if (booking.user_id !== userId && userRole !== 'admin') {
      throw new ApiError(403, 'Geen toegang');
    }

    db.prepare(
      `
      UPDATE resource_bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(id);

    res.json({ message: 'Boeking geannuleerd' });
  }),
);

export default router;
