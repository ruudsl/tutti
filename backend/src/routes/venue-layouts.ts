import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const seatSchema = z.object({
  number: z.string().min(1, 'Seat number is required'),
  type: z.enum(['regular', 'wheelchair', 'companion', 'vip']).default('regular'),
  x: z.number(),
  y: z.number(),
  priceCategory: z.string().default('standard'),
});

const rowSchema = z.object({
  name: z.string().min(1, 'Row name is required'),
  seats: z.array(seatSchema),
  curve: z.number().optional(),
});

const sectionSchema = z.object({
  id: z.string().min(1, 'Section ID is required'),
  name: z.string().min(1, 'Section name is required'),
  rows: z.array(rowSchema),
  x: z.number(),
  y: z.number(),
  rotation: z.number().optional(),
});

const layoutDataSchema = z.object({
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive'),
  sections: z.array(sectionSchema),
});

const createLayoutSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  layoutData: layoutDataSchema,
});

const updateLayoutSchema = createLayoutSchema.partial();

const bulkSeatsSchema = z.object({
  seats: z.array(
    z.object({
      id: z.string().optional(), // Existing seat ID for update
      section: z.string().min(1, 'Section is required'),
      rowName: z.string().min(1, 'Row name is required'),
      seatNumber: z.string().min(1, 'Seat number is required'),
      seatType: z.enum(['regular', 'wheelchair', 'companion', 'vip']).default('regular'),
      xPosition: z.number(),
      yPosition: z.number(),
      priceCategory: z.string().default('standard'),
      isAvailable: z.boolean().default(true),
    }),
  ),
  deleteOtherSeats: z.boolean().default(false), // If true, delete seats not in the list
});

const reserveSeatsSchema = z.object({
  seatIds: z.array(z.string().uuid()).min(1, 'At least one seat is required'),
  orderId: z.string().uuid().optional(),
  reservationMinutes: z.number().int().min(1).max(60).default(15),
});

// ==========================================
// VENUE LAYOUT ENDPOINTS
// ==========================================

/**
 * @swagger
 * /venue-layouts:
 *   get:
 *     summary: List all venue layouts for the association
 *     tags: [Venue Layouts]
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const layouts = db
      .prepare(
        `
        SELECT
            id,
            name,
            description,
            capacity,
            created_at,
            updated_at
        FROM venue_layouts
        WHERE association_id = ?
        ORDER BY name ASC
    `,
      )
      .all(req.user!.associationId) as {
      id: string;
      name: string;
      description: string | null;
      capacity: number;
      created_at: string;
      updated_at: string;
    }[];

    res.json({
      layouts: layouts.map((layout) => ({
        id: layout.id,
        name: layout.name,
        description: layout.description,
        capacity: layout.capacity,
        createdAt: layout.created_at,
        updatedAt: layout.updated_at,
      })),
    });
  }),
);

/**
 * @swagger
 * /venue-layouts:
 *   post:
 *     summary: Create a new venue layout
 *     tags: [Venue Layouts]
 */
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const validation = createLayoutSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ApiError(400, validation.error.issues[0].message);
    }

    const { name, description, layoutData } = validation.data;

    // Calculate capacity from layout data
    let capacity = 0;
    for (const section of layoutData.sections) {
      for (const row of section.rows) {
        capacity += row.seats.length;
      }
    }

    const id = uuidv4();

    // Insert layout
    db.prepare(
      `
        INSERT INTO venue_layouts (id, association_id, name, description, layout_data, capacity)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(id, req.user!.associationId, name, description || null, JSON.stringify(layoutData), capacity);

    // Insert individual seats for easy querying
    const insertSeatStmt = db.prepare(`
        INSERT INTO venue_seats (id, layout_id, section, row_name, seat_number, seat_type, x_position, y_position, price_category, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const section of layoutData.sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          insertSeatStmt.run(
            uuidv4(),
            id,
            section.name,
            row.name,
            seat.number,
            seat.type,
            seat.x + section.x,
            seat.y + section.y,
            seat.priceCategory,
            1,
          );
        }
      }
    }

    logger.info(`Venue layout created: ${name}`, { id, createdBy: req.user!.id, capacity });

    res.status(201).json({
      id,
      name,
      description,
      capacity,
      layoutData,
      message: 'Venue layout created successfully.',
    });
  }),
);

