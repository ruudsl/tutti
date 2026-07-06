import { Router, Response } from 'express';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { cacheMiddleware } from '../middleware/cache';
import repertoireStats from '../services/repertoireStats';
import db from '../database/connection';
import logger from '../utils/logger';

const router = Router();

// Analytics endpoints run heavy aggregation queries. Responses are
// association-scoped, so the cache varies by association (default). A short
// TTL keeps dashboards responsive while bounding staleness; there are no
// mutation endpoints in this router (data derives from activity/attendance
// logs), so time-based expiry is the invalidation strategy.
// The CSV export endpoint is intentionally not cached (non-JSON response,
// and exports should always reflect current data).
const analyticsCache = cacheMiddleware({ ttlSeconds: 180 });

// =============================================================================
// MEMBER ACTIVITY REPORTS (Admin only)
// =============================================================================

interface ActivityOverview {
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
  totalDownloads: number;
  totalViews: number;
  totalPracticeSessions: number;
  totalPracticeMinutes: number;
  totalAudioPlays: number;
  loginCount: number;
}

interface MemberActivity {
  userId: string;
  userName: string;
  email: string;
  lastLogin: string | null;
  downloads: number;
  views: number;
  practiceSessions: number;
  practiceMinutes: number;
  audioPlays: number;
  totalActions: number;
}

interface ContentActivity {
  contentId: string;
  contentTitle: string;
  contentType: string;
  arranger: string | null;
  downloads: number;
  views: number;
  audioPlays: number;
  totalAccess: number;
}

/**
 * @swagger
 * /analytics/activity/overview:
 *   get:
 *     summary: Get overall activity statistics (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *         description: End date (ISO 8601)
 *     responses:
 *       200:
 *         description: Activity overview statistics
 */
router.get(
  '/activity/overview',
  authenticateToken,
  requireRole('admin'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const associationId = req.user!.associationId!;

    // Default date range: last 30 days
    const endDate = dateTo ? String(dateTo) : new Date().toISOString().split('T')[0];
    const startDate = dateFrom
      ? String(dateFrom)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

    // Active users this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const activeUsersWeek = db
      .prepare(
        `
    SELECT COUNT(DISTINCT al.user_id) as count
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE u.association_id = ? AND al.created_at >= ?
  `,
      )
      .get(associationId, weekAgoStr) as { count: number };

    // Active users this month
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString().split('T')[0];

    const activeUsersMonth = db
      .prepare(
        `
    SELECT COUNT(DISTINCT al.user_id) as count
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE u.association_id = ? AND al.created_at >= ?
  `,
      )
      .get(associationId, monthAgoStr) as { count: number };

    // Activity counts by type within date range
    const activityCounts = db
      .prepare(
        `
    SELECT
      SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
      SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views,
      SUM(CASE WHEN al.action_type = 'play_audio' THEN 1 ELSE 0 END) as audio_plays,
      SUM(CASE WHEN al.action_type = 'login' THEN 1 ELSE 0 END) as logins
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE u.association_id = ?
      AND al.created_at >= ? AND al.created_at <= ?
  `,
      )
      .get(associationId, startDate, endDate + ' 23:59:59') as {
      downloads: number;
      views: number;
      audio_plays: number;
      logins: number;
    };

    // Practice stats
    const practiceStats = db
      .prepare(
        `
    SELECT
      COUNT(*) as sessions,
      COALESCE(SUM(pl.duration_minutes), 0) as total_minutes
    FROM practice_logs pl
    JOIN users u ON pl.user_id = u.id
    WHERE u.association_id = ?
      AND pl.practiced_at >= ? AND pl.practiced_at <= ?
  `,
      )
      .get(associationId, startDate, endDate + ' 23:59:59') as {
      sessions: number;
      total_minutes: number;
    };

    const overview: ActivityOverview = {
      activeUsersThisWeek: activeUsersWeek.count,
      activeUsersThisMonth: activeUsersMonth.count,
      totalDownloads: activityCounts.downloads || 0,
      totalViews: activityCounts.views || 0,
      totalPracticeSessions: practiceStats.sessions || 0,
      totalPracticeMinutes: practiceStats.total_minutes || 0,
      totalAudioPlays: activityCounts.audio_plays || 0,
      loginCount: activityCounts.logins || 0,
    };

    res.json({
      overview,
      dateRange: { from: startDate, to: endDate },
    });
  }),
);

/**
 * @swagger
 * /analytics/activity/by-member:
 *   get:
 *     summary: Get activity breakdown per member (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: anonymize
 *         schema:
 *           type: boolean
 *         description: Anonymize member names for privacy
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [totalActions, downloads, views, practiceMinutes, lastLogin]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Per-member activity data
 */
