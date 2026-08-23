import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../database/connection';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { isModuleEnabled } from '../modules/service';
import logger from '../utils/logger';
import config from '../config';
import {
  generateEventIcs,
  generateCalendarFeed,
  rehearsalToCalendarEvent,
  concertToCalendarEvent,
  generateCalendarFeedToken,
  tokensGelijk,
  getGoogleOAuthUrl,
  exchangeGoogleCode,
  refreshGoogleToken,
  createGoogleCalendarEvent,
  CalendarEvent,
} from '../services/calendarSync';

const router = Router();

// Secret for calendar feed tokens (use JWT secret as base)
const CALENDAR_FEED_SECRET = config.jwtSecret + '-calendar-feed';

interface CalendarSettings {
  id: string;
  user_id: string;
  feed_token: string;
  google_refresh_token: string | null;
  google_access_token: string | null;
  google_token_expires_at: string | null;
  google_calendar_id: string | null;
  include_rehearsals: boolean;
  include_concerts: boolean;
  last_sync: string | null;
}

/**
 * @swagger
 * /calendar/export/{type}/{id}:
 *   get:
 *     summary: Export single event as ICS file
 *     tags: [Calendar]
 */
router.get(
  '/export/:type/:id',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { type, id } = req.params;

    let event: CalendarEvent;

    if (type === 'rehearsal') {
      const rehearsal = db
        .prepare(
          `
            SELECT r.*, o.name as orchestra_name
            FROM rehearsals r
            LEFT JOIN orchestras o ON r.orchestra_id = o.id
            WHERE r.id = ? AND r.association_id = ?
        `,
        )
        .get(id, req.user!.associationId) as any;

      if (!rehearsal) {
        throw new ApiError(404, 'Repetitie niet gevonden.');
      }

      event = rehearsalToCalendarEvent(rehearsal);
    } else if (type === 'concert') {
      const concert = db
        .prepare(
          `
            SELECT * FROM concerts WHERE id = ? AND association_id = ? AND deleted_at IS NULL
        `,
        )
        .get(id, req.user!.associationId) as any;

      if (!concert) {
        throw new ApiError(404, 'Concert niet gevonden.');
      }

      event = concertToCalendarEvent(concert);
    } else {
      throw new ApiError(400, 'Ongeldig type. Gebruik "rehearsal" of "concert".');
    }

    const icsContent = generateEventIcs(event);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    // Bewust niet via bijlageKopregel: `type` komt uit een vaste keuze
    // (rehearsal of concert) en `id` is de sleutel van een record dat hierboven
    // is opgezocht - vindt de zoekopdracht niets, dan is het al een 404. Geen
    // vrije tekst dus.
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${id}.ics"`);
    res.send(icsContent);
  }),
);

/**
 * @swagger
 * /calendar/feed/{userId}:
 *   get:
 *     summary: Personal calendar feed URL (iCal format)
 *     description: Public endpoint that returns ICS feed (requires token query param)
 *     tags: [Calendar]
 */
