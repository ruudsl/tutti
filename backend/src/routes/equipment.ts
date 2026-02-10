import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createEquipmentSchema = z.object({
    instrumentType: z.string().min(1, 'Instrument type is verplicht'),
    brandModel: z.string().optional(),
    serialNumber: z.string().optional(),
    yearOfManufacture: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
    status: z.enum(['available', 'on_loan', 'in_repair', 'written_off', 'personal']).default('available'),
    currentUserId: z.string().uuid().optional().nullable(),
    notes: z.string().optional(),
    maintenanceIntervalMonths: z.number().int().min(1).max(60).default(12),
    lastMaintenanceDate: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    currentValue: z.number().min(0).optional(),
});

const updateEquipmentSchema = createEquipmentSchema.partial();

const createDamageLogSchema = z.object({
    date: z.string().min(1, 'Datum is verplicht'),
    description: z.string().min(1, 'Beschrijving is verplicht'),
    repairCost: z.number().min(0).optional(),
    repairedBy: z.string().optional(),
    status: z.enum(['reported', 'in_repair', 'repaired', 'written_off']).default('reported'),
});

const createEquipmentLoanSchema = z.object({
    userId: z.string().uuid('Gebruiker is verplicht'),
    loanDate: z.string().min(1, 'Uitleen datum is verplicht'),
    conditionAtLoan: z.string().optional(),
    notes: z.string().optional(),
});

const returnEquipmentLoanSchema = z.object({
    returnDate: z.string().min(1, 'Retour datum is verplicht'),
    conditionAtReturn: z.string().optional(),
});

// Equipment types for dropdown
const EQUIPMENT_TYPES = [
    'Altsaxofoon', 'Tenorsaxofoon', 'Baritonsaxofoon', 'Sopraansaxofoon',
    'Bes-Klarinet', 'Es-Klarinet', 'Basklarinet', 'Altklarinet',
    'Dwarsfluit', 'Piccolo', 'Hobo', 'Fagot',
    'Bes-Trompet', 'C-Trompet', 'Es-Kornet', 'Bugel',
    'Althoorn', 'Bariton', 'Euphonium', 'Trombone',
    'Bes-Tuba', 'Es-Tuba', 'F-Tuba',
    'Slagwerk-set', 'Pauken', 'Grote trom', 'Kleine trom', 'Bekkens', 'Xylofoon', 'Klokkenspel',
    'Overig',
];

/**
 * @swagger
 * /equipment/types:
 *   get:
 *     summary: Get available equipment types
 *     tags: [Equipment]
 *     responses:
 *       200:
 *         description: List of equipment types
 */
router.get('/types', authenticateToken, (req: AuthRequest, res: Response) => {
    res.json(EQUIPMENT_TYPES);
});

/**
 * @swagger
 * /equipment/maintenance-alerts:
 *   get:
 *     summary: Get equipment needing maintenance
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 */
router.get('/maintenance-alerts', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const items = db.prepare(`
        SELECT e.*, u.first_name, u.last_name, u.email
        FROM equipment e
        LEFT JOIN users u ON e.current_user_id = u.id
        WHERE e.association_id = ?
        AND e.status NOT IN ('written_off')
        AND e.next_maintenance_date IS NOT NULL
        AND e.next_maintenance_date <= ?
        ORDER BY e.next_maintenance_date ASC
    `).all(req.user!.associationId, thirtyDaysFromNow);

    res.json(items.map((item: any) => ({
        id: item.id,
        instrumentType: item.instrument_type,
        brandModel: item.brand_model,
        serialNumber: item.serial_number,
        nextMaintenanceDate: item.next_maintenance_date,
        isOverdue: item.next_maintenance_date < today,
        currentUser: item.current_user_id ? {
            id: item.current_user_id,
            firstName: item.first_name,
            lastName: item.last_name,
            email: item.email,
        } : null,
    })));
}));

