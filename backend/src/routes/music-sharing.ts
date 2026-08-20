/**
 * Muziek delen tussen verenigingen: koppelen, delen, verzoeken en oproepen.
 *
 * De regels staan in services/muziekDelen.ts; hier staat wie wat mag.
 * Beheren doet de muziekcommissie of een beheerder - het gaat over het
 * repertoire van de vereniging en over wat er naar buiten gaat. Kijken in de
 * catalogus van een partner mag elk lid, want dat is precies waar delen voor
 * bedoeld is.
 */

import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import {
  CODE_GELDIG_UREN,
  TOEGANG_GELDIG_DAGEN,
  gekoppeldeVerenigingen,
  isGekoppeld,
  isUitgesloten,
  magBestandOphalen,
  magTitelZien,
  maakKoppelcode,
  partijenVanTitel,
  titelVanPartij,
  wisselKoppelcodeIn,
} from '../services/muziekDelen';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/** Wie het delen mag inrichten. */
const BEHEERT_DELEN = ['admin', 'music_committee'];

const beheerder = requireRole(...BEHEERT_DELEN);

/** Een verwijzing bij een oproep: een gewone webpagina of een filmpje. */
const verwijzingSchema = z
  .string()
  .trim()
  .url()
  .refine((waarde) => /^https?:\/\//i.test(waarde), 'Alleen http- en https-adressen')
  .optional();

const oproepSchema = z.object({
  title: z.string().trim().min(1).max(200),
  composer: z.string().trim().max(200).optional(),
  arranger: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  referenceUrl: verwijzingSchema,
});

// =====================================================
// KOPPELEN
// =====================================================

/**
 * POST /music-sharing/link-code - maak een code om te delen met een andere
 * vereniging.
 *
 * Er is bewust geen lijst van verenigingen op het platform. Deze code geef je
 * buiten Tutti om door; de ander voert hem in en dan zijn jullie gekoppeld.
 */
router.post(
  '/link-code',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const code = maakKoppelcode(req.user!.associationId!, req.user!.id);
    logger.info('Koppelcode aangemaakt', { associationId: req.user!.associationId });
    res.status(201).json({ ...code, geldigUren: CODE_GELDIG_UREN });
  }),
);

/** POST /music-sharing/link-code/redeem - wissel de code van een ander in. */
router.post(
  '/link-code/redeem',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { code } = z.object({ code: z.string().trim().min(1) }).parse(req.body);

    const resultaat = wisselKoppelcodeIn(code, req.user!.associationId!, req.user!.id);

    // Een onbekende en een verlopen code geven allebei hetzelfde antwoord niet:
    // wie een code intypt heeft er baat bij te weten of hij te laat is of zich
    // vertypt heeft, en een code raden is met 31^8 mogelijkheden geen route.
    const meldingen: Record<string, string> = {
      onbekend: 'Deze koppelcode bestaat niet.',
      verlopen: 'Deze koppelcode is verlopen. Vraag de andere vereniging om een nieuwe.',
      gebruikt: 'Deze koppelcode is al gebruikt.',
      'eigen-vereniging': 'Dit is de code van je eigen vereniging.',
      'al-gekoppeld': 'Jullie zijn al gekoppeld.',
    };

    if (resultaat.fout) {
      throw new ApiError(400, meldingen[resultaat.fout]);
    }

    logger.info('Verenigingen gekoppeld', {
      associationId: req.user!.associationId,
      partnerId: resultaat.partnerId,
    });

    res.json({ partnerId: resultaat.partnerId, partnerNaam: resultaat.partnerNaam });
  }),
);

/** GET /music-sharing/partners - met wie zijn we gekoppeld. */
router.get(
  '/partners',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(gekoppeldeVerenigingen(req.user!.associationId!));
  }),
);

/**
 * DELETE /music-sharing/partners/:id - koppeling beeindigen.
 *
 * De delingen blijven staan, maar doen niets meer: magTitelZien vraagt bij elke
 * aanvraag opnieuw of het partnerschap actief is. Wordt de koppeling later
 * hersteld, dan is alles er weer zoals het was.
 */
