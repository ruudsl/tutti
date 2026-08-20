import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { z } from 'zod';
import { wijzigingsschema } from '../utils/schema';

const router = Router();

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const createEquipmentSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  inventoryNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  equipmentType: z.enum(['instrument', 'accessory', 'audio', 'lighting', 'furniture', 'transport', 'misc']),
  status: z.enum(['available', 'in_use', 'maintenance', 'repair', 'retired', 'lost', 'sold']).default('available'),
  condition: z.enum(['new', 'excellent', 'good', 'fair', 'poor', 'broken']).default('good'),
  location: z.string().optional(),
  storageLocation: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  currentValue: z.number().optional(),
  depreciationYears: z.number().optional(),
  warrantyExpiry: z.string().optional(),
  maintenanceIntervalMonths: z.number().optional(),
  insuranceValue: z.number().optional(),
  insurancePolicy: z.string().optional(),
  isLoanable: z.boolean().default(true),
  requiresTraining: z.boolean().default(false),
  notes: z.string().optional(),
});

const updateEquipmentSchema = wijzigingsschema(createEquipmentSchema);

const loanSchema = z.object({
  equipmentId: z.string().uuid(),
  userId: z.string().uuid(),
  expectedReturnDate: z.string().optional(),
  conditionAtCheckout: z.string().optional(),
  checkoutNotes: z.string().optional(),
  relatedConcertId: z.string().uuid().optional(),
  relatedRehearsalId: z.string().uuid().optional(),
  relatedProjectId: z.string().uuid().optional(),
});

const returnLoanSchema = z.object({
  conditionAtReturn: z.string().optional(),
  returnNotes: z.string().optional(),
});

const maintenanceSchema = z.object({
  maintenanceType: z.enum(['inspection', 'cleaning', 'repair', 'service', 'calibration', 'replacement']),
  description: z.string().min(1),
  performedDate: z.string(),
  performedBy: z.string().uuid().optional(),
  externalProvider: z.string().optional(),
  cost: z.number().optional(),
  partsReplaced: z.string().optional(),
  nextMaintenanceDate: z.string().optional(),
  notes: z.string().optional(),
});

// GET /equipment/categories
router.get(
  '/categories',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const categories = db
      .prepare(
        `
      SELECT ec.*, p.name as parent_name,
        (SELECT COUNT(*) FROM equipment_items WHERE category_id = ec.id AND deleted_at IS NULL) as item_count
      FROM equipment_categories ec
      LEFT JOIN equipment_categories p ON ec.parent_id = p.id
      WHERE ec.association_id = ?
      ORDER BY ec.sort_order, ec.name
    `,
      )
      .all(associationId);

    res.json(
      categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        parentId: c.parent_id,
        parentName: c.parent_name,
        color: c.color,
        icon: c.icon,
        sortOrder: c.sort_order,
        itemCount: c.item_count,
      })),
    );
  }),
);

