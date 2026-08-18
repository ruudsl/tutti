import db from '../database/connection';
import logger from '../utils/logger';

/**
 * Repertoire Statistics Service
 *
 * Provides analytics and insights about the music repertoire:
 * - Track play count per music title
 * - Track last performed date
 * - Calculate time since last performance
 * - Find most/least played pieces
 * - Identify pieces not played in X months
 * - Genre distribution statistics
 * - Composer statistics
 */

export interface RepertoireOverview {
  totalTitles: number;
  playedThisYear: number;
  notPlayedOver6Months: number;
  totalPerformances: number;
  averagePerformancesPerTitle: number;
}

export interface MostPlayedPiece {
  id: string;
  title: string;
  composer: string | null;
  arranger: string | null;
  performanceCount: number;
  lastPerformed: string | null;
  genres: string[];
}

export interface NotPlayedPiece {
  id: string;
  title: string;
  composer: string | null;
  arranger: string | null;
  lastPerformed: string | null;
  daysSinceLastPerformed: number | null;
  genres: string[];
}

export interface GenreStats {
  genreId: string;
  genreName: string;
  titleCount: number;
  totalPerformances: number;
  averagePerformances: number;
}

export interface ComposerStats {
  composer: string;
  titleCount: number;
  totalPerformances: number;
  averagePerformances: number;
  lastPerformed: string | null;
}

export interface PerformanceTimelineEntry {
  date: string;
  eventType: 'concert' | 'rehearsal';
  eventName: string;
  eventId: string;
  titleId: string | null;
  title: string;
  composer: string | null;
}

/**
 * Get the overview statistics for repertoire
 */
export function getRepertoireOverview(associationId: string, orchestraId?: string): RepertoireOverview {
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const yearAgoStr = yearAgo.toISOString().split('T')[0];

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

  // Total titles in the association
  const totalTitles = db
    .prepare(
      `
        SELECT COUNT(*) as count FROM music_titles WHERE association_id = ?
    `,
    )
    .get(associationId) as { count: number };

  // Get pieces played this year (from concerts and rehearsals)
  const playedThisYearQuery = `
        SELECT COUNT(DISTINCT title) as count FROM (
            SELECT cp.title FROM concert_program cp
            JOIN concerts c ON cp.concert_id = c.id
            WHERE c.association_id = ? AND c.date >= ?
            ${orchestraId ? 'AND EXISTS (SELECT 1 FROM music_lists ml WHERE ml.orchestra_id = ?)' : ''}
            UNION
            SELECT rp.title FROM rehearsal_pieces rp
            JOIN rehearsals r ON rp.rehearsal_id = r.id
            WHERE r.association_id = ? AND r.date >= ?
            ${orchestraId ? 'AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)' : ''}
        )
    `;
  const playedThisYearParams = orchestraId
    ? [associationId, yearAgoStr, orchestraId, associationId, yearAgoStr, orchestraId]
    : [associationId, yearAgoStr, associationId, yearAgoStr];
  const playedThisYear = db.prepare(playedThisYearQuery).get(...playedThisYearParams) as { count: number };

  // Get pieces not played in over 6 months
  // First get all titles, then exclude ones that have been played recently
  const notPlayedQuery = `
        SELECT COUNT(*) as count FROM music_titles mt
        WHERE mt.association_id = ?
        AND NOT EXISTS (
            SELECT 1 FROM concert_program cp
            JOIN concerts c ON cp.concert_id = c.id
            WHERE (cp.music_title_id = mt.id OR LOWER(cp.title) = LOWER(mt.title))
            AND c.association_id = ? AND c.date >= ?
        )
        AND NOT EXISTS (
            SELECT 1 FROM rehearsal_pieces rp
            JOIN rehearsals r ON rp.rehearsal_id = r.id
            WHERE LOWER(rp.title) = LOWER(mt.title)
            AND r.association_id = ? AND r.date >= ?
        )
    `;
  const notPlayedOver6Months = db
    .prepare(notPlayedQuery)
    .get(associationId, associationId, sixMonthsAgoStr, associationId, sixMonthsAgoStr) as { count: number };

  // Total performances (concerts + rehearsals with pieces)
  const totalPerformancesQuery = `
        SELECT
            (SELECT COUNT(*) FROM concert_program cp
             JOIN concerts c ON cp.concert_id = c.id
             WHERE c.association_id = ?) +
            (SELECT COUNT(*) FROM rehearsal_pieces rp
             JOIN rehearsals r ON rp.rehearsal_id = r.id
             WHERE r.association_id = ?) as count
    `;
  const totalPerformances = db.prepare(totalPerformancesQuery).get(associationId, associationId) as { count: number };

  const avgPerformances =
    totalTitles.count > 0 ? Math.round((totalPerformances.count / totalTitles.count) * 10) / 10 : 0;

  return {
    totalTitles: totalTitles.count,
    playedThisYear: playedThisYear.count,
    notPlayedOver6Months: notPlayedOver6Months.count,
    totalPerformances: totalPerformances.count,
    averagePerformancesPerTitle: avgPerformances,
  };
}

