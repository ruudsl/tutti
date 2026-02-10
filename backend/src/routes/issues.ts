import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @swagger
 * /issues:
 *   get:
 *     summary: Get all reported issues
 *     tags: [Issues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, in_review, resolved, rejected, all]
 *       - in: query
 *         name: pieceId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of issues
 */
router.get('/', authenticateToken, requireRole('music_committee', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status, pieceId } = req.query;

  let query = `
    SELECT
      pi.id,
      pi.music_piece_id,
      pi.page_number,
      pi.measure_number,
      pi.description,
      pi.status,
      pi.resolution_notes,
      pi.resolved_at,
      pi.created_at,
      mp.title as piece_title,
      mp.arranger as piece_arranger,
      i.name as instrument_name,
      u.first_name || ' ' || u.last_name as reported_by_name,
      u.email as reported_by_email,
      ru.first_name || ' ' || ru.last_name as resolved_by_name
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    LEFT JOIN instruments i ON mp.instrument_id = i.id
    JOIN users u ON pi.reported_by = u.id
    LEFT JOIN users ru ON pi.resolved_by = ru.id
    WHERE mp.association_id = ?
  `;

  const params: any[] = [req.user!.associationId];

  if (status && status !== 'all') {
    query += ' AND pi.status = ?';
    params.push(status);
  }

  if (pieceId) {
    query += ' AND pi.music_piece_id = ?';
    params.push(pieceId);
  }

  query += ' ORDER BY pi.created_at DESC';

  const issues = db.prepare(query).all(...params);
  res.json(issues);
}));

// Get my reported issues (for regular members)
router.get('/my-issues', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const query = `
    SELECT
      pi.id,
      pi.music_piece_id,
      pi.page_number,
      pi.measure_number,
      pi.description,
      pi.status,
      pi.resolution_notes,
      pi.resolved_at,
      pi.created_at,
      mp.title as piece_title,
      mp.arranger as piece_arranger,
      i.name as instrument_name
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    LEFT JOIN instruments i ON mp.instrument_id = i.id
    WHERE pi.reported_by = ?
    ORDER BY pi.created_at DESC
  `;

  const issues = db.prepare(query).all(req.user!.id);
  res.json(issues);
}));

// Get issue statistics
router.get('/stats', authenticateToken, requireRole('music_committee', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status = 'in_review' THEN 1 ELSE 0 END) as in_review,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    WHERE mp.association_id = ?
  `).get(req.user!.associationId);

  res.json(stats);
}));

/**
 * @swagger
 * /issues:
 *   post:
 *     summary: Report a new issue on a music piece
 *     tags: [Issues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [musicPieceId, description]
 *             properties:
 *               musicPieceId:
 *                 type: string
 *               pageNumber:
 *                 type: integer
 *               measureNumber:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Issue created
 *       404:
 *         description: Music piece not found
 */
router.post('/', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { musicPieceId, pageNumber, measureNumber, description } = req.body;

  if (!musicPieceId || !description) {
    return res.status(400).json({ error: 'Muziekstuk en beschrijving zijn verplicht' });
  }

  // Verify the music piece exists and user has access
  const piece = db.prepare(`
    SELECT mp.id
    FROM music_pieces mp
    WHERE mp.id = ? AND mp.association_id = ?
  `).get(musicPieceId, req.user!.associationId);

  if (!piece) {
    return res.status(404).json({ error: 'Muziekstuk niet gevonden' });
  }

  const issueId = uuidv4();

  db.prepare(`
    INSERT INTO piece_issues (id, music_piece_id, reported_by, page_number, measure_number, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(issueId, musicPieceId, req.user!.id, pageNumber || null, measureNumber || null, description);

  const issue = db.prepare(`
    SELECT
      pi.*,
      mp.title as piece_title,
      u.first_name || ' ' || u.last_name as reported_by_name
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    JOIN users u ON pi.reported_by = u.id
    WHERE pi.id = ?
  `).get(issueId);

  res.status(201).json(issue);
}));

// Update issue status (music committee/admin only)
router.patch('/:id/status', authenticateToken, requireRole('music_committee', 'admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, resolutionNotes } = req.body;

  if (!status || !['open', 'in_review', 'resolved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Ongeldige status' });
  }

  // Verify the issue exists and belongs to user's association
  const issue = db.prepare(`
    SELECT pi.id
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    WHERE pi.id = ? AND mp.association_id = ?
  `).get(id, req.user!.associationId);

  if (!issue) {
    return res.status(404).json({ error: 'Melding niet gevonden' });
  }

  if (status === 'resolved' || status === 'rejected') {
    db.prepare(`
      UPDATE piece_issues
      SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, resolutionNotes || null, req.user!.id, id);
  } else {
    db.prepare(`
      UPDATE piece_issues
      SET status = ?, resolution_notes = NULL, resolved_by = NULL, resolved_at = NULL
      WHERE id = ?
    `).run(status, id);
  }

  const updated = db.prepare(`
    SELECT
      pi.*,
      mp.title as piece_title,
      u.first_name || ' ' || u.last_name as reported_by_name,
      ru.first_name || ' ' || ru.last_name as resolved_by_name
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    JOIN users u ON pi.reported_by = u.id
    LEFT JOIN users ru ON pi.resolved_by = ru.id
    WHERE pi.id = ?
  `).get(id);

  res.json(updated);
}));

// Delete issue (admin only or reporter can delete their own open issues)
router.delete('/:id', authenticateToken, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const issue = db.prepare(`
    SELECT pi.*, mp.association_id
    FROM piece_issues pi
    JOIN music_pieces mp ON pi.music_piece_id = mp.id
    WHERE pi.id = ?
  `).get(id) as any;

  if (!issue) {
    return res.status(404).json({ error: 'Melding niet gevonden' });
  }

  // Check permissions
  const isAdmin = req.user!.role === 'admin';
  const isOwnOpenIssue = issue.reported_by === req.user!.id && issue.status === 'open';
  const isSameAssociation = issue.association_id === req.user!.associationId;

  if (!isSameAssociation || (!isAdmin && !isOwnOpenIssue)) {
    return res.status(403).json({ error: 'Geen toegang om deze melding te verwijderen' });
  }

  db.prepare('DELETE FROM piece_issues WHERE id = ?').run(id);
  res.json({ success: true });
}));

export default router;