router.delete(
  '/partners/:id',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const eigen = req.user!.associationId!;
    const resultaat = db
      .prepare(
        `UPDATE association_partnerships SET status = 'ended'
         WHERE status = 'active'
           AND ((association_a_id = ? AND association_b_id = ?)
             OR (association_a_id = ? AND association_b_id = ?))`,
      )
      .run(eigen, req.params.id, req.params.id, eigen);

    if (resultaat.changes === 0) {
      throw new ApiError(404, 'Geen actieve koppeling met deze vereniging.');
    }

    res.json({ message: 'Koppeling beeindigd.' });
  }),
);

// =====================================================
// DELEN PER TITEL
// =====================================================

/** Haalt een titel van de eigen vereniging, of werpt een 404. */
function eigenTitel(req: AuthRequest, titelId: string): { id: string; title: string } {
  const titel = db
    .prepare('SELECT id, title FROM music_titles WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
    .get(titelId, req.user!.associationId) as { id: string; title: string } | undefined;

  if (!titel) {
    throw new ApiError(404, 'Muziektitel niet gevonden.');
  }
  return titel;
}

/** GET /music-sharing/titles/:id - met wie deel ik dit stuk, en welke partijen horen erbij. */
router.get(
  '/titles/:id',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const titel = eigenTitel(req, req.params.id);

    const gedeeldMet = db
      .prepare(
        `SELECT a.id, a.name, a.display_name AS displayName, mts.created_at AS sinds
         FROM music_title_shares mts
         JOIN associations a ON a.id = mts.partner_association_id
         WHERE mts.music_title_id = ?
         ORDER BY a.name`,
      )
      .all(titel.id);

    res.json({
      titleId: titel.id,
      title: titel.title,
      sharedWith: gedeeldMet,
      parts: partijenVanTitel(titel.id),
    });
  }),
);

/**
 * PUT /music-sharing/titles/:id/shares - leg vast met welke verenigingen dit
 * stuk gedeeld wordt.
 *
 * De hele lijst gaat mee, niet een wijziging erop: het scherm toont vinkjes en
 * dan is "dit is de nieuwe stand" eenduidiger dan een reeks toevoegingen en
 * verwijderingen die elkaar kunnen kruisen.
 */
router.put(
  '/titles/:id/shares',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const titel = eigenTitel(req, req.params.id);
    const { partnerIds } = z.object({ partnerIds: z.array(z.string().uuid()) }).parse(req.body);

    // Alleen verenigingen waarmee op dit moment een koppeling bestaat. Anders
    // kun je met een willekeurig id een deling aanmaken die pas werking krijgt
    // zodra je ooit met die vereniging koppelt.
    const gekoppeld = new Set(gekoppeldeVerenigingen(req.user!.associationId!).map((v) => v.id));
    const onbekend = partnerIds.filter((id) => !gekoppeld.has(id));
    if (onbekend.length > 0) {
      throw new ApiError(400, 'Je bent niet gekoppeld met een van de gekozen verenigingen.');
    }

    db.prepare('DELETE FROM music_title_shares WHERE music_title_id = ?').run(titel.id);
    const invoegen = db.prepare(
      `INSERT INTO music_title_shares (id, music_title_id, partner_association_id, shared_by)
       VALUES (?, ?, ?, ?)`,
    );
    for (const partnerId of partnerIds) {
      invoegen.run(uuidv4(), titel.id, partnerId, req.user!.id);
    }

    res.json({ message: 'Delen bijgewerkt.', sharedWith: partnerIds.length });
  }),
);

/** Haalt een partij van de eigen vereniging, of werpt een 404. */
function eigenPartij(req: AuthRequest, partijId: string): { id: string } {
  const partij = db
    .prepare('SELECT id FROM music_pieces WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
    .get(partijId, req.user!.associationId) as { id: string } | undefined;

  if (!partij) {
    throw new ApiError(404, 'Partij niet gevonden.');
  }
  return partij;
}

/**
 * POST /music-sharing/pieces/:id/exclude - sluit een partij uit van delen.
 *
 * Geldt voor alle partners tegelijk: "deze partij deel ik niet" is een
 * eigenschap van de partij, niet van de relatie met een bepaalde vereniging.
 */
router.post(
  '/pieces/:id/exclude',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partij = eigenPartij(req, req.params.id);
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body ?? {});

    db.prepare(
      `INSERT INTO music_share_exclusions (id, music_piece_id, reason, excluded_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(music_piece_id) DO UPDATE SET reason = excluded.reason, excluded_by = excluded.excluded_by`,
    ).run(uuidv4(), partij.id, reason ?? null, req.user!.id);

    res.status(201).json({ message: 'Partij wordt niet gedeeld.' });
  }),
);

