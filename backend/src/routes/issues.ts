import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get all issues (for music committee/admin)
router.get('/', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
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

  const params: any[] = [authReq.user!.associationId];

  if (status && status !== 'all') {
    query += ' AND pi.status = ?';
    params.push(status);
  }

  if (pieceId) {
    query += ' AND pi.music_piece_id = ?';
    params.push(pieceId);
  }

  query += ' ORDER BY pi.created_at DESC';

  try {
    const issues = db.prepare(query).all(...params);
    res.json(issues);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ error: 'Fout bij ophalen van meldingen' });
  }
});

// Get my reported issues (for regular members)
router.get('/my-issues', authenticateToken, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

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

  try {
    const issues = db.prepare(query).all(authReq.user!.id);
    res.json(issues);
  } catch (error) {
    console.error('Error fetching my issues:', error);
    res.status(500).json({ error: 'Fout bij ophalen van mijn meldingen' });
  }
});

// Get issue statistics
router.get('/stats', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
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
    `).get(authReq.user!.associationId);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching issue stats:', error);
    res.status(500).json({ error: 'Fout bij ophalen van statistieken' });
  }
});

// Create a new issue
router.post('/', authenticateToken, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { musicPieceId, pageNumber, measureNumber, description } = req.body;

  if (!musicPieceId || !description) {
    return res.status(400).json({ error: 'Muziekstuk en beschrijving zijn verplicht' });
  }

  // Verify the music piece exists and user has access
  const piece = db.prepare(`
    SELECT mp.id
    FROM music_pieces mp
    WHERE mp.id = ? AND mp.association_id = ?
  `).get(musicPieceId, authReq.user!.associationId);

  if (!piece) {
    return res.status(404).json({ error: 'Muziekstuk niet gevonden' });
  }

  const issueId = uuidv4();

  try {
    db.prepare(`
      INSERT INTO piece_issues (id, music_piece_id, reported_by, page_number, measure_number, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(issueId, musicPieceId, authReq.user!.id, pageNumber || null, measureNumber || null, description);

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
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ error: 'Fout bij aanmaken van melding' });
  }
});

// Update issue status (music committee/admin only)
router.patch('/:id/status', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
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
  `).get(id, authReq.user!.associationId);

  if (!issue) {
    return res.status(404).json({ error: 'Melding niet gevonden' });
  }

  try {
    if (status === 'resolved' || status === 'rejected') {
      db.prepare(`
        UPDATE piece_issues
        SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, resolutionNotes || null, authReq.user!.id, id);
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
  } catch (error) {
    console.error('Error updating issue:', error);
    res.status(500).json({ error: 'Fout bij bijwerken van melding' });
  }
});

// Delete issue (admin only or reporter can delete their own open issues)
router.delete('/:id', authenticateToken, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
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
  const isAdmin = authReq.user!.role === 'admin';
  const isOwnOpenIssue = issue.reported_by === authReq.user!.id && issue.status === 'open';
  const isSameAssociation = issue.association_id === authReq.user!.associationId;

  if (!isSameAssociation || (!isAdmin && !isOwnOpenIssue)) {
    return res.status(403).json({ error: 'Geen toegang om deze melding te verwijderen' });
  }

  try {
    db.prepare('DELETE FROM piece_issues WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting issue:', error);
    res.status(500).json({ error: 'Fout bij verwijderen van melding' });
  }
});

export default router;
