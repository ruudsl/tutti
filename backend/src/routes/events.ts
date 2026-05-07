import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

const sanitizeForLog = (value: unknown): string => String(value).replace(/[\r\n]/g, '');

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const createEventLocationSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    address: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    venueType: z.string().optional(),
    capacity: z.number().int().min(0).optional(),
    indoorOutdoor: z.enum(['indoor', 'outdoor', 'both']).optional(),
    hasElectricity: z.boolean().optional(),
    hasChangingRooms: z.boolean().optional(),
    hasStorage: z.boolean().optional(),
    hasCatering: z.boolean().optional(),
    hasParking: z.boolean().optional(),
    parkingInfo: z.string().optional(),
    accessibilityInfo: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional().or(z.literal('')),
    notes: z.string().optional(),
    isFavorite: z.boolean().optional(),
});

const createEventSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    eventType: z.string().optional(),
    status: z.enum(['planned', 'confirmed', 'cancelled', 'completed']).optional(),
    locationId: z.string().uuid().optional().nullable(),
    locationName: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    indoorOutdoor: z.enum(['indoor', 'outdoor', 'both']).optional(),
    startDatetime: z.string().min(1, 'Start datum/tijd is verplicht'),
    endDatetime: z.string().optional(),
    setupTime: z.string().optional(),
    soundcheckTime: z.string().optional(),
    doorsTime: z.string().optional(),
    performanceTime: z.string().optional(),
    breakTime: z.string().optional(),
    packDownTime: z.string().optional(),
    expectedAudience: z.number().int().min(0).optional(),
    dressCode: z.string().optional(),
    description: z.string().optional(),
    internalNotes: z.string().optional(),
    publicNotes: z.string().optional(),
    feeAmount: z.number().optional(),
    feeCurrency: z.string().optional(),
    expensesBudget: z.number().optional(),
    isPublic: z.boolean().optional(),
    requiresTickets: z.boolean().optional(),
    weatherSensitive: z.boolean().optional(),
    backupLocationId: z.string().uuid().optional().nullable(),
    backupLocationName: z.string().optional(),
    concertId: z.string().uuid().optional().nullable(),
    orchestraIds: z.array(z.string().uuid()).optional(),
});

const createScheduleItemSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht'),
    description: z.string().optional(),
    startTime: z.string().min(1, 'Start tijd is verplicht'),
    endTime: z.string().optional(),
    durationMinutes: z.number().int().min(0).optional(),
    itemType: z.string().optional(),
    responsibleUserId: z.string().uuid().optional().nullable(),
    responsibleName: z.string().optional(),
    locationDescription: z.string().optional(),
    isPublic: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    notes: z.string().optional(),
});

const createTransportSchema = z.object({
    transportType: z.enum(['car', 'van', 'bus', 'train', 'bike', 'other']),
    vehicleDescription: z.string().optional(),
    licensePlate: z.string().optional(),
    capacity: z.number().int().min(1).optional(),
    driverUserId: z.string().uuid().optional().nullable(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    departureTime: z.string().optional(),
    departureLocation: z.string().optional(),
    departureAddress: z.string().optional(),
    departureLatitude: z.number().optional(),
    departureLongitude: z.number().optional(),
    arrivalTime: z.string().optional(),
    returnTime: z.string().optional(),
    returnDepartureTime: z.string().optional(),
    notes: z.string().optional(),
});

const createMeetingPointSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    address: z.string().optional(),
    city: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    meetingTime: z.string().min(1, 'Tijd is verplicht'),
    description: z.string().optional(),
    isPrimary: z.boolean().optional(),
});

const createPackingListSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    templateId: z.string().uuid().optional().nullable(),
    notes: z.string().optional(),
});

const createPackingItemSchema = z.object({
    category: z.string().optional(),
    itemName: z.string().min(1, 'Item naam is verplicht'),
    quantity: z.number().int().min(1).optional(),
    isRequired: z.boolean().optional(),
    responsibleUserId: z.string().uuid().optional().nullable(),
    responsibleName: z.string().optional(),
    notes: z.string().optional(),
    sortOrder: z.number().int().optional(),
});

const updateAttendanceSchema = z.object({
    status: z.enum(['pending', 'attending', 'not_attending', 'maybe']),
    instrumentId: z.string().uuid().optional().nullable(),
    transportNeeded: z.boolean().optional(),
    canDrive: z.boolean().optional(),
    availableSeats: z.number().int().min(0).optional(),
    dietaryRequirements: z.string().optional(),
    notes: z.string().optional(),
});

// ===========================================
// EVENT LOCATIONS
// ===========================================

router.get('/locations', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search, venueType, isFavorite } = req.query;
    const { limit, offset } = getPaginationParams(req);

    let whereClause = 'WHERE association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ' AND (name LIKE ? OR address LIKE ? OR city LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (venueType) {
        whereClause += ' AND venue_type = ?';
        params.push(venueType);
    }

    if (isFavorite === 'true') {
        whereClause += ' AND is_favorite = 1';
    }

    const countResult = db.prepare(
        `SELECT COUNT(*) as total FROM event_locations ${whereClause}`
    ).get(...params) as { total: number };

    const locations = db.prepare(`
        SELECT * FROM event_locations
        ${whereClause}
        ORDER BY is_favorite DESC, name
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json(createPaginatedResult(
        locations.map(mapLocation),
        countResult.total,
        limit,
        offset
    ));
}));

router.get('/locations/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const location = db.prepare(`
        SELECT * FROM event_locations WHERE id = ? AND association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!location) {
        throw new ApiError(404, 'Locatie niet gevonden.');
    }

    res.json(mapLocation(location));
}));

