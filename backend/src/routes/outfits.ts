import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError, isUniekheidsfout } from '../middleware/errorHandler';

const router = Router();

router.use(authenticateToken);

// Validation schemas
const createOutfitSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  colorCode: z.string().max(20).optional(),
  items: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

const updateOutfitSchema = createOutfitSchema.partial();

// GET /api/outfits - List all outfits
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const outfits = db
      .prepare(
        `
    SELECT
      o.*,
      (SELECT COUNT(*) FROM concert_outfits co WHERE co.outfit_id = o.id) as usage_count
    FROM outfits o
    WHERE o.association_id = ? AND o.deleted_at IS NULL
    ORDER BY o.is_default DESC, o.sort_order, o.name
  `,
      )
      .all(associationId);

    res.json(
      outfits.map((o: any) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        colorCode: o.color_code,
        imagePath: o.image_path,
        items: o.items ? JSON.parse(o.items) : [],
        isDefault: !!o.is_default,
        sortOrder: o.sort_order,
        usageCount: o.usage_count,
        createdAt: o.created_at,
      })),
    );
  }),
);

// GET /api/outfits/:id - Get single outfit
router.get(
  '/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const outfit = db
      .prepare(
        `
    SELECT o.*, u.first_name || ' ' || u.last_name as created_by_name
    FROM outfits o
    LEFT JOIN users u ON o.created_by = u.id
    WHERE o.id = ? AND o.association_id = ? AND o.deleted_at IS NULL
  `,
      )
      .get(req.params.id, associationId) as any;

    if (!outfit) {
      throw new ApiError(404, 'Outfit not found');
    }

    // Get concerts using this outfit.
    // Een zacht verwijderd concert telt in de rest van de applicatie niet
    // meer mee, dus hoort het hier ook niet in de lijst. De vereniging staat
    // er nog een keer bij: concert_outfits kent zelf geen association_id, dus
    // een koppeling die ooit over de grens heen is gelegd mag hier geen namen
    // van concerten van een andere vereniging prijsgeven.
    const concerts = db
      .prepare(
        `
    SELECT c.id, c.name, c.date
    FROM concerts c
    JOIN concert_outfits co ON co.concert_id = c.id
    WHERE co.outfit_id = ? AND c.association_id = ? AND c.deleted_at IS NULL
    ORDER BY c.date DESC
    LIMIT 10
  `,
      )
      .all(req.params.id, associationId);

    res.json({
      id: outfit.id,
      name: outfit.name,
      description: outfit.description,
      colorCode: outfit.color_code,
      imagePath: outfit.image_path,
      items: outfit.items ? JSON.parse(outfit.items) : [],
      isDefault: !!outfit.is_default,
      sortOrder: outfit.sort_order,
      createdByName: outfit.created_by_name,
      createdAt: outfit.created_at,
      updatedAt: outfit.updated_at,
      recentConcerts: concerts,
    });
  }),
);

// POST /api/outfits - Create outfit
router.post(
  '/',
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = createOutfitSchema.parse(req.body);

    const id = uuidv4();
    const now = new Date().toISOString();

    db.transaction(() => {
      // If this is default, unset other defaults
      if (data.isDefault) {
        db.prepare(`UPDATE outfits SET is_default = 0 WHERE association_id = ?`).run(associationId);
      }

      db.prepare(
        `
      INSERT INTO outfits (id, association_id, name, description, color_code, items, is_default, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        id,
        associationId,
        data.name,
        data.description || null,
        data.colorCode || null,
        data.items ? JSON.stringify(data.items) : null,
        data.isDefault ? 1 : 0,
        req.user!.id,
        now,
        now,
      );
    })();

    res.status(201).json({ id, message: 'Outfit created' });
  }),
);

// PATCH /api/outfits/:id - Update outfit
router.patch(
  '/:id',
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = updateOutfitSchema.parse(req.body);

    const outfit = db
      .prepare(
        `
    SELECT id FROM outfits WHERE id = ? AND association_id = ? AND deleted_at IS NULL
  `,
      )
      .get(req.params.id, associationId);

    if (!outfit) {
      throw new ApiError(404, 'Outfit not found');
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.colorCode !== undefined) {
      updates.push('color_code = ?');
      values.push(data.colorCode);
    }
    if (data.items !== undefined) {
      updates.push('items = ?');
      values.push(JSON.stringify(data.items));
    }
    if (data.isDefault !== undefined) {
      updates.push('is_default = ?');
      values.push(data.isDefault ? 1 : 0);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(req.params.id);

    db.transaction(() => {
      // If setting as default, unset other defaults
      if (data.isDefault) {
        db.prepare(`UPDATE outfits SET is_default = 0 WHERE association_id = ?`).run(associationId);
      }

      db.prepare(`UPDATE outfits SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    })();

    res.json({ message: 'Outfit updated' });
  }),
);

