import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const sanitizeForLog = (value: unknown): string =>
    String(value).replace(/[\r\n]+/g, '').replace(/[\x00-\x1F\x7F]+/g, '');

const router = Router();

// ===========================================
// VALIDATION SCHEMAS
// ===========================================

const assetCategories = ['woodwind', 'brass', 'percussion', 'strings', 'keyboard', 'accessories', 'other'] as const;
const assetStatuses = ['available', 'on_loan', 'in_repair', 'in_storage', 'written_off', 'sold', 'lost'] as const;
const conditions = ['excellent', 'good', 'fair', 'poor', 'damaged', 'needs_repair'] as const;
const repairPriorities = ['low', 'normal', 'high', 'urgent'] as const;
const repairStatuses = ['pending', 'approved', 'in_progress', 'completed', 'cancelled'] as const;

const createAssetSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht'),
    instrumentType: z.string().min(1, 'Instrumenttype is verplicht'),
    category: z.enum(assetCategories),
    brand: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    barcode: z.string().optional(),
    yearManufactured: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
    countryOfOrigin: z.string().optional(),
    color: z.string().optional(),
    material: z.string().optional(),
    weightKg: z.number().positive().optional(),
    dimensions: z.string().optional(),
    purchaseDate: z.string().optional(),
    purchasePrice: z.number().min(0).optional(),
    purchaseVendor: z.string().optional(),
    currentValue: z.number().min(0).optional(),
    replacementValue: z.number().min(0).optional(),
    depreciationRate: z.number().min(0).max(100).default(5),
    status: z.enum(assetStatuses).default('available'),
    condition: z.enum(conditions).default('good'),
    location: z.string().optional(),
    storageLocation: z.string().optional(),
    maintenanceIntervalMonths: z.number().int().min(1).max(60).default(12),
    photoUrls: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    customFields: z.record(z.string(), z.any()).optional(),
});

const updateAssetSchema = createAssetSchema.partial();

const createValuationSchema = z.object({
    valuationDate: z.string().min(1, 'Datum is verplicht'),
    valuationType: z.enum(['purchase', 'insurance', 'sale', 'appraisal', 'depreciation']),
    valuedAmount: z.number().positive('Bedrag moet positief zijn'),
    currency: z.string().default('EUR'),
    appraiserName: z.string().optional(),
    appraiserCompany: z.string().optional(),
    appraiserCredentials: z.string().optional(),
    valuationMethod: z.string().optional(),
    marketComparison: z.string().optional(),
    conditionAtValuation: z.enum(conditions).optional(),
    certificateUrl: z.string().optional(),
    notes: z.string().optional(),
});

const createRepairSchema = z.object({
    repairType: z.enum(['preventive', 'corrective', 'emergency', 'overhaul', 'cleaning']),
    priority: z.enum(repairPriorities).default('normal'),
    issueDescription: z.string().min(1, 'Beschrijving is verplicht'),
    diagnosis: z.string().optional(),
    repairShopName: z.string().optional(),
    repairShopContact: z.string().optional(),
    repairShopAddress: z.string().optional(),
    technicianName: z.string().optional(),
    estimatedCost: z.number().min(0).optional(),
    estimatedCompletion: z.string().optional(),
    warrantyClaimRef: z.boolean().default(false),
    insuranceClaimId: z.string().uuid().optional(),
    notes: z.string().optional(),
});

const updateRepairSchema = z.object({
    status: z.enum(repairStatuses).optional(),
    diagnosis: z.string().optional(),
    actualCost: z.number().min(0).optional(),
    partsReplaced: z.string().optional(),
    laborHours: z.number().min(0).optional(),
    startedDate: z.string().optional(),
    completedDate: z.string().optional(),
    invoiceNumber: z.string().optional(),
    invoiceUrl: z.string().optional(),
    qualityRating: z.number().int().min(1).max(5).optional(),
    qualityNotes: z.string().optional(),
    notes: z.string().optional(),
});

const createLoanSchema = z.object({
    borrowerUserId: z.string().uuid(),
    loanType: z.enum(['standard', 'trial', 'long_term', 'performance']).default('standard'),
    purpose: z.string().optional(),
    loanDate: z.string().min(1),
    expectedReturnDate: z.string().optional(),
    conditionAtLoan: z.enum(conditions),
    accessoriesLoaned: z.array(z.string()).optional(),
    depositAmount: z.number().min(0).optional(),
    insuranceRequired: z.boolean().default(false),
    rentalFee: z.number().min(0).optional(),
    rentalPeriod: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
    notes: z.string().optional(),
});

