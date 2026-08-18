import db from '../database/connection';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import twilio from 'twilio';
import { isModuleEnabled } from '../modules/service';

interface NotificationSettings {
  id: string;
  orchestra_id: string;
  notification_type: 'webhook' | 'whatsapp';
  webhook_url: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_whatsapp_from: string | null;
  twilio_whatsapp_to: string | null;
  minutes_before: number;
  enabled: boolean;
  include_image: boolean;
  message_template: string | null;
  orchestra_name: string;
  association_id: string;
}

interface Rehearsal {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
}

interface Seat {
  member_name: string;
  instrument_name: string | null;
  row_number: number;
  position_in_row: number;
  is_conductor: boolean;
}

// Run every minute to check for upcoming rehearsals
const CHECK_INTERVAL_MS = 60 * 1000;

let schedulerRunning = false;
let timeoutHandle: NodeJS.Timeout | null = null;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildDefaultMessage(
  orchestraName: string,
  rehearsal: Rehearsal,
  rows: { row: number; chairs: number }[],
  conductorCount: number,
  memberCount: number,
  declinedMembers: string[] = [],
): string {
  const lines = [
    `🎵 Opstelling ${orchestraName}`,
    `📅 ${formatDate(rehearsal.date)}${rehearsal.start_time ? ` om ${rehearsal.start_time}` : ''}`,
    rehearsal.location ? `📍 ${rehearsal.location}` : '',
    '',
    `👥 Totaal: ${memberCount} leden${conductorCount > 0 ? ` + ${conductorCount} dirigent${conductorCount > 1 ? 'en' : ''}` : ''}`,
    '',
    '🪑 Stoelen per rij:',
    ...rows.map((r) => `  Rij ${r.row}: ${r.chairs} stoelen`),
  ];

  // Add absent members section if there are any
  if (declinedMembers.length > 0) {
    lines.push('');
    lines.push(`❌ Afgemeld (${declinedMembers.length}):`);
    lines.push(`  ${declinedMembers.join(', ')}`);
  }

  return lines.filter(Boolean).join('\n');
}

async function sendWhatsApp(settings: NotificationSettings, message: string): Promise<boolean> {
  if (!settings.twilio_account_sid || !settings.twilio_auth_token) {
    logger.error('Twilio credentials not configured for WhatsApp');
    return false;
  }

  try {
    const client = twilio(settings.twilio_account_sid, settings.twilio_auth_token);
    const destinations = settings.twilio_whatsapp_to?.split(',').map((n) => n.trim()) || [];

    if (destinations.length === 0) {
      logger.error('No WhatsApp destination numbers configured');
      return false;
    }

    let allSuccessful = true;

    for (const to of destinations) {
      try {
        const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        const fromNumber = settings.twilio_whatsapp_from?.startsWith('whatsapp:')
          ? settings.twilio_whatsapp_from
          : `whatsapp:${settings.twilio_whatsapp_from}`;

        await client.messages.create({
          body: message,
          from: fromNumber,
          to: toNumber,
        });
        logger.info(`WhatsApp message sent to ${to}`);
      } catch (sendError) {
        const errorMsg = sendError instanceof Error ? sendError.message : 'Unknown error';
        logger.error(`Failed to send WhatsApp to ${to}`, { error: errorMsg });
        allSuccessful = false;
      }
    }

    return allSuccessful;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('WhatsApp sending failed', { error: errorMsg });
    return false;
  }
}

async function sendWebhook(settings: NotificationSettings, payload: Record<string, unknown>): Promise<boolean> {
  if (!settings.webhook_url) {
    logger.error('Webhook URL not configured');
    return false;
  }

  try {
    const response = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return true;
    } else {
      const responseText = await response.text();
      logger.error(`Webhook failed: HTTP ${response.status}`, { response: responseText });
      return false;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Webhook sending failed', { error: errorMsg });
    return false;
  }
}