router.post('/locations', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEventLocationSchema.parse(req.body);
    const id = uuidv4();

    db.prepare(`
        INSERT INTO event_locations (
            id, association_id, name, address, city, postal_code, country,
            latitude, longitude, venue_type, capacity, indoor_outdoor,
            has_electricity, has_changing_rooms, has_storage, has_catering, has_parking,
            parking_info, accessibility_info, contact_name, contact_phone, contact_email,
            notes, is_favorite
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.user!.associationId,
        data.name,
        data.address ?? null,
        data.city ?? null,
        data.postalCode ?? null,
        data.country ?? 'Nederland',
        data.latitude ?? null,
        data.longitude ?? null,
        data.venueType ?? null,
        data.capacity ?? null,
        data.indoorOutdoor ?? 'indoor',
        data.hasElectricity ?? 1,
        data.hasChangingRooms ?? 0,
        data.hasStorage ?? 0,
        data.hasCatering ?? 0,
        data.hasParking ?? 0,
        data.parkingInfo ?? null,
        data.accessibilityInfo ?? null,
        data.contactName ?? null,
        data.contactPhone ?? null,
        data.contactEmail || null,
        data.notes ?? null,
        data.isFavorite ?? 0
    );

    logger.info(`Event location created: ${data.name}`, { id, createdBy: req.user!.id });

    res.status(201).json({ id, message: 'Locatie aangemaakt.' });
}));

router.put('/locations/:id', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEventLocationSchema.partial().parse(req.body);

    const existing = db.prepare(
        'SELECT id FROM event_locations WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Locatie niet gevonden.');
    }

    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
        name: 'name', address: 'address', city: 'city', postalCode: 'postal_code',
        country: 'country', latitude: 'latitude', longitude: 'longitude',
        venueType: 'venue_type', capacity: 'capacity', indoorOutdoor: 'indoor_outdoor',
        hasElectricity: 'has_electricity', hasChangingRooms: 'has_changing_rooms',
        hasStorage: 'has_storage', hasCatering: 'has_catering', hasParking: 'has_parking',
        parkingInfo: 'parking_info', accessibilityInfo: 'accessibility_info',
        contactName: 'contact_name', contactPhone: 'contact_phone', contactEmail: 'contact_email',
        notes: 'notes', isFavorite: 'is_favorite'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
        if (key in data) {
            updates.push(`${dbField} = ?`);
            values.push((data as any)[key] ?? null);
        }
    }

    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        db.prepare(`UPDATE event_locations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    logger.info(`Event location updated: ${sanitizeForLog(req.params.id)}`, { updatedBy: req.user!.id });

    res.json({ message: 'Locatie bijgewerkt.' });
}));

router.delete('/locations/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM event_locations WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Locatie niet gevonden.');
    }

    logger.info(`Event location deleted: ${sanitizeForLog(req.params.id)}`, { deletedBy: req.user!.id });

    res.json({ message: 'Locatie verwijderd.' });
}));

// ===========================================
// EVENTS
// ===========================================

router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { search, status, eventType, from, to, upcoming } = req.query;
    const { limit, offset } = getPaginationParams(req);

    let whereClause = 'WHERE e.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ' AND (e.name LIKE ? OR e.location_name LIKE ? OR e.city LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (status) {
        whereClause += ' AND e.status = ?';
        params.push(status);
    }

    if (eventType) {
        whereClause += ' AND e.event_type = ?';
        params.push(eventType);
    }

    if (from) {
        whereClause += ' AND DATE(e.start_datetime) >= ?';
        params.push(from);
    }

    if (to) {
        whereClause += ' AND DATE(e.start_datetime) <= ?';
        params.push(to);
    }

    if (upcoming === 'true') {
        whereClause += ' AND e.start_datetime >= datetime("now")';
    }

    const countResult = db.prepare(
        `SELECT COUNT(*) as total FROM events e ${whereClause}`
    ).get(...params) as { total: number };

    const events = db.prepare(`
        SELECT e.*,
               l.name as location_full_name,
               l.address as location_full_address,
               (SELECT COUNT(*) FROM event_attendance WHERE event_id = e.id AND status = 'attending') as attending_count,
               (SELECT COUNT(*) FROM event_attendance WHERE event_id = e.id AND status = 'not_attending') as not_attending_count
        FROM events e
        LEFT JOIN event_locations l ON e.location_id = l.id
        ${whereClause}
        ORDER BY e.start_datetime DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const eventIds = events.map((e: any) => e.id);
    const orchestras = eventIds.length > 0 ? db.prepare(`
        SELECT eo.event_id, o.id, o.name
        FROM event_orchestras eo
        JOIN orchestras o ON eo.orchestra_id = o.id
        WHERE eo.event_id IN (${eventIds.map(() => '?').join(',')})
        ORDER BY eo.performance_order
    `).all(...eventIds) : [];

    const orchestraMap = new Map<string, any[]>();
    (orchestras as any[]).forEach(o => {
        if (!orchestraMap.has(o.event_id)) {
            orchestraMap.set(o.event_id, []);
        }
        orchestraMap.get(o.event_id)!.push({ id: o.id, name: o.name });
    });

    res.json(createPaginatedResult(
        events.map((e: any) => ({
            ...mapEvent(e),
            orchestras: orchestraMap.get(e.id) || [],
        })),
        countResult.total,
        limit,
        offset
    ));
}));

router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(`
        SELECT e.*,
               l.name as location_full_name,
               l.address as location_full_address,
               bl.name as backup_location_full_name
        FROM events e
        LEFT JOIN event_locations l ON e.location_id = l.id
        LEFT JOIN event_locations bl ON e.backup_location_id = bl.id
        WHERE e.id = ? AND e.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const orchestras = db.prepare(`
        SELECT o.id, o.name, eo.performance_order, eo.set_duration_minutes, eo.notes
        FROM event_orchestras eo
        JOIN orchestras o ON eo.orchestra_id = o.id
        WHERE eo.event_id = ?
        ORDER BY eo.performance_order
    `).all(req.params.id);

    const attendance = db.prepare(`
        SELECT ea.*, u.first_name, u.last_name, u.email, i.name as instrument_name
        FROM event_attendance ea
        JOIN users u ON ea.user_id = u.id
        LEFT JOIN instruments i ON ea.instrument_id = i.id
        WHERE ea.event_id = ?
        ORDER BY u.last_name, u.first_name
    `).all(req.params.id);

    const myAttendance = db.prepare(`
        SELECT * FROM event_attendance WHERE event_id = ? AND user_id = ?
    `).get(req.params.id, req.user!.id);

    res.json({
        ...mapEvent(event),
        orchestras: (orchestras as any[]).map(o => ({
            id: o.id,
            name: o.name,
            performanceOrder: o.performance_order,
            setDurationMinutes: o.set_duration_minutes,
            notes: o.notes,
        })),
        attendance: (attendance as any[]).map(a => ({
            id: a.id,
            userId: a.user_id,
            userName: `${a.first_name} ${a.last_name}`,
            email: a.email,
            status: a.status,
            instrumentName: a.instrument_name,
            transportNeeded: !!a.transport_needed,
            canDrive: !!a.can_drive,
            availableSeats: a.available_seats,
            notes: a.notes,
            responseDate: a.response_date,
        })),
        myAttendance: myAttendance ? mapAttendance(myAttendance) : null,
    });
}));