const returnLoanSchema = z.object({
    actualReturnDate: z.string().min(1),
    conditionAtReturn: z.enum(conditions),
    accessoriesReturned: z.array(z.string()).optional(),
    returnInspectionNotes: z.string().optional(),
    damageReported: z.string().optional(),
    damageCost: z.number().min(0).optional(),
});

const createDocumentSchema = z.object({
    documentType: z.enum(['manual', 'warranty', 'certificate', 'invoice', 'photo', 'contract', 'appraisal', 'other']),
    title: z.string().min(1),
    description: z.string().optional(),
    fileUrl: z.string().min(1),
    fileName: z.string().min(1),
    fileSize: z.number().optional(),
    mimeType: z.string().optional(),
    version: z.string().optional(),
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    isPublic: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function logAssetHistory(
    assetId: string,
    eventType: string,
    description: string,
    userId: string | undefined,
    oldValue?: string | null,
    newValue?: string | null,
    fieldChanged?: string | null,
    relatedId?: string | null,
    relatedType?: string | null
) {
    db.prepare(`
        INSERT INTO instrument_history (id, asset_id, event_type, description, user_id, old_value, new_value, field_changed, related_id, related_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        uuidv4(),
        assetId,
        eventType,
        description,
        userId ?? null,
        oldValue ?? null,
        newValue ?? null,
        fieldChanged ?? null,
        relatedId ?? null,
        relatedType ?? null
    );
}

function mapAssetRow(row: any) {
    return {
        id: row.id,
        name: row.name,
        instrumentType: row.instrument_type,
        category: row.category,
        brand: row.brand,
        model: row.model,
        serialNumber: row.serial_number,
        barcode: row.barcode,
        yearManufactured: row.year_manufactured,
        countryOfOrigin: row.country_of_origin,
        color: row.color,
        material: row.material,
        weightKg: row.weight_kg,
        dimensions: row.dimensions,
        purchaseDate: row.purchase_date,
        purchasePrice: row.purchase_price,
        purchaseVendor: row.purchase_vendor,
        currentValue: row.current_value,
        replacementValue: row.replacement_value,
        depreciationRate: row.depreciation_rate,
        status: row.status,
        condition: row.condition,
        location: row.location,
        storageLocation: row.storage_location,
        assignedToUserId: row.assigned_to_user_id,
        assignedDate: row.assigned_date,
        expectedReturnDate: row.expected_return_date,
        maintenanceIntervalMonths: row.maintenance_interval_months,
        lastMaintenanceDate: row.last_maintenance_date,
        nextMaintenanceDue: row.next_maintenance_due,
        maintenanceNotes: row.maintenance_notes,
        insurancePolicyId: row.insurance_policy_id,
        photoUrls: row.photo_urls ? JSON.parse(row.photo_urls) : [],
        tags: row.tags ? JSON.parse(row.tags) : [],
        notes: row.notes,
        customFields: row.custom_fields ? JSON.parse(row.custom_fields) : {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// ===========================================
// ASSET ROUTES
// ===========================================

router.get('/categories', authenticateToken, (_req: AuthRequest, res: Response) => {
    res.json(assetCategories);
});

router.get('/statuses', authenticateToken, (_req: AuthRequest, res: Response) => {
    res.json(assetStatuses);
});

router.get('/conditions', authenticateToken, (_req: AuthRequest, res: Response) => {
    res.json(conditions);
});

router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const category = req.query.category as string | undefined;
    const condition = req.query.condition as string | undefined;

    let whereClause = 'WHERE a.association_id = ? AND a.deleted_at IS NULL';
    const params: any[] = [req.user!.associationId];

    if (search) {
        whereClause += ` AND (LOWER(a.name) LIKE ? OR LOWER(a.instrument_type) LIKE ? OR LOWER(a.serial_number) LIKE ? OR LOWER(a.barcode) LIKE ?)`;
        const term = `%${search.toLowerCase()}%`;
        params.push(term, term, term, term);
    }

    if (status) {
        whereClause += ' AND a.status = ?';
        params.push(status);
    }

    if (category) {
        whereClause += ' AND a.category = ?';
        params.push(category);
    }

    if (condition) {
        whereClause += ' AND a.condition = ?';
        params.push(condition);
    }

    const countResult = db.prepare(`SELECT COUNT(*) as total FROM instrument_assets a ${whereClause}`).get(...params) as { total: number };

    const rows = db.prepare(`
        SELECT a.*, u.first_name as assigned_first_name, u.last_name as assigned_last_name
        FROM instrument_assets a
        LEFT JOIN users u ON a.assigned_to_user_id = u.id
        ${whereClause}
        ORDER BY a.name
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const items = rows.map((row: any) => ({
        ...mapAssetRow(row),
        assignedUser: row.assigned_to_user_id ? {
            id: row.assigned_to_user_id,
            firstName: row.assigned_first_name,
            lastName: row.assigned_last_name,
        } : null,
    }));

    res.json(createPaginatedResult(items, countResult.total, page, limit));
}));

router.get('/summary', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const stats = db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
            SUM(CASE WHEN status = 'on_loan' THEN 1 ELSE 0 END) as on_loan,
            SUM(CASE WHEN status = 'in_repair' THEN 1 ELSE 0 END) as in_repair,
            SUM(CASE WHEN status = 'in_storage' THEN 1 ELSE 0 END) as in_storage,
            SUM(COALESCE(current_value, 0)) as total_value,
            SUM(COALESCE(replacement_value, 0)) as total_replacement_value
        FROM instrument_assets
        WHERE association_id = ? AND deleted_at IS NULL
    `).get(req.user!.associationId) as any;

    const byCategory = db.prepare(`
        SELECT category, COUNT(*) as count, SUM(COALESCE(current_value, 0)) as value
        FROM instrument_assets
        WHERE association_id = ? AND deleted_at IS NULL
        GROUP BY category
    `).all(req.user!.associationId);

    const maintenanceDue = db.prepare(`
        SELECT COUNT(*) as count
        FROM instrument_assets
        WHERE association_id = ? AND deleted_at IS NULL
        AND next_maintenance_due IS NOT NULL
        AND next_maintenance_due <= date('now', '+30 days')
    `).get(req.user!.associationId) as { count: number };

    const overdueLoans = db.prepare(`
        SELECT COUNT(*) as count
        FROM instrument_loans l
        JOIN instrument_assets a ON l.asset_id = a.id
        WHERE a.association_id = ?
        AND l.status = 'active'
        AND l.expected_return_date < date('now')
    `).get(req.user!.associationId) as { count: number };

    res.json({
        total: stats.total,
        available: stats.available,
        onLoan: stats.on_loan,
        inRepair: stats.in_repair,
        inStorage: stats.in_storage,
        totalValue: stats.total_value,
        totalReplacementValue: stats.total_replacement_value,
        byCategory,
        maintenanceDueCount: maintenanceDue.count,
        overdueLoansCount: overdueLoans.count,
    });
}));

router.get('/maintenance-due', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;

    const items = db.prepare(`
        SELECT a.*, u.first_name, u.last_name
        FROM instrument_assets a
        LEFT JOIN users u ON a.assigned_to_user_id = u.id
        WHERE a.association_id = ?
        AND a.deleted_at IS NULL
        AND a.next_maintenance_due IS NOT NULL
        AND a.next_maintenance_due <= date('now', '+' || ? || ' days')
        ORDER BY a.next_maintenance_due ASC
    `).all(req.user!.associationId, days);

    res.json(items.map((row: any) => ({
        ...mapAssetRow(row),
        assignedUser: row.assigned_to_user_id ? {
            id: row.assigned_to_user_id,
            firstName: row.first_name,
            lastName: row.last_name,
        } : null,
        isOverdue: row.next_maintenance_due < new Date().toISOString().split('T')[0],
    })));
}));

router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const row = db.prepare(`
        SELECT a.*, u.first_name, u.last_name, u.email
        FROM instrument_assets a
        LEFT JOIN users u ON a.assigned_to_user_id = u.id
        WHERE a.id = ? AND a.association_id = ? AND a.deleted_at IS NULL
    `).get(req.params.id, req.user!.associationId) as any;

    if (!row) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const valuations = db.prepare(`
        SELECT * FROM instrument_valuations WHERE asset_id = ? ORDER BY valuation_date DESC
    `).all(req.params.id);

    const repairs = db.prepare(`
        SELECT * FROM instrument_repairs WHERE asset_id = ? ORDER BY reported_date DESC LIMIT 10
    `).all(req.params.id);

    const loans = db.prepare(`
        SELECT l.*, u.first_name, u.last_name
        FROM instrument_loans l
        JOIN users u ON l.borrower_user_id = u.id
        WHERE l.asset_id = ?
        ORDER BY l.loan_date DESC LIMIT 10
    `).all(req.params.id);

    const documents = db.prepare(`
        SELECT * FROM instrument_documents WHERE asset_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    const insurance = row.insurance_policy_id ? db.prepare(`
        SELECT * FROM instrument_insurance_policies WHERE id = ?
    `).get(row.insurance_policy_id) : null;

    res.json({
        ...mapAssetRow(row),
        assignedUser: row.assigned_to_user_id ? {
            id: row.assigned_to_user_id,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
        } : null,
        valuations: valuations.map((v: any) => ({
            id: v.id,
            valuationDate: v.valuation_date,
            valuationType: v.valuation_type,
            valuedAmount: v.valued_amount,
            currency: v.currency,
            appraiserName: v.appraiser_name,
            conditionAtValuation: v.condition_at_valuation,
            notes: v.notes,
        })),
        repairs: repairs.map((r: any) => ({
            id: r.id,
            repairType: r.repair_type,
            priority: r.priority,
            status: r.status,
            issueDescription: r.issue_description,
            estimatedCost: r.estimated_cost,
            actualCost: r.actual_cost,
            reportedDate: r.reported_date,
            completedDate: r.completed_date,
        })),
        loans: loans.map((l: any) => ({
            id: l.id,
            borrower: { id: l.borrower_user_id, firstName: l.first_name, lastName: l.last_name },
            loanType: l.loan_type,
            loanDate: l.loan_date,
            expectedReturnDate: l.expected_return_date,
            actualReturnDate: l.actual_return_date,
            status: l.status,
        })),
        documents: documents.map((d: any) => ({
            id: d.id,
            documentType: d.document_type,
            title: d.title,
            fileUrl: d.file_url,
            fileName: d.file_name,
            createdAt: d.created_at,
        })),
        insurance: insurance ? {
            id: (insurance as any).id,
            policyNumber: (insurance as any).policy_number,
            providerName: (insurance as any).provider_name,
            coverageAmount: (insurance as any).coverage_amount,
            endDate: (insurance as any).end_date,
        } : null,
    });
}));

