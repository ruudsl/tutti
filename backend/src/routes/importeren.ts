import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { beoordeelLeden, beoordeelTitels, importeerLeden, importeerTitels } from '../services/importeren';
import { logAuditEvent } from './audit-logs';

/**
 * Leden en de muziekbibliotheek inlezen uit een spreadsheet (WP11). Zie
 * docs/IMPORTEREN.md voor de kolommen.
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
  csv: z.string().min(1, 'Het bestand is leeg.').max(5_000_000, 'Het bestand is groter dan 5 MB.'),
});

router.post(
  '/leden/voorbeeld',
  requireRole('admin'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(beoordeelLeden(req.user!.associationId!, req.body.csv));
  }),
);

router.post(
  '/leden',
  requireRole('admin'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = await importeerLeden(req.user!.associationId!, req.body.csv);

    // Aantallen, geen namen of adressen: het auditlog bewaart geen
    // persoonsgegevens van wie er binnenkwam.
    if (uitkomst.geimporteerd > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'user',
        uuidv4(),
        `${uitkomst.geimporteerd} leden uit een spreadsheet`,
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
    res.json(beoordeelTitels(req.user!.associationId!, req.body.csv));
  }),
);

router.post(
  '/muziektitels',
  requireRole('admin', 'music_committee'),
  validate(bestandSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const uitkomst = importeerTitels(req.user!.associationId!, req.body.csv);

    if (uitkomst.geimporteerd > 0) {
      logAuditEvent(
        req.user!.id,
        'import',
        'music_title',
        uuidv4(),
        `${uitkomst.geimporteerd} muziektitels uit een spreadsheet`,
        uitkomst.tellingen,
        req.ip,
        req.get('user-agent'),
      );
    }

    res.status(uitkomst.geimporteerd > 0 ? 201 : 200).json(uitkomst);
  }),
);

export default router;
