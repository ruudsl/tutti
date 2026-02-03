import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get all loans
router.get('/', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { status } = req.query;

  let query = `
    SELECT
      l.id,
      l.music_title_id,
      l.borrower_name,
      l.borrower_email,
      l.borrower_organization,
      l.notes,
      l.date_out,
      l.expected_return,
      l.date_returned,
      l.status,
      l.created_at,
      mt.title as title_name,
      mt.arranger as title_arranger,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    JOIN users u ON l.created_by = u.id
    WHERE mt.association_id = ?
  `;

  const params: any[] = [authReq.user!.associationId];

  if (status && status !== 'all') {
    query += ' AND l.status = ?';
    params.push(status);
  }

  query += ' ORDER BY l.date_out DESC';

  try {
    const loans = db.prepare(query).all(...params);
    res.json(loans);
  } catch (error) {
    console.error('Error fetching loans:', error);
    res.status(500).json({ error: 'Fout bij ophalen van uitleningen' });
  }
});

// Get loan statistics
router.get('/stats', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned
      FROM loans l
      JOIN music_titles mt ON l.music_title_id = mt.id
      WHERE mt.association_id = ?
    `).get(authReq.user!.associationId);

    // Get overdue loans count (where expected_return has passed and not returned)
    const overdueCheck = db.prepare(`
      UPDATE loans
      SET status = 'overdue'
      WHERE status = 'active'
        AND expected_return IS NOT NULL
        AND expected_return < date('now')
        AND music_title_id IN (
          SELECT id FROM music_titles WHERE association_id = ?
        )
    `).run(authReq.user!.associationId);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching loan stats:', error);
    res.status(500).json({ error: 'Fout bij ophalen van statistieken' });
  }
});

// Get titles available for lending
router.get('/available-titles', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { search } = req.query;

  let query = `
    SELECT
      mt.id,
      mt.title,
      mt.arranger,
      (SELECT COUNT(*) FROM loans l WHERE l.music_title_id = mt.id AND l.status IN ('active', 'overdue')) as active_loans
    FROM music_titles mt
    WHERE mt.association_id = ?
  `;

  const params: any[] = [authReq.user!.associationId];

  if (search) {
    query += ' AND (mt.title LIKE ? OR mt.arranger LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY mt.title LIMIT 50';

  try {
    const titles = db.prepare(query).all(...params);
    res.json(titles);
  } catch (error) {
    console.error('Error fetching available titles:', error);
    res.status(500).json({ error: 'Fout bij ophalen van titels' });
  }
});

// Create a new loan
router.post('/', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { musicTitleId, borrowerName, borrowerEmail, borrowerOrganization, notes, expectedReturn } = req.body;

  if (!musicTitleId || !borrowerName) {
    return res.status(400).json({ error: 'Titel en naam van lener zijn verplicht' });
  }

  // Verify the title exists and belongs to user's association
  const title = db.prepare(`
    SELECT id FROM music_titles WHERE id = ? AND association_id = ?
  `).get(musicTitleId, authReq.user!.associationId);

  if (!title) {
    return res.status(404).json({ error: 'Titel niet gevonden' });
  }

  const loanId = uuidv4();

  try {
    db.prepare(`
      INSERT INTO loans (id, music_title_id, borrower_name, borrower_email, borrower_organization, notes, expected_return, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      loanId,
      musicTitleId,
      borrowerName,
      borrowerEmail || null,
      borrowerOrganization || null,
      notes || null,
      expectedReturn || null,
      authReq.user!.id
    );

    const loan = db.prepare(`
      SELECT
        l.*,
        mt.title as title_name,
        mt.arranger as title_arranger
      FROM loans l
      JOIN music_titles mt ON l.music_title_id = mt.id
      WHERE l.id = ?
    `).get(loanId);

    res.status(201).json(loan);
  } catch (error) {
    console.error('Error creating loan:', error);
    res.status(500).json({ error: 'Fout bij aanmaken van uitlening' });
  }
});

// Update a loan
router.put('/:id', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  const { borrowerName, borrowerEmail, borrowerOrganization, notes, expectedReturn } = req.body;

  // Verify the loan exists and belongs to user's association
  const loan = db.prepare(`
    SELECT l.id
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ? AND mt.association_id = ?
  `).get(id, authReq.user!.associationId);

  if (!loan) {
    return res.status(404).json({ error: 'Uitlening niet gevonden' });
  }

  try {
    db.prepare(`
      UPDATE loans
      SET borrower_name = COALESCE(?, borrower_name),
          borrower_email = ?,
          borrower_organization = ?,
          notes = ?,
          expected_return = ?
      WHERE id = ?
    `).run(
      borrowerName,
      borrowerEmail || null,
      borrowerOrganization || null,
      notes || null,
      expectedReturn || null,
      id
    );

    const updated = db.prepare(`
      SELECT
        l.*,
        mt.title as title_name,
        mt.arranger as title_arranger
      FROM loans l
      JOIN music_titles mt ON l.music_title_id = mt.id
      WHERE l.id = ?
    `).get(id);

    res.json(updated);
  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({ error: 'Fout bij bijwerken van uitlening' });
  }
});

// Return a loan
router.post('/:id/return', authenticateToken, requireRole('music_committee', 'admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;

  // Verify the loan exists and belongs to user's association
  const loan = db.prepare(`
    SELECT l.id, l.status
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ? AND mt.association_id = ?
  `).get(id, authReq.user!.associationId) as any;

  if (!loan) {
    return res.status(404).json({ error: 'Uitlening niet gevonden' });
  }

  if (loan.status === 'returned') {
    return res.status(400).json({ error: 'Uitlening is al geretourneerd' });
  }

  try {
    db.prepare(`
      UPDATE loans
      SET status = 'returned', date_returned = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    const updated = db.prepare(`
      SELECT
        l.*,
        mt.title as title_name,
        mt.arranger as title_arranger
      FROM loans l
      JOIN music_titles mt ON l.music_title_id = mt.id
      WHERE l.id = ?
    `).get(id);

    res.json(updated);
  } catch (error) {
    console.error('Error returning loan:', error);
    res.status(500).json({ error: 'Fout bij retourneren van uitlening' });
  }
});

// Delete a loan
router.delete('/:id', authenticateToken, requireRole('admin'), (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;

  // Verify the loan exists and belongs to user's association
  const loan = db.prepare(`
    SELECT l.id
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ? AND mt.association_id = ?
  `).get(id, authReq.user!.associationId);

  if (!loan) {
    return res.status(404).json({ error: 'Uitlening niet gevonden' });
  }

  try {
    db.prepare('DELETE FROM loans WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting loan:', error);
    res.status(500).json({ error: 'Fout bij verwijderen van uitlening' });
  }
});

export default router;