router.get(
  '/feed/:userId',
  asyncHandler(async (req, res: Response) => {
    const { userId } = req.params;
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      throw new ApiError(401, 'Token vereist.');
    }

    // Verify the token
    const settings = db
      .prepare(
        `
        SELECT * FROM user_calendar_settings WHERE user_id = ?
    `,
      )
      .get(userId) as CalendarSettings | undefined;

    // Vergelijken met !== laat de uitkomst uit de looptijd afleiden. Het is
    // hier een bearer-token voor een publiek pad, dus die vergelijking hoort
    // tijdsonafhankelijk te zijn.
    if (!settings || !tokensGelijk(token, settings.feed_token)) {
      throw new ApiError(401, 'Ongeldige token.');
    }

    // Get user info for calendar name
    //
    // deleted_at hoort hier bij: een verwijderd lid houdt anders een werkende
    // agenda van de vereniging. De token zit in zijn agendaprogramma en wordt
    // daar uit zichzelf opgehaald, dus het verwijderen van de gebruiker moet
    // de feed afsluiten - niemand komt er later nog aan te pas om de token in
    // te trekken.
    const user = db
      .prepare(
        `
        SELECT u.first_name, u.last_name, u.association_id, a.name as association_name
        FROM users u
        LEFT JOIN associations a ON u.association_id = a.id
        WHERE u.id = ? AND u.deleted_at IS NULL
    `,
      )
      .get(userId) as
      { first_name: string; last_name: string; association_id: string; association_name: string } | undefined;

    if (!user) {
      throw new ApiError(404, 'Gebruiker niet gevonden.');
    }

    const events: CalendarEvent[] = [];

    // Get future rehearsals (next 6 months)
    if (settings.include_rehearsals) {
      const today = new Date().toISOString().split('T')[0];
      const sixMonthsLater = new Date();
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      const endDate = sixMonthsLater.toISOString().split('T')[0];

      const rehearsals = db
        .prepare(
          `
            SELECT r.*, o.name as orchestra_name
            FROM rehearsals r
            LEFT JOIN orchestras o ON r.orchestra_id = o.id
            WHERE r.association_id = ? AND r.date >= ? AND r.date <= ? AND r.type != 'cancelled'
            ORDER BY r.date
        `,
        )
        .all(user.association_id, today, endDate) as any[];

      for (const rehearsal of rehearsals) {
        events.push(rehearsalToCalendarEvent(rehearsal));
      }
    }

    // Get future concerts (next 12 months)
    //
    // Concerten worden zacht verwijderd; alle andere routes filteren op
    // deleted_at. Zonder die voorwaarde blijft een ingetrokken concert in de
    // agenda van elk lid staan, want die feed wordt door hun agendaprogramma
    // vanzelf opnieuw opgehaald.
    if (settings.include_concerts) {
      const today = new Date().toISOString().split('T')[0];
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const endDate = oneYearLater.toISOString().split('T')[0];

      const concerts = db
        .prepare(
          `
            SELECT * FROM concerts
            WHERE association_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
            ORDER BY date
        `,
        )
        .all(user.association_id, today, endDate) as any[];

      for (const concert of concerts) {
        events.push(concertToCalendarEvent(concert));
      }
    }

    const calendarName = `${user.association_name || 'Harmonie'} - ${user.first_name} ${user.last_name}`;
    const icsContent = generateCalendarFeed(events, calendarName);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(icsContent);
  }),
);

/**
 * @swagger
 * /calendar/settings:
 *   get:
 *     summary: Get user's calendar preferences
 *     tags: [Calendar]
 */
router.get(
  '/settings',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    let settings = db
      .prepare(
        `
        SELECT * FROM user_calendar_settings WHERE user_id = ?
    `,
      )
      .get(req.user!.id) as CalendarSettings | undefined;

    // Create default settings if not exists
    if (!settings) {
      const id = uuidv4();
      const feedToken = generateCalendarFeedToken(req.user!.id, CALENDAR_FEED_SECRET);

      db.prepare(
        `
            INSERT INTO user_calendar_settings (id, user_id, feed_token, include_rehearsals, include_concerts)
            VALUES (?, ?, ?, 1, 1)
        `,
      ).run(id, req.user!.id, feedToken);

      settings = db
        .prepare(
          `
            SELECT * FROM user_calendar_settings WHERE user_id = ?
        `,
        )
        .get(req.user!.id) as CalendarSettings;
    }

    // Generate feed URL
    const feedUrl = `${config.frontendUrl.replace(/\/$/, '')}/api/calendar/feed/${req.user!.id}?token=${settings.feed_token}`;

    res.json({
      feedUrl,
      includeRehearsals: Boolean(settings.include_rehearsals),
      includeConcerts: Boolean(settings.include_concerts),
      googleConnected: Boolean(settings.google_refresh_token),
      googleCalendarId: settings.google_calendar_id,
      lastSync: settings.last_sync,
    });
  }),
);

/**
 * @swagger
 * /calendar/settings:
 *   put:
 *     summary: Update calendar preferences
 *     tags: [Calendar]
 */
