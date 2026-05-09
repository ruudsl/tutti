import { Router, Response } from 'express';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.use(authenticateToken);

// GET /api/performances/history - Get performance history for a piece
router.get('/history', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const titleId = req.query.titleId as string;
  const title = req.query.title as string;

  if (!titleId && !title) {
    res.status(400).json({ error: 'Either titleId or title query parameter is required' });
    return;
  }

  let query = `
    SELECT
      cp.id,
      cp.title,
      cp.composer,
      cp.arranger,
      c.id as concert_id,
      c.name as concert_name,
      c.date as concert_date,
      c.location as concert_location,
      c.concert_type
    FROM concert_program cp
    JOIN concerts c ON cp.concert_id = c.id
    WHERE c.association_id = ?
  `;
  const params: any[] = [associationId];

  if (titleId) {
    query += ` AND cp.music_title_id = ?`;
    params.push(titleId);
  } else if (title) {
    query += ` AND cp.title LIKE ?`;
    params.push(`%${title}%`);
  }

  query += ` ORDER BY c.date DESC`;

  const performances = db.prepare(query).all(...params);

  res.json(performances.map((p: any) => ({
    id: p.id,
    title: p.title,
    composer: p.composer,
    arranger: p.arranger,
    concertId: p.concert_id,
    concertName: p.concert_name,
    concertDate: p.concert_date,
    concertLocation: p.concert_location,
    concertType: p.concert_type,
  })));
}));

// GET /api/performances/last-played - Get when pieces were last played
router.get('/last-played', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const pieces = db.prepare(`
    SELECT
      cp.title,
      cp.composer,
      cp.music_title_id,
      MAX(c.date) as last_played,
      COUNT(*) as times_played
    FROM concert_program cp
    JOIN concerts c ON cp.concert_id = c.id
    WHERE c.association_id = ?
    GROUP BY cp.title, cp.composer, cp.music_title_id
    ORDER BY MAX(c.date) DESC
  `).all(associationId);

  res.json(pieces.map((p: any) => ({
    title: p.title,
    composer: p.composer,
    musicTitleId: p.music_title_id,
    lastPlayed: p.last_played,
    timesPlayed: p.times_played,
  })));
}));

// GET /api/performances/never-played - Get pieces in library never played
router.get('/never-played', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const pieces = db.prepare(`
    SELECT mt.id, mt.title, mt.composer
    FROM music_titles mt
    JOIN music_lists ml ON mt.list_id = ml.id
    JOIN orchestras o ON ml.orchestra_id = o.id
    WHERE o.association_id = ?
      AND mt.id NOT IN (
        SELECT DISTINCT cp.music_title_id
        FROM concert_program cp
        JOIN concerts c ON cp.concert_id = c.id
        WHERE c.association_id = ? AND cp.music_title_id IS NOT NULL
      )
    ORDER BY mt.title
  `).all(associationId, associationId);

  res.json(pieces.map((p: any) => ({
    id: p.id,
    title: p.title,
    composer: p.composer,
  })));
}));

// GET /api/performances/most-played - Get most frequently played pieces
router.get('/most-played', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const pieces = db.prepare(`
    SELECT
      cp.title,
      cp.composer,
      cp.music_title_id,
      COUNT(*) as times_played,
      MAX(c.date) as last_played,
      MIN(c.date) as first_played
    FROM concert_program cp
    JOIN concerts c ON cp.concert_id = c.id
    WHERE c.association_id = ?
    GROUP BY cp.title, cp.composer, cp.music_title_id
    ORDER BY COUNT(*) DESC
    LIMIT ?
  `).all(associationId, limit);

  res.json(pieces.map((p: any) => ({
    title: p.title,
    composer: p.composer,
    musicTitleId: p.music_title_id,
    timesPlayed: p.times_played,
    lastPlayed: p.last_played,
    firstPlayed: p.first_played,
  })));
}));

// GET /api/performances/by-year - Get performance statistics by year
router.get('/by-year', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;

  const stats = db.prepare(`
    SELECT
      strftime('%Y', c.date) as year,
      COUNT(DISTINCT c.id) as concert_count,
      COUNT(cp.id) as piece_count,
      COUNT(DISTINCT cp.title) as unique_pieces
    FROM concerts c
    LEFT JOIN concert_program cp ON cp.concert_id = c.id
    WHERE c.association_id = ?
    GROUP BY strftime('%Y', c.date)
    ORDER BY year DESC
  `).all(associationId);

  res.json(stats.map((s: any) => ({
    year: s.year,
    concertCount: s.concert_count,
    pieceCount: s.piece_count,
    uniquePieces: s.unique_pieces,
  })));
}));

// GET /api/performances/by-composer - Get performance statistics by composer
router.get('/by-composer', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const stats = db.prepare(`
    SELECT
      cp.composer,
      COUNT(*) as times_played,
      COUNT(DISTINCT cp.title) as unique_pieces,
      MAX(c.date) as last_played
    FROM concert_program cp
    JOIN concerts c ON cp.concert_id = c.id
    WHERE c.association_id = ? AND cp.composer IS NOT NULL AND cp.composer != ''
    GROUP BY cp.composer
    ORDER BY COUNT(*) DESC
    LIMIT ?
  `).all(associationId, limit);

  res.json(stats.map((s: any) => ({
    composer: s.composer,
    timesPlayed: s.times_played,
    uniquePieces: s.unique_pieces,
    lastPlayed: s.last_played,
  })));
}));

// GET /api/performances/search - Search performance history
router.get('/search', asyncHandler(async (req: AuthRequest, res: Response) => {
  const associationId = req.user!.associationId;
  const rawQuery = req.query.q;
  const query = typeof rawQuery === 'string' ? rawQuery : '';

  if (query.length < 2) {
    res.json([]);
    return;
  }

  const results = db.prepare(`
    SELECT
      cp.title,
      cp.composer,
      cp.music_title_id,
      c.name as concert_name,
      c.date as concert_date,
      c.id as concert_id
    FROM concert_program cp
    JOIN concerts c ON cp.concert_id = c.id
    WHERE c.association_id = ?
      AND (cp.title LIKE ? OR cp.composer LIKE ?)
    ORDER BY c.date DESC
    LIMIT 50
  `).all(associationId, `%${query}%`, `%${query}%`);

  res.json(results.map((r: any) => ({
    title: r.title,
    composer: r.composer,
    musicTitleId: r.music_title_id,
    concertId: r.concert_id,
    concertName: r.concert_name,
    concertDate: r.concert_date,
  })));
}));

export default router;