/**
 * @swagger
 * /venue-layouts/{id}:
 *   get:
 *     summary: Get a venue layout with all seats
 *     tags: [Venue Layouts]
 */
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const layout = db
      .prepare(
        `
        SELECT
            id,
            association_id,
            name,
            description,
            layout_data,
            capacity,
            created_at,
            updated_at
        FROM venue_layouts
        WHERE id = ? AND association_id = ?
    `,
      )
      .get(id, req.user!.associationId) as
      | {
          id: string;
          association_id: string;
          name: string;
          description: string | null;
          layout_data: string;
          capacity: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!layout) {
      throw new ApiError(404, 'Venue layout not found');
    }

    // Get all seats for this layout
    const seats = db
      .prepare(
        `
        SELECT
            id,
            section,
            row_name,
            seat_number,
            seat_type,
            x_position,
            y_position,
            price_category,
            is_available
        FROM venue_seats
        WHERE layout_id = ?
        ORDER BY section, row_name, seat_number
    `,
      )
      .all(id) as {
      id: string;
      section: string;
      row_name: string;
      seat_number: string;
      seat_type: string;
      x_position: number;
      y_position: number;
      price_category: string;
      is_available: number;
    }[];

    res.json({
      id: layout.id,
      name: layout.name,
      description: layout.description,
      layoutData: JSON.parse(layout.layout_data),
      capacity: layout.capacity,
      createdAt: layout.created_at,
      updatedAt: layout.updated_at,
      seats: seats.map((seat) => ({
        id: seat.id,
        section: seat.section,
        rowName: seat.row_name,
        seatNumber: seat.seat_number,
        seatType: seat.seat_type,
        xPosition: seat.x_position,
        yPosition: seat.y_position,
        priceCategory: seat.price_category,
        isAvailable: Boolean(seat.is_available),
      })),
    });
  }),
);