router.get(
  '/activity/by-member',
  authenticateToken,
  requireRole('admin'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dateFrom, dateTo, anonymize, sortBy = 'totalActions', limit = '50' } = req.query;
    const associationId = req.user!.associationId!;

    const endDate = dateTo ? String(dateTo) : new Date().toISOString().split('T')[0];
    const startDate = dateFrom
      ? String(dateFrom)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

    // Get all active users with their activity stats
    const members = db
      .prepare(
        `
    SELECT
      u.id,
      u.first_name || ' ' || u.last_name as name,
      u.email,
      u.last_login,
      COALESCE(activity.downloads, 0) as downloads,
      COALESCE(activity.views, 0) as views,
      COALESCE(activity.audio_plays, 0) as audio_plays,
      COALESCE(practice.sessions, 0) as practice_sessions,
      COALESCE(practice.total_minutes, 0) as practice_minutes
    FROM users u
    LEFT JOIN (
      SELECT
        al.user_id,
        SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
        SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views,
        SUM(CASE WHEN al.action_type = 'play_audio' THEN 1 ELSE 0 END) as audio_plays
      FROM activity_log al
      WHERE al.created_at >= ? AND al.created_at <= ?
      GROUP BY al.user_id
    ) activity ON u.id = activity.user_id
    LEFT JOIN (
      SELECT
        pl.user_id,
        COUNT(*) as sessions,
        SUM(pl.duration_minutes) as total_minutes
      FROM practice_logs pl
      WHERE pl.practiced_at >= ? AND pl.practiced_at <= ?
      GROUP BY pl.user_id
    ) practice ON u.id = practice.user_id
    WHERE u.association_id = ? AND u.status = 'active'
  `,
      )
      .all(startDate, endDate + ' 23:59:59', startDate, endDate + ' 23:59:59', associationId) as any[];

    // Calculate total actions and sort
    let results: MemberActivity[] = members.map((m, index) => ({
      userId: anonymize === 'true' ? `member_${index + 1}` : m.id,
      userName: anonymize === 'true' ? `Member ${index + 1}` : m.name,
      email: anonymize === 'true' ? '***@***' : m.email,
      lastLogin: m.last_login,
      downloads: m.downloads,
      views: m.views,
      practiceSessions: m.practice_sessions,
      practiceMinutes: m.practice_minutes,
      audioPlays: m.audio_plays,
      totalActions: m.downloads + m.views + m.audio_plays + m.practice_sessions,
    }));

    // Sort by specified field
    const sortField = String(sortBy);
    results.sort((a, b) => {
      switch (sortField) {
        case 'downloads':
          return b.downloads - a.downloads;
        case 'views':
          return b.views - a.views;
        case 'practiceMinutes':
          return b.practiceMinutes - a.practiceMinutes;
        case 'lastLogin':
          if (!a.lastLogin && !b.lastLogin) return 0;
          if (!a.lastLogin) return 1;
          if (!b.lastLogin) return -1;
          return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime();
        default:
          return b.totalActions - a.totalActions;
      }
    });

    // Apply limit
    const limitNum = Math.min(parseInt(String(limit)) || 50, 500);
    results = results.slice(0, limitNum);

    res.json({
      members: results,
      total: members.length,
      dateRange: { from: startDate, to: endDate },
      anonymized: anonymize === 'true',
    });
  }),
);

/**
 * @swagger
 * /analytics/activity/by-content:
 *   get:
 *     summary: Get most accessed content (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: contentType
 *         schema:
 *           type: string
 *           enum: [music_piece, music_title, music_list, audio_recording]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Most accessed content
 */
router.get(
  '/activity/by-content',
  authenticateToken,
  requireRole('admin'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dateFrom, dateTo, contentType, limit = '50' } = req.query;
    const associationId = req.user!.associationId!;

    const endDate = dateTo ? String(dateTo) : new Date().toISOString().split('T')[0];
    const startDate = dateFrom
      ? String(dateFrom)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

    // Build entity type filter
    let entityTypeFilter = '';
    if (contentType) {
      entityTypeFilter = 'AND al.entity_type = ?';
    }

    const params: any[] = [startDate, endDate + ' 23:59:59', associationId];
    if (contentType) {
      params.push(String(contentType));
    }
    params.push(parseInt(String(limit)) || 50);

    // Get content with activity counts
    const content = db
      .prepare(
        `
    SELECT
      al.entity_type,
      al.entity_id,
      SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
      SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views,
      SUM(CASE WHEN al.action_type = 'play_audio' THEN 1 ELSE 0 END) as audio_plays,
      COUNT(*) as total_access,
      CASE
        WHEN al.entity_type = 'music_piece' THEN (SELECT mp.title FROM music_pieces mp WHERE mp.id = al.entity_id)
        WHEN al.entity_type = 'music_title' THEN (SELECT mt.title FROM music_titles mt WHERE mt.id = al.entity_id)
        WHEN al.entity_type = 'music_list' THEN (SELECT ml.name FROM music_lists ml WHERE ml.id = al.entity_id)
        WHEN al.entity_type = 'audio_recording' THEN (SELECT ar.title FROM audio_recordings ar WHERE ar.id = al.entity_id)
        ELSE NULL
      END as content_title,
      CASE
        WHEN al.entity_type = 'music_piece' THEN (SELECT mp.arranger FROM music_pieces mp WHERE mp.id = al.entity_id)
        WHEN al.entity_type = 'music_title' THEN (SELECT mt.arranger FROM music_titles mt WHERE mt.id = al.entity_id)
        ELSE NULL
      END as arranger
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
      ${entityTypeFilter}
    GROUP BY al.entity_type, al.entity_id
    ORDER BY total_access DESC
    LIMIT ?
  `,
      )
      .all(...params) as any[];

    const results: ContentActivity[] = content
      .filter((c) => c.content_title) // Filter out deleted content
      .map((c) => ({
        contentId: c.entity_id,
        contentTitle: c.content_title,
        contentType: c.entity_type,
        arranger: c.arranger,
        downloads: c.downloads || 0,
        views: c.views || 0,
        audioPlays: c.audio_plays || 0,
        totalAccess: c.total_access || 0,
      }));

    res.json({
      content: results,
      dateRange: { from: startDate, to: endDate },
    });
  }),
);

/**
 * @swagger
 * /analytics/activity/downloads:
 *   get:
 *     summary: Get download statistics (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *     responses:
 *       200:
 *         description: Download statistics over time
 */