// POST /equipment/categories
router.post(
  '/categories',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createCategorySchema.parse(req.body);
    const associationId = req.user!.associationId;
    const id = uuidv4();

    db.prepare(
      `
      INSERT INTO equipment_categories (id, association_id, name, description, parent_id, color, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.name,
      data.description || null,
      data.parentId || null,
      data.color || null,
      data.icon || null,
    );

    res.status(201).json({ id, message: 'Categorie aangemaakt' });
  }),
);

// DELETE /equipment/categories/:id
router.delete(
  '/categories/:id',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const result = db
      .prepare('DELETE FROM equipment_categories WHERE id = ? AND association_id = ?')
      .run(id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Categorie niet gevonden');
    }

    res.json({ message: 'Categorie verwijderd' });
  }),
);

// GET /equipment
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { type, categoryId, status, loanable } = req.query;

    let query = `
      SELECT e.*, ec.name as category_name, ec.color as category_color,
        (SELECT COUNT(*) FROM equipment_item_loans WHERE equipment_id = e.id AND status = 'active') as active_loans
      FROM equipment_items e
      LEFT JOIN equipment_categories ec ON e.category_id = ec.id
      WHERE e.association_id = ? AND e.deleted_at IS NULL
    `;
    const params: any[] = [associationId];

    if (type) {
      query += ' AND e.equipment_type = ?';
      params.push(type);
    }
    if (categoryId) {
      query += ' AND e.category_id = ?';
      params.push(categoryId);
    }
    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }
    if (loanable !== undefined) {
      query += ' AND e.is_loanable = ?';
      params.push(loanable === 'true' ? 1 : 0);
    }

    query += ' ORDER BY e.name';

    const equipment = db.prepare(query).all(...params);

    res.json(
      equipment.map((e: any) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        categoryId: e.category_id,
        categoryName: e.category_name,
        categoryColor: e.category_color,
        inventoryNumber: e.inventory_number,
        serialNumber: e.serial_number,
        brand: e.brand,
        model: e.model,
        equipmentType: e.equipment_type,
        status: e.status,
        condition: e.condition,
        location: e.location,
        isLoanable: e.is_loanable === 1,
        currentValue: e.current_value,
        activeLoans: e.active_loans,
        imagePath: e.image_path,
      })),
    );
  }),
);

// LET OP: deze letterlijke routes staan bewust boven /:id.
// Express matcht in registratievolgorde, dus met /:id ervoor kwam een
// verzoek hier terecht bij de :id-handler en antwoordde die 404.

// GET /equipment/loans
router.get(
  '/loans',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { status, userId, equipmentId } = req.query;

    let query = `
      SELECT el.*, e.name as equipment_name, e.inventory_number,
        u.first_name || ' ' || u.last_name as user_name
      FROM equipment_item_loans el
      JOIN equipment_items e ON el.equipment_id = e.id
      JOIN users u ON el.user_id = u.id
      WHERE e.association_id = ?
    `;
    const params: any[] = [associationId];

    if (status) {
      query += ' AND el.status = ?';
      params.push(status);
    }
    if (userId) {
      query += ' AND el.user_id = ?';
      params.push(userId);
    }
    if (equipmentId) {
      query += ' AND el.equipment_id = ?';
      params.push(equipmentId);
    }

    query += ' ORDER BY el.checkout_date DESC';

    const loans = db.prepare(query).all(...params);

    res.json(
      loans.map((l: any) => ({
        id: l.id,
        equipmentId: l.equipment_id,
        equipmentName: l.equipment_name,
        inventoryNumber: l.inventory_number,
        userId: l.user_id,
        userName: l.user_name,
        checkoutDate: l.checkout_date,
        expectedReturnDate: l.expected_return_date,
        actualReturnDate: l.actual_return_date,
        status: l.status,
      })),
    );
  }),
);

// GET /equipment/stats
router.get(
  '/stats',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const totalItems = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM equipment_items WHERE association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(associationId) as any;

    const byStatus = db
      .prepare(
        `
      SELECT status, COUNT(*) as count FROM equipment_items
      WHERE association_id = ? AND deleted_at IS NULL
      GROUP BY status
    `,
      )
      .all(associationId);

    const activeLoans = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM equipment_item_loans el
      JOIN equipment_items e ON el.equipment_id = e.id
      WHERE e.association_id = ? AND el.status = 'active'
    `,
      )
      .get(associationId) as any;

    const totalValue = db
      .prepare(
        `
      SELECT SUM(current_value) as total FROM equipment_items
      WHERE association_id = ? AND deleted_at IS NULL AND status NOT IN ('retired', 'lost', 'sold')
    `,
      )
      .get(associationId) as any;

    res.json({
      totalItems: totalItems.count,
      byStatus: Object.fromEntries(byStatus.map((s: any) => [s.status, s.count])),
      activeLoans: activeLoans.count,
      totalValue: totalValue.total || 0,
    });
  }),
);

// GET /equipment/types
// De invoerpagina biedt bij "soort" een lijst met suggesties aan. Die haalde ze
// hier op, maar dit pad bestond niet en viel dus door naar /:id, wat met een
// 404 antwoordde. Deze route moet daarom boven /:id blijven staan.
router.get(
  '/types',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const rows = db
      .prepare(
        `
      SELECT DISTINCT equipment_type FROM equipment_items
      WHERE association_id = ? AND deleted_at IS NULL AND equipment_type IS NOT NULL
      ORDER BY equipment_type
    `,
      )
      .all(associationId) as Array<{ equipment_type: string }>;

    res.json(rows.map((r) => r.equipment_type));
  }),
);

