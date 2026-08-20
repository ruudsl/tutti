/**
 * Weekly Email Digest Scheduler
 *
 * Sends a weekly summary email to all active members with:
 * - Upcoming rehearsals
 * - New music pieces added
 * - Recent announcements
 * - Practice statistics
 */

import db from '../database/connection';
import { isModuleEnabled } from '../modules/service';
import logger from '../utils/logger';
import { sendEmail } from '../utils/email';

interface DigestData {
  upcomingRehearsals: {
    date: string;
    startTime: string;
    endTime: string;
    location: string | null;
    orchestraName: string;
  }[];
  newMusicPieces: {
    title: string;
    arranger: string | null;
    addedAt: string;
  }[];
  practiceStats: {
    totalMinutes: number;
    sessionCount: number;
  } | null;
  upcomingConcerts: {
    name: string;
    date: string;
    location: string | null;
  }[];
}

export async function sendWeeklyDigest(): Promise<void> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const oneWeekFromNow = new Date();
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

  // Get all associations
  const associations = db.prepare('SELECT id, name FROM associations').all() as { id: string; name: string }[];

  for (const association of associations) {
    try {
      // Get users who want to receive email digests
      const users = db
        .prepare(
          `
                SELECT u.id, u.email, u.first_name, u.last_name
                FROM users u
                WHERE u.association_id = ?
                  AND u.email IS NOT NULL
                  AND u.role != 'inactive'
                  AND NOT EXISTS (
                      SELECT 1 FROM notification_preferences np
                      WHERE np.user_id = u.id AND np.email_enabled = 0
                  )
            `,
        )
        .all(association.id) as { id: string; email: string; first_name: string; last_name: string }[];

      if (users.length === 0) continue;

      // Get upcoming rehearsals
      const upcomingRehearsals = db
        .prepare(
          `
                SELECT r.date, r.start_time, r.end_time, r.location, o.name as orchestra_name
                FROM rehearsals r
                JOIN orchestras o ON r.orchestra_id = o.id
                WHERE o.association_id = ?
                  AND r.date >= date('now')
                  AND r.date <= date('now', '+7 days')
                ORDER BY r.date, r.start_time
                LIMIT 10
            `,
        )
        .all(association.id) as DigestData['upcomingRehearsals'];

      // Get new music pieces from last week
      const newMusicPieces = db
        .prepare(
          `
                SELECT DISTINCT mt.title, mt.arranger, mp.created_at as added_at
                FROM music_pieces mp
                JOIN music_titles mt ON mp.title = mt.title
                WHERE mp.association_id = ?
                  AND mp.created_at >= ?
                ORDER BY mp.created_at DESC
                LIMIT 10
            `,
        )
        .all(association.id, oneWeekAgo.toISOString()) as DigestData['newMusicPieces'];

      // Get upcoming concerts
      const upcomingConcerts = db
        .prepare(
          `
                SELECT name, date, location
                FROM concerts
                WHERE association_id = ?
                  AND date >= date('now')
                  AND date <= date('now', '+30 days')
                ORDER BY date
                LIMIT 5
            `,
        )
        .all(association.id) as DigestData['upcomingConcerts'];

      // Oefengegevens horen bij de module Thuis oefenen. Staat die uit, dan hoort
      // er ook geen oefenoverzicht in de wekelijkse mail te staan.
      const practiceEnabled = isModuleEnabled(association.id, 'practice');

      // Send digest to each user
      for (const user of users) {
        try {
          // Get user's practice stats
          // De kolomnamen worden hier omgezet naar de namen die DigestData
          // gebruikt. Zonder die aliassen leverde de query total_minutes en
          // session_count, terwijl de mailtekst sessionCount leest: die was dus
          // altijd undefined en het oefenblok verscheen nooit in de weekmail.
          const practiceStats = practiceEnabled
            ? (db
                .prepare(
                  `
                        SELECT
                            COALESCE(SUM(duration_minutes), 0) as totalMinutes,
                            COUNT(*) as sessionCount
                        FROM practice_logs
                        WHERE user_id = ?
                          AND practiced_at >= ?
                    `,
                )
                .get(user.id, oneWeekAgo.toISOString()) as DigestData['practiceStats'])
            : null;

          const digestData: DigestData = {
            upcomingRehearsals,
            newMusicPieces,
            practiceStats,
            upcomingConcerts,
          };

          await sendDigestEmail(user, association.name, digestData);
        } catch (err) {
          logger.error(`Failed to send digest to user ${user.id}`, { error: (err as Error).message });
        }
      }

      logger.info(`Weekly digest sent for association ${association.name}`, {
        userCount: users.length,
        associationId: association.id,
      });
    } catch (err) {
      logger.error(`Failed to process digest for association ${association.id}`, {
        error: (err as Error).message,
      });
    }
  }
}

async function sendDigestEmail(
  user: { id: string; email: string; first_name: string; last_name: string },
  associationName: string,
  data: DigestData,
): Promise<void> {
  const subject = `Wekelijkse samenvatting - ${associationName}`;

  let html = `
        <h2>Hallo ${user.first_name}!</h2>
        <p>Hier is je wekelijkse samenvatting van ${associationName}.</p>
    `;

  // Upcoming rehearsals
  if (data.upcomingRehearsals.length > 0) {
    html += `
            <h3>📅 Komende repetities</h3>
            <ul>
        `;
    for (const rehearsal of data.upcomingRehearsals) {
      html += `<li>${rehearsal.date} ${rehearsal.startTime}-${rehearsal.endTime} - ${rehearsal.orchestraName}${rehearsal.location ? ` (${rehearsal.location})` : ''}</li>`;
    }
    html += '</ul>';
  }

  // Upcoming concerts
  if (data.upcomingConcerts.length > 0) {
    html += `
            <h3>🎵 Komende concerten</h3>
            <ul>
        `;
    for (const concert of data.upcomingConcerts) {
      html += `<li>${concert.date} - ${concert.name}${concert.location ? ` (${concert.location})` : ''}</li>`;
    }
    html += '</ul>';
  }

  // New music
  if (data.newMusicPieces.length > 0) {
    html += `
            <h3>🎼 Nieuwe muziek</h3>
            <ul>
        `;
    for (const piece of data.newMusicPieces) {
      html += `<li>${piece.title}${piece.arranger ? ` - ${piece.arranger}` : ''}</li>`;
    }
    html += '</ul>';
  }

  // Practice stats
  if (data.practiceStats && data.practiceStats.sessionCount > 0) {
    const hours = Math.floor(data.practiceStats.totalMinutes / 60);
    const minutes = data.practiceStats.totalMinutes % 60;
    html += `
            <h3>🎯 Je oefenstatistieken</h3>
            <p>Deze week heb je ${data.practiceStats.sessionCount} keer geoefend, totaal ${hours > 0 ? `${hours} uur en ` : ''}${minutes} minuten.</p>
        `;
  }

  html += `
        <hr>
        <p style="color: #666; font-size: 12px;">
            Je ontvangt deze email omdat je bent ingeschreven voor wekelijkse samenvattingen.
            Je kunt dit uitschakelen in je notificatie-instellingen.
        </p>
    `;

  const text = `Wekelijkse samenvatting voor ${associationName}. Bekijk de email in een HTML-compatibele mail client.`;
  await sendEmail({ to: user.email, subject, text, html });
}

// Export for scheduler integration
export default sendWeeklyDigest;