router.post('/', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
        const data = createAssetSchema.parse(req.body);
        const id = uuidv4();

        let nextMaintenanceDue: string | null = null;
        if (data.maintenanceIntervalMonths) {
            const next = new Date();
            next.setMonth(next.getMonth() + data.maintenanceIntervalMonths);
            nextMaintenanceDue = next.toISOString().split('T')[0];
        }

        const params = [
            id,
            req.user!.associationId,
            data.name,
            data.instrumentType,
            data.category,
            data.brand ?? null,
            data.model ?? null,
            data.serialNumber ?? null,
            data.barcode ?? null,
            data.yearManufactured ?? null,
            data.countryOfOrigin ?? null,
            data.color ?? null,
            data.material ?? null,
            data.weightKg ?? null,
            data.dimensions ?? null,
            data.purchaseDate ?? null,
            data.purchasePrice ?? null,
            data.purchaseVendor ?? null,
            data.currentValue ?? null,
            data.replacementValue ?? null,
            data.depreciationRate ?? 5,
            data.status,
            data.condition,
            data.location ?? null,
            data.storageLocation ?? null,
            data.maintenanceIntervalMonths ?? 12,
            nextMaintenanceDue,
            data.photoUrls ? JSON.stringify(data.photoUrls) : null,
            data.tags ? JSON.stringify(data.tags) : null,
            data.notes ?? null,
            data.customFields ? JSON.stringify(data.customFields) : null,
            req.user!.id,
        ];

        logger.info('Creating instrument asset with params count:', { count: params.length, id });

        db.prepare(`
            INSERT INTO instrument_assets (
                id, association_id, name, instrument_type, category, brand, model,
                serial_number, barcode, year_manufactured, country_of_origin, color, material,
                weight_kg, dimensions, purchase_date, purchase_price, purchase_vendor,
                current_value, replacement_value, depreciation_rate, status, condition,
                location, storage_location, maintenance_interval_months, next_maintenance_due,
                photo_urls, tags, notes, custom_fields, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(...params);

        logger.info('Insert succeeded, logging history');

        logAssetHistory(id, 'created', `Instrument "${data.name}" aangemaakt`, req.user!.id);
        logger.info(`Instrument asset created: ${data.name}`, { id, createdBy: req.user!.id });

        res.status(201).json({ id, message: 'Instrument succesvol aangemaakt' });
    } catch (error: unknown) {
        logger.error('Error creating instrument asset:', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            errorType: typeof error,
            errorKeys: error && typeof error === 'object' ? Object.keys(error) : []
        });
        throw error;
    }
}));

router.put('/:id', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateAssetSchema.parse(req.body);

    const existing = db.prepare('SELECT * FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId) as any;

    if (!existing) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    let nextMaintenanceDue = existing.next_maintenance_due;
    if (data.maintenanceIntervalMonths !== undefined) {
        const last = existing.last_maintenance_date ? new Date(existing.last_maintenance_date) : new Date();
        last.setMonth(last.getMonth() + (data.maintenanceIntervalMonths || existing.maintenance_interval_months));
        nextMaintenanceDue = last.toISOString().split('T')[0];
    }

    db.prepare(`
        UPDATE instrument_assets SET
            name = COALESCE(?, name),
            instrument_type = COALESCE(?, instrument_type),
            category = COALESCE(?, category),
            brand = COALESCE(?, brand),
            model = COALESCE(?, model),
            serial_number = COALESCE(?, serial_number),
            barcode = COALESCE(?, barcode),
            year_manufactured = COALESCE(?, year_manufactured),
            country_of_origin = COALESCE(?, country_of_origin),
            color = COALESCE(?, color),
            material = COALESCE(?, material),
            weight_kg = COALESCE(?, weight_kg),
            dimensions = COALESCE(?, dimensions),
            purchase_date = COALESCE(?, purchase_date),
            purchase_price = COALESCE(?, purchase_price),
            purchase_vendor = COALESCE(?, purchase_vendor),
            current_value = COALESCE(?, current_value),
            replacement_value = COALESCE(?, replacement_value),
            depreciation_rate = COALESCE(?, depreciation_rate),
            status = COALESCE(?, status),
            condition = COALESCE(?, condition),
            location = COALESCE(?, location),
            storage_location = COALESCE(?, storage_location),
            maintenance_interval_months = COALESCE(?, maintenance_interval_months),
            next_maintenance_due = ?,
            photo_urls = COALESCE(?, photo_urls),
            tags = COALESCE(?, tags),
            notes = COALESCE(?, notes),
            custom_fields = COALESCE(?, custom_fields),
            updated_at = CURRENT_TIMESTAMP,
            updated_by = ?
        WHERE id = ?
    `).run(
        data.name, data.instrumentType, data.category, data.brand, data.model,
        data.serialNumber, data.barcode, data.yearManufactured, data.countryOfOrigin,
        data.color, data.material, data.weightKg, data.dimensions, data.purchaseDate,
        data.purchasePrice, data.purchaseVendor, data.currentValue, data.replacementValue,
        data.depreciationRate, data.status, data.condition, data.location, data.storageLocation,
        data.maintenanceIntervalMonths, nextMaintenanceDue,
        data.photoUrls ? JSON.stringify(data.photoUrls) : null,
        data.tags ? JSON.stringify(data.tags) : null,
        data.notes,
        data.customFields ? JSON.stringify(data.customFields) : null,
        req.user!.id, req.params.id
    );

    logAssetHistory(req.params.id, 'updated', 'Instrument bijgewerkt', req.user!.id);
    logger.info(`Instrument asset updated: ${sanitizeForLog(req.params.id)}`, { updatedBy: req.user!.id });

    res.json({ message: 'Instrument succesvol bijgewerkt' });
}));

router.delete('/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = db.prepare('SELECT * FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId);

    if (!existing) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    db.prepare('UPDATE instrument_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    logAssetHistory(req.params.id, 'deleted', 'Instrument verwijderd', req.user!.id);
    logger.info(`Instrument asset deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Instrument succesvol verwijderd' });
}));

