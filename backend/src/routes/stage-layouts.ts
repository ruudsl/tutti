import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// Position types allowed in layouts
const POSITION_TYPES = ['chair', 'stand', 'conductor', 'piano', 'percussion', 'other'] as const;
const SHAPE_TYPES = ['rect', 'circle', 'line', 'text'] as const;

// Validation schemas
const positionSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  type: z.enum(POSITION_TYPES),
  rotation: z.number().optional().default(0),
  label: z.string().optional(),
  section: z.string().optional(),
  instrumentId: z.string().optional(),
});

const shapeSchema = z.object({
  id: z.string(),
  type: z.enum(SHAPE_TYPES),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  radius: z.number().optional(),
  label: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  fontSize: z.number().optional(),
});

const sectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  instrumentId: z.string().optional(),
});

const layoutDataSchema = z.object({
  positions: z.array(positionSchema).default([]),
  shapes: z.array(shapeSchema).default([]),
  sections: z.array(sectionSchema).default([]),
});

const createLayoutSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  venueName: z.string().optional(),
  stageWidth: z.number().int().min(100).max(5000).optional().default(1000),
  stageDepth: z.number().int().min(100).max(5000).optional().default(600),
  isTemplate: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
  layoutData: layoutDataSchema.optional().default({ positions: [], shapes: [], sections: [] }),
  thumbnailUrl: z.string().optional(),
});

const updateLayoutSchema = createLayoutSchema.partial();

const assignmentSchema = z.record(z.string(), z.object({
  userId: z.string().optional(),
  instrumentId: z.string().optional(),
  name: z.string().optional(),
}));

const saveConcertStageSchema = z.object({
  layoutId: z.string().uuid(),
  assignments: assignmentSchema,
});

// ==================== STAGE LAYOUTS ====================

/**
 * @swagger
 * /stage-layouts:
 *   get:
 *     summary: Get all stage layouts for this association
 *     tags: [Stage Layouts]
 */
router.get('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const includeTemplates = req.query.includeTemplates === 'true';

  let whereClause = 'WHERE sl.association_id = ?';
  const params: any[] = [req.user!.associationId];

  if (!includeTemplates) {
    whereClause += ' AND sl.is_template = 0';
  }

  const layouts = db.prepare(`
    SELECT sl.*,
           u.first_name as created_by_first_name,
           u.last_name as created_by_last_name,
           (SELECT COUNT(*) FROM concert_stage_assignments WHERE layout_id = sl.id) as usage_count
    FROM stage_layouts sl
    LEFT JOIN users u ON sl.created_by = u.id
    ${whereClause}
    ORDER BY sl.is_default DESC, sl.name ASC
  `).all(...params);

  res.json(layouts.map((layout: any) => ({
    id: layout.id,
    name: layout.name,
    description: layout.description,
    venueName: layout.venue_name,
    stageWidth: layout.stage_width,
    stageDepth: layout.stage_depth,
    isTemplate: layout.is_template === 1,
    isDefault: layout.is_default === 1,
    thumbnailUrl: layout.thumbnail_url,
    usageCount: layout.usage_count,
    createdBy: layout.created_by ? {
      id: layout.created_by,
      firstName: layout.created_by_first_name,
      lastName: layout.created_by_last_name,
    } : null,
    createdAt: layout.created_at,
    updatedAt: layout.updated_at,
  })));
}));

/**
 * @swagger
 * /stage-layouts/{id}:
 *   get:
 *     summary: Get single stage layout with full data
 *     tags: [Stage Layouts]
 */