router.post('/', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEventSchema.parse(req.body);
    const id = uuidv4();

    withTransaction(() => {
        db.prepare(`
            INSERT INTO events (
                id, association_id, name, event_type, status, location_id, location_name,
                address, city, latitude, longitude, indoor_outdoor,
                start_datetime, end_datetime, setup_time, soundcheck_time, doors_time,
                performance_time, break_time, pack_down_time, expected_audience, dress_code,
                description, internal_notes, public_notes, fee_amount, fee_currency,
                expenses_budget, is_public, requires_tickets, weather_sensitive,
                backup_location_id, backup_location_name, concert_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id,
            req.user!.associationId,
            data.name,
            data.eventType ?? 'performance',
            data.status ?? 'planned',
            data.locationId ?? null,
            data.locationName ?? null,
            data.address ?? null,
            data.city ?? null,
            data.latitude ?? null,
            data.longitude ?? null,
            data.indoorOutdoor ?? 'indoor',
            data.startDatetime,
            data.endDatetime ?? null,
            data.setupTime ?? null,
            data.soundcheckTime ?? null,
            data.doorsTime ?? null,
            data.performanceTime ?? null,
            data.breakTime ?? null,
            data.packDownTime ?? null,
            data.expectedAudience ?? null,
            data.dressCode ?? null,
            data.description ?? null,
            data.internalNotes ?? null,
            data.publicNotes ?? null,
            data.feeAmount ?? null,
            data.feeCurrency ?? 'EUR',
            data.expensesBudget ?? null,
            data.isPublic ?? 0,
            data.requiresTickets ?? 0,
            data.weatherSensitive ?? 0,
            data.backupLocationId ?? null,
            data.backupLocationName ?? null,
            data.concertId ?? null,
            req.user!.id
        );

        if (data.orchestraIds && data.orchestraIds.length > 0) {
            const stmt = db.prepare(`
                INSERT INTO event_orchestras (event_id, orchestra_id, performance_order)
                VALUES (?, ?, ?)
            `);
            data.orchestraIds.forEach((orchestraId, index) => {
                stmt.run(id, orchestraId, index);
            });
        }
    });

    logger.info(`Event created: ${data.name}`, { id, createdBy: req.user!.id });

    res.status(201).json({ id, message: 'Evenement aangemaakt.' });
}));

router.put('/:id', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEventSchema.partial().parse(req.body);

    const existing = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.id, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    withTransaction(() => {
        const updates: string[] = [];
        const values: any[] = [];

        const fieldMap: Record<string, string> = {
            name: 'name', eventType: 'event_type', status: 'status',
            locationId: 'location_id', locationName: 'location_name',
            address: 'address', city: 'city', latitude: 'latitude', longitude: 'longitude',
            indoorOutdoor: 'indoor_outdoor', startDatetime: 'start_datetime',
            endDatetime: 'end_datetime', setupTime: 'setup_time', soundcheckTime: 'soundcheck_time',
            doorsTime: 'doors_time', performanceTime: 'performance_time',
            breakTime: 'break_time', packDownTime: 'pack_down_time',
            expectedAudience: 'expected_audience', dressCode: 'dress_code',
            description: 'description', internalNotes: 'internal_notes',
            publicNotes: 'public_notes', feeAmount: 'fee_amount', feeCurrency: 'fee_currency',
            expensesBudget: 'expenses_budget', isPublic: 'is_public',
            requiresTickets: 'requires_tickets', weatherSensitive: 'weather_sensitive',
            backupLocationId: 'backup_location_id', backupLocationName: 'backup_location_name',
            concertId: 'concert_id'
        };

        for (const [key, dbField] of Object.entries(fieldMap)) {
            if (key in data) {
                updates.push(`${dbField} = ?`);
                values.push((data as any)[key] ?? null);
            }
        }

        if (updates.length > 0) {
            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(req.params.id);
            db.prepare(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }

        if (data.orchestraIds !== undefined) {
            db.prepare('DELETE FROM event_orchestras WHERE event_id = ?').run(req.params.id);
            if (data.orchestraIds.length > 0) {
                const stmt = db.prepare(`
                    INSERT INTO event_orchestras (event_id, orchestra_id, performance_order)
                    VALUES (?, ?, ?)
                `);
                data.orchestraIds.forEach((orchestraId, index) => {
                    stmt.run(req.params.id, orchestraId, index);
                });
            }
        }
    });

    logger.info(`Event updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Evenement bijgewerkt.' });
}));

router.delete('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM events WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    logger.info(`Event deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Evenement verwijderd.' });
}));