router.put(
  '/settings',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { includeRehearsals, includeConcerts, googleCalendarId } = req.body;

    const settings = db
      .prepare(
        `
        SELECT * FROM user_calendar_settings WHERE user_id = ?
    `,
      )
      .get(req.user!.id) as CalendarSettings | undefined;

    if (!settings) {
      // Create settings first
      const id = uuidv4();
      const feedToken = generateCalendarFeedToken(req.user!.id, CALENDAR_FEED_SECRET);

      db.prepare(
        `
            INSERT INTO user_calendar_settings (id, user_id, feed_token, include_rehearsals, include_concerts)
            VALUES (?, ?, ?, 1, 1)
        `,
      ).run(id, req.user!.id, feedToken);
    }

    // Update settings
    const includeR = includeRehearsals !== undefined ? (includeRehearsals ? 1 : 0) : undefined;
    const includeC = includeConcerts !== undefined ? (includeConcerts ? 1 : 0) : undefined;

    if (includeR !== undefined) {
      db.prepare('UPDATE user_calendar_settings SET include_rehearsals = ? WHERE user_id = ?').run(
        includeR,
        req.user!.id,
      );
    }
    if (includeC !== undefined) {
      db.prepare('UPDATE user_calendar_settings SET include_concerts = ? WHERE user_id = ?').run(
        includeC,
        req.user!.id,
      );
    }
    if (googleCalendarId !== undefined) {
      db.prepare('UPDATE user_calendar_settings SET google_calendar_id = ? WHERE user_id = ?').run(
        googleCalendarId,
        req.user!.id,
      );
    }

    res.json({ message: 'Instellingen bijgewerkt.' });
  }),
);

/**
 * @swagger
 * /calendar/feed/regenerate:
 *   post:
 *     summary: Regenerate calendar feed token
 *     tags: [Calendar]
 */
router.post(
  '/feed/regenerate',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const newToken = generateCalendarFeedToken(req.user!.id + Date.now(), CALENDAR_FEED_SECRET);

    db.prepare(
      `
        UPDATE user_calendar_settings SET feed_token = ? WHERE user_id = ?
    `,
    ).run(newToken, req.user!.id);

    const feedUrl = `${config.frontendUrl.replace(/\/$/, '')}/api/calendar/feed/${req.user!.id}?token=${newToken}`;

    logger.info('Calendar feed token regenerated', { userId: req.user!.id });

    res.json({
      feedUrl,
      message: 'Nieuwe feed URL gegenereerd.',
    });
  }),
);

/**
 * @swagger
 * /calendar/google/auth:
 *   post:
 *     summary: Start Google OAuth flow
 *     tags: [Calendar]
 */
