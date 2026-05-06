/**
 * Migration: Events Planner and Multi-Association Support
 * Created at: 2026-05-06
 *
 * This migration adds:
 * 1. Extended event planning capabilities (locations, transport, schedules, packing lists, weather)
 * 2. Enhanced multi-association support with super-admin and cross-association features
 */

import db from '../database/connection';

export function up(): void {
    // ===========================================
    // EVENT LOCATIONS (Venues)
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_locations (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            city TEXT,
            postal_code TEXT,
            country TEXT DEFAULT 'Nederland',
            latitude REAL,
            longitude REAL,
            venue_type TEXT,
            capacity INTEGER,
            indoor_outdoor TEXT DEFAULT 'indoor',
            has_electricity BOOLEAN DEFAULT 1,
            has_changing_rooms BOOLEAN DEFAULT 0,
            has_storage BOOLEAN DEFAULT 0,
            has_catering BOOLEAN DEFAULT 0,
            has_parking BOOLEAN DEFAULT 0,
            parking_info TEXT,
            accessibility_info TEXT,
            contact_name TEXT,
            contact_phone TEXT,
            contact_email TEXT,
            notes TEXT,
            is_favorite BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // EVENTS (extends concerts)
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            concert_id TEXT,
            name TEXT NOT NULL,
            event_type TEXT NOT NULL DEFAULT 'performance',
            status TEXT NOT NULL DEFAULT 'planned',
            location_id TEXT,
            location_name TEXT,
            address TEXT,
            city TEXT,
            latitude REAL,
            longitude REAL,
            indoor_outdoor TEXT DEFAULT 'indoor',
            start_datetime DATETIME NOT NULL,
            end_datetime DATETIME,
            setup_time DATETIME,
            soundcheck_time DATETIME,
            doors_time DATETIME,
            performance_time DATETIME,
            break_time DATETIME,
            pack_down_time DATETIME,
            expected_audience INTEGER,
            dress_code TEXT,
            description TEXT,
            internal_notes TEXT,
            public_notes TEXT,
            fee_amount REAL,
            fee_currency TEXT DEFAULT 'EUR',
            expenses_budget REAL,
            is_public BOOLEAN DEFAULT 0,
            requires_tickets BOOLEAN DEFAULT 0,
            weather_sensitive BOOLEAN DEFAULT 0,
            backup_location_id TEXT,
            backup_location_name TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE SET NULL,
            FOREIGN KEY (location_id) REFERENCES event_locations(id) ON DELETE SET NULL,
            FOREIGN KEY (backup_location_id) REFERENCES event_locations(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Event orchestras (which orchestras are performing)
    db.exec(`
        CREATE TABLE IF NOT EXISTS event_orchestras (
            event_id TEXT NOT NULL,
            orchestra_id TEXT NOT NULL,
            performance_order INTEGER DEFAULT 0,
            set_duration_minutes INTEGER,
            notes TEXT,
            PRIMARY KEY (event_id, orchestra_id),
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // EVENT SCHEDULES / TIMELINES
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_schedule_items (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            duration_minutes INTEGER,
            item_type TEXT NOT NULL DEFAULT 'general',
            responsible_user_id TEXT,
            responsible_name TEXT,
            location_description TEXT,
            is_public BOOLEAN DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            status TEXT DEFAULT 'scheduled',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // TRANSPORT COORDINATION
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_transport (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            transport_type TEXT NOT NULL DEFAULT 'car',
            vehicle_description TEXT,
            license_plate TEXT,
            capacity INTEGER,
            driver_user_id TEXT,
            driver_name TEXT,
            driver_phone TEXT,
            departure_time DATETIME,
            departure_location TEXT,
            departure_address TEXT,
            departure_latitude REAL,
            departure_longitude REAL,
            arrival_time DATETIME,
            return_time DATETIME,
            return_departure_time DATETIME,
            notes TEXT,
            status TEXT DEFAULT 'planned',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (driver_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_transport_passengers (
            id TEXT PRIMARY KEY,
            transport_id TEXT NOT NULL,
            user_id TEXT,
            passenger_name TEXT NOT NULL,
            pickup_location TEXT,
            pickup_address TEXT,
            pickup_time DATETIME,
            notes TEXT,
            confirmed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transport_id) REFERENCES event_transport(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_meeting_points (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            city TEXT,
            latitude REAL,
            longitude REAL,
            meeting_time DATETIME NOT NULL,
            description TEXT,
            is_primary BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // PACKING LISTS
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS packing_list_templates (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            event_type TEXT,
            is_default BOOLEAN DEFAULT 0,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS packing_list_template_items (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            item_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            is_required BOOLEAN DEFAULT 1,
            responsible_role TEXT,
            notes TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (template_id) REFERENCES packing_list_templates(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_packing_lists (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            template_id TEXT,
            name TEXT NOT NULL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES packing_list_templates(id) ON DELETE SET NULL
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_packing_items (
            id TEXT PRIMARY KEY,
            packing_list_id TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            item_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            quantity_packed INTEGER DEFAULT 0,
            is_required BOOLEAN DEFAULT 1,
            is_packed BOOLEAN DEFAULT 0,
            packed_by_user_id TEXT,
            packed_at DATETIME,
            responsible_user_id TEXT,
            responsible_name TEXT,
            notes TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (packing_list_id) REFERENCES event_packing_lists(id) ON DELETE CASCADE,
            FOREIGN KEY (packed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // WEATHER TRACKING
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_weather (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            fetched_at DATETIME NOT NULL,
            forecast_date DATE NOT NULL,
            forecast_time TIME,
            temperature_c REAL,
            feels_like_c REAL,
            humidity_percent INTEGER,
            wind_speed_kmh REAL,
            wind_direction TEXT,
            precipitation_mm REAL,
            precipitation_probability INTEGER,
            weather_code TEXT,
            weather_description TEXT,
            uv_index REAL,
            cloud_cover_percent INTEGER,
            visibility_km REAL,
            sunrise TEXT,
            sunset TEXT,
            is_outdoor_suitable BOOLEAN,
            alert_level TEXT,
            alert_message TEXT,
            raw_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS weather_settings (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL UNIQUE,
            api_provider TEXT DEFAULT 'openweathermap',
            api_key TEXT,
            auto_fetch BOOLEAN DEFAULT 1,
            fetch_days_before INTEGER DEFAULT 7,
            outdoor_temp_min_c REAL DEFAULT 5,
            outdoor_temp_max_c REAL DEFAULT 35,
            max_wind_speed_kmh REAL DEFAULT 40,
            max_precipitation_mm REAL DEFAULT 5,
            max_precipitation_prob INTEGER DEFAULT 50,
            alert_threshold_hours INTEGER DEFAULT 24,
            notify_on_change BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
        )
    `);

    // ===========================================
    // EVENT ATTENDANCE & AVAILABILITY
    // ===========================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_attendance (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            response_date DATETIME,
            instrument_id TEXT,
            transport_needed BOOLEAN DEFAULT 0,
            can_drive BOOLEAN DEFAULT 0,
            available_seats INTEGER DEFAULT 0,
            dietary_requirements TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (event_id, user_id),
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // MULTI-ASSOCIATION SUPPORT
    // ===========================================

    db.exec(`
        ALTER TABLE associations ADD COLUMN parent_id TEXT REFERENCES associations(id) ON DELETE SET NULL
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN subscription_tier TEXT DEFAULT 'free'
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN subscription_expires DATETIME
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN max_members INTEGER DEFAULT 100
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN max_orchestras INTEGER DEFAULT 5
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN max_storage_mb INTEGER DEFAULT 5000
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN is_active BOOLEAN DEFAULT 1
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN slug TEXT
    `);

    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_associations_slug ON associations(slug) WHERE slug IS NOT NULL
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN website TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN phone TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN email TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN address TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN city TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN postal_code TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN country TEXT DEFAULT 'Nederland'
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN billing_email TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN kvk_number TEXT
    `);

    db.exec(`
        ALTER TABLE associations ADD COLUMN iban TEXT
    `);

    // Super admins table
    db.exec(`
        CREATE TABLE IF NOT EXISTS super_admins (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            permissions TEXT DEFAULT '["all"]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // User membership in multiple associations
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_associations (
            user_id TEXT NOT NULL,
            association_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            is_primary BOOLEAN DEFAULT 0,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            invited_by TEXT,
            status TEXT DEFAULT 'active',
            PRIMARY KEY (user_id, association_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Association invitations
    db.exec(`
        CREATE TABLE IF NOT EXISTS association_invitations (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            invited_by TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Cross-association sharing
    db.exec(`
        CREATE TABLE IF NOT EXISTS association_partnerships (
            id TEXT PRIMARY KEY,
            association_a_id TEXT NOT NULL,
            association_b_id TEXT NOT NULL,
            partnership_type TEXT DEFAULT 'sharing',
            share_music BOOLEAN DEFAULT 0,
            share_events BOOLEAN DEFAULT 0,
            share_members BOOLEAN DEFAULT 0,
            status TEXT DEFAULT 'pending',
            requested_by TEXT NOT NULL,
            approved_by TEXT,
            approved_at DATETIME,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (association_a_id, association_b_id),
            FOREIGN KEY (association_a_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (association_b_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // Shared events between associations
    db.exec(`
        CREATE TABLE IF NOT EXISTS shared_events (
            event_id TEXT NOT NULL,
            association_id TEXT NOT NULL,
            can_edit BOOLEAN DEFAULT 0,
            can_add_members BOOLEAN DEFAULT 0,
            shared_by TEXT NOT NULL,
            shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (event_id, association_id),
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Association activity log
    db.exec(`
        CREATE TABLE IF NOT EXISTS association_activity_log (
            id TEXT PRIMARY KEY,
            association_id TEXT NOT NULL,
            user_id TEXT,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            details TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
    `);

    // ===========================================
    // INDEXES
    // ===========================================

    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_association ON events(association_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_start_datetime ON events(start_datetime)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_locations_association ON event_locations(association_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_schedule_items_event ON event_schedule_items(event_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_transport_event ON event_transport(event_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_packing_items_list ON event_packing_items(packing_list_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_weather_event ON event_weather(event_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_attendance_event ON event_attendance(event_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_event_attendance_user ON event_attendance(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_associations_user ON user_associations(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_associations_association ON user_associations(association_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_association_activity_log_association ON association_activity_log(association_id)`);
}

export function down(): void {
    // Drop indexes
    db.exec(`DROP INDEX IF EXISTS idx_events_association`);
    db.exec(`DROP INDEX IF EXISTS idx_events_start_datetime`);
    db.exec(`DROP INDEX IF EXISTS idx_events_status`);
    db.exec(`DROP INDEX IF EXISTS idx_event_locations_association`);
    db.exec(`DROP INDEX IF EXISTS idx_event_schedule_items_event`);
    db.exec(`DROP INDEX IF EXISTS idx_event_transport_event`);
    db.exec(`DROP INDEX IF EXISTS idx_event_packing_items_list`);
    db.exec(`DROP INDEX IF EXISTS idx_event_weather_event`);
    db.exec(`DROP INDEX IF EXISTS idx_event_attendance_event`);
    db.exec(`DROP INDEX IF EXISTS idx_event_attendance_user`);
    db.exec(`DROP INDEX IF EXISTS idx_user_associations_user`);
    db.exec(`DROP INDEX IF EXISTS idx_user_associations_association`);
    db.exec(`DROP INDEX IF EXISTS idx_association_activity_log_association`);

    // Drop tables in reverse order
    db.exec(`DROP TABLE IF EXISTS association_activity_log`);
    db.exec(`DROP TABLE IF EXISTS shared_events`);
    db.exec(`DROP TABLE IF EXISTS association_partnerships`);
    db.exec(`DROP TABLE IF EXISTS association_invitations`);
    db.exec(`DROP TABLE IF EXISTS user_associations`);
    db.exec(`DROP TABLE IF EXISTS super_admins`);
    db.exec(`DROP TABLE IF EXISTS event_attendance`);
    db.exec(`DROP TABLE IF EXISTS weather_settings`);
    db.exec(`DROP TABLE IF EXISTS event_weather`);
    db.exec(`DROP TABLE IF EXISTS event_packing_items`);
    db.exec(`DROP TABLE IF EXISTS event_packing_lists`);
    db.exec(`DROP TABLE IF EXISTS packing_list_template_items`);
    db.exec(`DROP TABLE IF EXISTS packing_list_templates`);
    db.exec(`DROP TABLE IF EXISTS event_meeting_points`);
    db.exec(`DROP TABLE IF EXISTS event_transport_passengers`);
    db.exec(`DROP TABLE IF EXISTS event_transport`);
    db.exec(`DROP TABLE IF EXISTS event_schedule_items`);
    db.exec(`DROP TABLE IF EXISTS event_orchestras`);
    db.exec(`DROP TABLE IF EXISTS events`);
    db.exec(`DROP TABLE IF EXISTS event_locations`);
}