// ===========================================
// SCHEDULE ITEMS
// ===========================================

router.get('/:eventId/schedule', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const items = db.prepare(`
        SELECT si.*, u.first_name, u.last_name
        FROM event_schedule_items si
        LEFT JOIN users u ON si.responsible_user_id = u.id
        WHERE si.event_id = ?
        ORDER BY si.start_time, si.sort_order
    `).all(req.params.eventId);

    res.json((items as any[]).map(mapScheduleItem));
}));

router.post('/:eventId/schedule', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const data = createScheduleItemSchema.parse(req.body);
    const id = uuidv4();

    db.prepare(`
        INSERT INTO event_schedule_items (
            id, event_id, title, description, start_time, end_time, duration_minutes,
            item_type, responsible_user_id, responsible_name, location_description,
            is_public, sort_order, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.params.eventId,
        data.title,
        data.description ?? null,
        data.startTime,
        data.endTime ?? null,
        data.durationMinutes ?? null,
        data.itemType ?? 'general',
        data.responsibleUserId ?? null,
        data.responsibleName ?? null,
        data.locationDescription ?? null,
        data.isPublic ?? 0,
        data.sortOrder ?? 0,
        data.notes ?? null
    );

    res.status(201).json({ id, message: 'Programma-item aangemaakt.' });
}));

router.put('/:eventId/schedule/:itemId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const data = createScheduleItemSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
        title: 'title', description: 'description', startTime: 'start_time',
        endTime: 'end_time', durationMinutes: 'duration_minutes', itemType: 'item_type',
        responsibleUserId: 'responsible_user_id', responsibleName: 'responsible_name',
        locationDescription: 'location_description', isPublic: 'is_public',
        sortOrder: 'sort_order', notes: 'notes'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
        if (key in data) {
            updates.push(`${dbField} = ?`);
            values.push((data as any)[key] ?? null);
        }
    }

    if (updates.length > 0) {
        values.push(req.params.itemId, req.params.eventId);
        db.prepare(`UPDATE event_schedule_items SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`).run(...values);
    }

    res.json({ message: 'Programma-item bijgewerkt.' });
}));

router.delete('/:eventId/schedule/:itemId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM event_schedule_items
        WHERE id = ? AND event_id IN (SELECT id FROM events WHERE id = ? AND association_id = ?)
    `).run(req.params.itemId, req.params.eventId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Programma-item niet gevonden.');
    }

    res.json({ message: 'Programma-item verwijderd.' });
}));

// ===========================================
// TRANSPORT
// ===========================================

router.get('/:eventId/transport', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const transport = db.prepare(`
        SELECT t.*, u.first_name, u.last_name
        FROM event_transport t
        LEFT JOIN users u ON t.driver_user_id = u.id
        WHERE t.event_id = ?
        ORDER BY t.departure_time
    `).all(req.params.eventId);

    const transportIds = (transport as any[]).map(t => t.id);
    const passengers = transportIds.length > 0 ? db.prepare(`
        SELECT p.*, u.first_name, u.last_name
        FROM event_transport_passengers p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.transport_id IN (${transportIds.map(() => '?').join(',')})
    `).all(...transportIds) : [];

    const passengerMap = new Map<string, any[]>();
    (passengers as any[]).forEach(p => {
        if (!passengerMap.has(p.transport_id)) {
            passengerMap.set(p.transport_id, []);
        }
        passengerMap.get(p.transport_id)!.push({
            id: p.id,
            userId: p.user_id,
            passengerName: p.user_id ? `${p.first_name} ${p.last_name}` : p.passenger_name,
            pickupLocation: p.pickup_location,
            pickupAddress: p.pickup_address,
            pickupTime: p.pickup_time,
            notes: p.notes,
            confirmed: !!p.confirmed,
        });
    });

    res.json((transport as any[]).map(t => ({
        ...mapTransport(t),
        passengers: passengerMap.get(t.id) || [],
    })));
}));

router.post('/:eventId/transport', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const data = createTransportSchema.parse(req.body);
    const id = uuidv4();

    db.prepare(`
        INSERT INTO event_transport (
            id, event_id, transport_type, vehicle_description, license_plate, capacity,
            driver_user_id, driver_name, driver_phone, departure_time, departure_location,
            departure_address, departure_latitude, departure_longitude,
            arrival_time, return_time, return_departure_time, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.params.eventId,
        data.transportType,
        data.vehicleDescription ?? null,
        data.licensePlate ?? null,
        data.capacity ?? null,
        data.driverUserId ?? null,
        data.driverName ?? null,
        data.driverPhone ?? null,
        data.departureTime ?? null,
        data.departureLocation ?? null,
        data.departureAddress ?? null,
        data.departureLatitude ?? null,
        data.departureLongitude ?? null,
        data.arrivalTime ?? null,
        data.returnTime ?? null,
        data.returnDepartureTime ?? null,
        data.notes ?? null
    );

    res.status(201).json({ id, message: 'Vervoer aangemaakt.' });
}));

router.put('/:eventId/transport/:transportId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createTransportSchema.partial().parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
        transportType: 'transport_type', vehicleDescription: 'vehicle_description',
        licensePlate: 'license_plate', capacity: 'capacity',
        driverUserId: 'driver_user_id', driverName: 'driver_name', driverPhone: 'driver_phone',
        departureTime: 'departure_time', departureLocation: 'departure_location',
        departureAddress: 'departure_address', departureLatitude: 'departure_latitude',
        departureLongitude: 'departure_longitude', arrivalTime: 'arrival_time',
        returnTime: 'return_time', returnDepartureTime: 'return_departure_time', notes: 'notes'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
        if (key in data) {
            updates.push(`${dbField} = ?`);
            values.push((data as any)[key] ?? null);
        }
    }

    if (updates.length > 0) {
        values.push(req.params.transportId, req.params.eventId);
        db.prepare(`UPDATE event_transport SET ${updates.join(', ')} WHERE id = ? AND event_id = ?`).run(...values);
    }

    res.json({ message: 'Vervoer bijgewerkt.' });
}));

router.delete('/:eventId/transport/:transportId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM event_transport
        WHERE id = ? AND event_id IN (SELECT id FROM events WHERE id = ? AND association_id = ?)
    `).run(req.params.transportId, req.params.eventId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Vervoer niet gevonden.');
    }

    res.json({ message: 'Vervoer verwijderd.' });
}));