router.post(
  '/google/auth',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get Google OAuth config from association settings
    const association = db
      .prepare(
        `
        SELECT google_calendar_client_id, google_calendar_client_secret
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as
      { google_calendar_client_id: string; google_calendar_client_secret: string } | undefined;

    if (!association?.google_calendar_client_id) {
      throw new ApiError(400, 'Google Calendar integratie is niet geconfigureerd voor deze vereniging.');
    }

    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state temporarily (in session or database)
    db.prepare(
      `
        INSERT OR REPLACE INTO oauth_states (id, user_id, state, expires_at)
        VALUES (?, ?, ?, datetime('now', '+10 minutes'))
    `,
    ).run(uuidv4(), req.user!.id, state);

    const redirectUri = `${config.frontendUrl.replace(/\/$/, '')}/api/calendar/google/callback`;
    const authUrl = getGoogleOAuthUrl(association.google_calendar_client_id, redirectUri, state);

    res.json({ authUrl });
  }),
);

/**
 * @swagger
 * /calendar/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Calendar]
 */
router.get(
  '/google/callback',
  asyncHandler(async (req, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn('Google OAuth error', { error });
      return res.redirect(`${config.frontendUrl}/profile?calendar_error=denied`);
    }

    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(`${config.frontendUrl}/profile?calendar_error=invalid`);
    }

    // Verify state and get user
    const oauthState = db
      .prepare(
        `
        SELECT user_id FROM oauth_states
        WHERE state = ? AND expires_at > datetime('now')
    `,
      )
      .get(state) as { user_id: string } | undefined;

    if (!oauthState) {
      return res.redirect(`${config.frontendUrl}/profile?calendar_error=expired`);
    }

    // Clean up state
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

    // Get user's association
    const user = db.prepare('SELECT association_id FROM users WHERE id = ?').get(oauthState.user_id) as
      { association_id: string } | undefined;

    if (!user) {
      return res.redirect(`${config.frontendUrl}/profile?calendar_error=user_not_found`);
    }

    // Get Google credentials
    const association = db
      .prepare(
        `
        SELECT google_calendar_client_id, google_calendar_client_secret
        FROM associations WHERE id = ?
    `,
      )
      .get(user.association_id) as
      { google_calendar_client_id: string; google_calendar_client_secret: string } | undefined;

    if (!association?.google_calendar_client_id) {
      return res.redirect(`${config.frontendUrl}/profile?calendar_error=not_configured`);
    }

    try {
      const redirectUri = `${config.frontendUrl.replace(/\/$/, '')}/api/calendar/google/callback`;
      const tokens = await exchangeGoogleCode(
        code,
        association.google_calendar_client_id,
        association.google_calendar_client_secret,
        redirectUri,
      );

      // Store tokens
      db.prepare(
        `
            UPDATE user_calendar_settings
            SET google_access_token = ?,
                google_refresh_token = ?,
                google_token_expires_at = ?,
                google_calendar_id = 'primary'
            WHERE user_id = ?
        `,
      ).run(tokens.accessToken, tokens.refreshToken, tokens.expiresAt.toISOString(), oauthState.user_id);

      logger.info('Google Calendar connected', { userId: oauthState.user_id });

      res.redirect(`${config.frontendUrl}/profile?calendar_connected=true`);
    } catch (err: any) {
      logger.error('Google OAuth token exchange failed', { error: err.message });
      res.redirect(`${config.frontendUrl}/profile?calendar_error=token_exchange`);
    }
  }),
);

/**
 * @swagger
 * /calendar/google/disconnect:
 *   post:
 *     summary: Disconnect Google Calendar
 *     tags: [Calendar]
 */
router.post(
  '/google/disconnect',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    db.prepare(
      `
        UPDATE user_calendar_settings
        SET google_access_token = NULL,
            google_refresh_token = NULL,
            google_token_expires_at = NULL,
            google_calendar_id = NULL
        WHERE user_id = ?
    `,
    ).run(req.user!.id);

    logger.info('Google Calendar disconnected', { userId: req.user!.id });

    res.json({ message: 'Google Calendar losgekoppeld.' });
  }),
);

/**
 * @swagger
 * /calendar/google/sync:
 *   post:
 *     summary: Sync events to Google Calendar
 *     tags: [Calendar]
 */
router.post(
  '/google/sync',
  authenticateToken,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const settings = db
      .prepare(
        `
        SELECT * FROM user_calendar_settings WHERE user_id = ?
    `,
      )
      .get(req.user!.id) as CalendarSettings | undefined;

    if (!settings?.google_refresh_token) {
      throw new ApiError(400, 'Google Calendar is niet gekoppeld.');
    }

    // Get association credentials
    const association = db
      .prepare(
        `
        SELECT google_calendar_client_id, google_calendar_client_secret
        FROM associations WHERE id = ?
    `,
      )
      .get(req.user!.associationId) as
      { google_calendar_client_id: string; google_calendar_client_secret: string } | undefined;

    if (!association?.google_calendar_client_id) {
      throw new ApiError(400, 'Google Calendar integratie is niet geconfigureerd.');
    }

    // Check if token needs refresh
    let accessToken = settings.google_access_token!;
    if (settings.google_token_expires_at) {
      const expiresAt = new Date(settings.google_token_expires_at);
      if (expiresAt <= new Date()) {
        // Refresh token
        try {
          const newTokens = await refreshGoogleToken(
            settings.google_refresh_token,
            association.google_calendar_client_id,
            association.google_calendar_client_secret,
          );
          accessToken = newTokens.accessToken;

          db.prepare(
            `
                    UPDATE user_calendar_settings
                    SET google_access_token = ?, google_token_expires_at = ?
                    WHERE user_id = ?
                `,
          ).run(accessToken, newTokens.expiresAt.toISOString(), req.user!.id);
        } catch (err: any) {
          logger.error('Failed to refresh Google token', { error: err.message, userId: req.user!.id });
          throw new ApiError(401, 'Google authenticatie verlopen. Koppel opnieuw.');
        }
      }
    }

    const calendarId = settings.google_calendar_id || 'primary';
    const events: CalendarEvent[] = [];
    let synced = 0;
    let failed = 0;

    // Get events to sync
    const today = new Date().toISOString().split('T')[0];
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const endDate = sixMonthsLater.toISOString().split('T')[0];

    if (settings.include_rehearsals) {
      const rehearsals = db
        .prepare(
          `
            SELECT r.*, o.name as orchestra_name
            FROM rehearsals r
            LEFT JOIN orchestras o ON r.orchestra_id = o.id
            WHERE r.association_id = ? AND r.date >= ? AND r.date <= ? AND r.type != 'cancelled'
            ORDER BY r.date
        `,
        )
        .all(req.user!.associationId, today, endDate) as any[];

      for (const rehearsal of rehearsals) {
        events.push(rehearsalToCalendarEvent(rehearsal));
      }
    }

    if (settings.include_concerts) {
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
      const concertEndDate = oneYearLater.toISOString().split('T')[0];

      const concerts = db
        .prepare(
          `
            SELECT * FROM concerts
            WHERE association_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
            ORDER BY date
        `,
        )
        .all(req.user!.associationId, today, concertEndDate) as any[];

      for (const concert of concerts) {
        events.push(concertToCalendarEvent(concert));
      }
    }

    // Sync each event
    for (const event of events) {
      try {
        await createGoogleCalendarEvent(accessToken, calendarId, event);
        synced++;
      } catch (err: any) {
        logger.warn('Failed to sync event to Google Calendar', {
          eventId: event.id,
          error: err.message,
        });
        failed++;
      }
    }

    // Update last sync time
    db.prepare(
      `
        UPDATE user_calendar_settings SET last_sync = datetime('now') WHERE user_id = ?
    `,
    ).run(req.user!.id);

    logger.info('Google Calendar sync completed', { userId: req.user!.id, synced, failed });

    res.json({
      message: `${synced} evenementen gesynchroniseerd.`,
      synced,
      failed,
      total: events.length,
    });
  }),
);

/**
 * @swagger
 * /calendar/public/{associationSlug}:
 *   get:
 *     summary: Public calendar events (no auth required)
 *     description: Returns upcoming public events for embedding on external websites
 *     tags: [Calendar]
 */
router.get(
  '/public/:associationSlug',
  asyncHandler(async (req, res: Response) => {
    const { associationSlug } = req.params;
    const { months = '3', format = 'json' } = req.query;

    // Find association by slug or ID
    const association = db
      .prepare(
        `
        SELECT id, name, slug FROM associations
        WHERE slug = ? OR id = ?
    `,
      )
      .get(associationSlug, associationSlug) as { id: string; name: string; slug: string } | undefined;

    if (!association) {
      throw new ApiError(404, 'Association not found');
    }

    // De url van de openbare agenda staat op de website van de vereniging en
    // is door iedereen aan te passen. parseInt('zes') geeft NaN, een datum die
    // daarmee is opgeschoven is ongeldig en toISOString() gooit daarop - een
    // 500 op een publieke pagina. Bij een onbruikbare waarde geldt daarom de
    // standaard van drie maanden; het bereik blijft begrensd op een jaar.
    const gevraagdeMaanden = parseInt(months as string, 10);
    const maanden = Number.isFinite(gevraagdeMaanden) ? Math.min(Math.max(gevraagdeMaanden, 1), 12) : 3;

    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + maanden);
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get public concerts
    const concerts = db
      .prepare(
        `
        SELECT id, name, date, end_date, location, description
        FROM concerts
        WHERE association_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
        ORDER BY date
    `,
      )
      .all(association.id, today, endDateStr) as any[];

    // Get public rehearsals (optionally include if setting allows)
    const publicSettings = db
      .prepare(
        `
        SELECT show_rehearsals_public FROM associations WHERE id = ?
    `,
      )
      .get(association.id) as { show_rehearsals_public: number } | undefined;

    let rehearsals: any[] = [];
    if (publicSettings?.show_rehearsals_public) {
      rehearsals = db
        .prepare(
          `
            SELECT r.id, r.date, r.start_time, r.end_time, r.location,
                   o.name as orchestra_name
            FROM rehearsals r
            LEFT JOIN orchestras o ON r.orchestra_id = o.id
            WHERE r.association_id = ? AND r.date >= ? AND r.date <= ? AND r.type != 'cancelled'
            ORDER BY r.date, r.start_time
        `,
        )
        .all(association.id, today, endDateStr);
    }

    const events = [
      // De concerttabel kent geen begintijd, adres of kaartprijs; alleen een
      // datum, een einddatum en een locatie.
      ...concerts.map((c: any) => ({
        id: c.id,
        type: 'concert' as const,
        title: c.name,
        date: c.date,
        // De concerttabel legt geen begin- of eindtijd vast, en ook geen
        // adres of kaartprijs; alleen een datum, een einddatum en een locatie.
        startTime: undefined as string | undefined,
        endTime: undefined as string | undefined,
        endDate: c.end_date as string | undefined,
        venue: c.location as string | undefined,
        location: c.location as string | undefined,
        address: undefined as string | undefined,
        city: undefined as string | undefined,
        ticketPrice: undefined as number | undefined,
        description: c.description as string | undefined,
      })),
      ...rehearsals.map((r: any) => ({
        id: r.id,
        type: 'rehearsal' as const,
        title: r.orchestra_name ? `Rehearsal - ${r.orchestra_name}` : 'Rehearsal',
        date: r.date,
        startTime: r.start_time,
        endTime: r.end_time,
        venue: r.location as string | undefined,
        location: r.location as string | undefined,
        endDate: undefined as string | undefined,
        address: undefined as string | undefined,
        city: undefined as string | undefined,
        ticketPrice: undefined as number | undefined,
        description: undefined as string | undefined,
      })),
    ].sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

    if (format === 'ics') {
      // De velden heetten hier start en end, terwijl CalendarEvent startDate en
      // endDate gebruikt. Door de cast naar any[] viel dat niet op bij het
      // vertalen, en pas bij het opbouwen van het bestand: formatIcsDateTime
      // kreeg undefined en wierp. Deze route gaf daarmee altijd een 500.
      const calEvents: CalendarEvent[] = events.map((e) => ({
        id: e.id,
        title: e.title,
        startDate: new Date(`${e.date}T${e.startTime || '00:00'}`),
        endDate: new Date(`${e.date}T${e.endTime || '23:59'}`),
        location: e.location || '',
        description: e.description || '',
      }));

      const icsContent = generateCalendarFeed(calEvents, association.name);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(icsContent);
    }

    // JSON format with CORS headers for embedding
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      association: {
        name: association.name,
        slug: association.slug,
      },
      events,
      generatedAt: new Date().toISOString(),
    });
  }),
);

/**
 * @swagger
 * /calendar/info-screen/{associationSlug}:
 *   get:
 *     summary: Info screen data for display boards
 *     description: Returns optimized data for info screens/kiosks
 *     tags: [Calendar]
 */
router.get(
  '/info-screen/:associationSlug',
  asyncHandler(async (req, res: Response) => {
    const { associationSlug } = req.params;

    const association = db
      .prepare(
        `
        SELECT id, name, slug FROM associations
        WHERE slug = ? OR id = ?
    `,
      )
      .get(associationSlug, associationSlug) as { id: string; name: string; slug: string } | undefined;

    if (!association) {
      throw new ApiError(404, 'Association not found');
    }

    const today = new Date().toISOString().split('T')[0];
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    const endDateStr = oneMonthLater.toISOString().split('T')[0];

    // Get next concert
    const nextConcert = db
      .prepare(
        `
        SELECT id, name, date, location, description
        FROM concerts
        WHERE association_id = ? AND date >= ? AND deleted_at IS NULL
        ORDER BY date
        LIMIT 1
    `,
      )
      .get(association.id, today) as any;

    // Get next rehearsal
    //
    // Het infoscherm is net zo openbaar als de kalender hierboven: geen
    // aanmelding, en Access-Control-Allow-Origin op *. Een repetitierooster
    // zegt waar de leden op welk moment zijn, dus dezelfde instelling die
    // repetities uit de openbare agenda houdt hoort ze ook hier weg te laten.
    // Anders is show_rehearsals_public met een andere url alsnog te omzeilen.
    const openbareInstellingen = db
      .prepare(
        `
        SELECT show_rehearsals_public FROM associations WHERE id = ?
    `,
      )
      .get(association.id) as { show_rehearsals_public: number } | undefined;

    const nextRehearsal = openbareInstellingen?.show_rehearsals_public
      ? (db
          .prepare(
            `
        SELECT r.id, r.date, r.start_time, r.end_time, r.location,
               o.name as orchestra_name
        FROM rehearsals r
        LEFT JOIN orchestras o ON r.orchestra_id = o.id
        WHERE r.association_id = ? AND r.date >= ? AND r.type != 'cancelled'
        ORDER BY r.date, r.start_time
        LIMIT 1
    `,
          )
          .get(association.id, today) as any)
      : null;

    // Get upcoming events (next 5)
    const upcomingConcerts = db
      .prepare(
        `
        SELECT id, name, date, location
        FROM concerts
        WHERE association_id = ? AND date >= ? AND date <= ? AND deleted_at IS NULL
        ORDER BY date
        LIMIT 5
    `,
      )
      .all(association.id, today, endDateStr) as any[];

    // Get latest announcement/post
    //
    // Het infoscherm is publiek, dus er is geen ingelogde gebruiker om de
    // vereniging uit af te leiden; die komt hier uit de route zelf. Staat de
    // module Nieuwsberichten uit, dan hoort er ook op het scherm in de hal
    // geen bericht te verschijnen.
    const latestPost = isModuleEnabled(association.id, 'posts')
      ? (db
          .prepare(
            `
        SELECT id, title, content, published_at
        FROM posts
        WHERE association_id = ? AND status = 'published' AND is_pinned = 1
        ORDER BY published_at DESC
        LIMIT 1
    `,
          )
          .get(association.id) as any)
      : null;

    // Allow CORS for info screens
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      association: {
        name: association.name,
      },
      nextConcert: nextConcert
        ? {
            id: nextConcert.id,
            name: nextConcert.name,
            date: nextConcert.date,
            venue: nextConcert.location,
            daysUntil: Math.ceil((new Date(nextConcert.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          }
        : null,
      nextRehearsal: nextRehearsal
        ? {
            id: nextRehearsal.id,
            date: nextRehearsal.date,
            startTime: nextRehearsal.start_time,
            endTime: nextRehearsal.end_time,
            location: nextRehearsal.location,
            orchestraName: nextRehearsal.orchestra_name,
          }
        : null,
      upcomingConcerts: upcomingConcerts.map((c: any) => ({
        id: c.id,
        name: c.name,
        date: c.date,
        venue: c.location,
      })),
      announcement: latestPost
        ? {
            title: latestPost.title,
            content: latestPost.content?.substring(0, 500),
            publishedAt: latestPost.published_at,
          }
        : null,
      currentTime: new Date().toISOString(),
      refreshInterval: 60,
    });
  }),
);

export default router;