// ===========================================
// VALUATION ROUTES
// ===========================================

router.post('/:id/valuations', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createValuationSchema.parse(req.body);

    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO instrument_valuations (
            id, asset_id, valuation_date, valuation_type, valued_amount, currency,
            appraiser_name, appraiser_company, appraiser_credentials, valuation_method,
            market_comparison, condition_at_valuation, certificate_url, notes, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, req.params.id, data.valuationDate, data.valuationType, data.valuedAmount,
        data.currency, data.appraiserName || null, data.appraiserCompany || null,
        data.appraiserCredentials || null, data.valuationMethod || null,
        data.marketComparison || null, data.conditionAtValuation || null,
        data.certificateUrl || null, data.notes || null, req.user!.id
    );

    db.prepare('UPDATE instrument_assets SET current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(data.valuedAmount, req.params.id);

    logAssetHistory(req.params.id, 'valuation_added', `Waardering toegevoegd: €${data.valuedAmount}`, req.user!.id, null, String(data.valuedAmount), 'current_value', id, 'valuation');

    res.status(201).json({ id, message: 'Waardering toegevoegd' });
}));

router.get('/:id/valuations', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const valuations = db.prepare('SELECT * FROM instrument_valuations WHERE asset_id = ? ORDER BY valuation_date DESC').all(req.params.id);

    res.json(valuations.map((v: any) => ({
        id: v.id,
        valuationDate: v.valuation_date,
        valuationType: v.valuation_type,
        valuedAmount: v.valued_amount,
        currency: v.currency,
        appraiserName: v.appraiser_name,
        appraiserCompany: v.appraiser_company,
        appraiserCredentials: v.appraiser_credentials,
        valuationMethod: v.valuation_method,
        marketComparison: v.market_comparison,
        conditionAtValuation: v.condition_at_valuation,
        certificateUrl: v.certificate_url,
        notes: v.notes,
        createdAt: v.created_at,
    })));
}));

