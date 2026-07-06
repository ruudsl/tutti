import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { withTransaction, getPaginationParams, createPaginatedResult } from '../utils/database';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// Uniform item types
const UNIFORM_ITEM_TYPES = [
  { value: 'jacket', label: 'Jas' },
  { value: 'pants', label: 'Broek' },
  { value: 'vest', label: 'Gilet' },
  { value: 'tie', label: 'Stropdas' },
  { value: 'scarf', label: 'Sjaaltje' },
  { value: 'polo', label: 'Poloshirt' },
  { value: 'raincoat', label: 'Regenjas' },
  { value: 'shirt', label: 'Overhemd' },
  { value: 'shoes', label: 'Schoenen' },
  { value: 'hat', label: 'Hoed/Pet' },
  { value: 'other', label: 'Overig' },
];

// Validation schemas
const createUniformItemSchema = z.object({
  itemType: z.string().min(1, 'Type is verplicht'),
  sizeStandard: z.string().optional(),
  sizeLength: z.number().int().min(0).optional(),
  sizeWidth: z.number().int().min(0).optional(),
  color: z.string().optional(),
  condition: z.enum(['good', 'fair', 'poor']).default('good'),
  status: z.enum(['available', 'issued', 'in_repair', 'written_off']).default('available'),
  currentUserId: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().min(0).optional(),
});

const updateUniformItemSchema = createUniformItemSchema.partial();

const createUniformSetSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  requirements: z
    .array(
      z.object({
        itemType: z.string().min(1),
        quantity: z.number().int().min(1).default(1),
      }),
    )
    .optional(),
});

const updateUniformSetSchema = createUniformSetSchema.partial();

const createAssignmentSchema = z.object({
  userId: z.string().uuid('Gebruiker is verplicht'),
  assignedDate: z.string().min(1, 'Datum is verplicht'),
  conditionAtAssignment: z.string().optional(),
  notes: z.string().optional(),
});

const returnAssignmentSchema = z.object({
  returnedDate: z.string().min(1, 'Retour datum is verplicht'),
  conditionAtReturn: z.string().optional(),
});

/**
 * @swagger
 * /uniforms/item-types:
 *   get:
 *     summary: Get available uniform item types
 *     tags: [Uniforms]
 */
router.get('/item-types', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json(UNIFORM_ITEM_TYPES);
});

/**
 * @swagger
 * /uniforms/size-search:
 *   get:
 *     summary: Search available items by size
 *     tags: [Uniforms]
 */
router.get(
  '/size-search',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { size, itemType } = req.query;

    if (!size) {
      throw new ApiError(400, 'Maat is verplicht.');
    }

    let whereClause = `WHERE ui.association_id = ? AND ui.status = 'available'`;
    const params: any[] = [req.user!.associationId];

    whereClause += ` AND ui.size_standard = ?`;
    params.push(size);

    if (itemType) {
      whereClause += ` AND ui.item_type = ?`;
      params.push(itemType);
    }

    const items = db
      .prepare(
        `
        SELECT ui.*
        FROM uniform_items ui
        ${whereClause}
        ORDER BY ui.item_type, ui.condition
    `,
      )
      .all(...params);

    res.json(
      items.map((item: any) => ({
        id: item.id,
        itemType: item.item_type,
        sizeStandard: item.size_standard,
        sizeLength: item.size_length,
        sizeWidth: item.size_width,
        color: item.color,
        condition: item.condition,
        notes: item.notes,
      })),
    );
  }),
);

/**
 * @swagger
 * /uniforms/available-by-size:
 *   get:
 *     summary: Get count of available items grouped by size
 *     tags: [Uniforms]
 */
router.get(
  '/available-by-size',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const itemType = req.query.itemType as string | undefined;

    let whereClause = `WHERE ui.association_id = ? AND ui.status = 'available'`;
    const params: any[] = [req.user!.associationId];

    if (itemType) {
      whereClause += ` AND ui.item_type = ?`;
      params.push(itemType);
    }

    const results = db
      .prepare(
        `
        SELECT ui.item_type, ui.size_standard, COUNT(*) as count
        FROM uniform_items ui
        ${whereClause}
        GROUP BY ui.item_type, ui.size_standard
        ORDER BY ui.item_type, ui.size_standard
    `,
      )
      .all(...params);

    res.json(
      results.map((r: any) => ({
        itemType: r.item_type,
        sizeStandard: r.size_standard,
        count: r.count,
      })),
    );
  }),
);