router.post('/:eventId/transport/:transportId/passengers', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId, passengerName, pickupLocation, pickupAddress, pickupTime, notes } = req.body;

    const transport = db.prepare(`
        SELECT t.id, t.capacity FROM event_transport t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = ? AND e.association_id = ?
    `).get(req.params.transportId, req.user!.associationId) as any;

    if (!transport) {
        throw new ApiError(404, 'Vervoer niet gevonden.');
    }

    const currentCount = db.prepare(
        'SELECT COUNT(*) as count FROM event_transport_passengers WHERE transport_id = ?'
    ).get(req.params.transportId) as { count: number };

    if (transport.capacity && currentCount.count >= transport.capacity) {
        throw new ApiError(400, 'Vervoer zit vol.');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO event_transport_passengers (
            id, transport_id, user_id, passenger_name, pickup_location, pickup_address, pickup_time, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.params.transportId,
        userId ?? null,
        passengerName || null,
        pickupLocation ?? null,
        pickupAddress ?? null,
        pickupTime ?? null,
        notes ?? null
    );

    res.status(201).json({ id, message: 'Passagier toegevoegd.' });
}));

router.delete('/:eventId/transport/:transportId/passengers/:passengerId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM event_transport_passengers
        WHERE id = ? AND transport_id = ?
    `).run(req.params.passengerId, req.params.transportId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Passagier niet gevonden.');
    }

    res.json({ message: 'Passagier verwijderd.' });
}));

// ===========================================
// MEETING POINTS
// ===========================================

router.get('/:eventId/meeting-points', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const points = db.prepare(`
        SELECT * FROM event_meeting_points WHERE event_id = ? ORDER BY is_primary DESC, meeting_time
    `).all(req.params.eventId);

    res.json((points as any[]).map(mapMeetingPoint));
}));

router.post('/:eventId/meeting-points', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const data = createMeetingPointSchema.parse(req.body);
    const id = uuidv4();

    if (data.isPrimary) {
        db.prepare('UPDATE event_meeting_points SET is_primary = 0 WHERE event_id = ?').run(req.params.eventId);
    }

    db.prepare(`
        INSERT INTO event_meeting_points (
            id, event_id, name, address, city, latitude, longitude, meeting_time, description, is_primary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.params.eventId,
        data.name,
        data.address ?? null,
        data.city ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.meetingTime,
        data.description ?? null,
        data.isPrimary ?? 0
    );

    res.status(201).json({ id, message: 'Verzamelpunt aangemaakt.' });
}));

router.delete('/:eventId/meeting-points/:pointId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM event_meeting_points
        WHERE id = ? AND event_id IN (SELECT id FROM events WHERE id = ? AND association_id = ?)
    `).run(req.params.pointId, req.params.eventId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Verzamelpunt niet gevonden.');
    }

    res.json({ message: 'Verzamelpunt verwijderd.' });
}));

// ===========================================
// PACKING LISTS
// ===========================================

router.get('/:eventId/packing-lists', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const lists = db.prepare(`
        SELECT pl.*,
               (SELECT COUNT(*) FROM event_packing_items WHERE packing_list_id = pl.id) as total_items,
               (SELECT COUNT(*) FROM event_packing_items WHERE packing_list_id = pl.id AND is_packed = 1) as packed_items
        FROM event_packing_lists pl
        WHERE pl.event_id = ?
    `).all(req.params.eventId);

    res.json((lists as any[]).map(l => ({
        id: l.id,
        eventId: l.event_id,
        templateId: l.template_id,
        name: l.name,
        notes: l.notes,
        totalItems: l.total_items,
        packedItems: l.packed_items,
        progress: l.total_items > 0 ? Math.round((l.packed_items / l.total_items) * 100) : 0,
        createdAt: l.created_at,
    })));
}));

router.get('/:eventId/packing-lists/:listId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = db.prepare(`
        SELECT pl.* FROM event_packing_lists pl
        JOIN events e ON pl.event_id = e.id
        WHERE pl.id = ? AND e.association_id = ?
    `).get(req.params.listId, req.user!.associationId) as any;

    if (!list) {
        throw new ApiError(404, 'Paklijst niet gevonden.');
    }

    const items = db.prepare(`
        SELECT pi.*, u.first_name, u.last_name, pb.first_name as packed_by_first, pb.last_name as packed_by_last
        FROM event_packing_items pi
        LEFT JOIN users u ON pi.responsible_user_id = u.id
        LEFT JOIN users pb ON pi.packed_by_user_id = pb.id
        WHERE pi.packing_list_id = ?
        ORDER BY pi.category, pi.sort_order, pi.item_name
    `).all(req.params.listId);

    res.json({
        id: list.id,
        eventId: list.event_id,
        templateId: list.template_id,
        name: list.name,
        notes: list.notes,
        createdAt: list.created_at,
        items: (items as any[]).map(mapPackingItem),
    });
}));

router.post('/:eventId/packing-lists', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const data = createPackingListSchema.parse(req.body);
    const id = uuidv4();

    withTransaction(() => {
        db.prepare(`
            INSERT INTO event_packing_lists (id, event_id, template_id, name, notes)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, req.params.eventId, data.templateId ?? null, data.name, data.notes ?? null);

        if (data.templateId) {
            const templateItems = db.prepare(`
                SELECT * FROM packing_list_template_items WHERE template_id = ?
            `).all(data.templateId) as any[];

            const stmt = db.prepare(`
                INSERT INTO event_packing_items (
                    id, packing_list_id, category, item_name, quantity, is_required, notes, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            templateItems.forEach(item => {
                stmt.run(
                    uuidv4(),
                    id,
                    item.category,
                    item.item_name,
                    item.quantity,
                    item.is_required,
                    item.notes,
                    item.sort_order
                );
            });
        }
    });

    res.status(201).json({ id, message: 'Paklijst aangemaakt.' });
}));

router.post('/:eventId/packing-lists/:listId/items', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = db.prepare(`
        SELECT pl.id FROM event_packing_lists pl
        JOIN events e ON pl.event_id = e.id
        WHERE pl.id = ? AND e.association_id = ?
    `).get(req.params.listId, req.user!.associationId);

    if (!list) {
        throw new ApiError(404, 'Paklijst niet gevonden.');
    }

    const data = createPackingItemSchema.parse(req.body);
    const id = uuidv4();

    db.prepare(`
        INSERT INTO event_packing_items (
            id, packing_list_id, category, item_name, quantity, is_required,
            responsible_user_id, responsible_name, notes, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id,
        req.params.listId,
        data.category ?? 'general',
        data.itemName,
        data.quantity ?? 1,
        data.isRequired ?? 1,
        data.responsibleUserId ?? null,
        data.responsibleName ?? null,
        data.notes ?? null,
        data.sortOrder ?? 0
    );

    res.status(201).json({ id, message: 'Item toegevoegd.' });
}));