async function sendNotification(settings: NotificationSettings, rehearsal: Rehearsal): Promise<boolean> {
  try {
    // Get seating arrangement
    const seating = db
      .prepare(
        `
            SELECT rs.*, ss.name as section_name
            FROM rehearsal_seating rs
            LEFT JOIN seating_sections ss ON rs.section_id = ss.id
            WHERE rs.rehearsal_id = ?
            ORDER BY rs.row_number, rs.position_in_row
        `,
      )
      .all(rehearsal.id) as Seat[];

    if (seating.length === 0) {
      logger.info('No seating arrangement for rehearsal, skipping notification', { rehearsalId: rehearsal.id });
      return false;
    }

    // Group by row
    const rowsMap = new Map<number, Seat[]>();
    for (const seat of seating) {
      if (!rowsMap.has(seat.row_number)) {
        rowsMap.set(seat.row_number, []);
      }
      rowsMap.get(seat.row_number)!.push(seat);
    }

    const rows = Array.from(rowsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([rowNumber, seats]) => ({
        row: rowNumber,
        chairs: seats.length,
        members: seats.map((s) => ({
          name: s.member_name,
          instrument: s.instrument_name,
          isConductor: Boolean(s.is_conductor),
        })),
      }));

    const conductors = seating.filter((s) => s.is_conductor);
    const regularMembers = seating.filter((s) => !s.is_conductor);

    // Get attendance data (declined members)
    const attendance = db
      .prepare(
        `
            SELECT member_name, status
            FROM rehearsal_attendance
            WHERE rehearsal_id = ?
            ORDER BY member_name
        `,
      )
      .all(rehearsal.id) as { member_name: string; status: string }[];

    const declinedMembers = attendance.filter((a) => a.status === 'declined').map((a) => a.member_name);

    // Build message
    let messageText =
      settings.message_template ||
      buildDefaultMessage(
        settings.orchestra_name,
        rehearsal,
        rows,
        conductors.length,
        regularMembers.length,
        declinedMembers,
      );

    messageText = messageText
      .replace('{orchestra}', settings.orchestra_name || 'Orkest')
      .replace('{date}', formatDate(rehearsal.date))
      .replace('{time}', rehearsal.start_time || '')
      .replace('{location}', rehearsal.location || '')
      .replace('{total_members}', String(regularMembers.length))
      .replace('{total_conductors}', String(conductors.length))
      .replace('{chairs_summary}', rows.map((r) => `Rij ${r.row}: ${r.chairs}`).join(', '))
      .replace('{absent_count}', String(declinedMembers.length))
      .replace('{absent_members}', declinedMembers.join(', ') || 'Niemand');

    // Create log entry
    const logId = uuidv4();
    db.prepare(
      `
            INSERT INTO seating_notification_logs (id, rehearsal_id, orchestra_id, status)
            VALUES (?, ?, ?, 'pending')
        `,
    ).run(logId, rehearsal.id, settings.orchestra_id);

    // Send based on notification type
    let success = false;

    if (settings.notification_type === 'whatsapp') {
      success = await sendWhatsApp(settings, messageText);
    } else {
      // Webhook payload
      const payload = {
        type: 'seating_notification',
        rehearsal: {
          id: rehearsal.id,
          date: rehearsal.date,
          startTime: rehearsal.start_time,
          endTime: rehearsal.end_time,
          location: rehearsal.location,
        },
        orchestra: {
          id: settings.orchestra_id,
          name: settings.orchestra_name,
        },
        seating: {
          totalMembers: regularMembers.length,
          totalConductors: conductors.length,
          rows,
        },
        message: messageText,
      };
      success = await sendWebhook(settings, payload);
    }

    if (success) {
      db.prepare(
        `
                UPDATE seating_notification_logs
                SET status = 'sent', webhook_response = ?, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `,
      ).run(settings.notification_type === 'whatsapp' ? 'WhatsApp message sent' : 'Webhook sent', logId);

      logger.info('Seating notification sent', {
        rehearsalId: rehearsal.id,
        orchestraId: settings.orchestra_id,
        type: settings.notification_type,
      });
      return true;
    } else {
      db.prepare(
        `
                UPDATE seating_notification_logs
                SET status = 'failed', error_message = ?, sent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `,
      ).run('Failed to send notification', logId);

      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send seating notification', { error: errorMessage, rehearsalId: rehearsal.id });
    return false;
  }
}

async function checkAndSendNotifications(): Promise<void> {
  if (!schedulerRunning) return;

  try {
    const now = new Date();

    // Get all enabled notification settings
    const allSettings = db
      .prepare(
        `
            SELECT sns.*, o.name as orchestra_name, o.association_id
            FROM seating_notification_settings sns
            JOIN orchestras o ON sns.orchestra_id = o.id
            WHERE sns.enabled = 1
        `,
      )
      .all() as NotificationSettings[];

    for (const settings of allSettings) {
      // Een vereniging die de module Podium en opstelling heeft uitgezet, mag
      // hier geen berichten over krijgen. De instellingen blijven staan, ze
      // worden alleen niet meer uitgevoerd - net als bij de rest van de
      // module: verbergen, niet verwijderen.
      if (!isModuleEnabled(settings.association_id, 'stage')) {
        continue;
      }

      // Calculate the target time window
      const targetTime = new Date(now.getTime() + settings.minutes_before * 60 * 1000);
      const windowStart = new Date(targetTime.getTime() - 2 * 60 * 1000); // 2 min before
      const windowEnd = new Date(targetTime.getTime() + 2 * 60 * 1000); // 2 min after

      const today = now.toISOString().split('T')[0];
      const windowStartTime = windowStart.toTimeString().substring(0, 5);
      const windowEndTime = windowEnd.toTimeString().substring(0, 5);

      // Find rehearsals in the time window that haven't been notified
      const rehearsals = db
        .prepare(
          `
                SELECT r.*
                FROM rehearsals r
                WHERE r.orchestra_id = ?
                AND r.date = ?
                AND r.start_time >= ?
                AND r.start_time <= ?
                AND NOT EXISTS (
                    SELECT 1 FROM seating_notification_logs snl
                    WHERE snl.rehearsal_id = r.id
                    AND snl.status = 'sent'
                )
            `,
        )
        .all(settings.orchestra_id, today, windowStartTime, windowEndTime) as Rehearsal[];

      for (const rehearsal of rehearsals) {
        await sendNotification(settings, rehearsal);
      }
    }
  } catch (error) {
    logger.error('Error in notification scheduler', { error });
  }

  // Schedule next check
  if (schedulerRunning) {
    timeoutHandle = setTimeout(checkAndSendNotifications, CHECK_INTERVAL_MS);
  }
}

export function startScheduler(): void {
  if (schedulerRunning) {
    logger.warn('Seating notification scheduler already running');
    return;
  }

  schedulerRunning = true;
  logger.info('Seating notification scheduler started');

  // Start checking after a short delay
  timeoutHandle = setTimeout(checkAndSendNotifications, 5000);
}

export function stopScheduler(): void {
  schedulerRunning = false;
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  logger.info('Seating notification scheduler stopped');
}