// ==================== UNIFORM ITEMS ====================

/**
 * @swagger
 * /uniforms/items:
 *   get:
 *     summary: Get all uniform items
 *     tags: [Uniforms]
 */
router.get(
  '/items',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, offset } = getPaginationParams(req.query);
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const itemType = req.query.itemType as string | undefined;
    const size = req.query.size as string | undefined;

    let whereClause = 'WHERE ui.association_id = ?';
    const params: any[] = [req.user!.associationId];

    if (search) {
      whereClause += ` AND (LOWER(ui.notes) LIKE ? OR LOWER(ui.color) LIKE ?)`;
      const searchTerm = `%${search.toLowerCase()}%`;
      params.push(searchTerm, searchTerm);
    }

    if (status) {
      whereClause += ' AND ui.status = ?';
      params.push(status);
    }

    if (itemType) {
      whereClause += ' AND ui.item_type = ?';
      params.push(itemType);
    }

    if (size) {
      whereClause += ' AND ui.size_standard = ?';
      params.push(size);
    }

    const countResult = db
      .prepare(
        `
        SELECT COUNT(*) as total FROM uniform_items ui ${whereClause}
    `,
      )
      .get(...params) as { total: number };

    const items = db
      .prepare(
        `
        SELECT ui.*, u.first_name, u.last_name, u.email
        FROM uniform_items ui
        LEFT JOIN users u ON ui.current_user_id = u.id
        ${whereClause}
        ORDER BY ui.item_type, ui.size_standard
        LIMIT ? OFFSET ?
    `,
      )
      .all(...params, limit, offset);

    const result = items.map((item: any) => ({
      id: item.id,
      itemType: item.item_type,
      sizeStandard: item.size_standard,
      sizeLength: item.size_length,
      sizeWidth: item.size_width,
      color: item.color,
      condition: item.condition,
      status: item.status,
      notes: item.notes,
      purchaseDate: item.purchase_date,
      purchasePrice: item.purchase_price,
      currentUser: item.current_user_id
        ? {
            id: item.current_user_id,
            firstName: item.first_name,
            lastName: item.last_name,
            email: item.email,
          }
        : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    res.json(createPaginatedResult(result, countResult.total, page, limit));
  }),
);

/**
 * @swagger
 * /uniforms/items/{id}:
 *   get:
 *     summary: Get single uniform item with assignment history
 *     tags: [Uniforms]
 */
router.get(
  '/items/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const item = db
      .prepare(
        `
        SELECT ui.*, u.first_name, u.last_name, u.email
        FROM uniform_items ui
        LEFT JOIN users u ON ui.current_user_id = u.id
        WHERE ui.id = ? AND ui.association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!item) {
      throw new ApiError(404, 'Uniform onderdeel niet gevonden.');
    }

    // Get assignment history
    const assignmentHistory = db
      .prepare(
        `
        SELECT ua.*, u.first_name, u.last_name, u.email
        FROM uniform_assignments ua
        JOIN users u ON ua.user_id = u.id
        WHERE ua.uniform_item_id = ?
        ORDER BY ua.assigned_date DESC
    `,
      )
      .all(req.params.id);

    res.json({
      id: item.id,
      itemType: item.item_type,
      sizeStandard: item.size_standard,
      sizeLength: item.size_length,
      sizeWidth: item.size_width,
      color: item.color,
      condition: item.condition,
      status: item.status,
      notes: item.notes,
      purchaseDate: item.purchase_date,
      purchasePrice: item.purchase_price,
      currentUser: item.current_user_id
        ? {
            id: item.current_user_id,
            firstName: item.first_name,
            lastName: item.last_name,
            email: item.email,
          }
        : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      assignmentHistory: assignmentHistory.map((a: any) => ({
        id: a.id,
        user: {
          id: a.user_id,
          firstName: a.first_name,
          lastName: a.last_name,
          email: a.email,
        },
        assignedDate: a.assigned_date,
        returnedDate: a.returned_date,
        conditionAtAssignment: a.condition_at_assignment,
        conditionAtReturn: a.condition_at_return,
        notes: a.notes,
      })),
    });
  }),
);

/**
 * @swagger
 * /uniforms/items:
 *   post:
 *     summary: Create new uniform item
 *     tags: [Uniforms]
 */
router.post(
  '/items',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createUniformItemSchema.parse(req.body);

    const id = uuidv4();

    db.prepare(
      `
        INSERT INTO uniform_items (
            id, association_id, item_type, size_standard, size_length, size_width,
            color, condition, status, current_user_id, notes, purchase_date, purchase_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      req.user!.associationId,
      data.itemType,
      data.sizeStandard || null,
      data.sizeLength || null,
      data.sizeWidth || null,
      data.color || null,
      data.condition,
      data.status,
      data.currentUserId || null,
      data.notes || null,
      data.purchaseDate || null,
      data.purchasePrice || null,
    );

    logger.info(`Uniform item created: ${data.itemType}`, { id, createdBy: req.user!.id });

    res.status(201).json({
      id,
      message: 'Uniform onderdeel succesvol toegevoegd.',
    });
  }),
);