/** DELETE /music-sharing/pieces/:id/exclude - haal de uitzondering weg. */
router.delete(
  '/pieces/:id/exclude',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const partij = eigenPartij(req, req.params.id);
    db.prepare('DELETE FROM music_share_exclusions WHERE music_piece_id = ?').run(partij.id);
    res.json({ message: 'Partij wordt weer gedeeld.' });
  }),
);

// =====================================================
// DE CATALOGUS VAN PARTNERS
// =====================================================

/** GET /music-sharing/catalog - wat partners met ons hebben gedeeld. */
router.get(
  '/catalog',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const eigen = req.user!.associationId!;
    const partners = gekoppeldeVerenigingen(eigen);
    if (partners.length === 0) {
      res.json([]);
      return;
    }

    const zoekterm = ((req.query.q as string) || '').trim().toLowerCase();
    const plaatshouders = partners.map(() => '?').join(',');
    const params: unknown[] = [eigen, ...partners.map((p) => p.id)];

    let filter = '';
    if (zoekterm) {
      filter = ' AND (LOWER(mt.title) LIKE ? OR LOWER(mt.composer) LIKE ? OR LOWER(mt.arranger) LIKE ?)';
      const patroon = `%${zoekterm}%`;
      params.push(patroon, patroon, patroon);
    }

    // internal_notes staat er bewust niet bij: dat veld hoort binnen de eigen
    // vereniging te blijven.
    const titels = db
      .prepare(
        `SELECT mt.id, mt.title, mt.composer, mt.arranger, mt.duration_seconds AS durationSeconds,
                mt.grade, mt.youtube_url AS youtubeUrl,
                a.id AS associationId, a.name AS associationName
         FROM music_title_shares mts
         JOIN music_titles mt ON mt.id = mts.music_title_id
         JOIN associations a ON a.id = mt.association_id
         WHERE mts.partner_association_id = ?
           AND mt.association_id IN (${plaatshouders})
           AND mt.deleted_at IS NULL${filter}
         ORDER BY mt.title`,
      )
      .all(...params);

    res.json(titels);
  }),
);

/** GET /music-sharing/catalog/:titleId - de partijen bij een gedeeld stuk. */
router.get(
  '/catalog/:titleId',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const eigen = req.user!.associationId!;
    if (!magTitelZien(eigen, req.params.titleId)) {
      throw new ApiError(404, 'Muziektitel niet gevonden.');
    }

    const titel = db
      .prepare(
        `SELECT mt.id, mt.title, mt.composer, mt.arranger, mt.duration_seconds AS durationSeconds,
                mt.grade, mt.youtube_url AS youtubeUrl, a.name AS associationName
         FROM music_titles mt JOIN associations a ON a.id = mt.association_id
         WHERE mt.id = ?`,
      )
      .get(req.params.titleId);

    // Uitgesloten partijen komen hier niet in voor: die deelt de eigenaar niet,
    // dus een partner hoeft niet te weten dat ze bestaan.
    const partijen = partijenVanTitel(req.params.titleId).filter((p) => !p.uitgesloten);

    const verzoeken = db
      .prepare(
        `SELECT music_piece_id AS pieceId, status, access_expires_at AS accessExpiresAt
         FROM music_file_requests
         WHERE requesting_association_id = ? AND music_piece_id IN (${partijen.map(() => '?').join(',') || "''"})`,
      )
      .all(eigen, ...partijen.map((p) => p.id)) as {
      pieceId: string;
      status: string;
      accessExpiresAt: string | null;
    }[];

    const perPartij = new Map(verzoeken.map((v) => [v.pieceId, v]));

    res.json({
      ...(titel as object),
      parts: partijen.map((p) => ({
        id: p.id,
        instrumentName: p.instrumentName,
        tuning: p.tuning,
        groupNumber: p.groupNumber,
        request: perPartij.get(p.id) ?? null,
      })),
    });
  }),
);

// =====================================================
// VERZOEKEN OM EEN BESTAND
// =====================================================

/**
 * POST /music-sharing/requests - vraag een partij op bij de eigenaar.
 *
 * De catalogus laat zien dat een stuk bestaat; het bestand komt er pas uit als
 * de eigenaar per keer akkoord geeft. Dat is de reden dat dit een verzoek is en
 * geen download.
 */
