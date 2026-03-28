import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { logAuditEvent } from './audit-logs';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createSectionSchema = z.object({
    orchestraId: z.string().uuid(),
    name: z.string().min(1),
    rowNumber: z.number().int().min(1),
    instrumentIds: z.array(z.string().uuid()).optional(),
});

const updateSectionSchema = z.object({
    name: z.string().min(1).optional(),
    rowNumber: z.number().int().min(1).optional(),
    instrumentIds: z.array(z.string().uuid()).optional(),
});

const updateSectionInstrumentsSchema = z.object({
    instrumentIds: z.array(z.string().uuid()),
});

const createAssignmentSchema = z.object({
    orchestraId: z.string().uuid(),
    userId: z.string().uuid(),
    sectionId: z.string().uuid(),
    positionInSection: z.number().int().min(0),
    seatLabel: z.string().optional(),
    notes: z.string().optional(),
});

const updateAssignmentSchema = z.object({
    sectionId: z.string().uuid().optional(),
    positionInSection: z.number().int().min(0).optional(),
    seatLabel: z.string().optional(),
    notes: z.string().optional(),
});

const createNeighborSchema = z.object({
    orchestraId: z.string().uuid(),
    userId: z.string().uuid(),
    neighborUserId: z.string().uuid(),
    preference: z.enum(['preferred', 'avoid']),
});

// ============================================
// SEATING SECTIONS
// ============================================

/**
 * @swagger
 * /seating/sections/{orchestraId}:
 *   get:
 *     summary: Get all seating sections for an orchestra
 *     tags: [Seating]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orchestraId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of seating sections with instruments
 *       404:
 *         description: Orchestra not found
 */