/**
 * @swagger
 * /uniforms/items/bulk:
 *   post:
 *     summary: Create multiple uniform items at once
 *     tags: [Uniforms]
 */
router.post(
  '/items/bulk',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { count, ...itemData } = req.body;
    const data = createUniformItemSchema.parse(itemData);
    const quantity = Math.min(Math.max(1, count || 1), 100); // Max 100 items at once

    const ids: string[] = [];

    withTransaction(() => {
      const stmt = db.prepare(`
            INSERT INTO uniform_items (
                id, association_id, item_type, size_standard, size_length, size_width,
                color, condition, status, notes, purchase_date, purchase_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

      for (let i = 0; i < quantity; i++) {
        const id = uuidv4();
        ids.push(id);
        stmt.run(
          id,
          req.user!.associationId,
          data.itemType,
          data.sizeStandard || null,
          data.sizeLength || null,
          data.sizeWidth || null,
          data.color || null,
          data.condition,
          data.status,
          data.notes || null,
          data.purchaseDate || null,
          data.purchasePrice || null,
        );
      }
    });

    logger.info(`Bulk uniform items created: ${data.itemType} x${quantity}`, { ids, createdBy: req.user!.id });

    res.status(201).json({
      ids,
      count: quantity,
      message: `${quantity} uniform onderdelen succesvol toegevoegd.`,
    });
  }),
);

/**
 * @swagger
 * /uniforms/items/{id}:
 *   put:
 *     summary: Update uniform item
 *     tags: [Uniforms]
 */
router.put(
  '/items/:id',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateUniformItemSchema.parse(req.body);

    const existing = db
      .prepare('SELECT * FROM uniform_items WHERE id = ? AND association_id = ?')
      .get(req.params.id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Uniform onderdeel niet gevonden.');
    }

    db.prepare(
      `
        UPDATE uniform_items SET
            item_type = COALESCE(?, item_type),
            size_standard = COALESCE(?, size_standard),
            size_length = COALESCE(?, size_length),
            size_width = COALESCE(?, size_width),
            color = COALESCE(?, color),
            condition = COALESCE(?, condition),
            status = COALESCE(?, status),
            current_user_id = ?,
            notes = COALESCE(?, notes),
            purchase_date = COALESCE(?, purchase_date),
            purchase_price = COALESCE(?, purchase_price),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(
      data.itemType,
      data.sizeStandard,
      data.sizeLength,
      data.sizeWidth,
      data.color,
      data.condition,
      data.status,
      data.currentUserId !== undefined ? data.currentUserId : (existing as any).current_user_id,
      data.notes,
      data.purchaseDate,
      data.purchasePrice,
      req.params.id,
    );

    logger.info(`Uniform item updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Uniform onderdeel succesvol bijgewerkt.' });
  }),
);

/**
 * @swagger
 * /uniforms/items/{id}:
 *   delete:
 *     summary: Delete uniform item
 *     tags: [Uniforms]
 */
router.delete(
  '/items/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare('DELETE FROM uniform_items WHERE id = ? AND association_id = ?')
      .run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Uniform onderdeel niet gevonden.');
    }

    logger.info(`Uniform item deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Uniform onderdeel succesvol verwijderd.' });
  }),
);

// ==================== UNIFORM ASSIGNMENTS ====================

/**
 * @swagger
 * /uniforms/items/{id}/assign:
 *   post:
 *     summary: Assign uniform item to user
 *     tags: [Uniforms]
 */
router.post(
  '/items/:id/assign',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createAssignmentSchema.parse(req.body);

    const item = db
      .prepare('SELECT * FROM uniform_items WHERE id = ? AND association_id = ?')
      .get(req.params.id, req.user!.associationId) as any;

    if (!item) {
      throw new ApiError(404, 'Uniform onderdeel niet gevonden.');
    }

    if (item.status === 'issued') {
      throw new ApiError(400, 'Dit onderdeel is al uitgegeven.');
    }

    if (item.status === 'in_repair' || item.status === 'written_off') {
      throw new ApiError(400, 'Dit onderdeel kan niet worden uitgegeven vanwege de huidige status.');
    }

    const id = uuidv4();

    withTransaction(() => {
      db.prepare(
        `
            INSERT INTO uniform_assignments (id, uniform_item_id, user_id, assigned_date, condition_at_assignment, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(id, req.params.id, data.userId, data.assignedDate, data.conditionAtAssignment || null, data.notes || null);

      db.prepare(
        'UPDATE uniform_items SET status = ?, current_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ).run('issued', data.userId, req.params.id);
    });

    logger.info(`Uniform item assigned: ${req.params.id}`, {
      assignmentId: id,
      userId: data.userId,
      assignedBy: req.user!.id,
    });

    res.status(201).json({ id, message: 'Onderdeel uitgegeven.' });
  }),
);

/**
 * @swagger
 * /uniforms/items/{id}/return:
 *   post:
 *     summary: Return uniform item
 *     tags: [Uniforms]
 */
router.post(
  '/items/:id/return',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = returnAssignmentSchema.parse(req.body);

    const assignment = db
      .prepare(
        `
        SELECT ua.* FROM uniform_assignments ua
        JOIN uniform_items ui ON ua.uniform_item_id = ui.id
        WHERE ui.id = ? AND ui.association_id = ? AND ua.returned_date IS NULL
        ORDER BY ua.assigned_date DESC
        LIMIT 1
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!assignment) {
      throw new ApiError(404, 'Geen actieve uitgifte gevonden.');
    }

    withTransaction(() => {
      db.prepare(
        `
            UPDATE uniform_assignments SET returned_date = ?, condition_at_return = ?
            WHERE id = ?
        `,
      ).run(data.returnedDate, data.conditionAtReturn || null, assignment.id);

      // Update condition based on return condition if provided
      let newCondition = null;
      if (data.conditionAtReturn) {
        newCondition = data.conditionAtReturn;
      }

      db.prepare(
        `
            UPDATE uniform_items SET
                status = 'available',
                current_user_id = NULL,
                condition = COALESCE(?, condition),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
      ).run(newCondition, req.params.id);
    });

    logger.info(`Uniform item returned: ${req.params.id}`, { assignmentId: assignment.id, returnedBy: req.user!.id });

    res.json({ message: 'Onderdeel teruggebracht.' });
  }),
);

// ==================== UNIFORM SETS ====================

/**
 * @swagger
 * /uniforms/sets:
 *   get:
 *     summary: Get all uniform sets
 *     tags: [Uniforms]
 */
router.get(
  '/sets',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sets = db
      .prepare(
        `
        SELECT * FROM uniform_sets
        WHERE association_id = ?
        ORDER BY name
    `,
      )
      .all(req.user!.associationId);

    // Get requirements for all sets in one batch query
    const setIds = sets.map((s: any) => s.id);
    const requirementsBySet = new Map<string, any[]>();

    if (setIds.length > 0) {
      const placeholders = setIds.map(() => '?').join(',');
      const allRequirements = db
        .prepare(
          `
            SELECT * FROM uniform_set_requirements WHERE set_id IN (${placeholders})
        `,
        )
        .all(...setIds) as any[];

      for (const row of allRequirements) {
        const list = requirementsBySet.get(row.set_id) || [];
        list.push(row);
        requirementsBySet.set(row.set_id, list);
      }
    }

    const result = sets.map((set: any) => {
      const requirements = requirementsBySet.get(set.id) || [];

      return {
        id: set.id,
        name: set.name,
        description: set.description,
        requirements: requirements.map((r: any) => ({
          id: r.id,
          itemType: r.item_type,
          quantity: r.quantity,
        })),
        createdAt: set.created_at,
      };
    });

    res.json(result);
  }),
);

/**
 * @swagger
 * /uniforms/sets/{id}:
 *   get:
 *     summary: Get single uniform set
 *     tags: [Uniforms]
 */
router.get(
  '/sets/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const set = db
      .prepare(
        `
        SELECT * FROM uniform_sets WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, req.user!.associationId) as any;

    if (!set) {
      throw new ApiError(404, 'Uniform set niet gevonden.');
    }

    const requirements = db
      .prepare(
        `
        SELECT * FROM uniform_set_requirements WHERE set_id = ?
    `,
      )
      .all(set.id);

    res.json({
      id: set.id,
      name: set.name,
      description: set.description,
      requirements: requirements.map((r: any) => ({
        id: r.id,
        itemType: r.item_type,
        quantity: r.quantity,
      })),
      createdAt: set.created_at,
    });
  }),
);

/**
 * @swagger
 * /uniforms/sets:
 *   post:
 *     summary: Create new uniform set
 *     tags: [Uniforms]
 */
router.post(
  '/sets',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createUniformSetSchema.parse(req.body);

    const id = uuidv4();

    withTransaction(() => {
      db.prepare(
        `
            INSERT INTO uniform_sets (id, association_id, name, description)
            VALUES (?, ?, ?, ?)
        `,
      ).run(id, req.user!.associationId, data.name, data.description || null);

      if (data.requirements && data.requirements.length > 0) {
        const stmt = db.prepare(`
                INSERT INTO uniform_set_requirements (id, set_id, item_type, quantity)
                VALUES (?, ?, ?, ?)
            `);
        for (const req of data.requirements) {
          stmt.run(uuidv4(), id, req.itemType, req.quantity);
        }
      }
    });

    logger.info(`Uniform set created: ${data.name}`, { id, createdBy: req.user!.id });

    res.status(201).json({
      id,
      message: 'Uniform set succesvol aangemaakt.',
    });
  }),
);

/**
 * @swagger
 * /uniforms/sets/{id}:
 *   put:
 *     summary: Update uniform set
 *     tags: [Uniforms]
 */
router.put(
  '/sets/:id',
  authenticateToken,
  requireRole('admin', 'uniforms_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = updateUniformSetSchema.parse(req.body);

    const existing = db
      .prepare('SELECT * FROM uniform_sets WHERE id = ? AND association_id = ?')
      .get(req.params.id, req.user!.associationId);

    if (!existing) {
      throw new ApiError(404, 'Uniform set niet gevonden.');
    }

    withTransaction(() => {
      db.prepare(
        `
            UPDATE uniform_sets SET
                name = COALESCE(?, name),
                description = COALESCE(?, description)
            WHERE id = ?
        `,
      ).run(data.name, data.description, req.params.id);

      if (data.requirements !== undefined) {
        db.prepare('DELETE FROM uniform_set_requirements WHERE set_id = ?').run(req.params.id);

        if (data.requirements.length > 0) {
          const setId = req.params.id;
          const stmt = db.prepare(`
                    INSERT INTO uniform_set_requirements (id, set_id, item_type, quantity)
                    VALUES (?, ?, ?, ?)
                `);
          for (const requirement of data.requirements) {
            stmt.run(uuidv4(), setId, requirement.itemType, requirement.quantity);
          }
        }
      }
    });

    logger.info(`Uniform set updated: ${req.params.id}`, { updatedBy: req.user!.id });

    res.json({ message: 'Uniform set succesvol bijgewerkt.' });
  }),
);

/**
 * @swagger
 * /uniforms/sets/{id}:
 *   delete:
 *     summary: Delete uniform set
 *     tags: [Uniforms]
 */
router.delete(
  '/sets/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = db
      .prepare('DELETE FROM uniform_sets WHERE id = ? AND association_id = ?')
      .run(req.params.id, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Uniform set niet gevonden.');
    }

    logger.info(`Uniform set deleted: ${req.params.id}`, { deletedBy: req.user!.id });

    res.json({ message: 'Uniform set succesvol verwijderd.' });
  }),
);

/**
 * @swagger
 * /uniforms/user/{userId}:
 *   get:
 *     summary: Get all uniforms assigned to a user
 *     tags: [Uniforms]
 */
router.get(
  '/user/:userId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const items = db
      .prepare(
        `
        SELECT ui.*
        FROM uniform_items ui
        WHERE ui.current_user_id = ? AND ui.association_id = ?
        ORDER BY ui.item_type
    `,
      )
      .all(req.params.userId, req.user!.associationId);

    res.json(
      items.map((item: any) => ({
        id: item.id,
        itemType: item.item_type,
        sizeStandard: item.size_standard,
        sizeLength: item.size_length,
        sizeWidth: item.size_width,
        color: item.color,
        condition: item.condition,
        notes: item.notes,
      })),
    );
  }),
);

export default router;