// DELETE /api/outfits/:id - Soft delete outfit
router.delete(
  '/:id',
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const result = db
      .prepare(
        `
    UPDATE outfits SET deleted_at = ? WHERE id = ? AND association_id = ? AND deleted_at IS NULL
  `,
      )
      .run(new Date().toISOString(), req.params.id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Outfit not found');
    }

    res.json({ message: 'Outfit deleted' });
  }),
);

// POST /api/outfits/:id/concerts/:concertId - Link outfit to concert
router.post(
  '/:id/concerts/:concertId',
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    // Verify outfit and concert belong to association
    const outfit = db
      .prepare(`SELECT id FROM outfits WHERE id = ? AND association_id = ? AND deleted_at IS NULL`)
      .get(req.params.id, associationId);
    // Ook hier deleted_at meenemen: een zacht verwijderd concert bestaat voor
    // de rest van de applicatie niet meer, dus er hoort geen nieuwe kleding
    // meer aan gekoppeld te kunnen worden.
    const concert = db
      .prepare(`SELECT id FROM concerts WHERE id = ? AND association_id = ? AND deleted_at IS NULL`)
      .get(req.params.concertId, associationId);

    if (!outfit) throw new ApiError(404, 'Outfit not found');
    if (!concert) throw new ApiError(404, 'Concert not found');

    const id = uuidv4();

    try {
      db.prepare(`INSERT INTO concert_outfits (id, concert_id, outfit_id) VALUES (?, ?, ?)`).run(
        id,
        req.params.concertId,
        req.params.id,
      );
      res.status(201).json({ message: 'Outfit linked to concert' });
    } catch (err: any) {
      if (isUniekheidsfout(err)) {
        throw new ApiError(409, 'Outfit already linked to this concert');
      }
      throw err;
    }
  }),
);

// DELETE /api/outfits/:id/concerts/:concertId - Unlink outfit from concert
router.delete(
  '/:id/concerts/:concertId',
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // concert_outfits heeft zelf geen association_id; de grens loopt via de
    // outfit en het concert. De route die de koppeling aanmaakt controleert
    // die twee wel, deze deed dat niet - dus kon een koppeling van een andere
    // vereniging worden weggehaald.
    const result = db
      .prepare(
        `DELETE FROM concert_outfits
         WHERE outfit_id = ? AND concert_id = ?
           AND outfit_id IN (SELECT id FROM outfits WHERE association_id = ?)
           AND concert_id IN (SELECT id FROM concerts WHERE association_id = ?)`,
      )
      .run(req.params.id, req.params.concertId, req.user!.associationId, req.user!.associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Link not found');
    }

    res.json({ message: 'Outfit unlinked from concert' });
  }),
);

// PUT /api/outfits/reorder - Reorder outfits
const reorderOutfitsSchema = z.object({
  outfitIds: z.array(z.string().uuid()),
});

router.put(
  '/reorder',
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const data = reorderOutfitsSchema.parse(req.body);

    // Verify all outfits belong to this association
    const placeholders = data.outfitIds.map(() => '?').join(',');
    const existingOutfits = db
      .prepare(
        `
    SELECT id FROM outfits
    WHERE id IN (${placeholders}) AND association_id = ? AND deleted_at IS NULL
  `,
      )
      .all(...data.outfitIds, associationId) as { id: string }[];

    if (existingOutfits.length !== data.outfitIds.length) {
      throw new ApiError(400, 'Some outfits not found or do not belong to this association');
    }

    // Update sort_order for each outfit
    const updateStmt = db.prepare(`UPDATE outfits SET sort_order = ?, updated_at = ? WHERE id = ?`);
    const now = new Date().toISOString();

    db.transaction(() => {
      data.outfitIds.forEach((outfitId, index) => {
        updateStmt.run(index, now, outfitId);
      });
    })();

    res.json({ message: 'Outfits reordered successfully' });
  }),
);

export default router;