router.post(
  '/requests',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { pieceId, message } = z
      .object({ pieceId: z.string().uuid(), message: z.string().trim().max(1000).optional() })
      .parse(req.body);

    const eigen = req.user!.associationId!;
    const titel = titelVanPartij(pieceId);

    // Eén melding voor "bestaat niet", "niet met jou gedeeld" en "uitgesloten".
    // Anders vertelt het antwoord welke partijen een partner heeft die hij niet
    // deelt, en dat is precies wat uitsluiten moest voorkomen.
    if (!titel || !magTitelZien(eigen, titel.id) || isUitgesloten(pieceId)) {
      throw new ApiError(404, 'Partij niet gevonden.');
    }

    const lopend = db
      .prepare(
        `SELECT id FROM music_file_requests
         WHERE music_piece_id = ? AND requesting_association_id = ? AND status IN ('pending', 'approved')`,
      )
      .get(pieceId, eigen);

    if (lopend) {
      throw new ApiError(409, 'Er loopt al een verzoek voor deze partij.');
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_file_requests
         (id, music_piece_id, owner_association_id, requesting_association_id, requested_by, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, pieceId, titel.associationId, eigen, req.user!.id, message ?? null);

    res.status(201).json({ id, status: 'pending' });
  }),
);

/** De vaste vorm waarin een verzoek over de lijn gaat. */
const VERZOEK_KOLOMMEN = `
  mfr.id, mfr.status, mfr.message, mfr.decision_note AS decisionNote,
  mfr.access_expires_at AS accessExpiresAt, mfr.created_at AS createdAt, mfr.decided_at AS decidedAt,
  mp.id AS pieceId, mp.original_filename AS originalFilename,
  i.name AS instrumentName, mt.title AS titleName,
  vrager.name AS requestingAssociationName, eigenaar.name AS ownerAssociationName,
  lid.first_name || ' ' || lid.last_name AS requestedByName
`;

const VERZOEK_JOINS = `
  FROM music_file_requests mfr
  JOIN music_pieces mp ON mp.id = mfr.music_piece_id
  LEFT JOIN instruments i ON i.id = mp.instrument_id
  LEFT JOIN music_titles mt
    ON mt.title = mp.title AND mt.arranger IS mp.arranger AND mt.association_id = mp.association_id
  JOIN associations vrager ON vrager.id = mfr.requesting_association_id
  JOIN associations eigenaar ON eigenaar.id = mfr.owner_association_id
  JOIN users lid ON lid.id = mfr.requested_by
`;

/** GET /music-sharing/requests/incoming - wat anderen bij ons opvragen. */
router.get(
  '/requests/incoming',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const status = req.query.status as string | undefined;
    const params: unknown[] = [req.user!.associationId];
    let filter = '';
    if (status) {
      filter = ' AND mfr.status = ?';
      params.push(status);
    }

    res.json(
      db
        .prepare(
          `SELECT ${VERZOEK_KOLOMMEN} ${VERZOEK_JOINS}
           WHERE mfr.owner_association_id = ?${filter}
           ORDER BY mfr.created_at DESC`,
        )
        .all(...params),
    );
  }),
);

/** GET /music-sharing/requests/outgoing - wat wij bij anderen hebben opgevraagd. */
router.get(
  '/requests/outgoing',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(
      db
        .prepare(
          `SELECT ${VERZOEK_KOLOMMEN} ${VERZOEK_JOINS}
           WHERE mfr.requesting_association_id = ?
           ORDER BY mfr.created_at DESC`,
        )
        .all(req.user!.associationId),
    );
  }),
);

/** Haalt een openstaand verzoek dat bij ons hoort als eigenaar. */
function openstaandVerzoek(req: AuthRequest, verzoekId: string): { id: string; music_piece_id: string } {
  const verzoek = db
    .prepare(
      `SELECT id, music_piece_id FROM music_file_requests
       WHERE id = ? AND owner_association_id = ? AND status = 'pending'`,
    )
    .get(verzoekId, req.user!.associationId) as { id: string; music_piece_id: string } | undefined;

  if (!verzoek) {
    throw new ApiError(404, 'Verzoek niet gevonden.');
  }
  return verzoek;
}

