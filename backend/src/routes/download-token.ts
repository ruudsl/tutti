import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { generateDownloadToken, DOWNLOAD_TOKEN_TTL_SECONDS } from '../utils/downloadToken';

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

export default router;