router.put('/:eventId/packing-lists/:listId/items/:itemId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { isPacked, quantityPacked } = req.body;

    const item = db.prepare(`
        SELECT pi.id FROM event_packing_items pi
        JOIN event_packing_lists pl ON pi.packing_list_id = pl.id
        JOIN events e ON pl.event_id = e.id
        WHERE pi.id = ? AND e.association_id = ?
    `).get(req.params.itemId, req.user!.associationId);

    if (!item) {
        throw new ApiError(404, 'Item niet gevonden.');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (typeof isPacked === 'boolean') {
        updates.push('is_packed = ?', 'packed_by_user_id = ?', 'packed_at = ?');
        values.push(isPacked ? 1 : 0, isPacked ? req.user!.id : null, isPacked ? new Date().toISOString() : null);
    }

    if (typeof quantityPacked === 'number') {
        updates.push('quantity_packed = ?');
        values.push(quantityPacked);
    }

    if (updates.length > 0) {
        values.push(req.params.itemId);
        db.prepare(`UPDATE event_packing_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ message: 'Item bijgewerkt.' });
}));

router.delete('/:eventId/packing-lists/:listId/items/:itemId', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM event_packing_items WHERE id = ? AND packing_list_id = ?
    `).run(req.params.itemId, req.params.listId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Item niet gevonden.');
    }

    res.json({ message: 'Item verwijderd.' });
}));

// ===========================================
// ATTENDANCE
// ===========================================

router.post('/:eventId/attendance', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const data = updateAttendanceSchema.parse(req.body);

    db.prepare(`
        INSERT INTO event_attendance (
            id, event_id, user_id, status, response_date, instrument_id,
            transport_needed, can_drive, available_seats, dietary_requirements, notes
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id, user_id) DO UPDATE SET
            status = excluded.status,
            response_date = CURRENT_TIMESTAMP,
            instrument_id = excluded.instrument_id,
            transport_needed = excluded.transport_needed,
            can_drive = excluded.can_drive,
            available_seats = excluded.available_seats,
            dietary_requirements = excluded.dietary_requirements,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        uuidv4(),
        req.params.eventId,
        req.user!.id,
        data.status,
        data.instrumentId ?? null,
        data.transportNeeded ?? 0,
        data.canDrive ?? 0,
        data.availableSeats ?? 0,
        data.dietaryRequirements ?? null,
        data.notes ?? null
    );

    res.json({ message: 'Aanwezigheid bijgewerkt.' });
}));

router.get('/:eventId/attendance/summary', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(
        'SELECT id FROM events WHERE id = ? AND association_id = ?'
    ).get(req.params.eventId, req.user!.associationId);

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const summary = db.prepare(`
        SELECT
            status,
            COUNT(*) as count
        FROM event_attendance
        WHERE event_id = ?
        GROUP BY status
    `).all(req.params.eventId);

    const transportNeeds = db.prepare(`
        SELECT
            SUM(CASE WHEN transport_needed = 1 THEN 1 ELSE 0 END) as needs_transport,
            SUM(CASE WHEN can_drive = 1 THEN available_seats ELSE 0 END) as available_seats
        FROM event_attendance
        WHERE event_id = ? AND status = 'attending'
    `).get(req.params.eventId) as any;

    const byInstrument = db.prepare(`
        SELECT i.name, COUNT(*) as count
        FROM event_attendance ea
        JOIN instruments i ON ea.instrument_id = i.id
        WHERE ea.event_id = ? AND ea.status = 'attending'
        GROUP BY i.id
        ORDER BY count DESC
    `).all(req.params.eventId);

    res.json({
        byStatus: (summary as any[]).reduce((acc, s) => {
            acc[s.status] = s.count;
            return acc;
        }, {}),
        transport: {
            needsTransport: transportNeeds?.needs_transport || 0,
            availableSeats: transportNeeds?.available_seats || 0,
        },
        byInstrument: (byInstrument as any[]).map(i => ({
            instrument: i.name,
            count: i.count,
        })),
    });
}));

// ===========================================
// PACKING LIST TEMPLATES
// ===========================================

router.get('/packing-templates', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const templates = db.prepare(`
        SELECT t.*, u.first_name, u.last_name,
               (SELECT COUNT(*) FROM packing_list_template_items WHERE template_id = t.id) as item_count
        FROM packing_list_templates t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.association_id = ?
        ORDER BY t.is_default DESC, t.name
    `).all(req.user!.associationId);

    res.json((templates as any[]).map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        eventType: t.event_type,
        isDefault: !!t.is_default,
        itemCount: t.item_count,
        createdBy: t.first_name ? `${t.first_name} ${t.last_name}` : null,
        createdAt: t.created_at,
    })));
}));

router.get('/packing-templates/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const template = db.prepare(`
        SELECT * FROM packing_list_templates WHERE id = ? AND association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!template) {
        throw new ApiError(404, 'Template niet gevonden.');
    }

    const items = db.prepare(`
        SELECT * FROM packing_list_template_items WHERE template_id = ? ORDER BY category, sort_order, item_name
    `).all(req.params.id);

    res.json({
        id: template.id,
        name: template.name,
        description: template.description,
        eventType: template.event_type,
        isDefault: !!template.is_default,
        createdAt: template.created_at,
        items: (items as any[]).map(i => ({
            id: i.id,
            category: i.category,
            itemName: i.item_name,
            quantity: i.quantity,
            isRequired: !!i.is_required,
            responsibleRole: i.responsible_role,
            notes: i.notes,
            sortOrder: i.sort_order,
        })),
    });
}));