/**
 * Get the most played pieces
 */
export function getMostPlayedPieces(
  associationId: string,
  limit: number = 20,
  orchestraId?: string,
): MostPlayedPiece[] {
  // Count performances from both concerts and rehearsals
  const query = `
        WITH performance_counts AS (
            SELECT
                COALESCE(cp.music_title_id, mt.id) as title_id,
                COALESCE(mt.title, cp.title) as title,
                COUNT(*) as perf_count,
                MAX(c.date) as last_date
            FROM concert_program cp
            JOIN concerts c ON cp.concert_id = c.id
            LEFT JOIN music_titles mt ON cp.music_title_id = mt.id OR LOWER(cp.title) = LOWER(mt.title)
            WHERE c.association_id = ?
            ${orchestraId ? 'AND EXISTS (SELECT 1 FROM user_orchestras uo WHERE uo.orchestra_id = ?)' : ''}
            GROUP BY COALESCE(cp.music_title_id, mt.id), COALESCE(mt.title, cp.title)

            UNION ALL

            SELECT
                mt.id as title_id,
                COALESCE(mt.title, rp.title) as title,
                COUNT(*) as perf_count,
                MAX(r.date) as last_date
            FROM rehearsal_pieces rp
            JOIN rehearsals r ON rp.rehearsal_id = r.id
            LEFT JOIN music_titles mt ON LOWER(rp.title) = LOWER(mt.title) AND mt.association_id = r.association_id
            WHERE r.association_id = ?
            ${orchestraId ? 'AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)' : ''}
            GROUP BY mt.id, COALESCE(mt.title, rp.title)
        ),
        aggregated AS (
            SELECT
                title_id,
                title,
                SUM(perf_count) as total_performances,
                MAX(last_date) as last_performed
            FROM performance_counts
            GROUP BY title_id, title
        )
        SELECT
            a.title_id as id,
            a.title,
            mt.composer,
            mt.arranger,
            a.total_performances as performanceCount,
            a.last_performed as lastPerformed,
            GROUP_CONCAT(g.name) as genres
        FROM aggregated a
        LEFT JOIN music_titles mt ON a.title_id = mt.id
        LEFT JOIN music_title_genres mtg ON mt.id = mtg.music_title_id
        LEFT JOIN genres g ON mtg.genre_id = g.id
        GROUP BY a.title_id, a.title, mt.composer, mt.arranger, a.total_performances, a.last_performed
        ORDER BY a.total_performances DESC
        LIMIT ?
    `;

  const params = orchestraId
    ? [associationId, orchestraId, associationId, orchestraId, limit]
    : [associationId, associationId, limit];

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id || '',
    title: row.title,
    composer: row.composer,
    arranger: row.arranger,
    performanceCount: row.performanceCount,
    lastPerformed: row.lastPerformed,
    genres: row.genres ? row.genres.split(',') : [],
  }));
}

/**
 * Get pieces that haven't been played recently
 */
export function getNotPlayedPieces(
  associationId: string,
  months: number = 6,
  limit: number = 50,
  orchestraId?: string,
): NotPlayedPiece[] {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const query = `
        WITH last_performances AS (
            SELECT
                mt.id as title_id,
                MAX(c.date) as last_concert,
                MAX(r.date) as last_rehearsal
            FROM music_titles mt
            LEFT JOIN concert_program cp ON cp.music_title_id = mt.id OR LOWER(cp.title) = LOWER(mt.title)
            LEFT JOIN concerts c ON cp.concert_id = c.id AND c.association_id = mt.association_id
            LEFT JOIN rehearsal_pieces rp ON LOWER(rp.title) = LOWER(mt.title)
            LEFT JOIN rehearsals r ON rp.rehearsal_id = r.id AND r.association_id = mt.association_id
            WHERE mt.association_id = ?
            GROUP BY mt.id
        )
        SELECT
            mt.id,
            mt.title,
            mt.composer,
            mt.arranger,
            MAX(COALESCE(lp.last_concert, lp.last_rehearsal)) as lastPerformed,
            CASE
                WHEN MAX(COALESCE(lp.last_concert, lp.last_rehearsal)) IS NULL THEN NULL
                ELSE CAST(julianday(?) - julianday(MAX(COALESCE(lp.last_concert, lp.last_rehearsal))) AS INTEGER)
            END as daysSinceLastPerformed,
            GROUP_CONCAT(DISTINCT g.name) as genres
        FROM music_titles mt
        LEFT JOIN last_performances lp ON mt.id = lp.title_id
        LEFT JOIN music_title_genres mtg ON mt.id = mtg.music_title_id
        LEFT JOIN genres g ON mtg.genre_id = g.id
        WHERE mt.association_id = ?
        AND (
            MAX(COALESCE(lp.last_concert, lp.last_rehearsal)) IS NULL
            OR MAX(COALESCE(lp.last_concert, lp.last_rehearsal)) < ?
        )
        GROUP BY mt.id, mt.title, mt.composer, mt.arranger
        ORDER BY lastPerformed ASC NULLS FIRST, mt.title ASC
        LIMIT ?
    `;

  const rows = db.prepare(query).all(associationId, today, associationId, cutoffDateStr, limit) as any[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    composer: row.composer,
    arranger: row.arranger,
    lastPerformed: row.lastPerformed,
    daysSinceLastPerformed: row.daysSinceLastPerformed,
    genres: row.genres ? row.genres.split(',') : [],
  }));
}