// ===========================================
// REPAIR ROUTES
// ===========================================

router.post('/:id/repairs', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createRepairSchema.parse(req.body);

    const asset = db.prepare('SELECT * FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId) as any;

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO instrument_repairs (
            id, asset_id, repair_type, priority, status, reported_date, reported_by,
            issue_description, diagnosis, repair_shop_name, repair_shop_contact,
            repair_shop_address, technician_name, estimated_cost, estimated_completion,
            warranty_claim, insurance_claim_id, notes, created_by
        ) VALUES (?, ?, ?, ?, 'pending', date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, req.params.id, data.repairType, data.priority, req.user!.id,
        data.issueDescription, data.diagnosis || null, data.repairShopName || null,
        data.repairShopContact || null, data.repairShopAddress || null,
        data.technicianName || null, data.estimatedCost || null,
        data.estimatedCompletion || null, data.warrantyClaimRef ? 1 : 0,
        data.insuranceClaimId || null, data.notes || null, req.user!.id
    );

    if (data.priority === 'urgent' || data.priority === 'high') {
        db.prepare('UPDATE instrument_assets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('in_repair', req.params.id);
    }

    logAssetHistory(req.params.id, 'repair_created', `Reparatie aangemeld: ${data.issueDescription.substring(0, 50)}`, req.user!.id, null, null, null, id, 'repair');

    res.status(201).json({ id, message: 'Reparatie aangemeld' });
}));