router.get(
  '/activity/downloads',
  authenticateToken,
  requireRole('admin'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dateFrom, dateTo, groupBy = 'day' } = req.query;
    const associationId = req.user!.associationId!;

    const endDate = dateTo ? String(dateTo) : new Date().toISOString().split('T')[0];
    const startDate = dateFrom
      ? String(dateFrom)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

    // Date grouping format
    let dateFormat: string;
    switch (groupBy) {
      case 'week':
        dateFormat = "strftime('%Y-W%W', al.created_at)";
        break;
      case 'month':
        dateFormat = "strftime('%Y-%m', al.created_at)";
        break;
      default:
        dateFormat = 'date(al.created_at)';
    }

    const downloads = db
      .prepare(
        `
    SELECT
      ${dateFormat} as period,
      COUNT(*) as download_count,
      COUNT(DISTINCT al.user_id) as unique_users,
      COUNT(DISTINCT al.entity_id) as unique_items
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.action_type = 'download'
      AND al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
    GROUP BY period
    ORDER BY period ASC
  `,
      )
      .all(startDate, endDate + ' 23:59:59', associationId) as any[];

    // Top downloaded pieces
    const topDownloads = db
      .prepare(
        `
    SELECT
      al.entity_id,
      CASE
        WHEN al.entity_type = 'music_piece' THEN (SELECT mp.title FROM music_pieces mp WHERE mp.id = al.entity_id)
        WHEN al.entity_type = 'music_title' THEN (SELECT mt.title FROM music_titles mt WHERE mt.id = al.entity_id)
        ELSE NULL
      END as title,
      al.entity_type,
      COUNT(*) as download_count,
      COUNT(DISTINCT al.user_id) as unique_downloaders
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.action_type = 'download'
      AND al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
    GROUP BY al.entity_id, al.entity_type
    ORDER BY download_count DESC
    LIMIT 20
  `,
      )
      .all(startDate, endDate + ' 23:59:59', associationId) as any[];

    res.json({
      timeline: downloads.map((d) => ({
        period: d.period,
        downloadCount: d.download_count,
        uniqueUsers: d.unique_users,
        uniqueItems: d.unique_items,
      })),
      topDownloads: topDownloads
        .filter((d) => d.title)
        .map((d) => ({
          entityId: d.entity_id,
          title: d.title,
          entityType: d.entity_type,
          downloadCount: d.download_count,
          uniqueDownloaders: d.unique_downloaders,
        })),
      dateRange: { from: startDate, to: endDate },
      groupBy,
    });
  }),
);

/**
 * @swagger
 * /analytics/activity/engagement:
 *   get:
 *     summary: Get engagement metrics (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Engagement metrics
 */
router.get(
  '/activity/engagement',
  authenticateToken,
  requireRole('admin'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const associationId = req.user!.associationId!;

    const endDate = dateTo ? String(dateTo) : new Date().toISOString().split('T')[0];
    const startDate = dateFrom
      ? String(dateFrom)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

    // Total active members
    const totalMembers = db
      .prepare(
        `
    SELECT COUNT(*) as count FROM users WHERE association_id = ? AND status = 'active'
  `,
      )
      .get(associationId) as { count: number };

    // Members who logged in during period
    const loggedInMembers = db
      .prepare(
        `
    SELECT COUNT(DISTINCT user_id) as count
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.action_type = 'login'
      AND al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
  `,
      )
      .get(startDate, endDate + ' 23:59:59', associationId) as { count: number };

    // Members who practiced during period
    const practicingMembers = db
      .prepare(
        `
    SELECT COUNT(DISTINCT pl.user_id) as count
    FROM practice_logs pl
    JOIN users u ON pl.user_id = u.id
    WHERE pl.practiced_at >= ? AND pl.practiced_at <= ?
      AND u.association_id = ?
  `,
      )
      .get(startDate, endDate + ' 23:59:59', associationId) as { count: number };

    // Members who downloaded during period
    const downloadingMembers = db
      .prepare(
        `
    SELECT COUNT(DISTINCT al.user_id) as count
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.action_type = 'download'
      AND al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
  `,
      )
      .get(startDate, endDate + ' 23:59:59', associationId) as { count: number };

    // Activity heatmap (by day of week and hour)
    const activityHeatmap = db
      .prepare(
        `
    SELECT
      CAST(strftime('%w', al.created_at) AS INTEGER) as day_of_week,
      CAST(strftime('%H', al.created_at) AS INTEGER) as hour,
      COUNT(*) as activity_count
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
    GROUP BY day_of_week, hour
    ORDER BY day_of_week, hour
  `,
      )
      .all(startDate, endDate + ' 23:59:59', associationId) as any[];

    // Daily activity trend
    const dailyTrend = db
      .prepare(
        `
    SELECT
      date(al.created_at) as date,
      COUNT(*) as total_actions,
      COUNT(DISTINCT al.user_id) as active_users
    FROM activity_log al
    JOIN users u ON al.user_id = u.id
    WHERE al.created_at >= ? AND al.created_at <= ?
      AND u.association_id = ?
    GROUP BY date(al.created_at)
    ORDER BY date ASC
  `,
      )
      .all(startDate, endDate + ' 23:59:59', associationId) as any[];

    // Never logged in members
    const neverLoggedIn = db
      .prepare(
        `
    SELECT COUNT(*) as count
    FROM users
    WHERE association_id = ? AND status = 'active' AND last_login IS NULL
  `,
      )
      .get(associationId) as { count: number };

    // Inactive members (no activity in period)
    const inactiveMembers = db
      .prepare(
        `
    SELECT COUNT(*) as count
    FROM users u
    WHERE u.association_id = ? AND u.status = 'active'
      AND u.id NOT IN (
        SELECT DISTINCT user_id FROM activity_log
        WHERE created_at >= ? AND created_at <= ?
      )
  `,
      )
      .get(associationId, startDate, endDate + ' 23:59:59') as { count: number };

    res.json({
      metrics: {
        totalMembers: totalMembers.count,
        loggedInMembers: loggedInMembers.count,
        loginRate: totalMembers.count > 0 ? Math.round((loggedInMembers.count / totalMembers.count) * 100) : 0,
        practicingMembers: practicingMembers.count,
        practiceRate: totalMembers.count > 0 ? Math.round((practicingMembers.count / totalMembers.count) * 100) : 0,
        downloadingMembers: downloadingMembers.count,
        downloadRate: totalMembers.count > 0 ? Math.round((downloadingMembers.count / totalMembers.count) * 100) : 0,
        neverLoggedIn: neverLoggedIn.count,
        inactiveMembers: inactiveMembers.count,
      },
      heatmap: activityHeatmap.map((h) => ({
        dayOfWeek: h.day_of_week,
        hour: h.hour,
        count: h.activity_count,
      })),
      dailyTrend: dailyTrend.map((d) => ({
        date: d.date,
        totalActions: d.total_actions,
        activeUsers: d.active_users,
      })),
      dateRange: { from: startDate, to: endDate },
    });
  }),
);