/**
 * Get statistics by genre
 */
export function getStatsByGenre(associationId: string, orchestraId?: string): GenreStats[] {
  const query = `
        WITH genre_performances AS (
            SELECT
                g.id as genre_id,
                g.name as genre_name,
                mt.id as title_id,
                (
                    SELECT COUNT(*) FROM concert_program cp
                    JOIN concerts c ON cp.concert_id = c.id
                    WHERE (cp.music_title_id = mt.id OR LOWER(cp.title) = LOWER(mt.title))
                    AND c.association_id = ?
                ) + (
                    SELECT COUNT(*) FROM rehearsal_pieces rp
                    JOIN rehearsals r ON rp.rehearsal_id = r.id
                    WHERE LOWER(rp.title) = LOWER(mt.title)
                    AND r.association_id = ?
                ) as performance_count
            FROM genres g
            JOIN music_title_genres mtg ON g.id = mtg.genre_id
            JOIN music_titles mt ON mtg.music_title_id = mt.id
            WHERE mt.association_id = ?
        )
        SELECT
            genre_id as genreId,
            genre_name as genreName,
            COUNT(DISTINCT title_id) as titleCount,
            SUM(performance_count) as totalPerformances,
            ROUND(CAST(SUM(performance_count) AS REAL) / COUNT(DISTINCT title_id), 1) as averagePerformances
        FROM genre_performances
        GROUP BY genre_id, genre_name
        ORDER BY totalPerformances DESC
    `;

  const rows = db.prepare(query).all(associationId, associationId, associationId) as any[];

  return rows.map((row) => ({
    genreId: row.genreId,
    genreName: row.genreName,
    titleCount: row.titleCount,
    totalPerformances: row.totalPerformances || 0,
    averagePerformances: row.averagePerformances || 0,
  }));
}

/**
 * Get statistics by composer
 */
export function getStatsByComposer(associationId: string, limit: number = 30): ComposerStats[] {
  const query = `
        WITH composer_data AS (
            SELECT
                mt.composer,
                mt.id as title_id,
                mt.title,
                (
                    SELECT MAX(c.date) FROM concert_program cp
                    JOIN concerts c ON cp.concert_id = c.id
                    WHERE (cp.music_title_id = mt.id OR LOWER(cp.title) = LOWER(mt.title))
                    AND c.association_id = ?
                ) as last_concert,
                (
                    SELECT MAX(r.date) FROM rehearsal_pieces rp
                    JOIN rehearsals r ON rp.rehearsal_id = r.id
                    WHERE LOWER(rp.title) = LOWER(mt.title)
                    AND r.association_id = ?
                ) as last_rehearsal,
                (
                    SELECT COUNT(*) FROM concert_program cp
                    JOIN concerts c ON cp.concert_id = c.id
                    WHERE (cp.music_title_id = mt.id OR LOWER(cp.title) = LOWER(mt.title))
                    AND c.association_id = ?
                ) + (
                    SELECT COUNT(*) FROM rehearsal_pieces rp
                    JOIN rehearsals r ON rp.rehearsal_id = r.id
                    WHERE LOWER(rp.title) = LOWER(mt.title)
                    AND r.association_id = ?
                ) as performance_count
            FROM music_titles mt
            WHERE mt.association_id = ?
            AND mt.composer IS NOT NULL AND mt.composer != ''
        )
        SELECT
            composer,
            COUNT(DISTINCT title_id) as titleCount,
            SUM(performance_count) as totalPerformances,
            ROUND(CAST(SUM(performance_count) AS REAL) / COUNT(DISTINCT title_id), 1) as averagePerformances,
            MAX(COALESCE(last_concert, last_rehearsal)) as lastPerformed
        FROM composer_data
        GROUP BY composer
        ORDER BY totalPerformances DESC
        LIMIT ?
    `;

  const rows = db
    .prepare(query)
    .all(associationId, associationId, associationId, associationId, associationId, limit) as any[];

  return rows.map((row) => ({
    composer: row.composer,
    titleCount: row.titleCount,
    totalPerformances: row.totalPerformances || 0,
    averagePerformances: row.averagePerformances || 0,
    lastPerformed: row.lastPerformed,
  }));
}

