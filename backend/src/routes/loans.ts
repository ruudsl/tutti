import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * @swagger
 * /loans:
 *   get:
 *     summary: Get all music title loans
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, overdue, returned, all]
 *     responses:
 *       200:
 *         description: List of loans
 */
router.get(
  '/',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
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

    const params: any[] = [req.user!.associationId];

    if (status && status !== 'all') {
      query += ' AND l.status = ?';
      params.push(status);
    }

    query += ' ORDER BY l.date_out DESC';

    const loans = db.prepare(query).all(...params);
    res.json(loans);
  }),
);

// Get loan statistics
router.get(
  '/stats',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const stats = db
      .prepare(
        `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE mt.association_id = ?
  `,
      )
      .get(req.user!.associationId);

    // Update overdue loans
    db.prepare(
      `
    UPDATE loans
    SET status = 'overdue'
    WHERE status = 'active'
      AND expected_return IS NOT NULL
      AND expected_return < date('now')
      AND music_title_id IN (
        SELECT id FROM music_titles WHERE association_id = ?
      )
  `,
    ).run(req.user!.associationId);

    res.json(stats);
  }),
);

// Get titles available for lending
router.get(
  '/available-titles',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
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

    const params: any[] = [req.user!.associationId];

    if (search) {
      query += ' AND (mt.title LIKE ? OR mt.arranger LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY mt.title LIMIT 50';

    const titles = db.prepare(query).all(...params);
    res.json(titles);
  }),
);

/**
 * @swagger
 * /loans:
 *   post:
 *     summary: Create a new loan
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [musicTitleId, borrowerName]
 *             properties:
 *               musicTitleId:
 *                 type: string
 *               borrowerName:
 *                 type: string
 *               borrowerEmail:
 *                 type: string
 *               borrowerOrganization:
 *                 type: string
 *               notes:
 *                 type: string
 *               expectedReturn:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Loan created
 *       404:
 *         description: Title not found
 */
router.post(
  '/',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { musicTitleId, borrowerName, borrowerEmail, borrowerOrganization, notes, expectedReturn } = req.body;

    if (!musicTitleId || !borrowerName) {
      return res.status(400).json({ error: 'Titel en naam van lener zijn verplicht' });
    }

    // Verify the title exists and belongs to user's association
    const title = db
      .prepare(
        `
    SELECT id FROM music_titles WHERE id = ? AND association_id = ?
  `,
      )
      .get(musicTitleId, req.user!.associationId);

    if (!title) {
      return res.status(404).json({ error: 'Titel niet gevonden' });
    }

    const loanId = uuidv4();

    db.prepare(
      `
    INSERT INTO loans (id, music_title_id, borrower_name, borrower_email, borrower_organization, notes, expected_return, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    ).run(
      loanId,
      musicTitleId,
      borrowerName,
      borrowerEmail || null,
      borrowerOrganization || null,
      notes || null,
      expectedReturn || null,
      req.user!.id,
    );

    const loan = db
      .prepare(
        `
    SELECT
      l.*,
      mt.title as title_name,
      mt.arranger as title_arranger
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ?
  `,
      )
      .get(loanId);

    res.status(201).json(loan);
  }),
);

// Update a loan
router.put(
  '/:id',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { borrowerName, borrowerEmail, borrowerOrganization, notes, expectedReturn } = req.body;

    // Verify the loan exists and belongs to user's association
    const loan = db
      .prepare(
        `
    SELECT l.id
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ? AND mt.association_id = ?
  `,
      )
      .get(id, req.user!.associationId);

    if (!loan) {
      return res.status(404).json({ error: 'Uitlening niet gevonden' });
    }

    // Alleen bijwerken wat het verzoek noemt.
    //
    // Hiervoor stond de naam op COALESCE en de vier andere velden niet, dus
    // wie alleen de notitie aanpaste wiste het e-mailadres, de organisatie en
    // de verwachte retourdatum van de lener. De frontend stuurt die velden
    // allemaal als optioneel mee, dus dat gebeurde bij gewoon gebruik.
    //
    // Een veld dat wel wordt meegestuurd maar leeg is, wordt nog steeds
    // leeggemaakt: dat is de manier om een e-mailadres weg te halen.
    const velden: Record<string, unknown> = {
      borrower_name: borrowerName,
      borrower_email: borrowerEmail,
      borrower_organization: borrowerOrganization,
      notes: notes,
      expected_return: expectedReturn,
    };

    const toewijzingen: string[] = [];
    const waarden: unknown[] = [];

    for (const [kolom, waarde] of Object.entries(velden)) {
      if (waarde === undefined) continue;
      toewijzingen.push(`${kolom} = ?`);
      waarden.push(waarde === '' ? null : waarde);
    }

    if (toewijzingen.length > 0) {
      db.prepare(`UPDATE loans SET ${toewijzingen.join(', ')} WHERE id = ?`).run(...waarden, id);
    }

    const updated = db
      .prepare(
        `
    SELECT
      l.*,
      mt.title as title_name,
      mt.arranger as title_arranger
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ?
  `,
      )
      .get(id);

    res.json(updated);
  }),
);

/**
 * @swagger
 * /loans/{id}/return:
 *   post:
 *     summary: Mark a loan as returned
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loan marked as returned
 *       400:
 *         description: Loan already returned
 *       404:
 *         description: Loan not found
 */
router.post(
  '/:id/return',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify the loan exists and belongs to user's association
    const loan = db
      .prepare(
        `
    SELECT l.id, l.status
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ? AND mt.association_id = ?
  `,
      )
      .get(id, req.user!.associationId) as any;

    if (!loan) {
      return res.status(404).json({ error: 'Uitlening niet gevonden' });
    }

    if (loan.status === 'returned') {
      return res.status(400).json({ error: 'Uitlening is al geretourneerd' });
    }

    db.prepare(
      `
    UPDATE loans
    SET status = 'returned', date_returned = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
    ).run(id);

    const updated = db
      .prepare(
        `
    SELECT
      l.*,
      mt.title as title_name,
      mt.arranger as title_arranger
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ?
  `,
      )
      .get(id);

    res.json(updated);
  }),
);