/**
 * @swagger
 * /analytics/activity/export:
 *   get:
 *     summary: Export activity report as CSV (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *           enum: [member_activity, content_activity, detailed_log]
 *           default: member_activity
 *       - in: query
 *         name: anonymize
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: CSV file download
 */
router.get(
  '/activity/export',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { dateFrom, dateTo, reportType: rawReportType = 'member_activity', anonymize } = req.query;
    const associationId = req.user!.associationId!;

    const allowedReportTypes = ['member_activity', 'content_activity', 'detailed_log'] as const;
    const reportType =
      typeof rawReportType === 'string' &&
      (allowedReportTypes as readonly string[]).includes(rawReportType)
        ? rawReportType
        : 'member_activity';
    const reportTypeForLog = reportType.replace(/[\r\n]/g, '');

    const endDate = dateTo ? String(dateTo) : new Date().toISOString().split('T')[0];
    const startDate = dateFrom
      ? String(dateFrom)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

    let csvContent = '';
    const filename = `activity-report-${reportType}-${startDate}-to-${endDate}.csv`;

    switch (reportType) {
      case 'member_activity': {
        csvContent =
          'Member ID,Member Name,Email,Downloads,Views,Audio Plays,Practice Sessions,Practice Minutes,Total Actions\n';

        const members = db
          .prepare(
            `
        SELECT
          u.id,
          u.first_name || ' ' || u.last_name as name,
          u.email,
          COALESCE(activity.downloads, 0) as downloads,
          COALESCE(activity.views, 0) as views,
          COALESCE(activity.audio_plays, 0) as audio_plays,
          COALESCE(practice.sessions, 0) as practice_sessions,
          COALESCE(practice.total_minutes, 0) as practice_minutes
        FROM users u
        LEFT JOIN (
          SELECT
            al.user_id,
            SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
            SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views,
            SUM(CASE WHEN al.action_type = 'play_audio' THEN 1 ELSE 0 END) as audio_plays
          FROM activity_log al
          WHERE al.created_at >= ? AND al.created_at <= ?
          GROUP BY al.user_id
        ) activity ON u.id = activity.user_id
        LEFT JOIN (
          SELECT
            pl.user_id,
            COUNT(*) as sessions,
            SUM(pl.duration_minutes) as total_minutes
          FROM practice_logs pl
          WHERE pl.practiced_at >= ? AND pl.practiced_at <= ?
          GROUP BY pl.user_id
        ) practice ON u.id = practice.user_id
        WHERE u.association_id = ? AND u.status = 'active'
        ORDER BY (COALESCE(activity.downloads, 0) + COALESCE(activity.views, 0) + COALESCE(activity.audio_plays, 0)) DESC
      `,
          )
          .all(startDate, endDate + ' 23:59:59', startDate, endDate + ' 23:59:59', associationId) as any[];

        members.forEach((m, index) => {
          const memberId = anonymize === 'true' ? `member_${index + 1}` : m.id;
          const memberName = anonymize === 'true' ? `Member ${index + 1}` : m.name;
          const email = anonymize === 'true' ? '***@***' : m.email;
          const total = m.downloads + m.views + m.audio_plays + m.practice_sessions;
          csvContent += `"${memberId}","${memberName}","${email}",${m.downloads},${m.views},${m.audio_plays},${m.practice_sessions},${m.practice_minutes},${total}\n`;
        });
        break;
      }

      case 'content_activity': {
        csvContent = 'Content ID,Title,Type,Arranger,Downloads,Views,Audio Plays,Total Access\n';

        const content = db
          .prepare(
            `
        SELECT
          al.entity_type,
          al.entity_id,
          SUM(CASE WHEN al.action_type = 'download' THEN 1 ELSE 0 END) as downloads,
          SUM(CASE WHEN al.action_type = 'view' THEN 1 ELSE 0 END) as views,
          SUM(CASE WHEN al.action_type = 'play_audio' THEN 1 ELSE 0 END) as audio_plays,
          COUNT(*) as total_access,
          CASE
            WHEN al.entity_type = 'music_piece' THEN (SELECT mp.title FROM music_pieces mp WHERE mp.id = al.entity_id)
            WHEN al.entity_type = 'music_title' THEN (SELECT mt.title FROM music_titles mt WHERE mt.id = al.entity_id)
            ELSE NULL
          END as title,
          CASE
            WHEN al.entity_type = 'music_piece' THEN (SELECT mp.arranger FROM music_pieces mp WHERE mp.id = al.entity_id)
            WHEN al.entity_type = 'music_title' THEN (SELECT mt.arranger FROM music_titles mt WHERE mt.id = al.entity_id)
            ELSE NULL
          END as arranger
        FROM activity_log al
        JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= ? AND al.created_at <= ?
          AND u.association_id = ?
        GROUP BY al.entity_type, al.entity_id
        ORDER BY total_access DESC
      `,
          )
          .all(startDate, endDate + ' 23:59:59', associationId) as any[];

        content
          .filter((c) => c.title)
          .forEach((c) => {
            csvContent += `"${c.entity_id}","${c.title || ''}","${c.entity_type}","${c.arranger || ''}",${c.downloads || 0},${c.views || 0},${c.audio_plays || 0},${c.total_access}\n`;
          });
        break;
      }

      case 'detailed_log': {
        csvContent = 'Date,Time,Member ID,Member Name,Action,Content Type,Content ID,Content Title\n';

        const logs = db
          .prepare(
            `
        SELECT
          al.created_at,
          al.user_id,
          u.first_name || ' ' || u.last_name as user_name,
          al.action_type,
          al.entity_type,
          al.entity_id,
          CASE
            WHEN al.entity_type = 'music_piece' THEN (SELECT mp.title FROM music_pieces mp WHERE mp.id = al.entity_id)
            WHEN al.entity_type = 'music_title' THEN (SELECT mt.title FROM music_titles mt WHERE mt.id = al.entity_id)
            WHEN al.entity_type = 'music_list' THEN (SELECT ml.name FROM music_lists ml WHERE ml.id = al.entity_id)
            ELSE NULL
          END as content_title
        FROM activity_log al
        JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= ? AND al.created_at <= ?
          AND u.association_id = ?
        ORDER BY al.created_at DESC
        LIMIT 10000
      `,
          )
          .all(startDate, endDate + ' 23:59:59', associationId) as any[];

        logs.forEach((l, index) => {
          const date = l.created_at.split('T')[0];
          const time = l.created_at.split('T')[1]?.substring(0, 8) || '';
          const memberId = anonymize === 'true' ? `member_${index + 1}` : l.user_id;
          const memberName = anonymize === 'true' ? `Member ${index + 1}` : l.user_name;
          csvContent += `"${date}","${time}","${memberId}","${memberName}","${l.action_type}","${l.entity_type}","${l.entity_id}","${l.content_title || ''}"\n`;
        });
        break;
      }
    }

    logger.info(`Activity report exported by user ${req.user!.id}: ${reportTypeForLog}`);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvContent); // Add BOM for Excel compatibility
  }),
);