/**
 * Get performance timeline (history of what was played when)
 */
export function getPerformanceTimeline(
  associationId: string,
  startDate?: string,
  endDate?: string,
  orchestraId?: string,
  limit: number = 100,
): PerformanceTimelineEntry[] {
  const today = new Date().toISOString().split('T')[0];
  const defaultStart = new Date();
  defaultStart.setFullYear(defaultStart.getFullYear() - 2);
  const start = startDate || defaultStart.toISOString().split('T')[0];
  const end = endDate || today;

  const query = `
        SELECT * FROM (
            SELECT
                c.date,
                'concert' as eventType,
                c.name as eventName,
                c.id as eventId,
                cp.music_title_id as titleId,
                cp.title,
                cp.composer
            FROM concert_program cp
            JOIN concerts c ON cp.concert_id = c.id
            WHERE c.association_id = ?
            AND c.date >= ? AND c.date <= ?

            UNION ALL

            SELECT
                r.date,
                'rehearsal' as eventType,
                COALESCE(r.notes, 'Rehearsal') as eventName,
                r.id as eventId,
                mt.id as titleId,
                rp.title,
                mt.composer
            FROM rehearsal_pieces rp
            JOIN rehearsals r ON rp.rehearsal_id = r.id
            LEFT JOIN music_titles mt ON LOWER(rp.title) = LOWER(mt.title) AND mt.association_id = r.association_id
            WHERE r.association_id = ?
            AND r.date >= ? AND r.date <= ?
            ${orchestraId ? 'AND (r.orchestra_id = ? OR r.orchestra_id IS NULL)' : ''}
        )
        ORDER BY date DESC
        LIMIT ?
    `;

  const params = orchestraId
    ? [associationId, start, end, associationId, start, end, orchestraId, limit]
    : [associationId, start, end, associationId, start, end, limit];

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    date: row.date,
    eventType: row.eventType as 'concert' | 'rehearsal',
    eventName: row.eventName,
    eventId: row.eventId,
    titleId: row.titleId,
    title: row.title,
    composer: row.composer,
  }));
}

/**
 * Update cached performance statistics for a music title
 * Called when a concert program or rehearsal piece is added/modified
 */
export function updateTitlePerformanceStats(titleId: string): void {
  try {
    const stats = db
      .prepare(
        `
            SELECT
                (
                    SELECT COUNT(*) FROM concert_program cp
                    JOIN concerts c ON cp.concert_id = c.id
                    WHERE cp.music_title_id = ?
                ) + (
                    SELECT COUNT(*) FROM rehearsal_pieces rp
                    JOIN rehearsals r ON rp.rehearsal_id = r.id
                    JOIN music_titles mt ON LOWER(rp.title) = LOWER(mt.title) AND mt.association_id = r.association_id
                    WHERE mt.id = ?
                ) as performance_count,
                COALESCE(
                    (SELECT MAX(c.date) FROM concert_program cp
                     JOIN concerts c ON cp.concert_id = c.id
                     WHERE cp.music_title_id = ?),
                    (SELECT MAX(r.date) FROM rehearsal_pieces rp
                     JOIN rehearsals r ON rp.rehearsal_id = r.id
                     JOIN music_titles mt ON LOWER(rp.title) = LOWER(mt.title) AND mt.association_id = r.association_id
                     WHERE mt.id = ?)
                ) as last_performed
        `,
      )
      .get(titleId, titleId, titleId, titleId) as { performance_count: number; last_performed: string | null };

    // Check if columns exist before updating
    const tableInfo = db.prepare('PRAGMA table_info(music_titles)').all() as { name: string }[];
    const hasPerformanceCount = tableInfo.some((col) => col.name === 'performance_count');
    const hasLastPerformed = tableInfo.some((col) => col.name === 'last_performed');

    if (hasPerformanceCount && hasLastPerformed) {
      db.prepare(
        `
                UPDATE music_titles
                SET performance_count = ?, last_performed = ?
                WHERE id = ?
            `,
      ).run(stats.performance_count, stats.last_performed, titleId);
    }
  } catch (error) {
    logger.error('Failed to update title performance stats:', error);
  }
}

export default {
  getRepertoireOverview,
  getMostPlayedPieces,
  getNotPlayedPieces,
  getStatsByGenre,
  getStatsByComposer,
  getPerformanceTimeline,
  updateTitlePerformanceStats,
};
