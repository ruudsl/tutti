import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError, isUniekheidsfout } from '../middleware/errorHandler';
import { z } from 'zod';
import { wijzigingsschema } from '../utils/schema';

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  projectType: z.enum(['concert', 'competition', 'festival', 'tour', 'recording', 'other']).default('concert'),
  orchestraId: z.string().uuid().optional(),
  budget: z.number().optional(),
  notes: z.string().optional(),
});

const updateProjectSchema = wijzigingsschema(createProjectSchema);

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['participant', 'leader', 'coordinator', 'soloist', 'substitute']).default('participant'),
  notes: z.string().optional(),
});

const setlistItemSchema = z.object({
  musicTitleId: z.string().uuid().optional(),
  customTitle: z.string().optional(),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
});

// GET /projects - List all projects
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { status, type, orchestraId } = req.query;

    let query = `
      SELECT p.*, o.name as orchestra_name,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM project_concerts WHERE project_id = p.id) as concert_count,
        (SELECT COUNT(*) FROM project_rehearsals WHERE project_id = p.id) as rehearsal_count
      FROM projects p
      LEFT JOIN orchestras o ON p.orchestra_id = o.id
      WHERE p.association_id = ? AND p.deleted_at IS NULL
    `;
    const params: any[] = [associationId];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    if (type) {
      query += ' AND p.project_type = ?';
      params.push(type);
    }
    if (orchestraId) {
      query += ' AND p.orchestra_id = ?';
      params.push(orchestraId);
    }

    query += ' ORDER BY p.start_date DESC, p.created_at DESC';

    const projects = db.prepare(query).all(...params);

    res.json(
      projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        startDate: p.start_date,
        endDate: p.end_date,
        status: p.status,
        projectType: p.project_type,
        orchestraId: p.orchestra_id,
        orchestraName: p.orchestra_name,
        budget: p.budget,
        notes: p.notes,
        memberCount: p.member_count,
        concertCount: p.concert_count,
        rehearsalCount: p.rehearsal_count,
        createdAt: p.created_at,
      })),
    );
  }),
);

// GET /projects/:id - Get project details
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const associationId = req.user!.associationId;

    const project = db
      .prepare(
        `
      SELECT p.*, o.name as orchestra_name, u.first_name || ' ' || u.last_name as created_by_name
      FROM projects p
      LEFT JOIN orchestras o ON p.orchestra_id = o.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ? AND p.association_id = ? AND p.deleted_at IS NULL
    `,
      )
      .get(id, associationId) as any;

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    const members = db
      .prepare(
        `
      SELECT pm.*, u.first_name, u.last_name, u.email
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
      ORDER BY pm.role, u.last_name
    `,
      )
      .all(id);

    const concerts = db
      .prepare(
        `
      SELECT c.*, pc.sort_order
      FROM project_concerts pc
      JOIN concerts c ON pc.concert_id = c.id
      WHERE pc.project_id = ?
      ORDER BY pc.sort_order, c.date
    `,
      )
      .all(id);

    const rehearsals = db
      .prepare(
        `
      SELECT ri.*, pr.sort_order
      FROM project_rehearsals pr
      JOIN rehearsal_instances ri ON pr.rehearsal_instance_id = ri.id
      WHERE pr.project_id = ?
      ORDER BY pr.sort_order, ri.date
    `,
      )
      .all(id);

    const setlist = db
      .prepare(
        `
      SELECT ps.*, mt.title as music_title_name
      FROM project_setlist ps
      LEFT JOIN music_titles mt ON ps.music_title_id = mt.id
      WHERE ps.project_id = ?
      ORDER BY ps.sort_order
    `,
      )
      .all(id);

    res.json({
      id: project.id,
      name: project.name,
      description: project.description,
      startDate: project.start_date,
      endDate: project.end_date,
      status: project.status,
      projectType: project.project_type,
      orchestraId: project.orchestra_id,
      orchestraName: project.orchestra_name,
      budget: project.budget,
      notes: project.notes,
      coverImagePath: project.cover_image_path,
      createdBy: project.created_by,
      createdByName: project.created_by_name,
      createdAt: project.created_at,
      members: members.map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        firstName: m.first_name,
        lastName: m.last_name,
        email: m.email,
        role: m.role,
        status: m.status,
        notes: m.notes,
      })),
      concerts: concerts.map((c: any) => ({
        id: c.id,
        name: c.name,
        date: c.date,
        venue: c.venue,
        sortOrder: c.sort_order,
      })),
      rehearsals: rehearsals.map((r: any) => ({
        id: r.id,
        date: r.date,
        startTime: r.start_time,
        endTime: r.end_time,
        location: r.location,
        sortOrder: r.sort_order,
      })),
      setlist: setlist.map((s: any) => ({
        id: s.id,
        musicTitleId: s.music_title_id,
        musicTitleName: s.music_title_name,
        customTitle: s.custom_title,
        sortOrder: s.sort_order,
        durationMinutes: s.duration_minutes,
        notes: s.notes,
      })),
    });
  }),
);