/**
 * @swagger
 * /venue-layouts/{id}:
 *   put:
 *     summary: Update a venue layout
 *     tags: [Venue Layouts]
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const validation = updateLayoutSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ApiError(400, validation.error.issues[0].message);
    }

    const existing = db
      .prepare(
        `
        SELECT id FROM venue_layouts WHERE id = ? AND association_id = ?
    `,
      )
      .get(id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Venue layout not found');
    }

    // Check if layout is in use by any concert
    const inUse = db
      .prepare(
        `
        SELECT id, name FROM concerts WHERE venue_layout_id = ? LIMIT 1
    `,
      )
      .get(id) as { id: string; name: string } | undefined;

    const { name, description, layoutData } = validation.data;

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    if (layoutData !== undefined) {
      // Calculate new capacity
      let capacity = 0;
      for (const section of layoutData.sections) {
        for (const row of section.rows) {
          capacity += row.seats.length;
        }
      }

      updates.push('layout_data = ?');
      values.push(JSON.stringify(layoutData));
      updates.push('capacity = ?');
      values.push(capacity);

      // If layout is in use, warn but don't block
      if (inUse) {
        logger.warn(`Updating venue layout in use by concert: ${inUse.name}`, { layoutId: id, concertId: inUse.id });
      }

      // Update seats - delete existing and recreate
      db.prepare('DELETE FROM venue_seats WHERE layout_id = ?').run(id);

      const insertSeatStmt = db.prepare(`
            INSERT INTO venue_seats (id, layout_id, section, row_name, seat_number, seat_type, x_position, y_position, price_category, is_available)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

      for (const section of layoutData.sections) {
        for (const row of section.rows) {
          for (const seat of row.seats) {
            insertSeatStmt.run(
              uuidv4(),
              id,
              section.name,
              row.name,
              seat.number,
              seat.type,
              seat.x + section.x,
              seat.y + section.y,
              seat.priceCategory,
              1,
            );
          }
        }
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id, req.user!.associationId);

      db.prepare(
        `
            UPDATE venue_layouts
            SET ${updates.join(', ')}
            WHERE id = ? AND association_id = ?
        `,
      ).run(...values);
    }

    logger.info(`Venue layout updated: ${id}`, { updatedBy: req.user!.id });

    res.json({
      message: 'Venue layout updated successfully.',
      inUseWarning: inUse ? `Layout is in use by concert: ${inUse.name}` : undefined,
    });
  }),
);

/**
 * @swagger
 * /venue-layouts/{id}:
 *   delete:
 *     summary: Delete a venue layout
 *     tags: [Venue Layouts]
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const existing = db
      .prepare(
        `
        SELECT id, name FROM venue_layouts WHERE id = ? AND association_id = ?
    `,
      )
      .get(id, req.user!.associationId) as { id: string; name: string } | undefined;

    if (!existing) {
      throw new ApiError(404, 'Venue layout not found');
    }

    // Check if layout is in use by any concert
    const inUse = db
      .prepare(
        `
        SELECT id, name FROM concerts WHERE venue_layout_id = ?
    `,
      )
      .all(id) as { id: string; name: string }[];

    if (inUse.length > 0) {
      throw new ApiError(409, `Layout is in use by ${inUse.length} concert(s): ${inUse.map((c) => c.name).join(', ')}`);
    }

    // Delete layout (seats will cascade)
    db.prepare('DELETE FROM venue_layouts WHERE id = ?').run(id);

    logger.info(`Venue layout deleted: ${existing.name}`, { id, deletedBy: req.user!.id });

    res.json({
      message: 'Venue layout deleted successfully.',
    });
  }),
);

/**
 * @swagger
 * /venue-layouts/{id}/seats:
 *   post:
 *     summary: Bulk add/update seats for a layout
 *     tags: [Venue Layouts]
 */
router.post(
  '/:id/seats',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const validation = bulkSeatsSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ApiError(400, validation.error.issues[0].message);
    }

    const existing = db
      .prepare(
        `
        SELECT id FROM venue_layouts WHERE id = ? AND association_id = ?
    `,
      )
      .get(id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Venue layout not found');
    }

    const { seats, deleteOtherSeats } = validation.data;

    // Get existing seat IDs for reference
    const existingSeats = new Set(
      (db.prepare('SELECT id FROM venue_seats WHERE layout_id = ?').all(id) as { id: string }[]).map((s) => s.id),
    );

    const newSeatIds = new Set<string>();
    let created = 0;
    let updated = 0;

    const insertStmt = db.prepare(`
        INSERT INTO venue_seats (id, layout_id, section, row_name, seat_number, seat_type, x_position, y_position, price_category, is_available)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
        UPDATE venue_seats
        SET section = ?, row_name = ?, seat_number = ?, seat_type = ?, x_position = ?, y_position = ?, price_category = ?, is_available = ?
        WHERE id = ? AND layout_id = ?
    `);

    for (const seat of seats) {
      if (seat.id && existingSeats.has(seat.id)) {
        // Update existing seat
        updateStmt.run(
          seat.section,
          seat.rowName,
          seat.seatNumber,
          seat.seatType,
          seat.xPosition,
          seat.yPosition,
          seat.priceCategory,
          seat.isAvailable ? 1 : 0,
          seat.id,
          id,
        );
        newSeatIds.add(seat.id);
        updated++;
      } else {
        // Create new seat
        const seatId = seat.id || uuidv4();
        insertStmt.run(
          seatId,
          id,
          seat.section,
          seat.rowName,
          seat.seatNumber,
          seat.seatType,
          seat.xPosition,
          seat.yPosition,
          seat.priceCategory,
          seat.isAvailable ? 1 : 0,
        );
        newSeatIds.add(seatId);
        created++;
      }
    }

    // Delete seats not in the list if requested
    let deleted = 0;
    if (deleteOtherSeats) {
      const toDelete = Array.from(existingSeats).filter((seatId) => !newSeatIds.has(seatId));
      if (toDelete.length > 0) {
        // Check if any seats are reserved
        const reserved = db
          .prepare(
            `
                SELECT s.id, s.seat_number, s.row_name
                FROM venue_seats s
                JOIN concert_seat_reservations r ON r.seat_id = s.id
                WHERE s.id IN (${toDelete.map(() => '?').join(',')})
                AND r.status IN ('reserved', 'sold')
            `,
          )
          .all(...toDelete) as { id: string; seat_number: string; row_name: string }[];

        if (reserved.length > 0) {
          throw new ApiError(
            409,
            `Cannot delete seats with active reservations: ${reserved.map((s) => `${s.row_name}${s.seat_number}`).join(', ')}`,
          );
        }

        db.prepare(`DELETE FROM venue_seats WHERE id IN (${toDelete.map(() => '?').join(',')}) AND layout_id = ?`).run(
          ...toDelete,
          id,
        );
        deleted = toDelete.length;
      }
    }

    // Update capacity
    const newCapacity = db.prepare('SELECT COUNT(*) as count FROM venue_seats WHERE layout_id = ?').get(id) as {
      count: number;
    };
    db.prepare('UPDATE venue_layouts SET capacity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      newCapacity.count,
      id,
    );

    logger.info(`Bulk seat update for layout ${id}`, { created, updated, deleted, updatedBy: req.user!.id });

    res.json({
      message: 'Seats updated successfully.',
      created,
      updated,
      deleted,
      totalSeats: newCapacity.count,
    });
  }),
);

