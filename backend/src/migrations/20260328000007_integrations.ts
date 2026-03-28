/**
 * Migration: Integrations (Entra ID, M365, Audit Logs)
 * Created at: 2026-03-28
 *
 * This migration adds tables for Microsoft Entra ID sync, M365 integration, and audit logging.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // ===========================================
    // ENTRA ID SYNCHRONIZATION
    // ===========================================

    // Job title to instrument mappings
    db.exec(`
        CREATE TABLE IF NOT EXISTS job_title_instrument_mappings (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            job_title TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            UNIQUE(association_id, job_title)
        )
    `);

    // ===========================================
    // AUDIT LOGS
    // ===========================================

    // Audit log table for tracking all changes
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            entity_name TEXT,
            changes TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // ONBOARDING & OFFBOARDING
    // ===========================================

    // Onboarding tasks for tracking
    db.exec(`
        CREATE TABLE IF NOT EXISTS onboarding_tasks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            association_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            metadata TEXT,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // Pending Spond links
    db.exec(`
        CREATE TABLE IF NOT EXISTS pending_spond_links (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            association_id TEXT NOT NULL,
            expected_email TEXT,
            expected_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // M365 INTEGRATION
    // ===========================================

    // M365 group mappings for orchestras
    db.exec(`
        CREATE TABLE IF NOT EXISTS m365_group_mappings (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            orchestra_id TEXT,
            group_name TEXT NOT NULL,
            group_type TEXT NOT NULL DEFAULT 'orchestra',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

    // Instrument to Job Title mapping (for M365 job title)
    db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_job_title_mappings (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            instrument_id TEXT NOT NULL,
            job_title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
            UNIQUE(association_id, instrument_id)
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_job_title_mappings_association ON job_title_instrument_mappings(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_job_title_mappings_title ON job_title_instrument_mappings(job_title)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_user ON onboarding_tasks(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_status ON onboarding_tasks(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_pending_spond_links_email ON pending_spond_links(expected_email)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_pending_spond_links_user ON pending_spond_links(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_m365_group_mappings_association ON m365_group_mappings(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_m365_group_mappings_orchestra ON m365_group_mappings(orchestra_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_job_title_mappings_association ON instrument_job_title_mappings(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_job_title_mappings_instrument ON instrument_job_title_mappings(instrument_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'instrument_job_title_mappings',
        'm365_group_mappings',
        'pending_spond_links',
        'onboarding_tasks',
        'audit_logs',
        'job_title_instrument_mappings',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