// POST /projects - Create project
router.post(
  '/',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = createProjectSchema.parse(req.body);
    const associationId = req.user!.associationId;
    const userId = req.user!.id;
    const id = uuidv4();

    db.prepare(
      `
      INSERT INTO projects (id, association_id, name, description, start_date, end_date,
        project_type, orchestra_id, budget, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.name,
      data.description || null,
      data.startDate || null,
      data.endDate || null,
      data.projectType,
      data.orchestraId || null,
      data.budget || null,
      data.notes || null,
      userId,
    );

    res.status(201).json({ id, message: 'Project aangemaakt' });
  }),
);

// PATCH /projects/:id - Update project
router.patch(
  '/:id',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = updateProjectSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
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
    if (data.startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      updates.push('end_date = ?');
      params.push(data.endDate);
    }
    if (data.projectType !== undefined) {
      updates.push('project_type = ?');
      params.push(data.projectType);
    }
    if (data.orchestraId !== undefined) {
      updates.push('orchestra_id = ?');
      params.push(data.orchestraId);
    }
    if (data.budget !== undefined) {
      updates.push('budget = ?');
      params.push(data.budget);
    }
    if (data.notes !== undefined) {
      updates.push('notes = ?');
      params.push(data.notes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    }

    res.json({ message: 'Project bijgewerkt' });
  }),
);

// PATCH /projects/:id/status - Update project status
router.patch(
  '/:id/status',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;
    const associationId = req.user!.associationId;

    const validStatuses = ['planning', 'active', 'completed', 'cancelled', 'archived'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, 'Ongeldige status');
    }

    const result = db
      .prepare(
        `
      UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .run(status, id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    res.json({ message: 'Status bijgewerkt' });
  }),
);

// DELETE /projects/:id - Soft delete project
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
      UPDATE projects SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND association_id = ? AND deleted_at IS NULL
    `,
      )
      .run(id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    res.json({ message: 'Project verwijderd' });
  }),
);

// POST /projects/:id/members - Add member to project
router.post(
  '/:id/members',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = addMemberSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    // Zonder deze controle kon elk gebruikers-id worden meegegeven, ook dat
    // van een lid van een andere vereniging. Dat lid stond dan met naam en
    // e-mailadres in het projectoverzicht.
    const gebruiker = db
      .prepare('SELECT id FROM users WHERE id = ? AND association_id = ?')
      .get(data.userId, associationId);

    if (!gebruiker) {
      throw new ApiError(404, 'Lid niet gevonden');
    }

    const memberId = uuidv4();
    try {
      db.prepare(
        `
        INSERT INTO project_members (id, project_id, user_id, role, notes)
        VALUES (?, ?, ?, ?, ?)
      `,
      ).run(memberId, id, data.userId, data.role, data.notes || null);
    } catch (err: any) {
      if (isUniekheidsfout(err)) {
        throw new ApiError(409, 'Lid is al toegevoegd aan dit project');
      }
      throw err;
    }

    res.status(201).json({ id: memberId, message: 'Lid toegevoegd' });
  }),
);

// DELETE /projects/:id/members/:memberId - Remove member from project
router.delete(
  '/:id/members/:memberId',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, memberId } = req.params;
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    db.prepare('DELETE FROM project_members WHERE id = ? AND project_id = ?').run(memberId, id);

    res.json({ message: 'Lid verwijderd' });
  }),
);

// POST /projects/:id/concerts - Link concert to project
router.post(
  '/:id/concerts',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { concertId, sortOrder } = req.body;
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    // Idem voor het concert: zonder deze controle kon een concert van een
    // andere vereniging aan het project worden gehangen, en verscheen het met
    // naam en datum in het projectoverzicht.
    const concert = db
      .prepare('SELECT id FROM concerts WHERE id = ? AND association_id = ?')
      .get(concertId, associationId);

    if (!concert) {
      throw new ApiError(404, 'Concert niet gevonden');
    }

    try {
      db.prepare(
        `
        INSERT INTO project_concerts (project_id, concert_id, sort_order)
        VALUES (?, ?, ?)
      `,
      ).run(id, concertId, sortOrder || 0);
    } catch (err: any) {
      if (isUniekheidsfout(err)) {
        throw new ApiError(409, 'Concert is al gekoppeld aan dit project');
      }
      throw err;
    }

    res.status(201).json({ message: 'Concert gekoppeld' });
  }),
);

// DELETE /projects/:id/concerts/:concertId - Unlink concert
router.delete(
  '/:id/concerts/:concertId',
  authenticateToken,
  requireRole('admin', 'music_committee'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, concertId } = req.params;
    const associationId = req.user!.associationId;

    // Deze route keek alleen naar het project-id uit het pad. De routes die
    // koppelen controleren wel van welke vereniging het project is; deze en de
    // setlist-route hieronder bleven achter.
    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    db.prepare('DELETE FROM project_concerts WHERE project_id = ? AND concert_id = ?').run(id, concertId);

    res.json({ message: 'Concert ontkoppeld' });
  }),
);

// POST /projects/:id/setlist - Add setlist item
router.post(
  '/:id/setlist',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = setlistItemSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    const maxOrder = db
      .prepare('SELECT MAX(sort_order) as max FROM project_setlist WHERE project_id = ?')
      .get(id) as any;

    const setlistId = uuidv4();
    db.prepare(
      `
      INSERT INTO project_setlist (id, project_id, music_title_id, custom_title, sort_order, duration_minutes, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      setlistId,
      id,
      data.musicTitleId || null,
      data.customTitle || null,
      (maxOrder?.max || 0) + 1,
      data.durationMinutes || null,
      data.notes || null,
    );

    res.status(201).json({ id: setlistId, message: 'Item toegevoegd aan setlist' });
  }),
);

// DELETE /projects/:id/setlist/:itemId - Remove setlist item
router.delete(
  '/:id/setlist/:itemId',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, itemId } = req.params;
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    const result = db.prepare('DELETE FROM project_setlist WHERE id = ? AND project_id = ?').run(itemId, id);

    if (result.changes === 0) {
      throw new ApiError(404, 'Setlist-item niet gevonden');
    }

    res.json({ message: 'Item verwijderd uit setlist' });
  }),
);

export default router;