router.post('/packing-templates', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, description, eventType, isDefault, items } = req.body;

    if (!name) {
        throw new ApiError(400, 'Naam is verplicht.');
    }

    const id = uuidv4();

    withTransaction(() => {
        if (isDefault) {
            db.prepare('UPDATE packing_list_templates SET is_default = 0 WHERE association_id = ?').run(req.user!.associationId);
        }

        db.prepare(`
            INSERT INTO packing_list_templates (id, association_id, name, description, event_type, is_default, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user!.associationId, name, description ?? null, eventType ?? null, isDefault ?? 0, req.user!.id);

        if (items && Array.isArray(items)) {
            const stmt = db.prepare(`
                INSERT INTO packing_list_template_items (id, template_id, category, item_name, quantity, is_required, responsible_role, notes, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            items.forEach((item: any, index: number) => {
                stmt.run(
                    uuidv4(),
                    id,
                    item.category ?? 'general',
                    item.itemName,
                    item.quantity ?? 1,
                    item.isRequired ?? 1,
                    item.responsibleRole ?? null,
                    item.notes ?? null,
                    item.sortOrder ?? index
                );
            });
        }
    });

    res.status(201).json({ id, message: 'Template aangemaakt.' });
}));

router.delete('/packing-templates/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(
        'DELETE FROM packing_list_templates WHERE id = ? AND association_id = ?'
    ).run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Template niet gevonden.');
    }

    res.json({ message: 'Template verwijderd.' });
}));

// ===========================================
// WEATHER
// ===========================================

router.get('/:eventId/weather', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(`
        SELECT e.*, l.latitude as loc_lat, l.longitude as loc_lng
        FROM events e
        LEFT JOIN event_locations l ON e.location_id = l.id
        WHERE e.id = ? AND e.association_id = ?
    `).get(req.params.eventId, req.user!.associationId) as any;

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const weather = db.prepare(`
        SELECT * FROM event_weather
        WHERE event_id = ?
        ORDER BY fetched_at DESC
        LIMIT 10
    `).all(req.params.eventId);

    const latestByDate = new Map<string, any>();
    (weather as any[]).forEach(w => {
        if (!latestByDate.has(w.forecast_date)) {
            latestByDate.set(w.forecast_date, w);
        }
    });

    res.json({
        location: {
            latitude: event.latitude || event.loc_lat,
            longitude: event.longitude || event.loc_lng,
        },
        forecasts: Array.from(latestByDate.values()).map(mapWeather),
    });
}));

router.post('/:eventId/weather/fetch', authenticateToken, requireRole('board', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const event = db.prepare(`
        SELECT e.*, l.latitude as loc_lat, l.longitude as loc_lng
        FROM events e
        LEFT JOIN event_locations l ON e.location_id = l.id
        WHERE e.id = ? AND e.association_id = ?
    `).get(req.params.eventId, req.user!.associationId) as any;

    if (!event) {
        throw new ApiError(404, 'Evenement niet gevonden.');
    }

    const lat = event.latitude || event.loc_lat;
    const lng = event.longitude || event.loc_lng;

    if (!lat || !lng) {
        throw new ApiError(400, 'Geen locatie coördinaten beschikbaar voor dit evenement.');
    }

    const settings = db.prepare(`
        SELECT * FROM weather_settings WHERE association_id = ?
    `).get(req.user!.associationId) as any;

    if (!settings?.api_key) {
        throw new ApiError(400, 'Weer API niet geconfigureerd. Stel eerst een API key in.');
    }

    res.json({
        message: 'Weer ophalen gestart. Dit kan even duren.',
        note: 'Weather API integration pending implementation'
    });
}));

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function mapLocation(l: any) {
    return {
        id: l.id,
        associationId: l.association_id,
        name: l.name,
        address: l.address,
        city: l.city,
        postalCode: l.postal_code,
        country: l.country,
        latitude: l.latitude,
        longitude: l.longitude,
        venueType: l.venue_type,
        capacity: l.capacity,
        indoorOutdoor: l.indoor_outdoor,
        hasElectricity: !!l.has_electricity,
        hasChangingRooms: !!l.has_changing_rooms,
        hasStorage: !!l.has_storage,
        hasCatering: !!l.has_catering,
        hasParking: !!l.has_parking,
        parkingInfo: l.parking_info,
        accessibilityInfo: l.accessibility_info,
        contactName: l.contact_name,
        contactPhone: l.contact_phone,
        contactEmail: l.contact_email,
        notes: l.notes,
        isFavorite: !!l.is_favorite,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
    };
}