router.get('/sections/:orchestraId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const sections = db.prepare(`
        SELECT ss.id, ss.name, ss.row_number, ss.sort_order, ss.created_at
        FROM seating_sections ss
        WHERE ss.orchestra_id = ?
        ORDER BY ss.row_number, ss.sort_order
    `).all(orchestraId);

    // Get instruments for each section
    const sectionsWithInstruments = sections.map((section: any) => {
        const instruments = db.prepare(`
            SELECT i.id, i.name, i.tuning, ssi.sort_order
            FROM seating_section_instruments ssi
            JOIN instruments i ON ssi.instrument_id = i.id
            WHERE ssi.section_id = ?
            ORDER BY ssi.sort_order
        `).all(section.id);

        return {
            id: section.id,
            name: section.name,
            rowNumber: section.row_number,
            sortOrder: section.sort_order,
            instruments: instruments.map((i: any) => ({
                id: i.id,
                name: i.name,
                tuning: i.tuning,
                sortOrder: i.sort_order,
            })),
            createdAt: section.created_at,
        };
    });

    res.json(sectionsWithInstruments);
}));

/**
 * Create default seating layout for an orchestra
 */
router.post('/sections/:orchestraId/default', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id, name FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId) as any;

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Check if sections already exist
    const existingSections = db.prepare(
        'SELECT COUNT(*) as count FROM seating_sections WHERE orchestra_id = ?'
    ).get(orchestraId) as any;

    if (existingSections.count > 0) {
        throw new ApiError(400, 'Orkest heeft al een opstelling. Verwijder deze eerst.');
    }

    // Default layout:
    // Row 1: Flutes, Oboe, Clarinet (Bb)
    // Row 2: Clarinets (other)
    // Row 3: Saxophones, French Horn, Trumpet
    // Row 4: Euphonium, Tuba, Trombone, Piano, Guitar
    // Row 5: Percussion (behind)

    const defaultLayout = [
        { rowNumber: 1, name: 'Rij 1 - Fluiten, Hobo, Klarinet 1', instruments: ['Flute', 'Piccolo', 'Oboe', 'Clarinet'] },
        { rowNumber: 2, name: 'Rij 2 - Klarinetten 2 & 3', instruments: ['Bass Clarinet', 'Eb Clarinet', 'Alto Clarinet'] },
        { rowNumber: 3, name: 'Rij 3 - Saxofoons, Hoorns, Trompetten', instruments: ['Alto Saxophone', 'Tenor Saxophone', 'Baritone Saxophone', 'Soprano Saxophone', 'French Horn', 'Trumpet', 'Cornet', 'Flugelhorn'] },
        { rowNumber: 4, name: 'Rij 4 - Baritons, Bassen, Trombones', instruments: ['Euphonium', 'Tuba', 'Trombone', 'Bass Trombone', 'Piano', 'Guitar', 'Electric Bass', 'String Bass'] },
        { rowNumber: 5, name: 'Rij 5 - Slagwerk', instruments: ['Percussion', 'Timpani', 'Mallets'] },
    ];

    const transaction = db.transaction(() => {
        for (const row of defaultLayout) {
            const sectionId = uuidv4();
            db.prepare(`
                INSERT INTO seating_sections (id, orchestra_id, name, row_number, sort_order)
                VALUES (?, ?, ?, ?, ?)
            `).run(sectionId, orchestraId, row.name, row.rowNumber, row.rowNumber);

            // Add instruments to section
            let sortOrder = 0;
            for (const instrumentName of row.instruments) {
                const instrument = db.prepare(
                    'SELECT id FROM instruments WHERE name = ?'
                ).get(instrumentName) as any;

                if (instrument) {
                    db.prepare(`
                        INSERT OR IGNORE INTO seating_section_instruments (id, section_id, instrument_id, sort_order)
                        VALUES (?, ?, ?, ?)
                    `).run(uuidv4(), sectionId, instrument.id, sortOrder++);
                }
            }
        }
    });

    transaction();

    logger.info(`Default seating layout created for orchestra: ${orchestraId}`, { createdBy: req.user!.id });

    logAuditEvent(
        req.user!.id,
        'create',
        'seating_layout',
        orchestraId,
        orchestra.name,
        { type: 'default_layout' },
        req.ip,
        req.get('user-agent')
    );

    res.status(201).json({ message: 'Standaard opstelling aangemaakt.' });
}));

/**
 * Create a new seating section
 */
router.post('/sections', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createSectionSchema.parse(req.body);

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(data.orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Check if row number already exists
    const existingRow = db.prepare(
        'SELECT id FROM seating_sections WHERE orchestra_id = ? AND row_number = ?'
    ).get(data.orchestraId, data.rowNumber);

    if (existingRow) {
        throw new ApiError(400, 'Rijnummer bestaat al voor dit orkest.');
    }

    const sectionId = uuidv4();

    const transaction = db.transaction(() => {
        db.prepare(`
            INSERT INTO seating_sections (id, orchestra_id, name, row_number, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `).run(sectionId, data.orchestraId, data.name, data.rowNumber, data.rowNumber);

        // Add instruments if provided
        if (data.instrumentIds && data.instrumentIds.length > 0) {
            let sortOrder = 0;
            for (const instrumentId of data.instrumentIds) {
                db.prepare(`
                    INSERT INTO seating_section_instruments (id, section_id, instrument_id, sort_order)
                    VALUES (?, ?, ?, ?)
                `).run(uuidv4(), sectionId, instrumentId, sortOrder++);
            }
        }
    });

    transaction();

    logger.info(`Seating section created: ${sectionId}`, { createdBy: req.user!.id });

    res.status(201).json({
        id: sectionId,
        message: 'Sectie succesvol aangemaakt.',
    });
}));

/**
 * Update a seating section
 */
router.put('/sections/:id', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateSectionSchema.parse(req.body);

    // Verify section exists and belongs to user's association
    const section = db.prepare(`
        SELECT ss.id, ss.orchestra_id
        FROM seating_sections ss
        JOIN orchestras o ON ss.orchestra_id = o.id
        WHERE ss.id = ? AND o.association_id = ?
    `).get(id, req.user!.associationId) as any;

    if (!section) {
        throw new ApiError(404, 'Sectie niet gevonden.');
    }

    // Check row number uniqueness if changing
    if (data.rowNumber !== undefined) {
        const existingRow = db.prepare(
            'SELECT id FROM seating_sections WHERE orchestra_id = ? AND row_number = ? AND id != ?'
        ).get(section.orchestra_id, data.rowNumber, id);

        if (existingRow) {
            throw new ApiError(400, 'Rijnummer bestaat al voor dit orkest.');
        }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
        updates.push('name = ?');
        params.push(data.name);
    }
    if (data.rowNumber !== undefined) {
        updates.push('row_number = ?');
        params.push(data.rowNumber);
    }

    if (updates.length > 0) {
        params.push(id);
        db.prepare(`UPDATE seating_sections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // Update instruments if provided
    if (data.instrumentIds !== undefined) {
        db.prepare('DELETE FROM seating_section_instruments WHERE section_id = ?').run(id);

        let sortOrder = 0;
        for (const instrumentId of data.instrumentIds) {
            db.prepare(`
                INSERT INTO seating_section_instruments (id, section_id, instrument_id, sort_order)
                VALUES (?, ?, ?, ?)
            `).run(uuidv4(), id, instrumentId, sortOrder++);
        }
    }

    res.json({ message: 'Sectie succesvol bijgewerkt.' });
}));