// =============================================================================
// ATTENDANCE ANALYTICS
// =============================================================================

interface AttendanceOverview {
  avgAttendanceRate: number;
  totalMembers: number;
  totalRehearsals: number;
  acceptedCount: number;
  declinedCount: number;
  currentMonthRate: number;
  previousMonthRate: number;
  trend: number;
}

interface AttendanceTrend {
  month: string;
  attendanceRate: number;
  uniqueAttendees: number;
  totalRehearsals: number;
}

interface SectionAttendance {
  instrumentId: string;
  instrument: string;
  attendanceRate: number;
  memberCount: number;
  totalResponses: number;
}

interface AtRiskMember {
  id: string;
  firstName: string;
  lastName: string;
  recentRate: number;
  previousRate: number;
  trend: number;
  riskLevel: 'high' | 'medium' | 'low';
}

interface MemberAttendanceStats {
  id: string;
  firstName: string;
  lastName: string;
  attendanceRate: number;
  presentCount: number;
  totalCount: number;
  instrument: string | null;
}

interface AttendancePrediction {
  rehearsalId: string;
  date: string;
  predictedCount: number;
  predictedRate: number;
  dayOfWeek: number;
  understaffedSections: { instrument: string; expected: number; needed: number }[];
}

/**
 * @swagger
 * /analytics/attendance/overview:
 *   get:
 *     summary: Get overall attendance statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Attendance overview statistics
 */
router.get(
  '/attendance/overview',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;
    const associationId = req.user!.associationId!;

    // Build orchestra filter for rehearsals query
    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }

    // Get overall attendance stats for last 6 months
    const overallStats = db
      .prepare(
        `
    SELECT
      COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) as accepted_count,
      COUNT(CASE WHEN a.status = 'declined' THEN 1 END) as declined_count,
      COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) as total_responses,
      COUNT(DISTINCT a.user_id) as total_members,
      COUNT(DISTINCT a.rehearsal_id) as total_rehearsals,
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as avg_attendance_rate
    FROM rehearsal_attendance a
    JOIN rehearsals r ON a.rehearsal_id = r.id
    WHERE r.association_id = ? AND r.date >= date('now', '-6 months')${orchestraFilter}
  `,
      )
      .get(...params) as any;

    // Current month rate
    const currentMonthStats = db
      .prepare(
        `
    SELECT
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as rate
    FROM rehearsal_attendance a
    JOIN rehearsals r ON a.rehearsal_id = r.id
    WHERE r.association_id = ? AND r.date >= date('now', 'start of month')${orchestraFilter}
  `,
      )
      .get(...params) as any;

    // Previous month rate
    const previousMonthParams = [...params];
    const previousMonthStats = db
      .prepare(
        `
    SELECT
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as rate
    FROM rehearsal_attendance a
    JOIN rehearsals r ON a.rehearsal_id = r.id
    WHERE r.association_id = ?
      AND r.date >= date('now', 'start of month', '-1 month')
      AND r.date < date('now', 'start of month')${orchestraFilter}
  `,
      )
      .get(...previousMonthParams) as any;

    const overview: AttendanceOverview = {
      avgAttendanceRate: Math.round((overallStats.avg_attendance_rate || 0) * 10) / 10,
      totalMembers: overallStats.total_members || 0,
      totalRehearsals: overallStats.total_rehearsals || 0,
      acceptedCount: overallStats.accepted_count || 0,
      declinedCount: overallStats.declined_count || 0,
      currentMonthRate: Math.round((currentMonthStats?.rate || 0) * 10) / 10,
      previousMonthRate: Math.round((previousMonthStats?.rate || 0) * 10) / 10,
      trend: Math.round(((currentMonthStats?.rate || 0) - (previousMonthStats?.rate || 0)) * 10) / 10,
    };

    res.json(overview);
  }),
);

/**
 * @swagger
 * /analytics/attendance/trends:
 *   get:
 *     summary: Get attendance trends over time
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of months to include
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Monthly attendance trends
 */