/**
 * @swagger
 * /equipment:
 *   get:
 *     summary: Get all equipment
 *     tags: [Equipment]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    let whereClause = 'WHERE e.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ` AND (LOWER(e.instrument_type) LIKE ? OR LOWER(e.brand_model) LIKE ? OR LOWER(e.serial_number) LIKE ?)`;
        const searchTerm = `%${search.toLowerCase()}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    if (status) {
        whereClause += ' AND e.status = ?';
        params.push(status);
    }

    if (type) {
        whereClause += ' AND e.instrument_type = ?';
        params.push(type);
    }

    const countResult = db.prepare(`
        SELECT COUNT(*) as total FROM equipment e ${whereClause}
    `).get(...params) as { total: number };

    const items = db.prepare(`
        SELECT e.*, u.first_name, u.last_name, u.email
        FROM equipment e
        LEFT JOIN users u ON e.current_user_id = u.id
        ${whereClause}
        ORDER BY e.instrument_type, e.brand_model
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const result = items.map((item: any) => ({
        id: item.id,
        instrumentType: item.instrument_type,
        brandModel: item.brand_model,
        serialNumber: item.serial_number,
        yearOfManufacture: item.year_of_manufacture,
        status: item.status,
        notes: item.notes,
        maintenanceIntervalMonths: item.maintenance_interval_months,
        lastMaintenanceDate: item.last_maintenance_date,
        nextMaintenanceDate: item.next_maintenance_date,
        purchasePrice: item.purchase_price,
        currentValue: item.current_value,
        currentUser: item.current_user_id ? {
            id: item.current_user_id,
            firstName: item.first_name,
            lastName: item.last_name,
            email: item.email,
        } : null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
    }));

    res.json(createPaginatedResult(result, countResult.total, page, limit));
}));

/**
 * @swagger
 * /equipment/{id}:
 *   get:
 *     summary: Get single equipment item with history
 *     tags: [Equipment]
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const item = db.prepare(`
        SELECT e.*, u.first_name, u.last_name, u.email
        FROM equipment e
        LEFT JOIN users u ON e.current_user_id = u.id
        WHERE e.id = ? AND e.association_id = ?
    `).get(req.params.id, req.user!.associationId) as any;

    if (!item) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    // Get damage logs
    const damageLogs = db.prepare(`
        SELECT * FROM equipment_damage_logs
        WHERE equipment_id = ?
        ORDER BY date DESC
    `).all(req.params.id);

    // Get loan history
    const loanHistory = db.prepare(`
        SELECT el.*, u.first_name, u.last_name, u.email
        FROM equipment_loans el
        JOIN users u ON el.user_id = u.id
        WHERE el.equipment_id = ?
        ORDER BY el.loan_date DESC
    `).all(req.params.id);

    res.json({
        id: item.id,
        instrumentType: item.instrument_type,
        brandModel: item.brand_model,
        serialNumber: item.serial_number,
        yearOfManufacture: item.year_of_manufacture,
        status: item.status,
        notes: item.notes,
        maintenanceIntervalMonths: item.maintenance_interval_months,
        lastMaintenanceDate: item.last_maintenance_date,
        nextMaintenanceDate: item.next_maintenance_date,
        purchasePrice: item.purchase_price,
        currentValue: item.current_value,
        currentUser: item.current_user_id ? {
            id: item.current_user_id,
            firstName: item.first_name,
            lastName: item.last_name,
            email: item.email,
        } : null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        damageLogs: damageLogs.map((log: any) => ({
            id: log.id,
            date: log.date,
            description: log.description,
            repairCost: log.repair_cost,
            repairedBy: log.repaired_by,
            status: log.status,
            createdAt: log.created_at,
        })),
        loanHistory: loanHistory.map((loan: any) => ({
            id: loan.id,
            user: {
                id: loan.user_id,
                firstName: loan.first_name,
                lastName: loan.last_name,
                email: loan.email,
            },
            loanDate: loan.loan_date,
            returnDate: loan.return_date,
            conditionAtLoan: loan.condition_at_loan,
            conditionAtReturn: loan.condition_at_return,
            notes: loan.notes,
            agreementPdfPath: loan.agreement_pdf_path,
        })),
    });
}));

/**
 * @swagger
 * /equipment:
 *   post:
 *     summary: Create new equipment
 *     tags: [Equipment]
 */