// ==========================================
// CONCERT SEAT ENDPOINTS
// ==========================================

/**
 * De stoelen van een concert hangen onder /api/concerts/:id/seats en niet
 * onder /api/venue-layouts. Ze zaten daarom in dezelfde router, die kaal op
 * /api werd gemount.
 *
 * Daarmee stonden ook '/' en '/:id' op de wortel van de API: /api/ gaf de
 * zaalindelingen terug en /api/<wat dan ook> antwoordde met "Venue layout not
 * found". Elk onbekend pad met een enkel segment kwam daar dus uit in plaats
 * van bij de 404-handler.
 *
 * Dat was ook niet de bedoeling: de Swagger-beschrijvingen in dit bestand
 * noemen /venue-layouts, /venue-layouts/{id} en /venue-layouts/{id}/seats. De
 * mount week af van de eigen documentatie. De zaalindelingen staan nu onder
 * /api/venue-layouts, zoals beschreven, en alleen de concertstoelen blijven op
 * de wortel.
 */
export const concertSeatsRouter = Router();

/**
 * @swagger
 * /concerts/{id}/seats:
 *   get:
 *     summary: Get seat availability for a concert
 *     tags: [Venue Layouts, Tickets]
 */
concertSeatsRouter.get(
  '/concerts/:id/seats',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    // Get concert with layout info
    const concert = db
      .prepare(
        `
        SELECT
            c.id,
            c.name,
            c.venue_layout_id,
            c.is_seated_event,
            vl.name as layout_name,
            vl.layout_data,
            vl.capacity
        FROM concerts c
        LEFT JOIN venue_layouts vl ON vl.id = c.venue_layout_id
        WHERE c.id = ? AND c.association_id = ?
    `,
      )
      .get(concertId, req.user!.associationId) as
      | {
          id: string;
          name: string;
          venue_layout_id: string | null;
          is_seated_event: number;
          layout_name: string | null;
          layout_data: string | null;
          capacity: number | null;
        }
      | undefined;

    if (!concert) {
      throw new ApiError(404, 'Concert not found');
    }

    if (!concert.venue_layout_id || !concert.is_seated_event) {
      throw new ApiError(400, 'This concert does not have assigned seating');
    }

    // Get all seats with their reservation status
    const seats = db
      .prepare(
        `
        SELECT
            vs.id,
            vs.section,
            vs.row_name,
            vs.seat_number,
            vs.seat_type,
            vs.x_position,
            vs.y_position,
            vs.price_category,
            vs.is_available,
            csr.status as reservation_status,
            csr.reserved_at,
            csr.reservation_expires_at
        FROM venue_seats vs
        LEFT JOIN concert_seat_reservations csr ON csr.seat_id = vs.id AND csr.concert_id = ?
        WHERE vs.layout_id = ?
        ORDER BY vs.section, vs.row_name, vs.seat_number
    `,
      )
      .all(concertId, concert.venue_layout_id) as {
      id: string;
      section: string;
      row_name: string;
      seat_number: string;
      seat_type: string;
      x_position: number;
      y_position: number;
      price_category: string;
      is_available: number;
      reservation_status: string | null;
      reserved_at: string | null;
      reservation_expires_at: string | null;
    }[];

    // Calculate availability statistics
    const now = new Date().toISOString();
    let available = 0;
    let reserved = 0;
    let sold = 0;
    let blocked = 0;

    const seatsList = seats.map((seat) => {
      let status: 'available' | 'reserved' | 'sold' | 'blocked' = 'available';

      if (!seat.is_available) {
        status = 'blocked';
        blocked++;
      } else if (seat.reservation_status === 'sold') {
        status = 'sold';
        sold++;
      } else if (seat.reservation_status === 'blocked') {
        status = 'blocked';
        blocked++;
      } else if (seat.reservation_status === 'reserved') {
        // Check if reservation has expired
        if (seat.reservation_expires_at && seat.reservation_expires_at < now) {
          status = 'available';
          available++;
        } else {
          status = 'reserved';
          reserved++;
        }
      } else {
        available++;
      }

      return {
        id: seat.id,
        section: seat.section,
        rowName: seat.row_name,
        seatNumber: seat.seat_number,
        seatType: seat.seat_type,
        xPosition: seat.x_position,
        yPosition: seat.y_position,
        priceCategory: seat.price_category,
        status,
      };
    });

    res.json({
      concert: {
        id: concert.id,
        name: concert.name,
      },
      layout: {
        id: concert.venue_layout_id,
        name: concert.layout_name,
        layoutData: concert.layout_data ? JSON.parse(concert.layout_data) : null,
        capacity: concert.capacity,
      },
      seats: seatsList,
      stats: {
        total: seats.length,
        available,
        reserved,
        sold,
        blocked,
      },
    });
  }),
);

