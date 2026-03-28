/**
 * Migration: Equipment and Uniforms Management
 * Created at: 2026-03-28
 *
 * This migration adds tables for equipment (instrument) loans and uniform management.
 */

import db from '../database/connection';

/**
 * Run the migration
 */
export function up(): void {
    // ===========================================
    // EQUIPMENT MANAGEMENT
    // ===========================================

    // Physical equipment inventory
    db.exec(`
        CREATE TABLE IF NOT EXISTS equipment (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            instrument_type TEXT NOT NULL,
            brand_model TEXT,
            serial_number TEXT,
            year_of_manufacture INTEGER,
            status TEXT NOT NULL DEFAULT 'available',
            current_user_id TEXT,
            notes TEXT,
            maintenance_interval_months INTEGER DEFAULT 12,
            last_maintenance_date TEXT,
            next_maintenance_date TEXT,
            purchase_price REAL,
            current_value REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (current_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Equipment damage logs
    db.exec(`
        CREATE TABLE IF NOT EXISTS equipment_damage_logs (
            id TEXT PRIMARY KEY,
            equipment_id TEXT NOT NULL,
            date TEXT NOT NULL,
            description TEXT NOT NULL,
            repair_cost REAL,
            repaired_by TEXT,
            status TEXT DEFAULT 'reported',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
        )
    `);

    // Equipment loan history
    db.exec(`
        CREATE TABLE IF NOT EXISTS equipment_loans (
            id TEXT PRIMARY KEY,
            equipment_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            loan_date TEXT NOT NULL,
            return_date TEXT,
            condition_at_loan TEXT,
            condition_at_return TEXT,
            notes TEXT,
            agreement_pdf_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // UNIFORM MANAGEMENT
    // ===========================================

    // Uniform items
    db.exec(`
        CREATE TABLE IF NOT EXISTS uniform_items (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            size_standard TEXT,
            size_length INTEGER,
            size_width INTEGER,
            color TEXT,
            condition TEXT DEFAULT 'good',
            status TEXT DEFAULT 'available',
            current_user_id TEXT,
            notes TEXT,
            purchase_date TEXT,
            purchase_price REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (current_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Uniform sets
    db.exec(`
        CREATE TABLE IF NOT EXISTS uniform_sets (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // Uniform set requirements
    db.exec(`
        CREATE TABLE IF NOT EXISTS uniform_set_requirements (
            id TEXT PRIMARY KEY,
            set_id TEXT NOT NULL,
            item_type TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            FOREIGN KEY (set_id) REFERENCES uniform_sets(id) ON DELETE CASCADE
        )
    `);

    // Uniform assignments
    db.exec(`
        CREATE TABLE IF NOT EXISTS uniform_assignments (
            id TEXT PRIMARY KEY,
            uniform_item_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            assigned_date TEXT NOT NULL,
            returned_date TEXT,
            condition_at_assignment TEXT,
            condition_at_return TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uniform_item_id) REFERENCES uniform_items(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_association ON equipment(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_user ON equipment(current_user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_damage_equipment ON equipment_damage_logs(equipment_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_loans_equipment ON equipment_loans(equipment_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_equipment_loans_user ON equipment_loans(user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_items_association ON uniform_items(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_items_type ON uniform_items(item_type)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_items_status ON uniform_items(status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_items_user ON uniform_items(current_user_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_sets_association ON uniform_sets(association_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_assignments_item ON uniform_assignments(uniform_item_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_uniform_assignments_user ON uniform_assignments(user_id)');
}

/**
 * Rollback the migration
 */
export function down(): void {
    const tables = [
        'uniform_assignments',
        'uniform_set_requirements',
        'uniform_sets',
        'uniform_items',
        'equipment_loans',
        'equipment_damage_logs',
        'equipment',
    ];

    for (const table of tables) {
        db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
}
