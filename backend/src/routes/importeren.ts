import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import {
  beoordeelApparatuur,
  beoordeelContacten,
  beoordeelInstrumenten,
  beoordeelLeden,
  beoordeelTitels,
  beoordeelUniformen,
  importeerApparatuur,
  importeerContacten,
  importeerInstrumenten,
  importeerLeden,
  importeerTitels,
  importeerUniformen,
} from '../services/importeren';
import { MAX_TEKENS } from '../utils/csvLezen';
import { logAuditEvent } from './audit-logs';

/**
 * Leden, de muziekbibliotheek, instrumenten in bezit, contacten, uniformen en
 * apparatuur inlezen uit een spreadsheet (WP11). Zie docs/IMPORTEREN.md voor
 * de kolommen.
 *
 * Instrumenten, uniformen en apparatuur horen bij de module inventaris en
 * contacten bij de module contacten. Die guards staan op de mount in index.ts, net als bij de routes
 * van die modules zelf: staat de module uit, dan bestaat de import niet (404).
 *
 * Per soort twee routes: `/voorbeeld` beoordeelt het bestand en verandert
 * niets, de route zonder achtervoegsel voert uit wat klopt. Die beoordeelt het
 * bestand opnieuw; het voorbeeld dat de browser kreeg wordt niet vertrouwd.
 *
 * Het bestand komt als tekst in de JSON-body: de browser leest het in en zet
 * het daar om naar UTF-8 (ook als Excel het in Windows-1252 opsloeg).
 */

const router = Router();

router.use(authenticateToken);

// Ruim boven de 2000 regels die de import aankan, ver onder de 10 MB van de
// JSON-parser.
const bestandSchema = z.object({
  csv: z.string().min(1, 'Het bestand is leeg.').max(MAX_TEKENS, 'Het bestand is groter dan 5 MB.'),
  // Bestaande rijen bijwerken met wat in het bestand anders is. Uniformen
  // hebben geen sleutel en negeren dit.
  bijwerken: z.boolean().optional(),
});

const opties = (req: AuthRequest) => ({ bijwerken: req.body.bijwerken === true });

router.post(
  '/leden/voorbeeld',
  requireRole('admin'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelLeden(req.user!.associationId!, req.body.csv, opties(req)));
  }),
);

router.post(
  '/leden',
  requireRole('admin'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = await importeerLeden(req.user!.associationId!, req.body.csv, opties(req));

    // Aantallen, geen namen of adressen: het auditlog bewaart geen
    // persoonsgegevens van wie er binnenkwam.
    if (uitkomst.geimporteerd > 0 || uitkomst.bijgewerkt > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'user',
        uuidv4(),
        `${uitkomst.geimporteerd} leden uit een spreadsheet, ${uitkomst.bijgewerkt} bijgewerkt`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }

    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

router.post(
  '/muziektitels/voorbeeld',
  requireRole('admin', 'music_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelTitels(req.user!.associationId!, req.body.csv, opties(req)));
  }),
);

router.post(
  '/muziektitels',
  requireRole('admin', 'music_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = importeerTitels(req.user!.associationId!, req.body.csv, opties(req));

    if (uitkomst.geimporteerd > 0 || uitkomst.bijgewerkt > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'music_title',
        uuidv4(),
        `${uitkomst.geimporteerd} muziektitels uit een spreadsheet, ${uitkomst.bijgewerkt} bijgewerkt`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }

    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

router.post(
  '/instrumenten/voorbeeld',
  requireRole('admin', 'equipment_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelInstrumenten(req.user!.associationId!, req.body.csv, opties(req)));
  }),
);

router.post(
  '/instrumenten',
  requireRole('admin', 'equipment_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = importeerInstrumenten(req.user!.associationId!, req.user!.id, req.body.csv, opties(req));
    if (uitkomst.geimporteerd > 0 || uitkomst.bijgewerkt > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'instrument_asset',
        uuidv4(),
        `${uitkomst.geimporteerd} instrumenten uit een spreadsheet, ${uitkomst.bijgewerkt} bijgewerkt`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }
    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

// Dezelfde rollen als het aanmaken van een contact in routes/contacts.ts.
router.post(
  '/contacten/voorbeeld',
  requireRole('admin', 'music_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelContacten(req.user!.associationId!, req.body.csv, opties(req)));
  }),
);

router.post(
  '/contacten',
  requireRole('admin', 'music_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = importeerContacten(req.user!.associationId!, req.user!.id, req.body.csv, opties(req));
    if (uitkomst.geimporteerd > 0 || uitkomst.bijgewerkt > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'contact',
        uuidv4(),
        `${uitkomst.geimporteerd} contacten uit een spreadsheet, ${uitkomst.bijgewerkt} bijgewerkt`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }
    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

// Dezelfde rollen als het aanmaken van een onderdeel in routes/uniforms.ts.
router.post(
  '/uniformen/voorbeeld',
  requireRole('admin', 'uniforms_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelUniformen(req.user!.associationId!, req.body.csv));
  }),
);

router.post(
  '/uniformen',
  requireRole('admin', 'uniforms_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = importeerUniformen(req.user!.associationId!, req.body.csv);
    if (uitkomst.geimporteerd > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'uniform_item',
        uuidv4(),
        `${uitkomst.geimporteerd} uniformonderdelen uit een spreadsheet`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }
    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

// Dezelfde rollen als het aanmaken van apparatuur in routes/equipment.ts.
router.post(
  '/apparatuur/voorbeeld',
  requireRole('admin', 'equipment_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelApparatuur(req.user!.associationId!, req.body.csv, opties(req)));
  }),
);

router.post(
  '/apparatuur',
  requireRole('admin', 'equipment_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = importeerApparatuur(req.user!.associationId!, req.body.csv, opties(req));
    if (uitkomst.geimporteerd > 0 || uitkomst.bijgewerkt > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'equipment_item',
        uuidv4(),
        `${uitkomst.geimporteerd} stuks apparatuur uit een spreadsheet, ${uitkomst.bijgewerkt} bijgewerkt`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }
    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

export default router;