router.get(
  '/attendance/trends',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { months = '12', orchestraId } = req.query;
    const associationId = req.user!.associationId!;
    const monthsNum = parseInt(months as string) || 12;

    let orchestraFilter = '';
    const params: any[] = [associationId, monthsNum];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }

    const trends = db
      .prepare(
        `
    SELECT
      strftime('%Y-%m', r.date) as month,
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as attendance_rate,
      COUNT(DISTINCT CASE WHEN a.status = 'accepted' THEN a.user_id END) as unique_attendees,
      COUNT(DISTINCT r.id) as total_rehearsals
    FROM rehearsals r
    LEFT JOIN rehearsal_attendance a ON r.id = a.rehearsal_id
    WHERE r.association_id = ? AND r.date >= date('now', '-' || ? || ' months')${orchestraFilter}
    GROUP BY strftime('%Y-%m', r.date)
    ORDER BY month
  `,
      )
      .all(...params) as any[];

    const result: AttendanceTrend[] = trends.map((t) => ({
      month: t.month,
      attendanceRate: Math.round((t.attendance_rate || 0) * 10) / 10,
      uniqueAttendees: t.unique_attendees || 0,
      totalRehearsals: t.total_rehearsals || 0,
    }));

    res.json(result);
  }),
);

/**
 * @swagger
 * /analytics/attendance/by-section:
 *   get:
 *     summary: Get attendance breakdown by instrument section
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Attendance by instrument section
 */
router.get(
  '/attendance/by-section',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;
    const associationId = req.user!.associationId!;

    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }

    const sections = db
      .prepare(
        `
    SELECT
      i.name as instrument,
      i.id as instrument_id,
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as attendance_rate,
      COUNT(DISTINCT a.user_id) as member_count,
      COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) as total_responses
    FROM rehearsal_attendance a
    JOIN users u ON a.user_id = u.id
    JOIN user_instruments ui ON u.id = ui.user_id
    JOIN instruments i ON ui.instrument_id = i.id
    JOIN rehearsals r ON a.rehearsal_id = r.id
    WHERE r.association_id = ? AND r.date >= date('now', '-6 months')${orchestraFilter}
    GROUP BY i.id
    HAVING total_responses > 0
    ORDER BY attendance_rate ASC
  `,
      )
      .all(...params) as any[];

    const result: SectionAttendance[] = sections.map((s) => ({
      instrumentId: s.instrument_id,
      instrument: s.instrument,
      attendanceRate: Math.round((s.attendance_rate || 0) * 10) / 10,
      memberCount: s.member_count || 0,
      totalResponses: s.total_responses || 0,
    }));

    res.json(result);
  }),
);

/**
 * @swagger
 * /analytics/attendance/by-member:
 *   get:
 *     summary: Get individual member attendance statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of members to return
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [rate_asc, rate_desc, name]
 *           default: rate_desc
 *         description: Sort order
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Member attendance statistics
 */
router.get(
  '/attendance/by-member',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { limit = '50', sortBy = 'rate_desc', orchestraId } = req.query;
    const associationId = req.user!.associationId!;
    const limitNum = Math.min(parseInt(limit as string) || 50, 200);

    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }

    // Determine sort order
    let orderClause = 'ORDER BY attendance_rate DESC';
    if (sortBy === 'rate_asc') orderClause = 'ORDER BY attendance_rate ASC';
    else if (sortBy === 'name') orderClause = 'ORDER BY u.last_name, u.first_name';

    params.push(limitNum);

    const members = db
      .prepare(
        `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as attendance_rate,
      COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) as present_count,
      COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) as total_count,
      (SELECT i.name FROM user_instruments ui2 JOIN instruments i ON ui2.instrument_id = i.id WHERE ui2.user_id = u.id LIMIT 1) as instrument
    FROM users u
    JOIN rehearsal_attendance a ON u.id = a.user_id
    JOIN rehearsals r ON a.rehearsal_id = r.id
    WHERE r.association_id = ? AND r.date >= date('now', '-6 months') AND u.status = 'active'${orchestraFilter}
    GROUP BY u.id
    HAVING total_count > 0
    ${orderClause}
    LIMIT ?
  `,
      )
      .all(...params) as any[];

    const result: MemberAttendanceStats[] = members.map((m) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      attendanceRate: Math.round((m.attendance_rate || 0) * 10) / 10,
      presentCount: m.present_count || 0,
      totalCount: m.total_count || 0,
      instrument: m.instrument,
    }));

    res.json(result);
  }),
);

/**
 * @swagger
 * /analytics/attendance/at-risk:
 *   get:
 *     summary: Get members with declining attendance
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: At-risk members list
 */