// Delete a loan
router.delete(
  '/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    // Verify the loan exists and belongs to user's association
    const loan = db
      .prepare(
        `
    SELECT l.id
    FROM loans l
    JOIN music_titles mt ON l.music_title_id = mt.id
    WHERE l.id = ? AND mt.association_id = ?
  `,
      )
      .get(id, req.user!.associationId);

    if (!loan) {
      return res.status(404).json({ error: 'Uitlening niet gevonden' });
    }

    db.prepare('DELETE FROM loans WHERE id = ?').run(id);
    res.json({ success: true });
  }),
);

/**
 * @swagger
 * /loans/title/{titleId}/history:
 *   get:
 *     summary: Get loan history for a specific title
 *     tags: [Loans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: titleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loan history for the title
 */
router.get(
  '/title/:titleId/history',
  authenticateToken,
  requireRole('music_committee', 'admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { titleId } = req.params;

    // Verify title belongs to user's association
    const title = db
      .prepare(
        `
    SELECT id, title, arranger FROM music_titles WHERE id = ? AND association_id = ?
  `,
      )
      .get(titleId, req.user!.associationId) as { id: string; title: string; arranger: string | null } | undefined;

    if (!title) {
      return res.status(404).json({ error: 'Titel niet gevonden' });
    }

    const loans = db
      .prepare(
        `
    SELECT
      l.id,
      l.borrower_name,
      l.borrower_email,
      l.borrower_organization,
      l.notes,
      l.date_out,
      l.expected_return,
      l.date_returned,
      l.status,
      l.created_at,
      u.first_name || ' ' || u.last_name as created_by_name
    FROM loans l
    JOIN users u ON l.created_by = u.id
    WHERE l.music_title_id = ?
    ORDER BY l.date_out DESC
  `,
      )
      .all(titleId);

    // Calculate statistics
    const totalLoans = loans.length;
    const activeLoans = loans.filter((l: any) => l.status === 'active' || l.status === 'overdue').length;
    const avgLoanDurationDays =
      loans
        .filter((l: any) => l.date_returned)
        .map((l: any) => {
          const start = new Date(l.date_out);
          const end = new Date(l.date_returned);
          return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        })
        .reduce((sum, days, _, arr) => sum + days / arr.length, 0) || 0;

    res.json({
      title: {
        id: title.id,
        title: title.title,
        arranger: title.arranger,
      },
      statistics: {
        totalLoans,
        activeLoans,
        avgLoanDurationDays: Math.round(avgLoanDurationDays),
      },
      loans: loans.map((l: any) => ({
        id: l.id,
        borrowerName: l.borrower_name,
        borrowerEmail: l.borrower_email,
        borrowerOrganization: l.borrower_organization,
        notes: l.notes,
        dateOut: l.date_out,
        expectedReturn: l.expected_return,
        dateReturned: l.date_returned,
        status: l.status,
        createdAt: l.created_at,
        createdByName: l.created_by_name,
      })),
    });
  }),
);

export default router;