/**
 * Delete a seating section
 */
router.delete('/sections/:id', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify section exists and belongs to user's association
    const section = db.prepare(`
        SELECT ss.id
        FROM seating_sections ss
        JOIN orchestras o ON ss.orchestra_id = o.id
        WHERE ss.id = ? AND o.association_id = ?
    `).get(id, req.user!.associationId);

    if (!section) {
        throw new ApiError(404, 'Sectie niet gevonden.');
    }

    db.prepare('DELETE FROM seating_sections WHERE id = ?').run(id);

    res.json({ message: 'Sectie succesvol verwijderd.' });
}));

/**
 * Delete all seating sections for an orchestra
 */
router.delete('/sections/orchestra/:orchestraId', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    db.prepare('DELETE FROM seating_sections WHERE orchestra_id = ?').run(orchestraId);

    res.json({ message: 'Alle secties verwijderd.' });
}));

// ============================================
// SEATING ASSIGNMENTS
// ============================================

/**
 * Get all seating assignments for an orchestra
 */
router.get('/assignments/:orchestraId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const assignments = db.prepare(`
        SELECT
            sa.id, sa.user_id, sa.section_id, sa.position_in_section, sa.seat_label, sa.notes,
            u.first_name, u.last_name, u.email,
            ss.name as section_name, ss.row_number,
            (SELECT GROUP_CONCAT(i.name, ', ')
             FROM user_instruments ui
             JOIN instruments i ON ui.instrument_id = i.id
             WHERE ui.user_id = sa.user_id) as instruments
        FROM seating_assignments sa
        JOIN users u ON sa.user_id = u.id
        JOIN seating_sections ss ON sa.section_id = ss.id
        WHERE sa.orchestra_id = ?
        ORDER BY ss.row_number, sa.position_in_section
    `).all(orchestraId);

    res.json(assignments.map((a: any) => ({
        id: a.id,
        userId: a.user_id,
        userName: `${a.first_name} ${a.last_name}`,
        userEmail: a.email,
        sectionId: a.section_id,
        sectionName: a.section_name,
        rowNumber: a.row_number,
        positionInSection: a.position_in_section,
        seatLabel: a.seat_label,
        notes: a.notes,
        instruments: a.instruments,
    })));
}));

/**
 * Create a seating assignment
 */
router.post('/assignments', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createAssignmentSchema.parse(req.body);

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(data.orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Check if user already has an assignment in this orchestra
    const existingAssignment = db.prepare(
        'SELECT id FROM seating_assignments WHERE orchestra_id = ? AND user_id = ?'
    ).get(data.orchestraId, data.userId);

    if (existingAssignment) {
        throw new ApiError(400, 'Lid heeft al een zitplaats in dit orkest.');
    }

    const assignmentId = uuidv4();
    db.prepare(`
        INSERT INTO seating_assignments (id, orchestra_id, user_id, section_id, position_in_section, seat_label, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(assignmentId, data.orchestraId, data.userId, data.sectionId, data.positionInSection, data.seatLabel || null, data.notes || null);

    res.status(201).json({
        id: assignmentId,
        message: 'Zitplaats toegewezen.',
    });
}));