router.post('/', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEquipmentSchema.parse(req.body);

    const id = uuidv4();
    let nextMaintenanceDate = null;

    if (data.lastMaintenanceDate && data.maintenanceIntervalMonths) {
        const lastDate = new Date(data.lastMaintenanceDate);
        lastDate.setMonth(lastDate.getMonth() + data.maintenanceIntervalMonths);
        nextMaintenanceDate = lastDate.toISOString().split('T')[0];
    }

    db.prepare(`
        INSERT INTO equipment (
            id, association_id, instrument_type, brand_model, serial_number,
            year_of_manufacture, status, current_user_id, notes,
            maintenance_interval_months, last_maintenance_date, next_maintenance_date,
            purchase_price, current_value
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, req.user!.associationId, data.instrumentType, data.brandModel || null,
        data.serialNumber || null, data.yearOfManufacture || null, data.status,
        data.currentUserId || null, data.notes || null, data.maintenanceIntervalMonths,
        data.lastMaintenanceDate || null, nextMaintenanceDate,
        data.purchasePrice || null, data.currentValue || null
    );

    logger.info(`Equipment created: ${data.instrumentType}`, { id, createdBy: req.user!.id });

    res.status(201).json({
        id,
        message: 'Instrument succesvol toegevoegd.',
    });
}));

/**
 * @swagger
 * /equipment/{id}:
 *   put:
 *     summary: Update equipment
 *     tags: [Equipment]
 */
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateEquipmentSchema.parse(req.body);

    const existing = db.prepare('SELECT * FROM equipment WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    let nextMaintenanceDate = (existing as any).next_maintenance_date;
    if (data.lastMaintenanceDate !== undefined || data.maintenanceIntervalMonths !== undefined) {
        const lastDate = new Date(data.lastMaintenanceDate || (existing as any).last_maintenance_date);
        const interval = data.maintenanceIntervalMonths || (existing as any).maintenance_interval_months;
        if (lastDate && !isNaN(lastDate.getTime()) && interval) {
            lastDate.setMonth(lastDate.getMonth() + interval);
            nextMaintenanceDate = lastDate.toISOString().split('T')[0];
        }
    }

    db.prepare(`
        UPDATE equipment SET
            instrument_type = COALESCE(?, instrument_type),
            brand_model = COALESCE(?, brand_model),
            serial_number = COALESCE(?, serial_number),
            year_of_manufacture = COALESCE(?, year_of_manufacture),
            status = COALESCE(?, status),
            current_user_id = ?,
            notes = COALESCE(?, notes),
            maintenance_interval_months = COALESCE(?, maintenance_interval_months),
            last_maintenance_date = COALESCE(?, last_maintenance_date),
            next_maintenance_date = ?,
            purchase_price = COALESCE(?, purchase_price),
            current_value = COALESCE(?, current_value),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        data.instrumentType, data.brandModel, data.serialNumber,
        data.yearOfManufacture, data.status,
        data.currentUserId !== undefined ? data.currentUserId : (existing as any).current_user_id,
        data.notes, data.maintenanceIntervalMonths, data.lastMaintenanceDate,
        nextMaintenanceDate, data.purchasePrice, data.currentValue,
        req.params.id
    );

    logger.info(`Equipment updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Instrument succesvol bijgewerkt.' });
}));

/**
 * @swagger
 * /equipment/{id}:
 *   delete:
 *     summary: Delete equipment
 *     tags: [Equipment]
 */
router.delete('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare('DELETE FROM equipment WHERE id = ? AND association_id = ?')
        .run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    logger.info(`Equipment deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Instrument succesvol verwijderd.' });
}));

// ==================== DAMAGE LOGS ====================

/**
 * @swagger
 * /equipment/{id}/damage-logs:
 *   post:
 *     summary: Add damage log entry
 *     tags: [Equipment]
 */
router.post('/:id/damage-logs', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createDamageLogSchema.parse(req.body);

    const equipment = db.prepare('SELECT id FROM equipment WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!equipment) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO equipment_damage_logs (id, equipment_id, date, description, repair_cost, repaired_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.id, data.date, data.description, data.repairCost || null, data.repairedBy || null, data.status);

    // If status is in_repair, update equipment status
    if (data.status === 'in_repair') {
        db.prepare('UPDATE equipment SET status = ? WHERE id = ?').run('in_repair', req.params.id);
    }

    logger.info(`Damage log added to equipment: ${req.params.id}`, { logId: id, createdBy: req.user!.id });

    res.status(201).json({ id, message: 'Schademelding toegevoegd.' });
}));

/**
 * @swagger
 * /equipment/{id}/damage-logs/{logId}:
 *   put:
 *     summary: Update damage log entry
 *     tags: [Equipment]
 */
router.put('/:id/damage-logs/:logId', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createDamageLogSchema.partial().parse(req.body);

    const log = db.prepare(`
        SELECT dl.* FROM equipment_damage_logs dl
        JOIN equipment e ON dl.equipment_id = e.id
        WHERE dl.id = ? AND e.association_id = ?
    `).get(req.params.logId, req.user!.associationId);

    if (!log) {
        throw new ApiError(404, 'Schademelding niet gevonden.');
    }

    db.prepare(`
        UPDATE equipment_damage_logs SET
            date = COALESCE(?, date),
            description = COALESCE(?, description),
            repair_cost = COALESCE(?, repair_cost),
            repaired_by = COALESCE(?, repaired_by),
            status = COALESCE(?, status)
        WHERE id = ?
    `).run(data.date, data.description, data.repairCost, data.repairedBy, data.status, req.params.logId);

    // Update equipment status based on damage log status
    if (data.status === 'repaired') {
        db.prepare('UPDATE equipment SET status = ? WHERE id = ?').run('available', req.params.id);
    } else if (data.status === 'in_repair') {
        db.prepare('UPDATE equipment SET status = ? WHERE id = ?').run('in_repair', req.params.id);
    } else if (data.status === 'written_off') {
        db.prepare('UPDATE equipment SET status = ? WHERE id = ?').run('written_off', req.params.id);
    }

    res.json({ message: 'Schademelding bijgewerkt.' });
}));

