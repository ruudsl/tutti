import db from '../database/connection';

export const id = '20260329000001';
export const name = 'ticketing_enhancements';

/**
 * Helper to check if a column exists in a table
 */
function columnExists(table: string, column: string): boolean {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return columns.some(c => c.name === column);
}

/**
 * Helper to add column if it doesn't exist
 */
function addColumnIfNotExists(table: string, column: string, definition: string): void {
    if (!columnExists(table, column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

/**
 * Run the migration
 */
export function up(): void {
    // =============================================
    // EARLY-BIRD PRICING
    // =============================================

    // Add early-bird pricing fields to ticket_types
    addColumnIfNotExists('ticket_types', 'early_bird_price', 'REAL');
    addColumnIfNotExists('ticket_types', 'early_bird_end_date', 'DATETIME');
    addColumnIfNotExists('ticket_types', 'early_bird_quantity', 'INTEGER');

    // =============================================
    // GROUP DISCOUNTS (STAFFEL PRICING)
    // =============================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_group_discounts (
            id TEXT PRIMARY KEY,
            ticket_type_id TEXT NOT NULL,
            min_quantity INTEGER NOT NULL,
            max_quantity INTEGER,
            discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'fixed_price')),
            discount_value REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_group_discounts_ticket_type ON ticket_group_discounts(ticket_type_id);
    `);

    // =============================================
    // DISCOUNT CODES / VOUCHERS
    // =============================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS discount_codes (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            code TEXT NOT NULL,
            description TEXT,
            discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
            discount_value REAL NOT NULL,
            min_order_amount REAL DEFAULT 0,
            max_uses INTEGER,
            uses_count INTEGER DEFAULT 0,
            max_uses_per_user INTEGER DEFAULT 1,
            valid_from DATETIME,
            valid_until DATETIME,
            concert_ids TEXT, -- JSON array of concert IDs, null = all concerts
            ticket_type_ids TEXT, -- JSON array of ticket type IDs, null = all types
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE(association_id, code)
        );

        CREATE INDEX IF NOT EXISTS idx_discount_codes_association ON discount_codes(association_id);
        CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);

        -- Track discount code usage
        CREATE TABLE IF NOT EXISTS discount_code_usage (
            id TEXT PRIMARY KEY,
            discount_code_id TEXT NOT NULL,
            order_id TEXT NOT NULL,
            user_email TEXT NOT NULL,
            discount_amount REAL NOT NULL,
            used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES ticket_orders(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_discount_usage_code ON discount_code_usage(discount_code_id);
        CREATE INDEX IF NOT EXISTS idx_discount_usage_email ON discount_code_usage(user_email);
    `);

    // =============================================
    // SEAT SELECTION / VENUE LAYOUT
    // =============================================

    db.exec(`
        -- Venue layouts for seated events
        CREATE TABLE IF NOT EXISTS venue_layouts (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            layout_data TEXT NOT NULL, -- JSON with rows, sections, seats
            capacity INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        );

        -- Seats in a layout
        CREATE TABLE IF NOT EXISTS venue_seats (
            id TEXT PRIMARY KEY,
            layout_id TEXT NOT NULL,
            section TEXT NOT NULL,
            row_name TEXT NOT NULL,
            seat_number TEXT NOT NULL,
            seat_type TEXT DEFAULT 'regular', -- regular, wheelchair, companion, vip
            x_position REAL NOT NULL,
            y_position REAL NOT NULL,
            price_category TEXT DEFAULT 'standard', -- used to link to ticket types
            is_available BOOLEAN DEFAULT 1,
            FOREIGN KEY (layout_id) REFERENCES venue_layouts(id) ON DELETE CASCADE,
            UNIQUE(layout_id, section, row_name, seat_number)
        );

        CREATE INDEX IF NOT EXISTS idx_venue_seats_layout ON venue_seats(layout_id);
    `);

    // Link concert to a venue layout
    addColumnIfNotExists('concerts', 'venue_layout_id', 'TEXT REFERENCES venue_layouts(id) ON DELETE SET NULL');
    addColumnIfNotExists('concerts', 'is_seated_event', 'BOOLEAN DEFAULT 0');

    db.exec(`
        -- Reserved/sold seats for a concert
        CREATE TABLE IF NOT EXISTS concert_seat_reservations (
            id TEXT PRIMARY KEY,
            concert_id TEXT NOT NULL,
            seat_id TEXT NOT NULL,
            order_id TEXT,
            ticket_id TEXT,
            status TEXT NOT NULL DEFAULT 'available', -- available, reserved, sold, blocked
            reserved_at DATETIME,
            reservation_expires_at DATETIME,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
            FOREIGN KEY (seat_id) REFERENCES venue_seats(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES ticket_orders(id) ON DELETE SET NULL,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
            UNIQUE(concert_id, seat_id)
        );

        CREATE INDEX IF NOT EXISTS idx_seat_reservations_concert ON concert_seat_reservations(concert_id);
        CREATE INDEX IF NOT EXISTS idx_seat_reservations_order ON concert_seat_reservations(order_id);
    `);

    // =============================================
    // RESERVATION EXTENSION
    // =============================================

    addColumnIfNotExists('ticket_orders', 'extension_count', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('ticket_orders', 'max_extensions', 'INTEGER DEFAULT 2');

    // =============================================
    // ACCESSIBILITY INFORMATION
    // =============================================

    addColumnIfNotExists('concerts', 'accessibility_info', 'TEXT');
    addColumnIfNotExists('concerts', 'wheelchair_spaces', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('concerts', 'companion_spaces', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('concerts', 'hearing_loop_available', 'BOOLEAN DEFAULT 0');
    addColumnIfNotExists('concerts', 'accessible_parking_info', 'TEXT');

    // =============================================
    // INVOICE GENERATION
    // =============================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_invoices (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL UNIQUE,
            invoice_number TEXT NOT NULL UNIQUE,
            buyer_company_name TEXT,
            buyer_vat_number TEXT,
            buyer_address TEXT,
            buyer_postal_code TEXT,
            buyer_city TEXT,
            buyer_country TEXT DEFAULT 'NL',
            subtotal REAL NOT NULL,
            vat_amount REAL NOT NULL,
            vat_rate REAL DEFAULT 9, -- Default 9% for cultural events in NL
            total REAL NOT NULL,
            service_fee REAL DEFAULT 0,
            pdf_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES ticket_orders(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_invoices_order ON ticket_invoices(order_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_number ON ticket_invoices(invoice_number);

        -- Invoice line items
        CREATE TABLE IF NOT EXISTS invoice_line_items (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL,
            description TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            vat_rate REAL NOT NULL,
            total REAL NOT NULL,
            FOREIGN KEY (invoice_id) REFERENCES ticket_invoices(id) ON DELETE CASCADE
        );
    `);

    // =============================================
    // SERVICE FEE SETTINGS
    // =============================================

    addColumnIfNotExists('ticket_types', 'service_fee', 'REAL DEFAULT 0');
    addColumnIfNotExists('ticket_types', 'show_service_fee_separate', 'BOOLEAN DEFAULT 0');

    // =============================================
    // TICKET SALES ANALYTICS
    // =============================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_sales_snapshots (
            id TEXT PRIMARY KEY,
            concert_id TEXT NOT NULL,
            snapshot_date DATE NOT NULL,
            total_sold INTEGER NOT NULL,
            total_revenue REAL NOT NULL,
            sales_by_type TEXT NOT NULL, -- JSON object
            sales_by_hour TEXT, -- JSON object for hourly breakdown
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
            UNIQUE(concert_id, snapshot_date)
        );

        CREATE INDEX IF NOT EXISTS idx_sales_snapshots_concert ON ticket_sales_snapshots(concert_id);
        CREATE INDEX IF NOT EXISTS idx_sales_snapshots_date ON ticket_sales_snapshots(snapshot_date);
    `);

    // =============================================
    // TICKET TRANSFER
    // =============================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_transfers (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            from_email TEXT NOT NULL,
            to_email TEXT NOT NULL,
            to_name TEXT NOT NULL,
            transfer_code TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, cancelled, expired
            requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON ticket_transfers(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_ticket_transfers_code ON ticket_transfers(transfer_code);
    `);

    // Add transfer tracking to tickets
    addColumnIfNotExists('tickets', 'original_buyer_email', 'TEXT');
    addColumnIfNotExists('tickets', 'transfer_count', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('tickets', 'max_transfers', 'INTEGER DEFAULT 1');

    // =============================================
    // RATE LIMITING / BOT PROTECTION
    // =============================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS checkout_rate_limits (
            id TEXT PRIMARY KEY,
            ip_address TEXT NOT NULL,
            user_agent TEXT,
            action TEXT NOT NULL, -- checkout_start, checkout_complete, failed_payment
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON checkout_rate_limits(ip_address);
        CREATE INDEX IF NOT EXISTS idx_rate_limits_created ON checkout_rate_limits(created_at);

        -- Blocked IPs
        CREATE TABLE IF NOT EXISTS blocked_ips (
            id TEXT PRIMARY KEY,
            ip_address TEXT NOT NULL UNIQUE,
            reason TEXT,
            blocked_until DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_blocked_ips_address ON blocked_ips(ip_address);
    `);

    // =============================================
    // CAPTCHA TRACKING
    // =============================================

    addColumnIfNotExists('ticket_orders', 'captcha_verified', 'BOOLEAN DEFAULT 0');
    addColumnIfNotExists('ticket_orders', 'ip_address', 'TEXT');
    addColumnIfNotExists('ticket_orders', 'user_agent', 'TEXT');

    // =============================================
    // OFFLINE SCANNER SUPPORT
    // =============================================

    db.exec(`
        -- Sync tokens for offline scanner
        CREATE TABLE IF NOT EXISTS scanner_sync_tokens (
            id TEXT PRIMARY KEY,
            concert_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            last_sync_at DATETIME,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_scanner_tokens_concert ON scanner_sync_tokens(concert_id);
        CREATE INDEX IF NOT EXISTS idx_scanner_tokens_token ON scanner_sync_tokens(token);

        -- Offline scan queue (for syncing when back online)
        CREATE TABLE IF NOT EXISTS offline_scan_queue (
            id TEXT PRIMARY KEY,
            sync_token_id TEXT NOT NULL,
            ticket_qr_code TEXT NOT NULL,
            scanned_at DATETIME NOT NULL,
            scan_result TEXT NOT NULL, -- valid, already_used, not_found
            synced BOOLEAN DEFAULT 0,
            synced_at DATETIME,
            FOREIGN KEY (sync_token_id) REFERENCES scanner_sync_tokens(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_offline_scans_token ON offline_scan_queue(sync_token_id);
        CREATE INDEX IF NOT EXISTS idx_offline_scans_synced ON offline_scan_queue(synced);
    `);

    // =============================================
    // DYNAMIC QR CODES
    // =============================================

    // QR code rotation for fraud prevention
    addColumnIfNotExists('tickets', 'qr_secret', 'TEXT');
    addColumnIfNotExists('tickets', 'qr_rotation_interval', 'INTEGER DEFAULT 300');
    addColumnIfNotExists('tickets', 'last_qr_rotation', 'DATETIME');

    db.exec(`
        -- QR validation attempts (for detecting sharing)
        CREATE TABLE IF NOT EXISTS qr_validation_attempts (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            qr_code_used TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT,
            location_lat REAL,
            location_lng REAL,
            is_valid BOOLEAN NOT NULL,
            validation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_qr_attempts_ticket ON qr_validation_attempts(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_qr_attempts_time ON qr_validation_attempts(validation_time);
    `);

    // =============================================
    // MULTILINGUAL TICKET EMAILS
    // =============================================

    addColumnIfNotExists('ticket_orders', 'language', "TEXT DEFAULT 'nl'");

    // =============================================
    // SOCIAL LOGIN TRACKING
    // =============================================

    addColumnIfNotExists('ticket_orders', 'auth_provider', 'TEXT');
}

/**
 * Rollback the migration
 */
export function down(): void {
    // Drop all new tables
    db.exec(`
        DROP TABLE IF EXISTS qr_validation_attempts;
        DROP TABLE IF EXISTS offline_scan_queue;
        DROP TABLE IF EXISTS scanner_sync_tokens;
        DROP TABLE IF EXISTS blocked_ips;
        DROP TABLE IF EXISTS checkout_rate_limits;
        DROP TABLE IF EXISTS ticket_transfers;
        DROP TABLE IF EXISTS ticket_sales_snapshots;
        DROP TABLE IF EXISTS invoice_line_items;
        DROP TABLE IF EXISTS ticket_invoices;
        DROP TABLE IF EXISTS concert_seat_reservations;
        DROP TABLE IF EXISTS venue_seats;
        DROP TABLE IF EXISTS venue_layouts;
        DROP TABLE IF EXISTS discount_code_usage;
        DROP TABLE IF EXISTS discount_codes;
        DROP TABLE IF EXISTS ticket_group_discounts;
    `);

    // Note: SQLite doesn't support DROP COLUMN, so we can't fully rollback
    // In production, you would need to recreate tables without the new columns
}
