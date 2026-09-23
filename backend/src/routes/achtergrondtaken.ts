import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../database/connection';
import { authenticateToken, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { createPaginatedResult, getPaginationParams } from '../utils/database';
import { probeerOpnieuw } from '../taken/wachtrij';
import { logAuditEvent } from './audit-logs';

const router = Router();

/**
 * De wachtrij voor achtergrondtaken bekijken, en een mislukte taak opnieuw
 * proberen (WP12, zie docs/ACHTERGRONDTAKEN.md).
 *
 * Alleen voor superbeheerders. De taken die er nu zijn - back-up,
 * AVG-opschoning, meldingen - draaien voor de hele installatie en horen bij
 * geen enkele vereniging (association_id is leeg). Daarom geen filter op
 * vereniging hier: dit is de uitzondering uit regel 3 van CLAUDE.md. Komen er
 * taken die bij één vereniging horen, dan hoort een beheerder van die
 * vereniging een eigen route te krijgen die op association_id filtert, niet
 * deze.
 *
 * Geen cache: wie hier kijkt, wil zien wat er nu staat.
 */

const STATUSSEN = ['wachtend', 'bezig', 'gelukt', 'mislukt'] as const;

const lijstSchema = z.object({
  status: z.enum(STATUSSEN).optional(),
  soort: z
    .string()
    .regex(/^[a-z0-9-]{1,100}$/)
    .optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

const idSchema = z.object({ id: z.string().uuid() });

interface TaakRij {
  id: string;
  soort: string;
  sleutel: string | null;
  status: string;
  pogingen: number;
  gepland_op: string;
  eigenaar: string | null;
  vergrendeld_tot: string | null;
  laatste_fout: string | null;
  association_id: string | null;
  aangemaakt_op: string;
  bijgewerkt_op: string;
  afgerond_op: string | null;
}

/**
 * @swagger
 * /achtergrondtaken:
 *   get:
 *     summary: Taken in de wachtrij, met tellingen per status (superbeheerder)
 *     tags: [Achtergrondtaken]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authenticateToken,
  requireSuperAdmin,
  validate(lijstSchema, 'query'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { status, soort } = req.query as z.infer<typeof lijstSchema>;
    const { page, limit, offset } = getPaginationParams(req.query);

    // Vaste voorwaarden met eigen parameters; alleen de keuze welke erbij
    // komen hangt van de invoer af.
    const voorwaarden: string[] = [];
    const waarden: unknown[] = [];
    if (status) {
      voorwaarden.push('status = ?');
      waarden.push(status);
    }
    if (soort) {
      voorwaarden.push('soort = ?');
      waarden.push(soort);
    }
    const waar = voorwaarden.length > 0 ? `WHERE ${voorwaarden.join(' AND ')}` : '';

    const { totaal } = db.prepare(`SELECT COUNT(*) AS totaal FROM achtergrondtaken ${waar}`).get(...waarden) as {
      totaal: number;
    };
    // Wat het laatst veranderde bovenaan: dat is waar iemand naar zoekt.
    const taken = db
      .prepare(
        `SELECT id, soort, sleutel, status, pogingen, gepland_op, eigenaar, vergrendeld_tot, laatste_fout,
                association_id, aangemaakt_op, bijgewerkt_op, afgerond_op
           FROM achtergrondtaken ${waar}
          ORDER BY bijgewerkt_op DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...waarden, limit, offset) as TaakRij[];

    // Tellingen over alles, los van het filter: de knoppen bovenaan het scherm
    // laten zien hoeveel er in elke status staat.
    const tellingen = Object.fromEntries(STATUSSEN.map((s) => [s, 0])) as Record<string, number>;
    for (const rij of db.prepare('SELECT status, COUNT(*) AS aantal FROM achtergrondtaken GROUP BY status').all() as {
      status: string;
      aantal: number;
    }[]) {
      tellingen[rij.status] = rij.aantal;
    }

    res.json({ ...createPaginatedResult(taken, totaal, page, limit), tellingen });
  }),
);

/**
 * @swagger
 * /achtergrondtaken/{id}/opnieuw:
 *   post:
 *     summary: Een mislukte taak opnieuw in de wachtrij zetten (superbeheerder)
 *     tags: [Achtergrondtaken]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/:id/opnieuw',
  authenticateToken,
  requireSuperAdmin,
  validate(idSchema, 'params'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const taak = db.prepare('SELECT id, soort, status FROM achtergrondtaken WHERE id = ?').get(id) as
      { id: string; soort: string; status: string } | undefined;
    if (!taak) throw new ApiError(404, 'Taak niet gevonden.');
    if (taak.status !== 'mislukt' || !probeerOpnieuw(id)) {
      throw new ApiError(409, 'Alleen een mislukte taak kan opnieuw worden geprobeerd.');
    }

    logAuditEvent(req.user!.id, 'retry', 'achtergrondtaak', id, taak.soort, undefined, req.ip, req.get('user-agent'));
    res.json({ id, status: 'wachtend' });
  }),
);

export default router;