/**
 * @swagger
 * /equipment/{id}/damage-logs/{logId}:
 *   delete:
 *     summary: Delete damage log entry
 *     tags: [Equipment]
 */
router.delete('/:id/damage-logs/:logId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM equipment_damage_logs
        WHERE id = ? AND equipment_id IN (
            SELECT id FROM equipment WHERE association_id = ?
        )
    `).run(req.params.logId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Schademelding niet gevonden.');
    }

    res.json({ message: 'Schademelding verwijderd.' });
}));

// ==================== EQUIPMENT LOANS ====================

/**
 * @swagger
 * /equipment/{id}/loans:
 *   post:
 *     summary: Create equipment loan (lend out instrument)
 *     tags: [Equipment]
 */
router.post('/:id/loans', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEquipmentLoanSchema.parse(req.body);

    const equipment = db.prepare('SELECT * FROM equipment WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId) as any;

    if (!equipment) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    if (equipment.status === 'on_loan') {
        throw new ApiError(400, 'Dit instrument is al uitgeleend.');
    }

    if (equipment.status === 'in_repair' || equipment.status === 'written_off') {
        throw new ApiError(400, 'Dit instrument kan niet worden uitgeleend vanwege de huidige status.');
    }

    const id = uuidv4();

    withTransaction(() => {
        db.prepare(`
            INSERT INTO equipment_loans (id, equipment_id, user_id, loan_date, condition_at_loan, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, req.params.id, data.userId, data.loanDate, data.conditionAtLoan || null, data.notes || null);

        db.prepare('UPDATE equipment SET status = ?, current_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('on_loan', data.userId, req.params.id);
    });

    logger.info(`Equipment loaned out: ${req.params.id}`, { loanId: id, userId: data.userId, createdBy: req.user!.id });

    res.status(201).json({ id, message: 'Instrument uitgeleend.' });
}));

/**
 * @swagger
 * /equipment/{id}/loans/{loanId}/return:
 *   post:
 *     summary: Return equipment loan
 *     tags: [Equipment]
 */
router.post('/:id/loans/:loanId/return', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = returnEquipmentLoanSchema.parse(req.body);

    const loan = db.prepare(`
        SELECT el.* FROM equipment_loans el
        JOIN equipment e ON el.equipment_id = e.id
        WHERE el.id = ? AND e.association_id = ? AND el.return_date IS NULL
    `).get(req.params.loanId, req.user!.associationId);

    if (!loan) {
        throw new ApiError(404, 'Uitleen niet gevonden of al teruggebracht.');
    }

    withTransaction(() => {
        db.prepare(`
            UPDATE equipment_loans SET return_date = ?, condition_at_return = ?
            WHERE id = ?
        `).run(data.returnDate, data.conditionAtReturn || null, req.params.loanId);

        db.prepare('UPDATE equipment SET status = ?, current_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('available', req.params.id);
    });

    logger.info(`Equipment returned: ${req.params.id}`, { loanId: req.params.loanId, returnedBy: req.user!.id });

    res.json({ message: 'Instrument teruggebracht.' });
}));

/**
 * @swagger
 * /equipment/{id}/record-maintenance:
 *   post:
 *     summary: Record maintenance performed
 *     tags: [Equipment]
 */
router.post('/:id/record-maintenance', authenticateToken, requireRole('admin', 'music_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { date, notes } = req.body;

    const equipment = db.prepare('SELECT * FROM equipment WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId) as any;

    if (!equipment) {
        throw new ApiError(404, 'Instrument niet gevonden.');
    }

    const maintenanceDate = date || new Date().toISOString().split('T')[0];
    const interval = equipment.maintenance_interval_months || 12;
    const nextDate = new Date(maintenanceDate);
    nextDate.setMonth(nextDate.getMonth() + interval);
    const nextMaintenanceDate = nextDate.toISOString().split('T')[0];

    db.prepare(`
        UPDATE equipment SET
            last_maintenance_date = ?,
            next_maintenance_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(maintenanceDate, nextMaintenanceDate, req.params.id);

    // Optionally add a damage log entry for the maintenance
    if (notes) {
        const logId = uuidv4();
        db.prepare(`
            INSERT INTO equipment_damage_logs (id, equipment_id, date, description, status)
            VALUES (?, ?, ?, ?, 'repaired')
        `).run(logId, req.params.id, maintenanceDate, `Onderhoud uitgevoerd: ${notes}`);
    }

    logger.info(`Maintenance recorded for equipment: ${req.params.id}`, { date: maintenanceDate, recordedBy: req.user!.id });

    res.json({
        message: 'Onderhoud geregistreerd.',
        nextMaintenanceDate,
    });
}));

export default router;
