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

/** Het scherm stuurt alleen rehearsalId; sortOrder blijft mogelijk, net als bij concerten. */
const koppelRepetitieSchema = z.object({
  rehearsalId: z.string().uuid(),
  sortOrder: z.number().optional(),
});

/** De volledige nieuwe volgorde van de setlist, van voor naar achter. */
const herordenSetlistSchema = z.object({
  itemIds: z.array(z.string().uuid()),
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

/**
 * Zoekt de repetitie-instantie die aan een project gekoppeld mag worden, en
 * maakt hem aan als hij er nog niet is.
 *
 * project_rehearsals heeft een foreign key naar `rehearsal_instances`, maar de
 * keuzelijst in het scherm komt uit GET /rehearsals, en dat is de tabel
 * `rehearsals`: de geplande repetitie zelf. In rehearsal_instances schrijft
 * alleen routes/polls.ts ooit een rij. Het id dat de gebruiker aanklikt staat
 * daar dus niet, en omdat connection.ts PRAGMA foreign_keys = ON zet loopt een
 * rechtstreekse INSERT stuk op die foreign key - een 500 op elke klik in
 * plaats van een gekoppelde repetitie.
 *
 * Daarom wordt de repetitie hier gespiegeld naar rehearsal_instances, met
 * hetzelfde id. Hetzelfde id is geen toeval: GET /projects/:id geeft de
 * instantie-id's terug en het scherm ontkoppelt daar weer mee, dus een nieuw
 * id zou het ontkoppelen laten mikken op een id dat de gebruiker nooit gezien
 * heeft. rehearsal_id verwijst met ON DELETE CASCADE terug naar de repetitie:
 * verdwijnt die, dan verdwijnen spiegel en koppeling mee.
 *
 * @returns het id waarmee in project_rehearsals geschreven moet worden.
 */
function zorgVoorRepetitieInstantie(rehearsalId: string, associationId: string | null): string {
  // Is deze repetitie eerder al gespiegeld, dan hergebruiken we die spiegel.
  // Dat maakt herhaald koppelen onschadelijk: er komt geen tweede instantie
  // bij, en het id blijft hetzelfde als waar het scherm mee ontkoppelt.
  //
  // Let op wat dit NIET vindt: een instantie die routes/polls.ts heeft
  // aangemaakt. Die krijgt daar een eigen uuid en zet `rehearsal_id` helemaal
  // niet - er staat geen kolom voor in die INSERT - dus er is geen weg terug
  // van zo'n instantie naar een rij in `rehearsals`. Dat is hier geen gemis:
  // de keuzelijst in het scherm komt uit GET /rehearsals, dus een
  // peiling-instantie belandt nooit in deze functie. Zou dat ooit veranderen,
  // dan moet polls.ts eerst `rehearsal_id` gaan vullen.
  //
  // association_id is in deze tabel nullable; een rij zonder vereniging matcht
  // hier niet en valt door naar de controle hieronder - liever onvindbaar dan
  // koppelbaar voor iedereen.
  const bestaandeInstantie = db
    .prepare('SELECT id FROM rehearsal_instances WHERE id = ? AND association_id = ?')
    .get(rehearsalId, associationId) as { id: string } | undefined;

  if (bestaandeInstantie) {
    return bestaandeInstantie.id;
  }

  // Dezelfde grens als bij concerten: zonder deze controle kon een repetitie
  // van een andere vereniging aan het project worden gehangen, en verscheen
  // die met datum, tijd en locatie in het projectoverzicht.
  const repetitie = db
    .prepare('SELECT * FROM rehearsals WHERE id = ? AND association_id = ?')
    .get(rehearsalId, associationId) as any;

  if (!repetitie) {
    throw new ApiError(404, 'Repetitie niet gevonden');
  }

  // `type` in rehearsals en `status` in rehearsal_instances overlappen alleen
  // in 'cancelled'; 'regular' en 'extra' staan allebei gewoon gepland.
  db.prepare(
    `
    INSERT INTO rehearsal_instances (id, rehearsal_id, association_id, orchestra_id, date,
      start_time, end_time, location, status, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    repetitie.id,
    repetitie.id,
    repetitie.association_id,
    repetitie.orchestra_id || null,
    repetitie.date,
    repetitie.start_time,
    repetitie.end_time,
    repetitie.location || null,
    repetitie.type === 'cancelled' ? 'cancelled' : 'scheduled',
    repetitie.notes || null,
    repetitie.created_by || null,
  );

  return repetitie.id;
}

// POST /projects/:id/rehearsals - Link rehearsal to project
//
// Een dirigent mag hier wel bij, anders dan bij de concertroutes hierboven:
// routes/rehearsals.ts laat hem repetities aanmaken, wijzigen en verwijderen,
// dus hem de veel kleinere handeling van het koppelen ontzeggen zou vreemd zijn.
router.post(
  '/:id/rehearsals',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = koppelRepetitieSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    try {
      // Spiegel en koppeling in een transactie: struikelt de koppeling over de
      // primaire sleutel (dezelfde repetitie twee keer), dan hoort de zojuist
      // aangemaakte spiegelrij niet achter te blijven.
      db.transaction(() => {
        const instantieId = zorgVoorRepetitieInstantie(data.rehearsalId, associationId);

        db.prepare(
          `
          INSERT INTO project_rehearsals (project_id, rehearsal_instance_id, sort_order)
          VALUES (?, ?, ?)
        `,
        ).run(id, instantieId, data.sortOrder || 0);
      })();
    } catch (err: any) {
      if (isUniekheidsfout(err)) {
        throw new ApiError(409, 'Repetitie is al gekoppeld aan dit project');
      }
      throw err;
    }

    res.status(201).json({ message: 'Repetitie gekoppeld' });
  }),
);

// DELETE /projects/:id/rehearsals/:rehearsalId - Unlink rehearsal
router.delete(
  '/:id/rehearsals/:rehearsalId',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, rehearsalId } = req.params;
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    // Alleen de koppeling gaat weg, de rij in rehearsal_instances blijft: daar
    // hangen ook resource_bookings, equipment_loans en vervangingsverzoeken
    // aan, en die horen niet te sneuvelen omdat iemand een projectkoppeling
    // ongedaan maakt.
    //
    // Een koppeling die er niet is levert net als bij concerten geen 404 op:
    // het scherm haalt het project daarna toch opnieuw op, en tweemaal
    // ontkoppelen hoort hetzelfde te betekenen als eenmaal.
    db.prepare('DELETE FROM project_rehearsals WHERE project_id = ? AND rehearsal_instance_id = ?').run(
      id,
      rehearsalId,
    );

    res.json({ message: 'Repetitie ontkoppeld' });
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

// PUT /projects/:id/setlist/reorder - Reorder setlist
//
// Staat na DELETE /:id/setlist/:itemId maar botst daar niet mee: dat is een
// ander werkwoord. Zou hier ooit een PUT /:id/setlist/:itemId bij komen, dan
// moet die na deze route, anders slikt hij 'reorder' als item-id.
router.put(
  '/:id/setlist/reorder',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = herordenSetlistSchema.parse(req.body);
    const associationId = req.user!.associationId;

    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
      .get(id, associationId);

    if (!project) {
      throw new ApiError(404, 'Project niet gevonden');
    }

    // Hetzelfde item twee keer zou betekenen dat het zijn laatste plek krijgt
    // en dat er ergens anders een nummer overgeslagen wordt. De lijst klopt
    // dan niet, dus hij gaat in zijn geheel terug.
    if (new Set(data.itemIds).size !== data.itemIds.length) {
      throw new ApiError(400, 'De lijst bevat hetzelfde item meer dan een keer');
    }

    const bestaandeItems = db.prepare('SELECT id FROM project_setlist WHERE project_id = ?').all(id) as {
      id: string;
    }[];
    const bekend = new Set(bestaandeItems.map((item) => item.id));

    // De lijst moet precies de items van dit project zijn - niet meer, niet
    // minder. ProjectSetlistSection.tsx stuurt altijd het hele programma, dus
    // elke afwijking is een vergissing: een id van een ander project, een item
    // dat inmiddels verwijderd is, of een halve lijst.
    //
    // Alleen de meegestuurde id's doornummeren zou het ergst zijn wat hier kan
    // gebeuren: de items die ontbreken houden hun oude sort_order en belanden
    // willekeurig tussen de herordende. Het programma ziet er dan compleet uit
    // en staat in de verkeerde volgorde, zonder dat iets dat meldt.
    const compleet =
      bestaandeItems.length === data.itemIds.length && data.itemIds.every((itemId) => bekend.has(itemId));

    if (!compleet) {
      throw new ApiError(400, 'De lijst moet precies de items van dit project bevatten');
    }

    // Nummeren vanaf 1, in dezelfde reeks die POST /:id/setlist gebruikt (die
    // neemt MAX + 1). Een item dat na het herordenen wordt toegevoegd komt zo
    // weer achteraan in plaats van naast het eerste.
    const bijwerken = db.prepare('UPDATE project_setlist SET sort_order = ? WHERE id = ? AND project_id = ?');

    // In een transactie, want een halve nieuwe volgorde is erger dan geen.
    db.transaction(() => {
      data.itemIds.forEach((itemId, index) => {
        bijwerken.run(index + 1, itemId, id);
      });
    })();

    res.json({ message: 'Setlist herordend' });
  }),
);

export default router;