/** POST /music-sharing/requests/:id/approve - geef de partij vrij. */
router.post(
  '/requests/:id/approve',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const verzoek = openstaandVerzoek(req, req.params.id);
    const { note, dagen } = z
      .object({ note: z.string().trim().max(1000).optional(), dagen: z.number().int().min(1).max(365).optional() })
      .parse(req.body ?? {});

    const vervalt = new Date(Date.now() + (dagen ?? TOEGANG_GELDIG_DAGEN) * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `UPDATE music_file_requests
       SET status = 'approved', decided_by = ?, decided_at = CURRENT_TIMESTAMP,
           decision_note = ?, access_expires_at = ?
       WHERE id = ?`,
    ).run(req.user!.id, note ?? null, vervalt, verzoek.id);

    logger.info('Partij vrijgegeven aan partner', {
      associationId: req.user!.associationId,
      requestId: verzoek.id,
    });

    res.json({ message: 'Partij vrijgegeven.', accessExpiresAt: vervalt });
  }),
);

/** POST /music-sharing/requests/:id/reject - wijs het verzoek af. */
router.post(
  '/requests/:id/reject',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const verzoek = openstaandVerzoek(req, req.params.id);
    const { note } = z.object({ note: z.string().trim().max(1000).optional() }).parse(req.body ?? {});

    // De afwijzing blijft staan. Zo is achteraf na te gaan wat er gevraagd is
    // en wat erop is besloten - ook als het antwoord nee was.
    db.prepare(
      `UPDATE music_file_requests
       SET status = 'rejected', decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_note = ?
       WHERE id = ?`,
    ).run(req.user!.id, note ?? null, verzoek.id);

    res.json({ message: 'Verzoek afgewezen.' });
  }),
);

/** DELETE /music-sharing/requests/:id - trek je eigen verzoek in. */
router.delete(
  '/requests/:id',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const resultaat = db
      .prepare(
        `UPDATE music_file_requests SET status = 'withdrawn'
         WHERE id = ? AND requesting_association_id = ? AND status = 'pending'`,
      )
      .run(req.params.id, req.user!.associationId);

    if (resultaat.changes === 0) {
      throw new ApiError(404, 'Verzoek niet gevonden.');
    }

    res.json({ message: 'Verzoek ingetrokken.' });
  }),
);

/**
 * GET /music-sharing/requests/:id/download - haal de vrijgegeven partij op.
 *
 * De toegang wordt hier opnieuw gecontroleerd en niet alleen bij het
 * goedkeuren: een deling kan zijn ingetrokken, een koppeling beeindigd of de
 * termijn verlopen sinds die goedkeuring.
 */
router.get(
  '/requests/:id/download',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const verzoek = db
      .prepare(
        `SELECT mfr.music_piece_id AS pieceId, mp.file_path AS filePath, mp.original_filename AS filename
         FROM music_file_requests mfr
         JOIN music_pieces mp ON mp.id = mfr.music_piece_id
         WHERE mfr.id = ? AND mfr.requesting_association_id = ?`,
      )
      .get(req.params.id, req.user!.associationId) as
      { pieceId: string; filePath: string; filename: string } | undefined;

    if (!verzoek || !magBestandOphalen(req.user!.associationId!, verzoek.pieceId)) {
      throw new ApiError(404, 'Geen toegang tot dit bestand.');
    }

    const bestand = path.join(UPLOAD_DIR, verzoek.filePath);
    if (!fs.existsSync(bestand)) {
      throw new ApiError(404, 'Bestand niet gevonden.');
    }

    logger.info('Gedeelde partij opgehaald', {
      associationId: req.user!.associationId,
      requestId: req.params.id,
    });

    res.download(bestand, verzoek.filename);
  }),
);

// =====================================================
// OPROEPEN
// =====================================================

/**
 * GET /music-sharing/wanted - openstaande oproepen.
 *
 * Van onszelf en van verenigingen waarmee we gekoppeld zijn. Zonder koppeling
 * zie je alleen je eigen oproepen; dat volgt uit de keuze om geen lijst van
 * verenigingen te hebben.
 */
