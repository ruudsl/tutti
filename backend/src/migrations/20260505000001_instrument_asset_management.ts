/**
 * Migration: Instrument Asset Management
 * Created at: 2026-05-05
 *
 * Comprehensive instrument asset management system including:
 * - Extended asset details and tracking
 * - Valuation history
 * - Insurance management
 * - Repair tracking
 * - Document management
 * - Loan management with contracts
 */

import db from '../database/connection';

export function up(): void {
  // ===========================================
  // INSTRUMENT ASSETS (extends equipment)
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_assets (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            equipment_id TEXT,

            -- Basic identification
            name TEXT NOT NULL,
            instrument_type TEXT NOT NULL,
            category TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            serial_number TEXT,
            barcode TEXT,

            -- Physical details
            year_manufactured INTEGER,
            country_of_origin TEXT,
            color TEXT,
            material TEXT,
            weight_kg REAL,
            dimensions TEXT,

            -- Financial
            purchase_date TEXT,
            purchase_price REAL,
            purchase_vendor TEXT,
            current_value REAL,
            replacement_value REAL,
            depreciation_rate REAL DEFAULT 5.0,

            -- Status
            status TEXT NOT NULL DEFAULT 'available',
            condition TEXT DEFAULT 'good',
            location TEXT,
            storage_location TEXT,

            -- Assignment
            assigned_to_user_id TEXT,
            assigned_date TEXT,
            expected_return_date TEXT,

            -- Maintenance
            maintenance_interval_months INTEGER DEFAULT 12,
            last_maintenance_date TEXT,
            next_maintenance_due TEXT,
            maintenance_notes TEXT,

            -- Insurance reference
            insurance_policy_id TEXT,

            -- Media
            photo_urls TEXT,

            -- Metadata
            tags TEXT,
            notes TEXT,
            custom_fields TEXT,

            -- Audit
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,
            updated_by TEXT,
            deleted_at DATETIME,

            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL,
            FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

  // ===========================================
  // INSTRUMENT VALUATIONS
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_valuations (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,

            valuation_date TEXT NOT NULL,
            valuation_type TEXT NOT NULL,
            valued_amount REAL NOT NULL,
            currency TEXT DEFAULT 'EUR',

            appraiser_name TEXT,
            appraiser_company TEXT,
            appraiser_credentials TEXT,

            valuation_method TEXT,
            market_comparison TEXT,
            condition_at_valuation TEXT,

            certificate_url TEXT,
            notes TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,

            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INSTRUMENT INSURANCE
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_insurance_policies (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,

            policy_number TEXT NOT NULL,
            provider_name TEXT NOT NULL,
            provider_contact TEXT,
            provider_phone TEXT,
            provider_email TEXT,

            policy_type TEXT NOT NULL,
            coverage_type TEXT NOT NULL,
            coverage_amount REAL NOT NULL,
            deductible REAL DEFAULT 0,
            currency TEXT DEFAULT 'EUR',

            premium_amount REAL,
            premium_frequency TEXT,
            premium_due_date TEXT,

            start_date TEXT NOT NULL,
            end_date TEXT,
            auto_renew INTEGER DEFAULT 0,

            coverage_details TEXT,
            exclusions TEXT,

            document_url TEXT,

            status TEXT DEFAULT 'active',

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,

            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_insurance_coverage (
            id TEXT PRIMARY KEY,
            policy_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,

            covered_amount REAL NOT NULL,
            coverage_start TEXT NOT NULL,
            coverage_end TEXT,

            special_conditions TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (policy_id) REFERENCES instrument_insurance_policies(id) ON DELETE CASCADE,
            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_insurance_claims (
            id TEXT PRIMARY KEY,
            policy_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,

            claim_number TEXT,
            claim_date TEXT NOT NULL,
            incident_date TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            incident_description TEXT NOT NULL,
            incident_location TEXT,

            claimed_amount REAL,
            approved_amount REAL,
            paid_amount REAL,

            status TEXT DEFAULT 'submitted',

            police_report_number TEXT,
            witness_info TEXT,

            document_urls TEXT,
            photos TEXT,

            resolution_date TEXT,
            resolution_notes TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,

            FOREIGN KEY (policy_id) REFERENCES instrument_insurance_policies(id) ON DELETE CASCADE,
            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INSTRUMENT REPAIRS (extended)
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_repairs (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,

            repair_type TEXT NOT NULL,
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'pending',

            reported_date TEXT NOT NULL,
            reported_by TEXT,

            issue_description TEXT NOT NULL,
            diagnosis TEXT,

            repair_shop_name TEXT,
            repair_shop_contact TEXT,
            repair_shop_address TEXT,
            technician_name TEXT,

            estimated_cost REAL,
            actual_cost REAL,
            currency TEXT DEFAULT 'EUR',

            parts_replaced TEXT,
            labor_hours REAL,

            estimated_completion TEXT,
            started_date TEXT,
            completed_date TEXT,

            warranty_claim INTEGER DEFAULT 0,
            insurance_claim_id TEXT,

            before_photos TEXT,
            after_photos TEXT,

            quality_rating INTEGER,
            quality_notes TEXT,

            invoice_number TEXT,
            invoice_url TEXT,

            notes TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,

            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE,
            FOREIGN KEY (insurance_claim_id) REFERENCES instrument_insurance_claims(id) ON DELETE SET NULL
        )
    `);

  // ===========================================
  // INSTRUMENT LOANS (extended)
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_loans (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            borrower_user_id TEXT NOT NULL,

            loan_type TEXT DEFAULT 'standard',
            purpose TEXT,

            loan_date TEXT NOT NULL,
            expected_return_date TEXT,
            actual_return_date TEXT,

            condition_at_loan TEXT NOT NULL,
            condition_at_return TEXT,
            condition_photos_loan TEXT,
            condition_photos_return TEXT,

            accessories_loaned TEXT,
            accessories_returned TEXT,

            deposit_amount REAL,
            deposit_paid INTEGER DEFAULT 0,
            deposit_returned INTEGER DEFAULT 0,

            insurance_required INTEGER DEFAULT 0,
            insurance_verified INTEGER DEFAULT 0,
            insurance_policy_id TEXT,

            contract_signed INTEGER DEFAULT 0,
            contract_url TEXT,
            contract_signed_date TEXT,

            terms_accepted INTEGER DEFAULT 0,
            terms_version TEXT,

            rental_fee REAL,
            rental_period TEXT,

            status TEXT DEFAULT 'active',

            return_inspection_notes TEXT,
            damage_reported TEXT,
            damage_cost REAL,

            approved_by TEXT,
            approved_date TEXT,

            returned_to TEXT,
            return_verified INTEGER DEFAULT 0,

            notes TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,

            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE,
            FOREIGN KEY (borrower_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INSTRUMENT DOCUMENTS
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_documents (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,

            document_type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,

            file_url TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,

            version TEXT,
            valid_from TEXT,
            valid_until TEXT,

            is_public INTEGER DEFAULT 0,

            tags TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,

            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INSTRUMENT MAINTENANCE SCHEDULES
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_maintenance_schedules (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,

            maintenance_type TEXT NOT NULL,
            description TEXT,

            frequency_type TEXT NOT NULL,
            frequency_value INTEGER DEFAULT 1,

            last_performed TEXT,
            next_due TEXT,

            estimated_duration_hours REAL,
            estimated_cost REAL,

            assigned_to TEXT,

            reminder_days_before INTEGER DEFAULT 7,
            reminder_sent INTEGER DEFAULT 0,

            is_active INTEGER DEFAULT 1,

            notes TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INSTRUMENT HISTORY/AUDIT LOG
  // ===========================================

  db.exec(`
        CREATE TABLE IF NOT EXISTS instrument_history (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,

            event_type TEXT NOT NULL,
            event_date DATETIME DEFAULT CURRENT_TIMESTAMP,

            old_value TEXT,
            new_value TEXT,

            field_changed TEXT,

            related_id TEXT,
            related_type TEXT,

            description TEXT,

            user_id TEXT,
            user_name TEXT,

            ip_address TEXT,

            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (asset_id) REFERENCES instrument_assets(id) ON DELETE CASCADE
        )
    `);

  // ===========================================
  // INDEXES
  // ===========================================

  // Asset indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_association ON instrument_assets(association_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_status ON instrument_assets(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_type ON instrument_assets(instrument_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_category ON instrument_assets(category)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_assigned ON instrument_assets(assigned_to_user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_serial ON instrument_assets(serial_number)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_barcode ON instrument_assets(barcode)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_assets_deleted ON instrument_assets(deleted_at)');

  // Valuation indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_valuations_asset ON instrument_valuations(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_valuations_date ON instrument_valuations(valuation_date)');

  // Insurance indexes
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_insurance_policies_association ON instrument_insurance_policies(association_id)',
  );
  db.exec('CREATE INDEX IF NOT EXISTS idx_insurance_policies_status ON instrument_insurance_policies(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_insurance_coverage_policy ON instrument_insurance_coverage(policy_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_insurance_coverage_asset ON instrument_insurance_coverage(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy ON instrument_insurance_claims(policy_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_insurance_claims_asset ON instrument_insurance_claims(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON instrument_insurance_claims(status)');

  // Repair indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_repairs_asset ON instrument_repairs(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_repairs_status ON instrument_repairs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_repairs_priority ON instrument_repairs(priority)');

  // Loan indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_loans_asset ON instrument_loans(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_loans_borrower ON instrument_loans(borrower_user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_loans_status ON instrument_loans(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_loans_dates ON instrument_loans(loan_date, expected_return_date)');

  // Document indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_documents_asset ON instrument_documents(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_documents_type ON instrument_documents(document_type)');

  // Maintenance schedule indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_maintenance_asset ON instrument_maintenance_schedules(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_maintenance_next ON instrument_maintenance_schedules(next_due)');

  // History indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_history_asset ON instrument_history(asset_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_history_type ON instrument_history(event_type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_instrument_history_date ON instrument_history(event_date)');
}

export function down(): void {
  const tables = [
    'instrument_history',
    'instrument_maintenance_schedules',
    'instrument_documents',
    'instrument_loans',
    'instrument_repairs',
    'instrument_insurance_claims',
    'instrument_insurance_coverage',
    'instrument_insurance_policies',
    'instrument_valuations',
    'instrument_assets',
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