/**
 * Update a seating assignment
 */
router.put('/assignments/:id', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateAssignmentSchema.parse(req.body);

    // Verify assignment exists and belongs to user's association
    const assignment = db.prepare(`
        SELECT sa.id
        FROM seating_assignments sa
        JOIN orchestras o ON sa.orchestra_id = o.id
        WHERE sa.id = ? AND o.association_id = ?
    `).get(id, req.user!.associationId);

    if (!assignment) {
        throw new ApiError(404, 'Zitplaats niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.sectionId !== undefined) {
        updates.push('section_id = ?');
        params.push(data.sectionId);
    }
    if (data.positionInSection !== undefined) {
        updates.push('position_in_section = ?');
        params.push(data.positionInSection);
    }
    if (data.seatLabel !== undefined) {
        updates.push('seat_label = ?');
        params.push(data.seatLabel || null);
    }
    if (data.notes !== undefined) {
        updates.push('notes = ?');
        params.push(data.notes || null);
    }

    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);
        db.prepare(`UPDATE seating_assignments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Zitplaats bijgewerkt.' });
}));

/**
 * Delete a seating assignment
 */
router.delete('/assignments/:id', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify assignment exists and belongs to user's association
    const assignment = db.prepare(`
        SELECT sa.id
        FROM seating_assignments sa
        JOIN orchestras o ON sa.orchestra_id = o.id
        WHERE sa.id = ? AND o.association_id = ?
    `).get(id, req.user!.associationId);

    if (!assignment) {
        throw new ApiError(404, 'Zitplaats niet gevonden.');
    }

    db.prepare('DELETE FROM seating_assignments WHERE id = ?').run(id);

    res.json({ message: 'Zitplaats verwijderd.' });
}));

/**
 * Bulk update seating assignments (drag and drop)
 */
router.put('/assignments/bulk/:orchestraId', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;
    const { assignments } = req.body as { assignments: { userId: string; sectionId: string; positionInSection: number }[] };

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const transaction = db.transaction(() => {
        for (const assignment of assignments) {
            // Check if assignment exists
            const existing = db.prepare(
                'SELECT id FROM seating_assignments WHERE orchestra_id = ? AND user_id = ?'
            ).get(orchestraId, assignment.userId) as any;

            if (existing) {
                db.prepare(`
                    UPDATE seating_assignments
                    SET section_id = ?, position_in_section = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(assignment.sectionId, assignment.positionInSection, existing.id);
            } else {
                db.prepare(`
                    INSERT INTO seating_assignments (id, orchestra_id, user_id, section_id, position_in_section)
                    VALUES (?, ?, ?, ?, ?)
                `).run(uuidv4(), orchestraId, assignment.userId, assignment.sectionId, assignment.positionInSection);
            }
        }
    });

    transaction();

    res.json({ message: 'Zitplaatsen bijgewerkt.' });
}));

// ============================================
// NEIGHBOR PREFERENCES
// ============================================

/**
 * Get neighbor preferences for an orchestra
 */