router.get(
  '/wanted',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const eigen = req.user!.associationId!;
    const ids = [eigen, ...gekoppeldeVerenigingen(eigen).map((v) => v.id)];
    const plaatshouders = ids.map(() => '?').join(',');

    const alleen = req.query.status as string | undefined;
    const params: unknown[] = [...ids];
    let filter = '';
    if (alleen) {
      filter = ' AND p.status = ?';
      params.push(alleen);
    }

    res.json(
      db
        .prepare(
          `SELECT p.id, p.title, p.composer, p.arranger, p.description,
                  p.reference_url AS referenceUrl, p.status, p.created_at AS createdAt,
                  a.id AS associationId, a.name AS associationName,
                  lid.first_name || ' ' || lid.last_name AS createdByName,
                  (SELECT COUNT(*) FROM music_wanted_replies r WHERE r.post_id = p.id) AS replyCount
           FROM music_wanted_posts p
           JOIN associations a ON a.id = p.association_id
           JOIN users lid ON lid.id = p.created_by
           WHERE p.association_id IN (${plaatshouders})${filter}
           ORDER BY p.created_at DESC`,
        )
        .all(...params),
    );
  }),
);

/** POST /music-sharing/wanted - plaats een oproep. */
router.post(
  '/wanted',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const gegevens = oproepSchema.parse(req.body);
    const id = uuidv4();

    db.prepare(
      `INSERT INTO music_wanted_posts
         (id, association_id, title, composer, arranger, description, reference_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.user!.associationId,
      gegevens.title,
      gegevens.composer ?? null,
      gegevens.arranger ?? null,
      gegevens.description ?? null,
      gegevens.referenceUrl ?? null,
      req.user!.id,
    );

    res.status(201).json({ id });
  }),
);

/** PATCH /music-sharing/wanted/:id - werk je eigen oproep bij. */
router.patch(
  '/wanted/:id',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const gegevens = oproepSchema
      .partial()
      .extend({ status: z.enum(['open', 'resolved', 'closed']).optional() })
      .parse(req.body);

    const velden: Record<string, unknown> = {
      title: gegevens.title,
      composer: gegevens.composer,
      arranger: gegevens.arranger,
      description: gegevens.description,
      reference_url: gegevens.referenceUrl,
      status: gegevens.status,
    };

    const toewijzingen: string[] = [];
    const waarden: unknown[] = [];
    for (const [kolom, waarde] of Object.entries(velden)) {
      if (waarde === undefined) continue;
      toewijzingen.push(`${kolom} = ?`);
      waarden.push(waarde === '' ? null : waarde);
    }

    if (toewijzingen.length === 0) {
      throw new ApiError(400, 'Niets om bij te werken.');
    }

    toewijzingen.push('updated_at = CURRENT_TIMESTAMP');
    waarden.push(req.params.id, req.user!.associationId);

    const resultaat = db
      .prepare(`UPDATE music_wanted_posts SET ${toewijzingen.join(', ')} WHERE id = ? AND association_id = ?`)
      .run(...waarden);

    if (resultaat.changes === 0) {
      throw new ApiError(404, 'Oproep niet gevonden.');
    }

    res.json({ message: 'Oproep bijgewerkt.' });
  }),
);

/** DELETE /music-sharing/wanted/:id - haal je eigen oproep weg. */
router.delete(
  '/wanted/:id',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const resultaat = db
      .prepare('DELETE FROM music_wanted_posts WHERE id = ? AND association_id = ?')
      .run(req.params.id, req.user!.associationId);

    if (resultaat.changes === 0) {
      throw new ApiError(404, 'Oproep niet gevonden.');
    }

    res.json({ message: 'Oproep verwijderd.' });
  }),
);

/** Een oproep die deze vereniging mag zien: de eigen, of die van een partner. */
function zichtbareOproep(req: AuthRequest, oproepId: string): { id: string; association_id: string } {
  const oproep = db.prepare('SELECT id, association_id FROM music_wanted_posts WHERE id = ?').get(oproepId) as
    { id: string; association_id: string } | undefined;

  const eigen = req.user!.associationId!;
  if (!oproep || (oproep.association_id !== eigen && !isGekoppeld(eigen, oproep.association_id))) {
    throw new ApiError(404, 'Oproep niet gevonden.');
  }
  return oproep;
}

/** GET /music-sharing/wanted/:id/replies - de antwoorden op een oproep. */
router.get(
  '/wanted/:id/replies',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const oproep = zichtbareOproep(req, req.params.id);

    res.json(
      db
        .prepare(
          `SELECT r.id, r.body, r.music_title_id AS musicTitleId, r.created_at AS createdAt,
                  a.id AS associationId, a.name AS associationName,
                  lid.first_name || ' ' || lid.last_name AS createdByName
           FROM music_wanted_replies r
           JOIN associations a ON a.id = r.association_id
           JOIN users lid ON lid.id = r.created_by
           WHERE r.post_id = ?
           ORDER BY r.created_at`,
        )
        .all(oproep.id),
    );
  }),
);

/**
 * POST /music-sharing/wanted/:id/replies - antwoord op een oproep.
 *
 * Alleen de muziekcommissie of een beheerder: een antwoord spreekt namens de
 * vereniging, en vaak volgt er een deling uit.
 */
router.post(
  '/wanted/:id/replies',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const oproep = zichtbareOproep(req, req.params.id);
    const { body, musicTitleId } = z
      .object({ body: z.string().trim().min(1).max(2000), musicTitleId: z.string().uuid().optional() })
      .parse(req.body);

    // Wie een titel aanwijst moet die zelf hebben. Anders staat er straks een
    // verwijzing naar het repertoire van een derde in het antwoord.
    if (musicTitleId) {
      const eigen = db
        .prepare('SELECT id FROM music_titles WHERE id = ? AND association_id = ? AND deleted_at IS NULL')
        .get(musicTitleId, req.user!.associationId);
      if (!eigen) {
        throw new ApiError(400, 'Dat stuk staat niet in jullie eigen bibliotheek.');
      }
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_wanted_replies (id, post_id, association_id, music_title_id, body, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, oproep.id, req.user!.associationId, musicTitleId ?? null, body, req.user!.id);

    res.status(201).json({ id });
  }),
);

// =====================================================
// OVERZICHT
// =====================================================

/**
 * GET /music-sharing/overview - welke stukken delen wij met wie.
 *
 * Dit is de vraag waarmee het begon: als je per titel kunt kiezen, wil je ook
 * in een keer kunnen zien wat er waar terecht is gekomen.
 */
router.get(
  '/overview',
  authenticateToken,
  beheerder,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const eigen = req.user!.associationId!;

    const rijen = db
      .prepare(
        `SELECT a.id AS partnerId, a.name AS partnerName,
                mt.id AS titleId, mt.title, mt.composer, mt.arranger,
                mts.created_at AS sinds
         FROM music_title_shares mts
         JOIN music_titles mt ON mt.id = mts.music_title_id
         JOIN associations a ON a.id = mts.partner_association_id
         WHERE mt.association_id = ? AND mt.deleted_at IS NULL
         ORDER BY a.name, mt.title`,
      )
      .all(eigen) as {
      partnerId: string;
      partnerName: string;
      titleId: string;
      title: string;
      composer: string | null;
      arranger: string | null;
      sinds: string;
    }[];

    // Ook een partner zonder gedeelde stukken hoort in het overzicht: "met deze
    // vereniging deel je niets" is een antwoord, een ontbrekende regel niet.
    const perPartner = new Map<string, { partnerId: string; partnerName: string; titles: unknown[] }>();
    for (const partner of gekoppeldeVerenigingen(eigen)) {
      perPartner.set(partner.id, { partnerId: partner.id, partnerName: partner.name, titles: [] });
    }

    for (const rij of rijen) {
      if (!perPartner.has(rij.partnerId)) {
        perPartner.set(rij.partnerId, { partnerId: rij.partnerId, partnerName: rij.partnerName, titles: [] });
      }
      perPartner.get(rij.partnerId)!.titles.push({
        id: rij.titleId,
        title: rij.title,
        composer: rij.composer,
        arranger: rij.arranger,
        sinds: rij.sinds,
      });
    }

    const uitgesloten = db
      .prepare(
        `SELECT mp.id, mp.original_filename AS originalFilename, mp.title, i.name AS instrumentName,
                mse.reason
         FROM music_share_exclusions mse
         JOIN music_pieces mp ON mp.id = mse.music_piece_id
         LEFT JOIN instruments i ON i.id = mp.instrument_id
         WHERE mp.association_id = ? AND mp.deleted_at IS NULL
         ORDER BY mp.title, i.name`,
      )
      .all(eigen);

    res.json({ partners: [...perPartner.values()], excludedParts: uitgesloten });
  }),
);

export default router;