router.get('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const layout = db.prepare(`
    SELECT sl.*, u.first_name as created_by_first_name, u.last_name as created_by_last_name
    FROM stage_layouts sl
    LEFT JOIN users u ON sl.created_by = u.id
    WHERE sl.id = ? AND sl.association_id = ?
  `).get(req.params.id, req.user!.associationId) as any;

  if (!layout) {
    throw new ApiError(404, 'Podiumindeling niet gevonden.');
  }

  let layoutData;
  try {
    layoutData = JSON.parse(layout.layout_data || '{}');
  } catch {
    layoutData = { positions: [], shapes: [], sections: [] };
  }

  res.json({
    id: layout.id,
    name: layout.name,
    description: layout.description,
    venueName: layout.venue_name,
    stageWidth: layout.stage_width,
    stageDepth: layout.stage_depth,
    isTemplate: layout.is_template === 1,
    isDefault: layout.is_default === 1,
    layoutData,
    thumbnailUrl: layout.thumbnail_url,
    createdBy: layout.created_by ? {
      id: layout.created_by,
      firstName: layout.created_by_first_name,
      lastName: layout.created_by_last_name,
    } : null,
    createdAt: layout.created_at,
    updatedAt: layout.updated_at,
  });
}));

/**
 * @swagger
 * /stage-layouts:
 *   post:
 *     summary: Create new stage layout
 *     tags: [Stage Layouts]
 */
router.post('/', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createLayoutSchema.parse(req.body);

  const id = uuidv4();

  // If this is set as default, unset other defaults
  if (data.isDefault) {
    db.prepare(`
      UPDATE stage_layouts SET is_default = 0 WHERE association_id = ?
    `).run(req.user!.associationId);
  }

  db.prepare(`
    INSERT INTO stage_layouts (
      id, association_id, name, description, venue_name,
      stage_width, stage_depth, is_template, is_default,
      layout_data, thumbnail_url, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.user!.associationId,
    data.name,
    data.description || null,
    data.venueName || null,
    data.stageWidth,
    data.stageDepth,
    data.isTemplate ? 1 : 0,
    data.isDefault ? 1 : 0,
    JSON.stringify(data.layoutData),
    data.thumbnailUrl || null,
    req.user!.id
  );

  logger.info(`Stage layout created: ${data.name}`, { id, createdBy: req.user!.id });

  res.status(201).json({
    id,
    message: 'Podiumindeling aangemaakt.',
  });
}));

/**
 * @swagger
 * /stage-layouts/{id}:
 *   put:
 *     summary: Update stage layout
 *     tags: [Stage Layouts]
 */
