/**
 * Migration: Audio Recordings and Section Chat
 * Created at: 2026-03-28
 *
 * This migration adds tables for audio recording of rehearsals and section-based chat.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // ===========================================
    // AUDIO RECORDER (Rehearsal recordings)
    // ===========================================

    // Audio recordings of rehearsals/sections
    db.exec(`
        CREATE TABLE IF NOT EXISTS audio_recordings (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            orchestra_id TEXT,
            rehearsal_id TEXT,
            music_title_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            duration_seconds INTEGER NOT NULL,
            mime_type TEXT NOT NULL DEFAULT 'audio/webm',
            recorded_by TEXT NOT NULL,
            is_public BOOLEAN DEFAULT 0,
            section_instrument_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
            FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE SET NULL,
            FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL,
            FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (section_instrument_id) REFERENCES instruments(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // SECTION CHAT
    // ===========================================

    // Chat channels per section/instrument group
    db.exec(`
        CREATE TABLE IF NOT EXISTS section_chat_channels (
            id TEXT PRIMARY KEY,
            orchestra_id TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            UNIQUE(orchestra_id, instrument_id)
        )
    `);

    // Chat messages
    db.exec(`
        CREATE TABLE IF NOT EXISTS section_chat_messages (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            reply_to_id TEXT,
            is_pinned BOOLEAN DEFAULT 0,
            is_edited BOOLEAN DEFAULT 0,
            edited_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES section_chat_channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reply_to_id) REFERENCES section_chat_messages(id) ON DELETE SET NULL
        )
    `);

    // Read status per user per channel
    db.exec(`
        CREATE TABLE IF NOT EXISTS section_chat_read_status (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            last_read_message_id TEXT,
            last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES section_chat_channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (last_read_message_id) REFERENCES section_chat_messages(id) ON DELETE SET NULL,
            UNIQUE(channel_id, user_id)
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_audio_recordings_association ON audio_recordings(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audio_recordings_orchestra ON audio_recordings(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audio_recordings_rehearsal ON audio_recordings(rehearsal_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audio_recordings_title ON audio_recordings(music_title_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audio_recordings_user ON audio_recordings(recorded_by)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audio_recordings_date ON audio_recordings(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_channels_orchestra ON section_chat_channels(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_channels_instrument ON section_chat_channels(instrument_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_messages_channel ON section_chat_messages(channel_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_messages_user ON section_chat_messages(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_messages_date ON section_chat_messages(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_read_status_channel ON section_chat_read_status(channel_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_section_chat_read_status_user ON section_chat_read_status(user_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'section_chat_read_status',
        'section_chat_messages',
        'section_chat_channels',
        'audio_recordings',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