/**
 * @swagger
 * /concerts/{id}/seats/reserve:
 *   post:
 *     summary: Reserve seats temporarily for a concert
 *     tags: [Venue Layouts, Tickets]
 */
concertSeatsRouter.post(
  '/concerts/:id/seats/reserve',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;

    const validation = reserveSeatsSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ApiError(400, validation.error.issues[0].message);
    }

    const { seatIds, orderId, reservationMinutes } = validation.data;

    // Verify concert exists and has seating
    const concert = db
      .prepare(
        `
        SELECT id, name, venue_layout_id, is_seated_event
        FROM concerts
        WHERE id = ? AND association_id = ?
    `,
      )
      .get(concertId, req.user!.associationId) as
      | {
          id: string;
          name: string;
          venue_layout_id: string | null;
          is_seated_event: number;
        }
      | undefined;

    if (!concert) {
      throw new ApiError(404, 'Concert not found');
    }

    if (!concert.venue_layout_id || !concert.is_seated_event) {
      throw new ApiError(400, 'This concert does not have assigned seating');
    }

    // Verify all seats exist and belong to the concert's layout
    const seats = db
      .prepare(
        `
        SELECT id FROM venue_seats
        WHERE id IN (${seatIds.map(() => '?').join(',')})
        AND layout_id = ?
    `,
      )
      .all(...seatIds, concert.venue_layout_id) as { id: string }[];

    if (seats.length !== seatIds.length) {
      throw new ApiError(400, "One or more seats do not exist or do not belong to this concert's layout");
    }

    // Check if any seats are already reserved/sold
    const now = new Date().toISOString();
    const unavailable = db
      .prepare(
        `
        SELECT s.id, s.seat_number, s.row_name, csr.status
        FROM venue_seats s
        JOIN concert_seat_reservations csr ON csr.seat_id = s.id
        WHERE s.id IN (${seatIds.map(() => '?').join(',')})
        AND csr.concert_id = ?
        AND (
            csr.status IN ('sold', 'blocked')
            OR (csr.status = 'reserved' AND csr.reservation_expires_at > ?)
        )
    `,
      )
      .all(...seatIds, concertId, now) as {
      id: string;
      seat_number: string;
      row_name: string;
      status: string;
    }[];

    if (unavailable.length > 0) {
      throw new ApiError(
        409,
        `Seats not available: ${unavailable.map((s) => `${s.row_name}${s.seat_number} (${s.status})`).join(', ')}`,
      );
    }

    // Create/update reservations
    const expiresAt = new Date(Date.now() + reservationMinutes * 60 * 1000).toISOString();

    const upsertStmt = db.prepare(`
        INSERT INTO concert_seat_reservations (id, concert_id, seat_id, order_id, status, reserved_at, reservation_expires_at)
        VALUES (?, ?, ?, ?, 'reserved', ?, ?)
        ON CONFLICT(concert_id, seat_id) DO UPDATE SET
            order_id = excluded.order_id,
            status = 'reserved',
            reserved_at = excluded.reserved_at,
            reservation_expires_at = excluded.reservation_expires_at
    `);

    for (const seatId of seatIds) {
      upsertStmt.run(uuidv4(), concertId, seatId, orderId || null, now, expiresAt);
    }

    logger.info(`Seats reserved for concert ${concert.name}`, {
      concertId,
      seatCount: seatIds.length,
      orderId,
      expiresAt,
      reservedBy: req.user!.id,
    });

    res.json({
      message: 'Seats reserved successfully.',
      reservedSeats: seatIds,
      expiresAt,
    });
  }),
);