router.put('/:id', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = updateLayoutSchema.parse(req.body);

  const existing = db.prepare('SELECT * FROM stage_layouts WHERE id = ? AND association_id = ?')
    .get(req.params.id, req.user!.associationId);

  if (!existing) {
    throw new ApiError(404, 'Podiumindeling niet gevonden.');
  }

  // If this is set as default, unset other defaults
  if (data.isDefault) {
    db.prepare(`
      UPDATE stage_layouts SET is_default = 0 WHERE association_id = ? AND id != ?
    `).run(req.user!.associationId, req.params.id);
  }

  const layoutDataJson = data.layoutData ? JSON.stringify(data.layoutData) : null;

  db.prepare(`
    UPDATE stage_layouts SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      venue_name = COALESCE(?, venue_name),
      stage_width = COALESCE(?, stage_width),
      stage_depth = COALESCE(?, stage_depth),
      is_template = COALESCE(?, is_template),
      is_default = COALESCE(?, is_default),
      layout_data = COALESCE(?, layout_data),
      thumbnail_url = COALESCE(?, thumbnail_url),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.name ?? null,
    data.description ?? null,
    data.venueName ?? null,
    data.stageWidth ?? null,
    data.stageDepth ?? null,
    data.isTemplate !== undefined ? (data.isTemplate ? 1 : 0) : null,
    data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : null,
    layoutDataJson,
    data.thumbnailUrl ?? null,
    req.params.id
  );

  const safeLayoutIdForLog = String(req.params.id).replace(/[\r\n]/g, '');
  logger.info(`Stage layout updated: ${safeLayoutIdForLog}`, { updatedBy: req.user!.id });

  res.json({ message: 'Podiumindeling bijgewerkt.' });
}));

/**
 * @swagger
 * /stage-layouts/{id}:
 *   delete:
 *     summary: Delete stage layout
 *     tags: [Stage Layouts]
 */
router.delete('/:id', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
  // Check if layout is in use
  const usageCount = db.prepare(`
    SELECT COUNT(*) as count FROM concert_stage_assignments WHERE layout_id = ?
  `).get(req.params.id) as { count: number };

  if (usageCount.count > 0) {
    throw new ApiError(400, `Deze podiumindeling wordt gebruikt door ${usageCount.count} concert(en). Verwijder eerst de toewijzingen.`);
  }

  const result = db.prepare('DELETE FROM stage_layouts WHERE id = ? AND association_id = ?')
    .run(req.params.id, req.user!.associationId);

  if (result.changes === 0) {
    throw new ApiError(404, 'Podiumindeling niet gevonden.');
  }

  logger.info(`Stage layout deleted: ${req.params.id}`, { deletedBy: req.user!.id });

  res.json({ message: 'Podiumindeling verwijderd.' });
}));

/**
 * @swagger
 * /stage-layouts/{id}/duplicate:
 *   post:
 *     summary: Duplicate a stage layout
 *     tags: [Stage Layouts]
 */
router.post('/:id/duplicate', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const original = db.prepare('SELECT * FROM stage_layouts WHERE id = ? AND association_id = ?')
    .get(req.params.id, req.user!.associationId) as any;

  if (!original) {
    throw new ApiError(404, 'Podiumindeling niet gevonden.');
  }

  const newName = req.body.name || `${original.name} (kopie)`;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO stage_layouts (
      id, association_id, name, description, venue_name,
      stage_width, stage_depth, is_template, is_default,
      layout_data, thumbnail_url, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    req.user!.associationId,
    newName,
    original.description,
    original.venue_name,
    original.stage_width,
    original.stage_depth,
    original.is_template,
    original.layout_data,
    original.thumbnail_url,
    req.user!.id
  );

  logger.info(`Stage layout duplicated: ${original.name} -> ${newName}`, { originalId: req.params.id, newId: id });

  res.status(201).json({
    id,
    message: 'Podiumindeling gedupliceerd.',
  });
}));

// ==================== CONCERT STAGE ASSIGNMENTS ====================

/**
 * @swagger
 * /concerts/{id}/stage:
 *   get:
 *     summary: Get stage assignment for a concert
 *     tags: [Stage Layouts]
 */
router.get('/concerts/:id/stage', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  // Verify concert belongs to association
  const concert = db.prepare(`
    SELECT id, name, date FROM concerts WHERE id = ? AND association_id = ?
  `).get(req.params.id, req.user!.associationId) as any;

  if (!concert) {
    throw new ApiError(404, 'Concert niet gevonden.');
  }

  const assignment = db.prepare(`
    SELECT csa.*, sl.name as layout_name, sl.layout_data, sl.stage_width, sl.stage_depth
    FROM concert_stage_assignments csa
    JOIN stage_layouts sl ON csa.layout_id = sl.id
    WHERE csa.concert_id = ?
  `).get(req.params.id) as any;

  if (!assignment) {
    res.json({
      concert: {
        id: concert.id,
        name: concert.name,
        date: concert.date,
      },
      assignment: null,
    });
    return;
  }

  let layoutData;
  let assignments;
  try {
    layoutData = JSON.parse(assignment.layout_data || '{}');
    assignments = JSON.parse(assignment.assignments || '{}');
  } catch {
    layoutData = { positions: [], shapes: [], sections: [] };
    assignments = {};
  }

  res.json({
    concert: {
      id: concert.id,
      name: concert.name,
      date: concert.date,
    },
    assignment: {
      id: assignment.id,
      layoutId: assignment.layout_id,
      layoutName: assignment.layout_name,
      stageWidth: assignment.stage_width,
      stageDepth: assignment.stage_depth,
      layoutData,
      assignments,
      createdAt: assignment.created_at,
      updatedAt: assignment.updated_at,
    },
  });
}));

/**
 * @swagger
 * /concerts/{id}/stage:
 *   put:
 *     summary: Save stage assignment for a concert
 *     tags: [Stage Layouts]
 */
router.put('/concerts/:id/stage', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = saveConcertStageSchema.parse(req.body);

  // Verify concert belongs to association
  const concert = db.prepare(`
    SELECT id FROM concerts WHERE id = ? AND association_id = ?
  `).get(req.params.id, req.user!.associationId);

  if (!concert) {
    throw new ApiError(404, 'Concert niet gevonden.');
  }

  // Verify layout exists and belongs to association
  const layout = db.prepare(`
    SELECT id FROM stage_layouts WHERE id = ? AND association_id = ?
  `).get(data.layoutId, req.user!.associationId);

  if (!layout) {
    throw new ApiError(404, 'Podiumindeling niet gevonden.');
  }

  // Check for existing assignment
  const existing = db.prepare(`
    SELECT id FROM concert_stage_assignments WHERE concert_id = ?
  `).get(req.params.id) as any;

  const assignmentsJson = JSON.stringify(data.assignments);

  if (existing) {
    db.prepare(`
      UPDATE concert_stage_assignments SET
        layout_id = ?,
        assignments = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.layoutId, assignmentsJson, existing.id);

    logger.info(`Concert stage assignment updated: concert ${req.params.id}`, { updatedBy: req.user!.id });
  } else {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO concert_stage_assignments (id, concert_id, layout_id, assignments)
      VALUES (?, ?, ?, ?)
    `).run(id, req.params.id, data.layoutId, assignmentsJson);

    logger.info(`Concert stage assignment created: concert ${req.params.id}`, { id, createdBy: req.user!.id });
  }

  res.json({ message: 'Podiumindeling voor concert opgeslagen.' });
}));

/**
 * @swagger
 * /concerts/{id}/stage:
 *   delete:
 *     summary: Remove stage assignment from a concert
 *     tags: [Stage Layouts]
 */
router.delete('/concerts/:id/stage', authenticateToken, requireRole('admin', 'music_committee', 'conductor'), asyncHandler(async (req: AuthRequest, res: Response) => {
  // Verify concert belongs to association
  const concert = db.prepare(`
    SELECT id FROM concerts WHERE id = ? AND association_id = ?
  `).get(req.params.id, req.user!.associationId);

  if (!concert) {
    throw new ApiError(404, 'Concert niet gevonden.');
  }

  const result = db.prepare(`
    DELETE FROM concert_stage_assignments WHERE concert_id = ?
  `).run(req.params.id);

  if (result.changes === 0) {
    throw new ApiError(404, 'Geen podiumindeling gevonden voor dit concert.');
  }

  logger.info(`Concert stage assignment deleted: concert ${req.params.id}`, { deletedBy: req.user!.id });

  res.json({ message: 'Podiumindeling van concert verwijderd.' });
}));

/**
 * @swagger
 * /concerts/{id}/stage/print:
 *   get:
 *     summary: Get printable seat cards data for a concert
 *     tags: [Stage Layouts]
 */
router.get('/concerts/:id/stage/print', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  // Verify concert belongs to association
  const concert = db.prepare(`
    SELECT id, name, date, location FROM concerts WHERE id = ? AND association_id = ?
  `).get(req.params.id, req.user!.associationId) as any;

  if (!concert) {
    throw new ApiError(404, 'Concert niet gevonden.');
  }

  const assignment = db.prepare(`
    SELECT csa.*, sl.name as layout_name, sl.layout_data
    FROM concert_stage_assignments csa
    JOIN stage_layouts sl ON csa.layout_id = sl.id
    WHERE csa.concert_id = ?
  `).get(req.params.id) as any;

  if (!assignment) {
    throw new ApiError(404, 'Geen podiumindeling gevonden voor dit concert.');
  }

  let layoutData;
  let assignments;
  try {
    layoutData = JSON.parse(assignment.layout_data || '{}');
    assignments = JSON.parse(assignment.assignments || '{}');
  } catch {
    layoutData = { positions: [], shapes: [], sections: [] };
    assignments = {};
  }

  // Build seat cards from positions and assignments
  const seatCards: {
    positionId: string;
    label: string;
    section: string;
    sectionColor: string;
    musicianName: string;
    instrument: string;
    standNumber: number;
  }[] = [];

  const positions = layoutData.positions || [];
  const sections = layoutData.sections || [];

  // Get section colors map
  const sectionColors: Record<string, string> = {};
  for (const section of sections) {
    sectionColors[section.id] = section.color;
  }

  // Get instruments for lookup
  const instrumentRows = db.prepare(`
    SELECT id, name FROM instruments WHERE association_id = ?
  `).all(req.user!.associationId) as { id: string; name: string }[];

  const instrumentMap: Record<string, string> = {};
  for (const inst of instrumentRows) {
    instrumentMap[inst.id] = inst.name;
  }

  // Get users for lookup
  const userRows = db.prepare(`
    SELECT id, first_name, last_name FROM users WHERE association_id = ?
  `).all(req.user!.associationId) as { id: string; first_name: string; last_name: string }[];

  const userMap: Record<string, string> = {};
  for (const user of userRows) {
    userMap[user.id] = `${user.first_name} ${user.last_name}`;
  }

  // Counter for stand numbers per section
  const standCounters: Record<string, number> = {};

  for (const pos of positions) {
    if (pos.type !== 'chair' && pos.type !== 'stand') continue;

    const section = pos.section || 'unknown';
    if (!standCounters[section]) standCounters[section] = 0;
    standCounters[section]++;

    const assignment = assignments[pos.id];
    const musicianName = assignment?.userId
      ? userMap[assignment.userId] || assignment.name || ''
      : assignment?.name || '';

    const instrument = assignment?.instrumentId
      ? instrumentMap[assignment.instrumentId] || ''
      : pos.instrumentId
        ? instrumentMap[pos.instrumentId] || ''
        : '';

    const sectionData = sections.find((s: any) => s.id === section);

    seatCards.push({
      positionId: pos.id,
      label: pos.label || `${section}-${standCounters[section]}`,
      section: sectionData?.name || section,
      sectionColor: sectionColors[section] || '#cccccc',
      musicianName,
      instrument,
      standNumber: standCounters[section],
    });
  }

  res.json({
    concert: {
      id: concert.id,
      name: concert.name,
      date: concert.date,
      location: concert.location,
    },
    layoutName: assignment.layout_name,
    seatCards,
  });
}));

export default router;