function mapEvent(e: any) {
    return {
        id: e.id,
        associationId: e.association_id,
        concertId: e.concert_id,
        name: e.name,
        eventType: e.event_type,
        status: e.status,
        locationId: e.location_id,
        locationName: e.location_name || e.location_full_name,
        address: e.address || e.location_full_address,
        city: e.city,
        latitude: e.latitude,
        longitude: e.longitude,
        indoorOutdoor: e.indoor_outdoor,
        startDatetime: e.start_datetime,
        endDatetime: e.end_datetime,
        setupTime: e.setup_time,
        soundcheckTime: e.soundcheck_time,
        doorsTime: e.doors_time,
        performanceTime: e.performance_time,
        breakTime: e.break_time,
        packDownTime: e.pack_down_time,
        expectedAudience: e.expected_audience,
        dressCode: e.dress_code,
        description: e.description,
        internalNotes: e.internal_notes,
        publicNotes: e.public_notes,
        feeAmount: e.fee_amount,
        feeCurrency: e.fee_currency,
        expensesBudget: e.expenses_budget,
        isPublic: !!e.is_public,
        requiresTickets: !!e.requires_tickets,
        weatherSensitive: !!e.weather_sensitive,
        backupLocationId: e.backup_location_id,
        backupLocationName: e.backup_location_name || e.backup_location_full_name,
        attendingCount: e.attending_count,
        notAttendingCount: e.not_attending_count,
        createdBy: e.created_by,
        createdAt: e.created_at,
        updatedAt: e.updated_at,
    };
}

function mapScheduleItem(s: any) {
    return {
        id: s.id,
        eventId: s.event_id,
        title: s.title,
        description: s.description,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
        itemType: s.item_type,
        responsibleUserId: s.responsible_user_id,
        responsibleName: s.responsible_name || (s.first_name ? `${s.first_name} ${s.last_name}` : null),
        locationDescription: s.location_description,
        isPublic: !!s.is_public,
        sortOrder: s.sort_order,
        status: s.status,
        notes: s.notes,
        createdAt: s.created_at,
    };
}

function mapTransport(t: any) {
    return {
        id: t.id,
        eventId: t.event_id,
        transportType: t.transport_type,
        vehicleDescription: t.vehicle_description,
        licensePlate: t.license_plate,
        capacity: t.capacity,
        driverUserId: t.driver_user_id,
        driverName: t.driver_name || (t.first_name ? `${t.first_name} ${t.last_name}` : null),
        driverPhone: t.driver_phone,
        departureTime: t.departure_time,
        departureLocation: t.departure_location,
        departureAddress: t.departure_address,
        departureLatitude: t.departure_latitude,
        departureLongitude: t.departure_longitude,
        arrivalTime: t.arrival_time,
        returnTime: t.return_time,
        returnDepartureTime: t.return_departure_time,
        notes: t.notes,
        status: t.status,
        createdAt: t.created_at,
    };
}

function mapMeetingPoint(m: any) {
    return {
        id: m.id,
        eventId: m.event_id,
        name: m.name,
        address: m.address,
        city: m.city,
        latitude: m.latitude,
        longitude: m.longitude,
        meetingTime: m.meeting_time,
        description: m.description,
        isPrimary: !!m.is_primary,
        createdAt: m.created_at,
    };
}

function mapPackingItem(p: any) {
    return {
        id: p.id,
        packingListId: p.packing_list_id,
        category: p.category,
        itemName: p.item_name,
        quantity: p.quantity,
        quantityPacked: p.quantity_packed,
        isRequired: !!p.is_required,
        isPacked: !!p.is_packed,
        packedByUserId: p.packed_by_user_id,
        packedByName: p.packed_by_first ? `${p.packed_by_first} ${p.packed_by_last}` : null,
        packedAt: p.packed_at,
        responsibleUserId: p.responsible_user_id,
        responsibleName: p.responsible_name || (p.first_name ? `${p.first_name} ${p.last_name}` : null),
        notes: p.notes,
        sortOrder: p.sort_order,
        createdAt: p.created_at,
    };
}

function mapAttendance(a: any) {
    return {
        id: a.id,
        eventId: a.event_id,
        userId: a.user_id,
        status: a.status,
        responseDate: a.response_date,
        instrumentId: a.instrument_id,
        transportNeeded: !!a.transport_needed,
        canDrive: !!a.can_drive,
        availableSeats: a.available_seats,
        dietaryRequirements: a.dietary_requirements,
        notes: a.notes,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
    };
}

function mapWeather(w: any) {
    return {
        id: w.id,
        eventId: w.event_id,
        fetchedAt: w.fetched_at,
        forecastDate: w.forecast_date,
        forecastTime: w.forecast_time,
        temperatureC: w.temperature_c,
        feelsLikeC: w.feels_like_c,
        humidityPercent: w.humidity_percent,
        windSpeedKmh: w.wind_speed_kmh,
        windDirection: w.wind_direction,
        precipitationMm: w.precipitation_mm,
        precipitationProbability: w.precipitation_probability,
        weatherCode: w.weather_code,
        weatherDescription: w.weather_description,
        uvIndex: w.uv_index,
        cloudCoverPercent: w.cloud_cover_percent,
        visibilityKm: w.visibility_km,
        sunrise: w.sunrise,
        sunset: w.sunset,
        isOutdoorSuitable: w.is_outdoor_suitable,
        alertLevel: w.alert_level,
        alertMessage: w.alert_message,
    };
}

export default router;
