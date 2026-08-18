/**
 * Calendar Sync Service
 * Handles generation of ICS files for Google Calendar and Apple Calendar sync
 */

import crypto from 'crypto';
import { config } from '../config';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  recurrence?: RecurrenceRule;
  organizer?: {
    name: string;
    email: string;
  };
  url?: string;
}

export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  count?: number;
  until?: Date;
  byDay?: string[]; // e.g., ['MO', 'WE', 'FR']
}

/**
 * Format a date to ICS datetime format (YYYYMMDDTHHMMSSZ)
 */
function formatIcsDateTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Format a date to ICS date format (YYYYMMDD)
 */
function formatIcsDate(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Escape special characters in ICS text fields
 */
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Fold long lines according to RFC 5545 (max 75 octets per line)
 */
function foldLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) return line;

  const result: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    result.push(remaining.substring(0, maxLength));
    remaining = ' ' + remaining.substring(maxLength);
  }

  if (remaining) {
    result.push(remaining);
  }

  return result.join('\r\n');
}

/**
 * Generate a unique UID for a calendar event
 */
function generateEventUid(eventId: string, domain: string): string {
  return `${eventId}@${domain}`;
}

/**
 * Build a recurrence rule string (RRULE)
 */
function buildRRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.frequency}`];

  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  }

  if (rule.until) {
    parts.push(`UNTIL=${formatIcsDateTime(rule.until)}`);
  }

  if (rule.byDay && rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.join(',')}`);
  }

  return parts.join(';');
}

/**
 * Generate ICS content for a single event
 */
export function generateEventIcs(event: CalendarEvent): string {
  const domain = new URL(config.frontendUrl).hostname || 'harmonie.local';
  const uid = generateEventUid(event.id, domain);
  const now = new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Harmonie Muziek//Calendar//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDateTime(now)}`,
  ];

  // Date/time handling
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.endDate)}`);
  } else {
    lines.push(`DTSTART:${formatIcsDateTime(event.startDate)}`);
    lines.push(`DTEND:${formatIcsDateTime(event.endDate)}`);
  }

  // Title (summary)
  lines.push(foldLine(`SUMMARY:${escapeIcsText(event.title)}`));

  // Description
  if (event.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(event.description)}`));
  }

  // Location
  if (event.location) {
    lines.push(foldLine(`LOCATION:${escapeIcsText(event.location)}`));
  }

  // URL
  if (event.url) {
    lines.push(`URL:${event.url}`);
  }

  // Organizer
  if (event.organizer) {
    lines.push(`ORGANIZER;CN=${escapeIcsText(event.organizer.name)}:mailto:${event.organizer.email}`);
  }

  // Recurrence rule
  if (event.recurrence) {
    lines.push(`RRULE:${buildRRule(event.recurrence)}`);
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Generate ICS content for multiple events (calendar feed)
 */
export function generateCalendarFeed(events: CalendarEvent[], calendarName: string): string {
  const domain = new URL(config.frontendUrl).hostname || 'harmonie.local';
  const now = new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Harmonie Muziek//Calendar//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeIcsText(calendarName)}`),
    'X-WR-TIMEZONE:Europe/Amsterdam',
  ];

  // Add timezone definition
  lines.push(
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Amsterdam',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  );

  // Add events
  for (const event of events) {
    const uid = generateEventUid(event.id, domain);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${formatIcsDateTime(now)}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.endDate)}`);
    } else {
      lines.push(`DTSTART;TZID=Europe/Amsterdam:${formatLocalDateTime(event.startDate)}`);
      lines.push(`DTEND;TZID=Europe/Amsterdam:${formatLocalDateTime(event.endDate)}`);
    }

    lines.push(foldLine(`SUMMARY:${escapeIcsText(event.title)}`));

    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeIcsText(event.description)}`));
    }

    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeIcsText(event.location)}`));
    }

    if (event.url) {
      lines.push(`URL:${event.url}`);
    }

    if (event.organizer) {
      lines.push(`ORGANIZER;CN=${escapeIcsText(event.organizer.name)}:mailto:${event.organizer.email}`);
    }

    if (event.recurrence) {
      lines.push(`RRULE:${buildRRule(event.recurrence)}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Format date for local timezone datetime (without Z)
 */
function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Convert a rehearsal database record to a CalendarEvent
 */
