import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { hashToken } from '../utils/sessionStore';
import {
  generateDownloadToken,
  DOWNLOAD_TOKEN_TTL_SECONDS,
  BRONSOORTEN,
  Bronsoort,
  BRON_TOKEN_GELDIG_SECONDEN,
  maakBronToken,
} from '../utils/downloadToken';

/**
 * Download token endpoint.
 *
 * POST /api/download-token
 *
 * Requires a regular authenticated request (Authorization header). Returns a
 * short-lived token (5 minutes) with a `purpose: 'download'` claim that the
 * frontend can append as a `?token=` query parameter for downloads and media
 * URLs (<img src>, <audio src>, window.open, PDF viewer) where no
 * Authorization header can be set.
 *
 * NOTE: this router must be registered in index.ts:
 *   app.use('/api/download-token', downloadTokenRoutes);
 */
const router = Router();

router.post('/', authenticateToken, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const token = generateDownloadToken(user.id, user.associationId, user.role, user.email);
  res.json({
    token,
    expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS,
  });
});

const bronTokenSchema = z.object({
  soort: z.enum(BRONSOORTEN),
  id: z.string().min(1).max(255),
});

/**
 * Bestaat deze bron in de vereniging van de aanvrager? Per soort de vraag die
 * ook de downloadroute zelf stelt.
 */
const BRON_BESTAAT: Record<Bronsoort, (id: string, associationId: string | null) => boolean> = {
  mp3: (id, associationId) =>
    Boolean(
      db
        .prepare('SELECT 1 FROM music_titles WHERE mp3_file_path = ? AND association_id = ? AND deleted_at IS NULL')
        .get(id, associationId),
    ),
};

/**
 * POST /api/download-token/bron  { soort: 'mp3', id: '<bestandsnaam>' }
 *
 * Een token voor één bron, dat alleen de bijbehorende downloadroute aanneemt
 * (authenticateBronDownload), vijf minuten geldig en gebonden aan deze
 * gebruiker, vereniging en sessie. Voor <audio src>, dat geen kopregel kan
 * meesturen.
 */
router.post(
  '/bron',
  authenticateToken,
  validate(bronTokenSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { soort, id } = req.body as z.infer<typeof bronTokenSchema>;
    const user = req.user!;

    // authenticateToken heeft hier een sessietoken uit de kopregel aanvaard:
    // een download-token geldt niet bij POST, een token in de URL evenmin.
    const authHeader = req.headers.authorization;
    const sessietoken = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    if (!sessietoken) {
      throw new ApiError(401, 'Een download-token vraagt een sessie.');
    }

    if (!BRON_BESTAAT[soort](id, user.associationId)) {
      throw new ApiError(404, 'Niet gevonden.');
    }

    const token = maakBronToken({
      soort,
      bronId: id,
      userId: user.id,
      associationId: user.associationId,
      rol: user.role,
      sessieHash: hashToken(sessietoken),
    });
    res.json({ token, expiresIn: BRON_TOKEN_GELDIG_SECONDEN });
  }),
);

export default router;
