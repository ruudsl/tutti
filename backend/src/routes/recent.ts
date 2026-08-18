import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';

const router = Router();

/**
 * @swagger
 * /recent:
 *   get:
 *     summary: Get recently viewed items
 *     tags: [Recent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [music_piece, music_title, music_list, rehearsal, concert]
 *         description: Filter by item type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: Number of items to return (default 20)
 *     responses:
 *       200:
 *         description: List of recently viewed items
 */
router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { type, limit = '20' } = req.query;

    let query = `
        SELECT id, item_type, item_id, item_title, viewed_at
        FROM user_recent_views
        WHERE user_id = ?
    `;
    const params: any[] = [req.user!.id];

    if (type) {
      query += ' AND item_type = ?';
      params.push(type);
    }

    query += ' ORDER BY viewed_at DESC LIMIT ?';
    params.push(Math.min(parseInt(limit as string) || 20, 50));

    const items = db.prepare(query).all(...params);

    res.json(
      items.map((i: any) => ({
        id: i.id,
        itemType: i.item_type,
        itemId: i.item_id,
        itemTitle: i.item_title,
        viewedAt: i.viewed_at,
      })),
    );
  }),
);

/**
 * @swagger
 * /recent:
 *   post:
 *     summary: Record a view of an item
 *     tags: [Recent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemType
 *               - itemId
 *               - itemTitle
 *             properties:
 *               itemType:
 *                 type: string
 *                 enum: [music_piece, music_title, music_list, rehearsal, concert]
 *               itemId:
 *                 type: string
 *               itemTitle:
 *                 type: string
 *     responses:
 *       201:
 *         description: View recorded
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { itemType, itemId, itemTitle } = req.body;

    if (!itemType || !itemId || !itemTitle) {
      res.status(400).json({ error: 'itemType, itemId en itemTitle zijn verplicht.' });
      return;
    }

    // Remove existing view of the same item to update timestamp
    db.prepare('DELETE FROM user_recent_views WHERE user_id = ? AND item_type = ? AND item_id = ?').run(
      req.user!.id,
      itemType,
      itemId,
    );

    // Insert new view
    const id = uuidv4();
    db.prepare(
      'INSERT INTO user_recent_views (id, user_id, item_type, item_id, item_title) VALUES (?, ?, ?, ?, ?)',
    ).run(id, req.user!.id, itemType, itemId, itemTitle);

    // Keep only last 100 views per user
    db.prepare(
      `
        DELETE FROM user_recent_views
        WHERE user_id = ? AND id NOT IN (
            SELECT id FROM user_recent_views WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 100
        )
    `,
    ).run(req.user!.id, req.user!.id);

    res.status(201).json({ message: 'Bekeken item opgeslagen.' });
  }),
);

/**
 * @swagger
 * /recent:
 *   delete:
 *     summary: Clear recent view history
 *     tags: [Recent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: History cleared
 */
router.delete(
  '/',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare('DELETE FROM user_recent_views WHERE user_id = ?').run(req.user!.id);
    res.json({ message: 'Geschiedenis gewist.' });
  }),
);

export default router;