router.get('/:id/repairs', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const repairs = db.prepare('SELECT * FROM instrument_repairs WHERE asset_id = ? ORDER BY reported_date DESC').all(req.params.id);

    res.json(repairs.map((r: any) => ({
        id: r.id,
        repairType: r.repair_type,
        priority: r.priority,
        status: r.status,
        reportedDate: r.reported_date,
        issueDescription: r.issue_description,
        diagnosis: r.diagnosis,
        repairShopName: r.repair_shop_name,
        technicianName: r.technician_name,
        estimatedCost: r.estimated_cost,
        actualCost: r.actual_cost,
        partsReplaced: r.parts_replaced,
        laborHours: r.labor_hours,
        estimatedCompletion: r.estimated_completion,
        startedDate: r.started_date,
        completedDate: r.completed_date,
        warrantyClaimRef: r.warranty_claim === 1,
        insuranceClaimId: r.insurance_claim_id,
        invoiceNumber: r.invoice_number,
        qualityRating: r.quality_rating,
        notes: r.notes,
        createdAt: r.created_at,
    })));
}));

router.put('/:assetId/repairs/:repairId', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateRepairSchema.parse(req.body);

    const repair = db.prepare(`
        SELECT r.* FROM instrument_repairs r
        JOIN instrument_assets a ON r.asset_id = a.id
        WHERE r.id = ? AND a.association_id = ?
    `).get(req.params.repairId, req.user!.associationId) as any;

    if (!repair) {
        throw new ApiError(404, 'Reparatie niet gevonden');
    }

    db.prepare(`
        UPDATE instrument_repairs SET
            status = COALESCE(?, status),
            diagnosis = COALESCE(?, diagnosis),
            actual_cost = COALESCE(?, actual_cost),
            parts_replaced = COALESCE(?, parts_replaced),
            labor_hours = COALESCE(?, labor_hours),
            started_date = COALESCE(?, started_date),
            completed_date = COALESCE(?, completed_date),
            invoice_number = COALESCE(?, invoice_number),
            invoice_url = COALESCE(?, invoice_url),
            quality_rating = COALESCE(?, quality_rating),
            quality_notes = COALESCE(?, quality_notes),
            notes = COALESCE(?, notes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        data.status, data.diagnosis, data.actualCost, data.partsReplaced,
        data.laborHours, data.startedDate, data.completedDate,
        data.invoiceNumber, data.invoiceUrl, data.qualityRating,
        data.qualityNotes, data.notes, req.params.repairId
    );

    if (data.status === 'completed') {
        db.prepare(`
            UPDATE instrument_assets SET
                status = 'available',
                condition = 'good',
                last_maintenance_date = date('now'),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(req.params.assetId);

        logAssetHistory(req.params.assetId, 'repair_completed', 'Reparatie voltooid', req.user!.id, null, null, null, req.params.repairId, 'repair');
    } else if (data.status === 'in_progress') {
        db.prepare('UPDATE instrument_assets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run('in_repair', req.params.assetId);
    }

    res.json({ message: 'Reparatie bijgewerkt' });
}));

// ===========================================
// LOAN ROUTES
// ===========================================

