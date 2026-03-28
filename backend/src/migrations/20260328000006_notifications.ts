/**
 * Migration: Notifications and Seating Notifications
 * Created at: 2026-03-28
 *
 * This migration adds tables for notification management and seating notifications.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // ===========================================
    // SEATING NOTIFICATIONS (WhatsApp/Webhook)
    // ===========================================

    // Seating notification settings per orchestra
    db.exec(`
        CREATE TABLE IF NOT EXISTS seating_notification_settings (
            id TEXT PRIMARY KEY,
            orchestra_id TEXT NOT NULL UNIQUE,
            notification_type TEXT NOT NULL DEFAULT 'webhook',
            webhook_url TEXT,
            twilio_account_sid TEXT,
            twilio_auth_token TEXT,
            twilio_whatsapp_from TEXT,
            twilio_whatsapp_to TEXT,
            minutes_before INTEGER NOT NULL DEFAULT 15,
            enabled BOOLEAN DEFAULT 1,
            include_image BOOLEAN DEFAULT 1,
            message_template TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

    // Seating notification logs
    db.exec(`
        CREATE TABLE IF NOT EXISTS seating_notification_logs (
            id TEXT PRIMARY KEY,
            rehearsal_id TEXT NOT NULL,
            orchestra_id TEXT NOT NULL,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            webhook_response TEXT,
            FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // GENERAL NOTIFICATIONS
    // ===========================================

    // Notification preferences per user
    db.exec(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            new_music BOOLEAN DEFAULT 1,
            rehearsal_changes BOOLEAN DEFAULT 1,
            seating_updates BOOLEAN DEFAULT 1,
            chat_messages BOOLEAN DEFAULT 1,
            practice_reminders BOOLEAN DEFAULT 1,
            concert_reminders BOOLEAN DEFAULT 1,
            email_enabled BOOLEAN DEFAULT 1,
            push_enabled BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Notifications queue/history
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            data TEXT,
            is_read BOOLEAN DEFAULT 0,
            sent_push BOOLEAN DEFAULT 0,
            sent_email BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_notification_settings_orchestra ON seating_notification_settings(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_notification_logs_rehearsal ON seating_notification_logs(rehearsal_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_seating_notification_logs_status ON seating_notification_logs(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_date ON notifications(created_at)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'notifications',
        'notification_preferences',
        'seating_notification_logs',
        'seating_notification_settings',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