// GET /equipment/:id
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const equipment = db
      .prepare(
        `
      SELECT e.*, ec.name as category_name
      FROM equipment_items e
      LEFT JOIN equipment_categories ec ON e.category_id = ec.id
      WHERE e.id = ? AND e.association_id = ? AND e.deleted_at IS NULL
    `,
      )
      .get(id, associationId) as any;

    if (!equipment) {
      throw new ApiError(404, 'Apparatuur niet gevonden');
    }

    const loans = db
      .prepare(
        `
      SELECT el.*, u.first_name || ' ' || u.last_name as user_name
      FROM equipment_item_loans el
      JOIN users u ON el.user_id = u.id
      WHERE el.equipment_id = ?
      ORDER BY el.checkout_date DESC
      LIMIT 20
    `,
      )
      .all(id);

    const maintenance = db
      .prepare(
        `
      SELECT em.*, u.first_name || ' ' || u.last_name as performed_by_name
      FROM equipment_maintenance em
      LEFT JOIN users u ON em.performed_by = u.id
      WHERE em.equipment_id = ?
      ORDER BY em.performed_date DESC
      LIMIT 20
    `,
      )
      .all(id);

    res.json({
      id: equipment.id,
      name: equipment.name,
      description: equipment.description,
      categoryId: equipment.category_id,
      categoryName: equipment.category_name,
      inventoryNumber: equipment.inventory_number,
      serialNumber: equipment.serial_number,
      brand: equipment.brand,
      model: equipment.model,
      equipmentType: equipment.equipment_type,
      status: equipment.status,
      condition: equipment.condition,
      location: equipment.location,
      storageLocation: equipment.storage_location,
      purchaseDate: equipment.purchase_date,
      purchasePrice: equipment.purchase_price,
      currentValue: equipment.current_value,
      warrantyExpiry: equipment.warranty_expiry,
      lastMaintenance: equipment.last_maintenance,
      nextMaintenance: equipment.next_maintenance,
      isLoanable: equipment.is_loanable === 1,
      requiresTraining: equipment.requires_training === 1,
      imagePath: equipment.image_path,
      notes: equipment.notes,
      createdAt: equipment.created_at,
      loans: loans.map((l: any) => ({
        id: l.id,
        userId: l.user_id,
        userName: l.user_name,
        checkoutDate: l.checkout_date,
        expectedReturnDate: l.expected_return_date,
        actualReturnDate: l.actual_return_date,
        status: l.status,
      })),
      maintenance: maintenance.map((m: any) => ({
        id: m.id,
        maintenanceType: m.maintenance_type,
        description: m.description,
        performedDate: m.performed_date,
        performedByName: m.performed_by_name,
        cost: m.cost,
      })),
    });
  }),
);

// POST /equipment
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createEquipmentSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const id = uuidv4();

    let inventoryNumber = data.inventoryNumber;
    if (!inventoryNumber) {
      const count = db
        .prepare('SELECT COUNT(*) as count FROM equipment_items WHERE association_id = ?')
        .get(associationId) as any;
      inventoryNumber = `EQ-${String(count.count + 1).padStart(5, '0')}`;
    }

    db.prepare(
      `
      INSERT INTO equipment_items (id, association_id, category_id, name, description,
        inventory_number, serial_number, brand, model, equipment_type, status, condition,
        location, storage_location, purchase_date, purchase_price, current_value,
        depreciation_years, warranty_expiry, maintenance_interval_months, insurance_value,
        insurance_policy, is_loanable, requires_training, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.categoryId || null,
      data.name,
      data.description || null,
      inventoryNumber,
      data.serialNumber || null,
      data.brand || null,
      data.model || null,
      data.equipmentType,
      data.status,
      data.condition,
      data.location || null,
      data.storageLocation || null,
      data.purchaseDate || null,
      data.purchasePrice || null,
      data.currentValue || null,
      data.depreciationYears || null,
      data.warrantyExpiry || null,
      data.maintenanceIntervalMonths || null,
      data.insuranceValue || null,
      data.insurancePolicy || null,
      data.isLoanable ? 1 : 0,
      data.requiresTraining ? 1 : 0,
      data.notes || null,
    );

    res.status(201).json({ id, inventoryNumber, message: 'Apparatuur aangemaakt' });
  }),
);

// PATCH /equipment/:id
router.patch(
  '/:id',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateEquipmentSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const equipment = db
      .prepare('SELECT id FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!equipment) {
      throw new ApiError(404, 'Apparatuur niet gevonden');
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
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
    }
    if (data.condition !== undefined) {
      updates.push('condition = ?');
      params.push(data.condition);
    }
    if (data.location !== undefined) {
      updates.push('location = ?');
      params.push(data.location);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      db.prepare(`UPDATE equipment_items SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    }

    res.json({ message: 'Apparatuur bijgewerkt' });
  }),
);