router.post('/:id/loans', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createLoanSchema.parse(req.body);

    const asset = db.prepare('SELECT * FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId) as any;

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    if (asset.status === 'on_loan') {
        throw new ApiError(400, 'Dit instrument is al uitgeleend');
    }

    if (['in_repair', 'written_off', 'sold', 'lost'].includes(asset.status)) {
        throw new ApiError(400, 'Dit instrument kan niet worden uitgeleend vanwege de huidige status');
    }

    const id = uuidv4();

    withTransaction(() => {
        db.prepare(`
            INSERT INTO instrument_loans (
                id, asset_id, borrower_user_id, loan_type, purpose, loan_date,
                expected_return_date, condition_at_loan, accessories_loaned,
                deposit_amount, insurance_required, rental_fee, rental_period,
                status, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(
            id, req.params.id, data.borrowerUserId, data.loanType, data.purpose || null,
            data.loanDate, data.expectedReturnDate || null, data.conditionAtLoan,
            data.accessoriesLoaned ? JSON.stringify(data.accessoriesLoaned) : null,
            data.depositAmount || null, data.insuranceRequired ? 1 : 0,
            data.rentalFee || null, data.rentalPeriod || null,
            data.notes || null, req.user!.id
        );

        db.prepare(`
            UPDATE instrument_assets SET
                status = 'on_loan',
                assigned_to_user_id = ?,
                assigned_date = ?,
                expected_return_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(data.borrowerUserId, data.loanDate, data.expectedReturnDate || null, req.params.id);
    });

    logAssetHistory(req.params.id, 'loan_created', 'Instrument uitgeleend', req.user!.id, null, null, null, id, 'loan');
    logger.info(`Instrument loaned: ${req.params.id}`, { loanId: id, borrowerId: data.borrowerUserId });

    res.status(201).json({ id, message: 'Instrument uitgeleend' });
}));

router.get('/:id/loans', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const loans = db.prepare(`
        SELECT l.*, u.first_name, u.last_name, u.email
        FROM instrument_loans l
        JOIN users u ON l.borrower_user_id = u.id
        WHERE l.asset_id = ?
        ORDER BY l.loan_date DESC
    `).all(req.params.id);

    res.json(loans.map((l: any) => ({
        id: l.id,
        borrower: {
            id: l.borrower_user_id,
            firstName: l.first_name,
            lastName: l.last_name,
            email: l.email,
        },
        loanType: l.loan_type,
        purpose: l.purpose,
        loanDate: l.loan_date,
        expectedReturnDate: l.expected_return_date,
        actualReturnDate: l.actual_return_date,
        conditionAtLoan: l.condition_at_loan,
        conditionAtReturn: l.condition_at_return,
        accessoriesLoaned: l.accessories_loaned ? JSON.parse(l.accessories_loaned) : [],
        accessoriesReturned: l.accessories_returned ? JSON.parse(l.accessories_returned) : [],
        depositAmount: l.deposit_amount,
        rentalFee: l.rental_fee,
        status: l.status,
        damageReported: l.damage_reported,
        damageCost: l.damage_cost,
        notes: l.notes,
        createdAt: l.created_at,
    })));
}));

router.post('/:assetId/loans/:loanId/return', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = returnLoanSchema.parse(req.body);

    const loan = db.prepare(`
        SELECT l.* FROM instrument_loans l
        JOIN instrument_assets a ON l.asset_id = a.id
        WHERE l.id = ? AND a.association_id = ? AND l.status = 'active'
    `).get(req.params.loanId, req.user!.associationId) as any;

    if (!loan) {
        throw new ApiError(404, 'Uitleen niet gevonden of al teruggebracht');
    }

    withTransaction(() => {
        db.prepare(`
            UPDATE instrument_loans SET
                actual_return_date = ?,
                condition_at_return = ?,
                accessories_returned = ?,
                return_inspection_notes = ?,
                damage_reported = ?,
                damage_cost = ?,
                status = 'returned',
                returned_to = ?,
                return_verified = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            data.actualReturnDate, data.conditionAtReturn,
            data.accessoriesReturned ? JSON.stringify(data.accessoriesReturned) : null,
            data.returnInspectionNotes || null, data.damageReported || null,
            data.damageCost || null, req.user!.id, req.params.loanId
        );

        db.prepare(`
            UPDATE instrument_assets SET
                status = 'available',
                condition = ?,
                assigned_to_user_id = NULL,
                assigned_date = NULL,
                expected_return_date = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(data.conditionAtReturn, req.params.assetId);
    });

    logAssetHistory(req.params.assetId, 'loan_returned', 'Instrument teruggebracht', req.user!.id, null, null, null, req.params.loanId, 'loan');

    res.json({ message: 'Instrument teruggebracht' });
}));