/**
 * @swagger
 * /concerts/{id}/seats/reserve:
 *   delete:
 *     summary: Release seat reservations for a concert
 *     tags: [Venue Layouts, Tickets]
 */
concertSeatsRouter.delete(
  '/concerts/:id/seats/reserve',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: concertId } = req.params;
    const { seatIds, orderId } = req.body as { seatIds?: string[]; orderId?: string };

    // Verify concert exists
    const concert = db
      .prepare(
        `
        SELECT id, name FROM concerts WHERE id = ? AND association_id = ?
    `,
      )
      .get(concertId, req.user!.associationId) as { id: string; name: string } | undefined;

    if (!concert) {
      throw new ApiError(404, 'Concert not found');
    }

    let result;

    if (orderId) {
      // Release all reservations for an order
      result = db
        .prepare(
          `
            DELETE FROM concert_seat_reservations
            WHERE concert_id = ? AND order_id = ? AND status = 'reserved'
        `,
        )
        .run(concertId, orderId);
    } else if (seatIds && seatIds.length > 0) {
      // Release specific seats
      result = db
        .prepare(
          `
            DELETE FROM concert_seat_reservations
            WHERE concert_id = ?
            AND seat_id IN (${seatIds.map(() => '?').join(',')})
            AND status = 'reserved'
        `,
        )
        .run(concertId, ...seatIds);
    } else {
      throw new ApiError(400, 'Either seatIds or orderId is required');
    }

    logger.info(`Seat reservations released for concert ${concert.name}`, {
      concertId,
      releasedCount: result.changes,
      orderId,
      seatIds,
      releasedBy: req.user!.id,
    });

    res.json({
      message: 'Reservations released successfully.',
      releasedCount: result.changes,
    });
  }),
);

export default router;