// DELETE /equipment/:id
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const result = db
      .prepare(
        `
      UPDATE equipment_items SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .run(id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Apparatuur niet gevonden');
    }

    res.json({ message: 'Apparatuur verwijderd' });
  }),
);

// POST /equipment/loans
router.post(
  '/loans',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = loanSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const createdBy = req.user!.id;

    const equipment = db
      .prepare(
        `
      SELECT * FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(data.equipmentId, associationId) as any;

    if (!equipment) {
      throw new ApiError(404, 'Apparatuur niet gevonden');
    }

    if (!equipment.is_loanable) {
      throw new ApiError(400, 'Dit item kan niet worden uitgeleend');
    }

    const activeLoan = db
      .prepare(
        `
      SELECT id FROM equipment_item_loans WHERE equipment_id = ? AND status = 'active'
    `,
      )
      .get(data.equipmentId);

    if (activeLoan) {
      throw new ApiError(400, 'Dit item is al uitgeleend');
    }

    const id = uuidv4();
    db.prepare(
      `
      INSERT INTO equipment_item_loans (id, equipment_id, user_id, checkout_date, expected_return_date,
        condition_at_checkout, checkout_notes, related_concert_id, related_rehearsal_id,
        related_project_id, created_by)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      data.equipmentId,
      data.userId,
      data.expectedReturnDate || null,
      data.conditionAtCheckout || null,
      data.checkoutNotes || null,
      data.relatedConcertId || null,
      data.relatedRehearsalId || null,
      data.relatedProjectId || null,
      createdBy,
    );

    db.prepare('UPDATE equipment_items SET status = "in_use" WHERE id = ?').run(data.equipmentId);

    res.status(201).json({ id, message: 'Uitlening geregistreerd' });
  }),
);

// PATCH /equipment/loans/:id/return
router.patch(
  '/loans/:id/return',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = returnLoanSchema.parse(req.body);
    const returnedTo = req.user!.id;
    const associationId = req.user!.associationId;

    const loan = db
      .prepare(
        `
      SELECT el.*, e.id as equipment_id FROM equipment_item_loans el
      JOIN equipment_items e ON el.equipment_id = e.id
      WHERE el.id = ? AND e.association_id = ?
    `,
      )
      .get(id, associationId) as any;

    if (!loan) {
      throw new ApiError(404, 'Uitlening niet gevonden');
    }

    if (loan.status !== 'active') {
      throw new ApiError(400, 'Uitlening is niet actief');
    }

    db.prepare(
      `
      UPDATE equipment_item_loans SET status = 'returned', actual_return_date = CURRENT_TIMESTAMP,
        condition_at_return = ?, return_notes = ?, returned_to = ?
      WHERE id = ?
    `,
    ).run(data.conditionAtReturn || null, data.returnNotes || null, returnedTo, id);

    db.prepare('UPDATE equipment_items SET status = "available" WHERE id = ?').run(loan.equipment_id);

    res.json({ message: 'Inlevering geregistreerd' });
  }),
);

// POST /equipment/:id/maintenance
router.post(
  '/:id/maintenance',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = maintenanceSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const createdBy = req.user!.id;

    const equipment = db
      .prepare('SELECT id FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!equipment) {
      throw new ApiError(404, 'Apparatuur niet gevonden');
    }

    const maintenanceId = uuidv4();
    db.prepare(
      `
      INSERT INTO equipment_maintenance (id, equipment_id, maintenance_type, description,
        performed_date, performed_by, external_provider, cost, parts_replaced,
        next_maintenance_date, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      maintenanceId,
      id,
      data.maintenanceType,
      data.description,
      data.performedDate,
      data.performedBy || null,
      data.externalProvider || null,
      data.cost || null,
      data.partsReplaced || null,
      data.nextMaintenanceDate || null,
      data.notes || null,
      createdBy,
    );

    db.prepare('UPDATE equipment_items SET last_maintenance = ?, next_maintenance = ? WHERE id = ?').run(
      data.performedDate,
      data.nextMaintenanceDate || null,
      id,
    );

    res.status(201).json({ id: maintenanceId, message: 'Onderhoud geregistreerd' });
  }),
);

// =====================================================
// DAMAGE REPORTS
// =====================================================

const createDamageReportSchema = z.object({
  description: z.string().min(1, 'Beschrijving is verplicht'),
  severity: z.enum(['minor', 'moderate', 'severe', 'unusable']),
  photos: z.array(z.string()).optional(),
  repairCost: z.number().optional(),
  notes: z.string().optional(),
});