router.get(
  '/attendance/at-risk',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;
    const associationId = req.user!.associationId!;

    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }

    // Get members with declining attendance (recent 2 months vs previous 4 months)
    const atRisk = db
      .prepare(
        `
    WITH recent AS (
      SELECT
        a.user_id,
        CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
          THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
          ELSE NULL END as recent_rate
      FROM rehearsal_attendance a
      JOIN rehearsals r ON a.rehearsal_id = r.id
      WHERE r.association_id = ? AND r.date >= date('now', '-2 months')${orchestraFilter}
      GROUP BY a.user_id
    ),
    previous AS (
      SELECT
        a.user_id,
        CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
          THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
          ELSE NULL END as previous_rate
      FROM rehearsal_attendance a
      JOIN rehearsals r ON a.rehearsal_id = r.id
      WHERE r.association_id = ? AND r.date >= date('now', '-6 months') AND r.date < date('now', '-2 months')${orchestraFilter}
      GROUP BY a.user_id
    )
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      COALESCE(recent.recent_rate, 0) as recent_rate,
      COALESCE(previous.previous_rate, 0) as previous_rate,
      (COALESCE(recent.recent_rate, 0) - COALESCE(previous.previous_rate, 0)) as trend
    FROM users u
    JOIN recent ON u.id = recent.user_id
    LEFT JOIN previous ON u.id = previous.user_id
    WHERE u.status = 'active'
      AND (
        (recent.recent_rate IS NOT NULL AND previous.previous_rate IS NOT NULL AND recent.recent_rate < previous.previous_rate - 10)
        OR recent.recent_rate < 50
      )
    ORDER BY trend ASC, recent_rate ASC
    LIMIT 20
  `,
      )
      .all(associationId, ...params.slice(1), associationId, ...params.slice(1)) as any[];

    const result: AtRiskMember[] = atRisk.map((m) => {
      let riskLevel: 'high' | 'medium' | 'low' = 'low';
      if (m.recent_rate < 30 || m.trend < -30) riskLevel = 'high';
      else if (m.recent_rate < 50 || m.trend < -15) riskLevel = 'medium';

      return {
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        recentRate: Math.round((m.recent_rate || 0) * 10) / 10,
        previousRate: Math.round((m.previous_rate || 0) * 10) / 10,
        trend: Math.round((m.trend || 0) * 10) / 10,
        riskLevel,
      };
    });

    res.json(result);
  }),
);

/**
 * @swagger
 * /analytics/attendance/predictions:
 *   get:
 *     summary: Get predicted attendance for upcoming rehearsals
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Number of upcoming rehearsals to predict
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Attendance predictions for upcoming rehearsals
 */
router.get(
  '/attendance/predictions',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { limit = '5', orchestraId } = req.query;
    const associationId = req.user!.associationId!;
    const limitNum = Math.min(parseInt(limit as string) || 5, 10);

    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }
    params.push(limitNum);

    // Get upcoming rehearsals
    const upcomingRehearsals = db
      .prepare(
        `
    SELECT id, date, orchestra_id,
           CAST(strftime('%w', date) AS INTEGER) as day_of_week
    FROM rehearsals r
    WHERE r.association_id = ? AND r.date >= date('now')${orchestraFilter}
    ORDER BY date
    LIMIT ?
  `,
      )
      .all(...params) as any[];

    // Get historical attendance rate by day of week
    const dayRates = db
      .prepare(
        `
    SELECT
      CAST(strftime('%w', r.date) AS INTEGER) as day_of_week,
      AVG(CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END) as avg_rate
    FROM rehearsals r
    LEFT JOIN rehearsal_attendance a ON r.id = a.rehearsal_id
    WHERE r.association_id = ? AND r.date >= date('now', '-6 months') AND r.date < date('now')${orchestraFilter}
    GROUP BY strftime('%w', r.date)
  `,
      )
      .all(associationId, ...(orchestraId ? [orchestraId] : [])) as any[];

    const dayRateMap = new Map(dayRates.map((d) => [d.day_of_week, d.avg_rate || 70]));

    // Get total active members count
    const memberCount = db
      .prepare(
        `
    SELECT COUNT(*) as count FROM users WHERE association_id = ? AND status = 'active'
  `,
      )
      .get(associationId) as { count: number };

    // Get section averages for understaffed detection
    const sectionAverages = db
      .prepare(
        `
    SELECT
      i.name as instrument,
      COUNT(DISTINCT u.id) as member_count,
      AVG(CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END) as avg_rate
    FROM users u
    JOIN user_instruments ui ON u.id = ui.user_id
    JOIN instruments i ON ui.instrument_id = i.id
    LEFT JOIN rehearsal_attendance a ON u.id = a.user_id
    LEFT JOIN rehearsals r ON a.rehearsal_id = r.id AND r.date >= date('now', '-3 months')
    WHERE u.association_id = ? AND u.status = 'active'
    GROUP BY i.id
  `,
      )
      .all(associationId) as any[];

    const predictions: AttendancePrediction[] = upcomingRehearsals.map((rehearsal) => {
      const dayRate = dayRateMap.get(rehearsal.day_of_week) || 70;
      const predictedRate = Math.round(dayRate * 10) / 10;
      const predictedCount = Math.round((memberCount.count * predictedRate) / 100);

      // Find potentially understaffed sections
      const understaffedSections = sectionAverages
        .filter((s) => {
          const expected = Math.round((s.member_count * (s.avg_rate || 70)) / 100);
          return expected < 2 && s.member_count >= 2; // Section might be understaffed
        })
        .map((s) => ({
          instrument: s.instrument,
          expected: Math.round((s.member_count * (s.avg_rate || 70)) / 100),
          needed: 2, // Minimum needed
        }));

      return {
        rehearsalId: rehearsal.id,
        date: rehearsal.date,
        predictedCount,
        predictedRate,
        dayOfWeek: rehearsal.day_of_week,
        understaffedSections,
      };
    });

    res.json(predictions);
  }),
);

/**
 * @swagger
 * /analytics/attendance/by-day-of-week:
 *   get:
 *     summary: Get attendance heatmap by day of week
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Attendance by day of week
 */
router.get(
  '/attendance/by-day-of-week',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;
    const associationId = req.user!.associationId!;

    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }

    const dayStats = db
      .prepare(
        `
    SELECT
      CAST(strftime('%w', r.date) AS INTEGER) as day_of_week,
      COUNT(DISTINCT r.id) as rehearsal_count,
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as attendance_rate
    FROM rehearsals r
    LEFT JOIN rehearsal_attendance a ON r.id = a.rehearsal_id
    WHERE r.association_id = ? AND r.date >= date('now', '-12 months')${orchestraFilter}
    GROUP BY strftime('%w', r.date)
    ORDER BY day_of_week
  `,
      )
      .all(...params) as any[];

    const result = dayStats.map((d) => ({
      dayOfWeek: d.day_of_week,
      rehearsalCount: d.rehearsal_count || 0,
      attendanceRate: Math.round((d.attendance_rate || 0) * 10) / 10,
    }));

    res.json(result);
  }),
);