// ===========================================
// DOCUMENT ROUTES
// ===========================================

router.post('/:id/documents', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createDocumentSchema.parse(req.body);

    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const id = uuidv4();

    db.prepare(`
        INSERT INTO instrument_documents (
            id, asset_id, document_type, title, description, file_url, file_name,
            file_size, mime_type, version, valid_from, valid_until, is_public, tags, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, req.params.id, data.documentType, data.title, data.description || null,
        data.fileUrl, data.fileName, data.fileSize || null, data.mimeType || null,
        data.version || null, data.validFrom || null, data.validUntil || null,
        data.isPublic ? 1 : 0, data.tags ? JSON.stringify(data.tags) : null, req.user!.id
    );

    logAssetHistory(req.params.id, 'document_added', `Document toegevoegd: ${data.title}`, req.user!.id, null, null, null, id, 'document');

    res.status(201).json({ id, message: 'Document toegevoegd' });
}));

router.get('/:id/documents', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const documents = db.prepare('SELECT * FROM instrument_documents WHERE asset_id = ? ORDER BY created_at DESC').all(req.params.id);

    res.json(documents.map((d: any) => ({
        id: d.id,
        documentType: d.document_type,
        title: d.title,
        description: d.description,
        fileUrl: d.file_url,
        fileName: d.file_name,
        fileSize: d.file_size,
        mimeType: d.mime_type,
        version: d.version,
        validFrom: d.valid_from,
        validUntil: d.valid_until,
        isPublic: d.is_public === 1,
        tags: d.tags ? JSON.parse(d.tags) : [],
        createdAt: d.created_at,
    })));
}));

router.delete('/:assetId/documents/:docId', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db.prepare(`
        DELETE FROM instrument_documents
        WHERE id = ? AND asset_id IN (SELECT id FROM instrument_assets WHERE association_id = ?)
    `).run(req.params.docId, req.user!.associationId);

    if (result.changes === 0) {
        throw new ApiError(404, 'Document niet gevonden');
    }

    logAssetHistory(req.params.assetId, 'document_deleted', 'Document verwijderd', req.user!.id, null, null, null, req.params.docId, 'document');

    res.json({ message: 'Document verwijderd' });
}));

// ===========================================
// HISTORY ROUTES
// ===========================================

router.get('/:id/history', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
    const asset = db.prepare('SELECT id FROM instrument_assets WHERE id = ? AND association_id = ?')
        .get(req.params.id, req.user!.associationId);

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const { limit, offset } = getPaginationParams(req.query);

    const history = db.prepare(`
        SELECT h.*, u.first_name, u.last_name
        FROM instrument_history h
        LEFT JOIN users u ON h.user_id = u.id
        WHERE h.asset_id = ?
        ORDER BY h.event_date DESC
        LIMIT ? OFFSET ?
    `).all(req.params.id, limit, offset);

    res.json(history.map((h: any) => ({
        id: h.id,
        eventType: h.event_type,
        eventDate: h.event_date,
        description: h.description,
        oldValue: h.old_value,
        newValue: h.new_value,
        fieldChanged: h.field_changed,
        relatedId: h.related_id,
        relatedType: h.related_type,
        user: h.user_id ? { id: h.user_id, firstName: h.first_name, lastName: h.last_name } : null,
    })));
}));

// ===========================================
// RECORD MAINTENANCE
// ===========================================

router.post('/:id/record-maintenance', authenticateToken, requireRole('admin', 'equipment_committee'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const { date, notes, cost } = req.body;

    const asset = db.prepare('SELECT * FROM instrument_assets WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(req.params.id, req.user!.associationId) as any;

    if (!asset) {
        throw new ApiError(404, 'Instrument niet gevonden');
    }

    const maintenanceDate = date || new Date().toISOString().split('T')[0];
    const interval = asset.maintenance_interval_months || 12;
    const nextDate = new Date(maintenanceDate);
    nextDate.setMonth(nextDate.getMonth() + interval);
    const nextMaintenanceDue = nextDate.toISOString().split('T')[0];

    db.prepare(`
        UPDATE instrument_assets SET
            last_maintenance_date = ?,
            next_maintenance_due = ?,
            maintenance_notes = ?,
            condition = 'good',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(maintenanceDate, nextMaintenanceDue, notes || null, req.params.id);

    logAssetHistory(req.params.id, 'maintenance_recorded', `Onderhoud uitgevoerd${cost ? `: €${cost}` : ''}`, req.user!.id, asset.last_maintenance_date, maintenanceDate, 'last_maintenance_date');

    res.json({
        message: 'Onderhoud geregistreerd',
        nextMaintenanceDue,
    });
}));

export default router;