router.get('/neighbors/:orchestraId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const neighbors = db.prepare(`
        SELECT
            sn.id, sn.user_id, sn.neighbor_user_id, sn.preference,
            u1.first_name as user_first_name, u1.last_name as user_last_name,
            u2.first_name as neighbor_first_name, u2.last_name as neighbor_last_name
        FROM seating_neighbors sn
        JOIN users u1 ON sn.user_id = u1.id
        JOIN users u2 ON sn.neighbor_user_id = u2.id
        WHERE sn.orchestra_id = ?
    `).all(orchestraId);

    res.json(neighbors.map((n: any) => ({
        id: n.id,
        userId: n.user_id,
        userName: `${n.user_first_name} ${n.user_last_name}`,
        neighborUserId: n.neighbor_user_id,
        neighborUserName: `${n.neighbor_first_name} ${n.neighbor_last_name}`,
        preference: n.preference,
    })));
}));

/**
 * Create a neighbor preference
 */
router.post('/neighbors', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createNeighborSchema.parse(req.body);

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(data.orchestraId, req.user!.associationId);

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    const neighborId = uuidv4();
    db.prepare(`
        INSERT INTO seating_neighbors (id, orchestra_id, user_id, neighbor_user_id, preference)
        VALUES (?, ?, ?, ?, ?)
    `).run(neighborId, data.orchestraId, data.userId, data.neighborUserId, data.preference);

    res.status(201).json({
        id: neighborId,
        message: 'Buurvoorkeur opgeslagen.',
    });
}));

/**
 * Delete a neighbor preference
 */
router.delete('/neighbors/:id', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify neighbor preference exists and belongs to user's association
    const neighbor = db.prepare(`
        SELECT sn.id
        FROM seating_neighbors sn
        JOIN orchestras o ON sn.orchestra_id = o.id
        WHERE sn.id = ? AND o.association_id = ?
    `).get(id, req.user!.associationId);

    if (!neighbor) {
        throw new ApiError(404, 'Buurvoorkeur niet gevonden.');
    }

    db.prepare('DELETE FROM seating_neighbors WHERE id = ?').run(id);

    res.json({ message: 'Buurvoorkeur verwijderd.' });
}));

// ============================================
// REHEARSAL SEATING (Generated per rehearsal)
// ============================================

/**
 * Get seating for a specific rehearsal
 */
router.get('/rehearsal/:rehearsalId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rehearsalId } = req.params;

    // Verify rehearsal exists and belongs to user's association
    const rehearsal = db.prepare(`
        SELECT r.id, r.orchestra_id
        FROM rehearsals r
        WHERE r.id = ? AND r.association_id = ?
    `).get(rehearsalId, req.user!.associationId) as any;

    if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    const seating = db.prepare(`
        SELECT
            rs.id, rs.user_id, rs.spond_member_id, rs.member_name, rs.instrument_name,
            rs.section_id, rs.row_number, rs.position_in_row, rs.is_conductor,
            ss.name as section_name
        FROM rehearsal_seating rs
        LEFT JOIN seating_sections ss ON rs.section_id = ss.id
        WHERE rs.rehearsal_id = ?
        ORDER BY rs.row_number, rs.position_in_row
    `).all(rehearsalId);

    res.json(seating.map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        spondMemberId: s.spond_member_id,
        memberName: s.member_name,
        instrumentName: s.instrument_name,
        sectionId: s.section_id,
        sectionName: s.section_name,
        rowNumber: s.row_number,
        positionInRow: s.position_in_row,
        isConductor: !!s.is_conductor,
    })));
}));

/**
 * Generate seating for a rehearsal based on attendance
 */
router.post('/rehearsal/:rehearsalId/generate', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rehearsalId } = req.params;

    // Verify rehearsal exists and belongs to user's association
    const rehearsal = db.prepare(`
        SELECT r.id, r.orchestra_id
        FROM rehearsals r
        WHERE r.id = ? AND r.association_id = ?
    `).get(rehearsalId, req.user!.associationId) as any;

    if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    // Get accepted attendance
    const attendance = db.prepare(`
        SELECT ra.id, ra.user_id, ra.spond_member_id, ra.member_name
        FROM rehearsal_attendance ra
        WHERE ra.rehearsal_id = ? AND ra.status = 'accepted'
    `).all(rehearsalId) as any[];

    if (attendance.length === 0) {
        throw new ApiError(400, 'Geen aanwezigen voor deze repetitie.');
    }

    // Determine which orchestra(s) to use for sections
    // If the rehearsal has a specific orchestra, use that; otherwise find orchestras with sections configured
    let orchestraId = rehearsal.orchestra_id;

    if (!orchestraId) {
        // Rehearsal is for all orchestras - find the first orchestra with seating sections configured
        const orchestraWithSections = db.prepare(`
            SELECT DISTINCT ss.orchestra_id
            FROM seating_sections ss
            JOIN orchestras o ON ss.orchestra_id = o.id
            WHERE o.association_id = ?
            ORDER BY o.name
            LIMIT 1
        `).get(req.user!.associationId) as any;

        if (orchestraWithSections) {
            orchestraId = orchestraWithSections.orchestra_id;
        }
    }

    // Get sections for the orchestra
    const sections = orchestraId ? db.prepare(`
        SELECT ss.id, ss.row_number, ss.name
        FROM seating_sections ss
        WHERE ss.orchestra_id = ?
        ORDER BY ss.row_number
    `).all(orchestraId) as any[] : [];

    // Get section instruments mapping
    const sectionInstruments = new Map<string, Set<string>>();
    for (const section of sections) {
        const instruments = db.prepare(`
            SELECT i.id, i.name
            FROM seating_section_instruments ssi
            JOIN instruments i ON ssi.instrument_id = i.id
            WHERE ssi.section_id = ?
        `).all(section.id) as any[];

        const instrumentIds = new Set(instruments.map((i: any) => i.id));
        sectionInstruments.set(section.id, instrumentIds);
    }

    // Get existing assignments
    const existingAssignments = orchestraId ? db.prepare(`
        SELECT sa.user_id, sa.section_id, sa.position_in_section
        FROM seating_assignments sa
        WHERE sa.orchestra_id = ?
    `).all(orchestraId) as any[] : [];

    const assignmentMap = new Map(existingAssignments.map(a => [a.user_id, a]));

    // Build a lookup for Spond-only members: try to match by name to find user_id and instrument
    // Filter by orchestra membership to avoid cross-orchestra name collisions
    const usersByName = new Map<string, any>();
    let eligibleUsers: any[];

    if (orchestraId) {
        // Only get users who are members of this specific orchestra
        eligibleUsers = db.prepare(`
            SELECT u.id, u.first_name, u.last_name
            FROM users u
            JOIN user_orchestras uo ON u.id = uo.user_id
            WHERE u.association_id = ? AND uo.orchestra_id = ?
        `).all(req.user!.associationId, orchestraId) as any[];
    } else {
        // Fallback: get all users (for all-orchestra rehearsals without specific orchestra)
        eligibleUsers = db.prepare(`
            SELECT u.id, u.first_name, u.last_name
            FROM users u
            WHERE u.association_id = ?
        `).all(req.user!.associationId) as any[];
    }

    for (const u of eligibleUsers) {
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase().trim();
        usersByName.set(fullName, u);
    }

    // Delete existing rehearsal seating
    db.prepare('DELETE FROM rehearsal_seating WHERE rehearsal_id = ?').run(rehearsalId);

    // Group attendees by section/row
    const rowAssignments = new Map<number, { userId: string | null; spondMemberId: string | null; memberName: string; instrumentName: string | null; sectionId: string | null; position: number; isConductor: boolean }[]>();

    for (const attendee of attendance) {
        let sectionId: string | null = null;
        let rowNumber = 99; // Default to last row if no match
        let instrumentName: string | null = null;
        let isConductor = false;

        // Check if this is a conductor based on name containing "dirigent" or "conductor"
        const nameLower = attendee.member_name.toLowerCase();
        if (nameLower.includes('dirigent') || nameLower.includes('conductor')) {
            isConductor = true;
            rowNumber = 0; // Conductor gets row 0 (front)
        }

        // Resolve user_id: either from attendance record or by matching Spond member name
        let resolvedUserId = attendee.user_id;
        if (!resolvedUserId && attendee.member_name) {
            const matchedUser = usersByName.get(attendee.member_name.toLowerCase().trim());
            if (matchedUser) {
                resolvedUserId = matchedUser.id;
            }
        }

        if (resolvedUserId) {
            // Check if user has conductor role
            const userRole = db.prepare('SELECT role FROM users WHERE id = ?').get(resolvedUserId) as any;
            if (userRole?.role === 'conductor') {
                isConductor = true;
                rowNumber = 0; // Conductor gets row 0 (front)
            }

            // Only assign instrument/section if not a conductor
            if (!isConductor) {
                // Get user's instruments
                const userInstruments = db.prepare(`
                    SELECT i.id, i.name
                    FROM user_instruments ui
                    JOIN instruments i ON ui.instrument_id = i.id
                    WHERE ui.user_id = ?
                `).all(resolvedUserId) as any[];

                if (userInstruments.length > 0) {
                    instrumentName = userInstruments.map((i: any) => i.name).join(', ');

                    // Find matching section based on instrument
                    for (const section of sections) {
                        const sectionInstrumentIds = sectionInstruments.get(section.id);
                        if (sectionInstrumentIds) {
                            for (const userInstr of userInstruments) {
                                if (sectionInstrumentIds.has(userInstr.id)) {
                                    sectionId = section.id;
                                    rowNumber = section.row_number;
                                    break;
                                }
                            }
                        }
                        if (sectionId) break;
                    }
                }

                // Check for existing manual assignment (overrides instrument-based placement)
                const existing = assignmentMap.get(resolvedUserId);
                if (existing) {
                    sectionId = existing.section_id;
                    const section = sections.find((s: any) => s.id === sectionId);
                    if (section) rowNumber = section.row_number;
                }
            }
        }

        if (!rowAssignments.has(rowNumber)) {
            rowAssignments.set(rowNumber, []);
        }
        rowAssignments.get(rowNumber)!.push({
            userId: attendee.user_id,
            spondMemberId: attendee.spond_member_id,
            memberName: attendee.member_name,
            instrumentName,
            sectionId,
            position: 0,
            isConductor,
        });
    }

    // Renumber rows compactly: row 99 (unmatched) becomes the next row after the last used section row
    const sortedRowNumbers = Array.from(rowAssignments.keys()).sort((a, b) => a - b);
    const compactRowMap = new Map<number, number>();
    let compactRow = 1;
    for (const rn of sortedRowNumbers) {
        if (rn === 99) {
            // Unmatched members get placed after the last configured row
            compactRowMap.set(rn, compactRow);
        } else {
            compactRowMap.set(rn, rn);
            compactRow = rn + 1;
        }
    }

    // Assign positions within each row (compact layout)
    const transaction = db.transaction(() => {
        for (const [rowNumber, rowMembers] of rowAssignments) {
            // Sort by existing position if available, then by name
            rowMembers.sort((a, b) => {
                if (a.userId && b.userId) {
                    const aAssignment = assignmentMap.get(a.userId);
                    const bAssignment = assignmentMap.get(b.userId);
                    if (aAssignment && bAssignment) {
                        return aAssignment.position_in_section - bAssignment.position_in_section;
                    }
                }
                return a.memberName.localeCompare(b.memberName);
            });

            const finalRowNumber = compactRowMap.get(rowNumber) ?? rowNumber;

            // Assign compact positions
            let position = 0;
            for (const member of rowMembers) {
                member.position = position++;

                db.prepare(`
                    INSERT INTO rehearsal_seating (id, rehearsal_id, user_id, spond_member_id, member_name, instrument_name, section_id, row_number, position_in_row, is_conductor)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    uuidv4(),
                    rehearsalId,
                    member.userId,
                    member.spondMemberId,
                    member.memberName,
                    member.instrumentName,
                    member.sectionId,
                    finalRowNumber,
                    member.position,
                    member.isConductor ? 1 : 0
                );
            }
        }
    });

    transaction();

    logger.info(`Rehearsal seating generated for rehearsal: ${rehearsalId}`, { generatedBy: req.user!.id });

    res.json({ message: 'Opstelling gegenereerd.', memberCount: attendance.length });
}));