/**
 * @swagger
 * /analytics/attendance/leaderboard:
 *   get:
 *     summary: Get top members by attendance
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of members to return
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Top members by attendance
 */
router.get(
  '/attendance/leaderboard',
  authenticateToken,
  requireRole('admin', 'music_committee', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { limit = '10', orchestraId } = req.query;
    const associationId = req.user!.associationId!;
    const limitNum = Math.min(parseInt(limit as string) || 10, 50);

    let orchestraFilter = '';
    const params: any[] = [associationId];
    if (orchestraId) {
      orchestraFilter = ' AND r.orchestra_id = ?';
      params.push(orchestraId);
    }
    params.push(limitNum);

    const leaders = db
      .prepare(
        `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      CASE WHEN COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) > 0
        THEN COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) * 100.0 / COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END)
        ELSE 0 END as attendance_rate,
      COUNT(CASE WHEN a.status = 'accepted' THEN 1 END) as present_count,
      COUNT(CASE WHEN a.status IN ('accepted', 'declined') THEN 1 END) as total_count,
      (SELECT i.name FROM user_instruments ui2 JOIN instruments i ON ui2.instrument_id = i.id WHERE ui2.user_id = u.id LIMIT 1) as instrument
    FROM users u
    JOIN rehearsal_attendance a ON u.id = a.user_id
    JOIN rehearsals r ON a.rehearsal_id = r.id
    WHERE r.association_id = ? AND r.date >= date('now', '-6 months') AND u.status = 'active'${orchestraFilter}
    GROUP BY u.id
    HAVING total_count >= 5
    ORDER BY attendance_rate DESC, present_count DESC
    LIMIT ?
  `,
      )
      .all(...params) as any[];

    const result = leaders.map((m, index) => ({
      rank: index + 1,
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      attendanceRate: Math.round((m.attendance_rate || 0) * 10) / 10,
      presentCount: m.present_count || 0,
      totalCount: m.total_count || 0,
      instrument: m.instrument,
    }));

    res.json(result);
  }),
);

// =============================================================================
// REPERTOIRE ANALYTICS (Existing routes)
// =============================================================================

/**
 * @swagger
 * /analytics/repertoire/overview:
 *   get:
 *     summary: Get repertoire overview statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Repertoire overview statistics
 */
router.get(
  '/repertoire/overview',
  authenticateToken,
  requireRole('music_committee', 'admin', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;

    const overview = repertoireStats.getRepertoireOverview(req.user!.associationId!, orchestraId as string | undefined);

    res.json(overview);
  }),
);

/**
 * @swagger
 * /analytics/repertoire/most-played:
 *   get:
 *     summary: Get most played pieces
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of pieces to return
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: List of most played pieces
 */
router.get(
  '/repertoire/most-played',
  authenticateToken,
  requireRole('music_committee', 'admin', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { limit = '20', orchestraId } = req.query;

    const pieces = repertoireStats.getMostPlayedPieces(
      req.user!.associationId!,
      parseInt(limit as string) || 20,
      orchestraId as string | undefined,
    );

    res.json(pieces);
  }),
);

/**
 * @swagger
 * /analytics/repertoire/not-played:
 *   get:
 *     summary: Get pieces not played recently
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: months
 *         schema:
 *           type: integer
 *           default: 6
 *         description: Number of months threshold
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of pieces to return
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: List of pieces not played recently
 */
router.get(
  '/repertoire/not-played',
  authenticateToken,
  requireRole('music_committee', 'admin', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { months = '6', limit = '50', orchestraId } = req.query;

    const pieces = repertoireStats.getNotPlayedPieces(
      req.user!.associationId!,
      parseInt(months as string) || 6,
      parseInt(limit as string) || 50,
      orchestraId as string | undefined,
    );

    res.json(pieces);
  }),
);

/**
 * @swagger
 * /analytics/repertoire/by-genre:
 *   get:
 *     summary: Get repertoire statistics by genre
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *     responses:
 *       200:
 *         description: Statistics grouped by genre
 */
router.get(
  '/repertoire/by-genre',
  authenticateToken,
  requireRole('music_committee', 'admin', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { orchestraId } = req.query;

    const stats = repertoireStats.getStatsByGenre(req.user!.associationId!, orchestraId as string | undefined);

    res.json(stats);
  }),
);

/**
 * @swagger
 * /analytics/repertoire/by-composer:
 *   get:
 *     summary: Get repertoire statistics by composer
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of composers to return
 *     responses:
 *       200:
 *         description: Statistics grouped by composer
 */
router.get(
  '/repertoire/by-composer',
  authenticateToken,
  requireRole('music_committee', 'admin', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { limit = '30' } = req.query;

    const stats = repertoireStats.getStatsByComposer(req.user!.associationId!, parseInt(limit as string) || 30);

    res.json(stats);
  }),
);

/**
 * @swagger
 * /analytics/repertoire/timeline:
 *   get:
 *     summary: Get performance history timeline
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for timeline (defaults to 2 years ago)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for timeline (defaults to today)
 *       - in: query
 *         name: orchestraId
 *         schema:
 *           type: string
 *         description: Filter by orchestra ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of entries to return
 *     responses:
 *       200:
 *         description: Performance timeline entries
 */
router.get(
  '/repertoire/timeline',
  authenticateToken,
  requireRole('music_committee', 'admin', 'conductor'),
  analyticsCache,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { startDate, endDate, orchestraId, limit = '100' } = req.query;

    const timeline = repertoireStats.getPerformanceTimeline(
      req.user!.associationId!,
      startDate as string | undefined,
      endDate as string | undefined,
      orchestraId as string | undefined,
      parseInt(limit as string) || 100,
    );

    res.json(timeline);
  }),
);

export default router;