// GET /equipment/:id/damage - List damage reports for an item
router.get(
  '/:id/damage',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const item = db
      .prepare(
        `
      SELECT id FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(req.params.id, associationId);

    if (!item) {
      throw new ApiError(404, 'Item niet gevonden.');
    }

    const reports = db
      .prepare(
        `
      SELECT d.*,
             u1.first_name || ' ' || u1.last_name AS reported_by_name,
             u2.first_name || ' ' || u2.last_name AS repaired_by_name
      FROM equipment_damage_reports d
      LEFT JOIN users u1 ON d.reported_by = u1.id
      LEFT JOIN users u2 ON d.repaired_by = u2.id
      WHERE d.item_id = ?
      ORDER BY d.created_at DESC
    `,
      )
      .all(req.params.id);

    res.json(
      reports.map((r: any) => ({
        id: r.id,
        description: r.description,
        severity: r.severity,
        photos: r.photos ? JSON.parse(r.photos) : [],
        repairCost: r.repair_cost,
        repairedAt: r.repaired_at,
        repairedBy: r.repaired_by,
        repairedByName: r.repaired_by_name,
        notes: r.notes,
        reportedBy: r.reported_by,
        reportedByName: r.reported_by_name,
        createdAt: r.created_at,
      })),
    );
  }),
);

// POST /equipment/:id/damage - Report damage
router.post(
  '/:id/damage',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = createDamageReportSchema.parse(req.body);

    const item = db
      .prepare(
        `
      SELECT id, condition, status FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!item) {
      throw new ApiError(404, 'Item niet gevonden.');
    }

    const reportId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO equipment_damage_reports (id, item_id, reported_by, description, severity, photos, repair_cost, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      reportId,
      req.params.id,
      req.user!.id,
      data.description,
      data.severity,
      data.photos ? JSON.stringify(data.photos) : null,
      data.repairCost || null,
      data.notes || null,
      now,
    );

    // Update item condition based on severity
    const conditionMap: Record<string, string> = {
      minor: 'fair',
      moderate: 'poor',
      severe: 'poor',
      unusable: 'broken',
    };

    // status stond niet in de SELECT hierboven, dus item.status was undefined
    // en bij elke melding die niet 'unusable' was werd de stand van het item
    // overschreven met niets. Alleen bij 'unusable' hoort hij te veranderen;
    // anders blijft hij zoals hij was.
    const newCondition = conditionMap[data.severity];
    if (newCondition) {
      db.prepare('UPDATE equipment_items SET condition = ?, status = ? WHERE id = ?').run(
        newCondition,
        data.severity === 'unusable' ? 'repair' : item.status,
        req.params.id,
      );
    }

    res.status(201).json({
      id: reportId,
      message: 'Schade gerapporteerd.',
    });
  }),
);

// PATCH /equipment/:id/damage/:reportId - Update damage report (mark as repaired)
router.patch(
  '/:id/damage/:reportId',
  authenticateToken,
  requireRole('admin', 'equipment_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { repairedAt, repairCost, notes } = req.body;

    const item = db
      .prepare(
        `
      SELECT id FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(req.params.id, associationId);

    if (!item) {
      throw new ApiError(404, 'Item niet gevonden.');
    }

    const report = db
      .prepare(
        `
      SELECT id FROM equipment_damage_reports WHERE id = ? AND item_id = ?
    `,
      )
      .get(req.params.reportId, req.params.id);

    if (!report) {
      throw new ApiError(404, 'Schaderapport niet gevonden.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (repairedAt !== undefined) {
      updates.push('repaired_at = ?');
      params.push(repairedAt);
      updates.push('repaired_by = ?');
      params.push(req.user!.id);
    }
    if (repairCost !== undefined) {
      updates.push('repair_cost = ?');
      params.push(repairCost);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length > 0) {
      params.push(req.params.reportId);
      db.prepare(`UPDATE equipment_damage_reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    // If marked as repaired, update item condition
    if (repairedAt) {
      db.prepare('UPDATE equipment_items SET condition = ?, status = ? WHERE id = ?').run(
        'good',
        'available',
        req.params.id,
      );
    }

    res.json({ message: 'Schaderapport bijgewerkt.' });
  }),
);

// DELETE /equipment/:id/damage/:reportId - Delete damage report
router.delete(
  '/:id/damage/:reportId',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const item = db
      .prepare(
        `
      SELECT id FROM equipment_items WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .get(req.params.id, associationId);

    if (!item) {
      throw new ApiError(404, 'Item niet gevonden.');
    }

    const result = db
      .prepare(
        `
      DELETE FROM equipment_damage_reports WHERE id = ? AND item_id = ?
    `,
      )
      .run(req.params.reportId, req.params.id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Schaderapport niet gevonden.');
    }

    res.json({ message: 'Schaderapport verwijderd.' });
  }),
);

export default router;