export function rehearsalToCalendarEvent(rehearsal: {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  location?: string;
  orchestra_name?: string;
  type: string;
  notes?: string;
}): CalendarEvent {
  const startDate = parseDateTime(rehearsal.date, rehearsal.start_time);
  const endDate = parseDateTime(rehearsal.date, rehearsal.end_time);

  let title = 'Repetitie';
  if (rehearsal.orchestra_name) {
    title += ` - ${rehearsal.orchestra_name}`;
  }
  if (rehearsal.type === 'extra') {
    title = `[Extra] ${title}`;
  } else if (rehearsal.type === 'cancelled') {
    title = `[Vervallen] ${title}`;
  }

  let description = '';
  if (rehearsal.notes) {
    description = rehearsal.notes;
  }

  return {
    id: `rehearsal-${rehearsal.id}`,
    title,
    description: description || undefined,
    location: rehearsal.location || undefined,
    startDate,
    endDate,
  };
}

/**
 * Convert a concert database record to a CalendarEvent
 */
export function concertToCalendarEvent(concert: {
  id: string;
  name: string;
  date: string;
  end_date?: string;
  location?: string;
  description?: string;
  concert_type?: string;
}): CalendarEvent {
  // For concerts, we might not have specific times, so default to all-day
  const startDate = new Date(concert.date);
  const endDate = concert.end_date ? new Date(concert.end_date) : new Date(concert.date);

  // Add one day to end date for all-day events (ICS convention)
  endDate.setDate(endDate.getDate() + 1);

  let title = concert.name;
  if (concert.concert_type) {
    title = `${concert.name}`;
  }

  return {
    id: `concert-${concert.id}`,
    title,
    description: concert.description || undefined,
    location: concert.location || undefined,
    startDate,
    endDate,
    allDay: true,
  };
}

/**
 * Parse date and time strings into a Date object
 */
function parseDateTime(dateStr: string, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Generate a secure calendar feed token for a user
 */
export function generateCalendarFeedToken(userId: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(userId);
  return hmac.digest('hex').substring(0, 32);
}

/**
 * Verify a calendar feed token
 */
export function verifyCalendarFeedToken(userId: string, token: string, secret: string): boolean {
  const expectedToken = generateCalendarFeedToken(userId, secret);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));
}

/**
 * Google Calendar OAuth configuration
 */
export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Generate Google Calendar OAuth URL
 */
export function getGoogleOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange Google OAuth code for tokens
 */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google OAuth error: ${error}`);
  }

  const data = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

/**
 * Refresh Google access token
 */
export async function refreshGoogleToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google token refresh error: ${error}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  return {
    accessToken: data.access_token,
    expiresAt,
  };
}

/**
 * Create event in Google Calendar
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent,
): Promise<string> {
  const googleEvent: any = {
    id: event.id
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .substring(0, 1024),
    summary: event.title,
    location: event.location,
    description: event.description,
  };

  if (event.allDay) {
    googleEvent.start = {
      date: event.startDate.toISOString().split('T')[0],
    };
    googleEvent.end = {
      date: event.endDate.toISOString().split('T')[0],
    };
  } else {
    googleEvent.start = {
      dateTime: event.startDate.toISOString(),
      timeZone: 'Europe/Amsterdam',
    };
    googleEvent.end = {
      dateTime: event.endDate.toISOString(),
      timeZone: 'Europe/Amsterdam',
    };
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(googleEvent),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Calendar API error: ${error}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Update event in Google Calendar
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEvent,
): Promise<void> {
  const googleEvent: any = {
    summary: event.title,
    location: event.location,
    description: event.description,
  };

  if (event.allDay) {
    googleEvent.start = {
      date: event.startDate.toISOString().split('T')[0],
    };
    googleEvent.end = {
      date: event.endDate.toISOString().split('T')[0],
    };
  } else {
    googleEvent.start = {
      dateTime: event.startDate.toISOString(),
      timeZone: 'Europe/Amsterdam',
    };
    googleEvent.end = {
      dateTime: event.endDate.toISOString(),
      timeZone: 'Europe/Amsterdam',
    };
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(googleEvent),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Calendar API error: ${error}`);
  }
}

/**
 * Delete event from Google Calendar
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  // 404 is ok - event might already be deleted
  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Google Calendar API error: ${error}`);
  }
}
