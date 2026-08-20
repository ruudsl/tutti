/**
 * Modules aan- en uitzetten per vereniging.
 *
 * Elke ingelogde gebruiker mag de lijst met actieve modules lezen: de frontend
 * heeft die nodig om navigatie en routes te verbergen. Wijzigen mag alleen een
 * beheerder.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { getEnabledModuleKeys, getModuleStates, setModuleEnabled } from '../modules/service';
import { isKnownModule } from '../modules/registry';

const router = Router();

const toggleSchema = z.object({
  enabled: z.boolean(),
});

/**
 * @swagger
 * /modules:
 *   get:
 *     summary: Sleutels van de modules die voor deze vereniging aan staan
 *     tags: [Modules]
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json({ enabled: getEnabledModuleKeys(req.user!.associationId) });
  }),
);

/**
 * @swagger
 * /modules/settings:
 *   get:
 *     summary: Alle modules met omschrijving en huidige stand (beheer)
 *     tags: [Modules]
 */
router.get(
  '/settings',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(
      getModuleStates(req.user!.associationId).map((m) => ({
        key: m.key,
        category: m.category,
        title: m.title,
        description: m.description,
        enabled: m.enabled,
        navPaths: m.navPaths,
      })),
    );
  }),
);

/**
 * @swagger
 * /modules/{key}:
 *   put:
 *     summary: Zet een module aan of uit (beheer)
 *     tags: [Modules]
 */
router.put(
  '/:key',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { key } = req.params;

    if (!isKnownModule(key)) {
      throw new ApiError(404, 'Module niet gevonden.');
    }

    const associationId = req.user!.associationId;
    if (!associationId) {
      throw new ApiError(400, 'Geen vereniging gekoppeld aan dit account.');
    }

    const { enabled } = toggleSchema.parse(req.body);
    setModuleEnabled(associationId, key, enabled, req.user!.id);

    res.json({ key, enabled });
  }),
);

export default router;