/**
 * Update a single seat in rehearsal seating
 */
router.put('/rehearsal/:rehearsalId/seat/:seatId', authenticateToken, requireRole('admin', 'conductor', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { rehearsalId, seatId } = req.params;
    const { rowNumber, positionInRow } = req.body;

    // Verify rehearsal exists and belongs to user's association
    const rehearsal = db.prepare(`
        SELECT r.id FROM rehearsals r WHERE r.id = ? AND r.association_id = ?
    `).get(rehearsalId, req.user!.associationId);

    if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
    }

    db.prepare(`
        UPDATE rehearsal_seating
        SET row_number = ?, position_in_row = ?
        WHERE id = ? AND rehearsal_id = ?
    `).run(rowNumber, positionInRow, seatId, rehearsalId);

    res.json({ message: 'Zitplaats bijgewerkt.' });
}));

/**
 * Get seating chart data for visualization
 */
router.get('/chart/:orchestraId', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.params;
    const { rehearsalId } = req.query;

    // Verify orchestra belongs to association
    const orchestra = db.prepare(
        'SELECT id, name FROM orchestras WHERE id = ? AND association_id = ?'
    ).get(orchestraId, req.user!.associationId) as any;

    if (!orchestra) {
        throw new ApiError(404, 'Orkest niet gevonden.');
    }

    // Get sections
    const sections = db.prepare(`
        SELECT ss.id, ss.name, ss.row_number, ss.sort_order
        FROM seating_sections ss
        WHERE ss.orchestra_id = ?
        ORDER BY ss.row_number
    `).all(orchestraId) as any[];

    let seats: any[] = [];

    if (rehearsalId) {
        // Get rehearsal-specific seating
        seats = db.prepare(`
            SELECT
                rs.id, rs.user_id, rs.member_name, rs.instrument_name,
                rs.row_number, rs.position_in_row, rs.is_conductor,
                ss.name as section_name
            FROM rehearsal_seating rs
            LEFT JOIN seating_sections ss ON rs.section_id = ss.id
            WHERE rs.rehearsal_id = ?
            ORDER BY rs.row_number, rs.position_in_row
        `).all(rehearsalId);
    } else {
        // Get default assignments
        seats = db.prepare(`
            SELECT
                sa.id, sa.user_id,
                u.first_name || ' ' || u.last_name as member_name,
                (SELECT GROUP_CONCAT(i.name, ', ')
                 FROM user_instruments ui
                 JOIN instruments i ON ui.instrument_id = i.id
                 WHERE ui.user_id = sa.user_id) as instrument_name,
                ss.row_number, sa.position_in_section as position_in_row,
                ss.name as section_name
            FROM seating_assignments sa
            JOIN users u ON sa.user_id = u.id
            JOIN seating_sections ss ON sa.section_id = ss.id
            WHERE sa.orchestra_id = ?
            ORDER BY ss.row_number, sa.position_in_section
        `).all(orchestraId);
    }

    // Calculate max positions per row
    const rowMaxPositions = new Map<number, number>();
    for (const seat of seats) {
        const current = rowMaxPositions.get(seat.row_number) || 0;
        if (seat.position_in_row >= current) {
            rowMaxPositions.set(seat.row_number, seat.position_in_row + 1);
        }
    }

    res.json({
        orchestraId,
        orchestraName: orchestra.name,
        sections: sections.map((s: any) => ({
            id: s.id,
            name: s.name,
            rowNumber: s.row_number,
            seatCount: rowMaxPositions.get(s.row_number) || 0,
        })),
        seats: seats.map((s: any) => ({
            id: s.id,
            userId: s.user_id,
            memberName: s.member_name,
            instrumentName: s.instrument_name,
            rowNumber: s.row_number,
            positionInRow: s.position_in_row,
            sectionName: s.section_name,
            isConductor: !!s.is_conductor,
        })),
        totalRows: sections.length,
    });
}));

export default router;
