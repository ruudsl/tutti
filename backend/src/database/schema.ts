// Database schema voor de harmonie muziek applicatie

export const schema = `
-- Verenigingen (voor het delen van muziekstukken tussen verenigingen)
CREATE TABLE IF NOT EXISTS associations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    logo_path TEXT,
    theme_json TEXT,
    microsoft_client_id TEXT,
    microsoft_client_secret TEXT,
    microsoft_tenant_id TEXT,
    microsoft_enabled BOOLEAN DEFAULT 0,
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT 0,
    smtp_user TEXT,
    smtp_pass TEXT,
    smtp_from TEXT,
    smtp_enabled BOOLEAN DEFAULT 0,
    google_drive_client_id TEXT,
    google_drive_api_key TEXT,
    google_drive_enabled BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Orkesten binnen een vereniging
CREATE TABLE IF NOT EXISTS orchestras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    association_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Instrumenten met hoofdnaam
CREATE TABLE IF NOT EXISTS instruments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tuning TEXT, -- Stemming bijv. Bb, Eb, C
    clef TEXT DEFAULT 'sol', -- Muzieksleutel: sol, fa, ut
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tuning, clef)
);

-- Subnamen/aliassen voor instrumenten
CREATE TABLE IF NOT EXISTS instrument_aliases (
    id TEXT PRIMARY KEY,
    instrument_id TEXT NOT NULL,
    alias TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    UNIQUE(instrument_id, alias)
);

-- Gebruikers/Leden
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- admin, music_committee, equipment_committee, uniforms_committee, conductor, member
    status TEXT NOT NULL DEFAULT 'active', -- active, inactive, pending
    association_id TEXT,
    mfa_secret TEXT, -- TOTP secret for MFA
    mfa_enabled BOOLEAN DEFAULT 0, -- Whether MFA is enabled
    microsoft_id TEXT, -- Microsoft Entra Object ID for SSO
    profile_photo_path TEXT, -- Pad naar profielfoto
    private_email TEXT, -- Privé email adres (voor M365 forwarding)
    last_login DATETIME, -- Laatste keer ingelogd
    onboarded_at DATETIME, -- Wanneer onboarding is voltooid
    offboarded_at DATETIME, -- Wanneer offboarding is voltooid
    password_changed_at TEXT, -- Laatste wachtwoordwijziging (invalideert oudere JWT's)
    failed_login_attempts INTEGER NOT NULL DEFAULT 0, -- Mislukte inlogpogingen (brute-force lockout)
    locked_until TEXT, -- Account gelockt tot dit tijdstip (NULL = niet gelockt)
    deleted_at DATETIME DEFAULT NULL, -- Soft delete timestamp (NULL = actief)
    email_before_delete TEXT DEFAULT NULL, -- Origineel e-mailadres vóór soft delete (voor herstel)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE SET NULL
);

-- Koppeltabel: gebruiker speelt instrument(en)
CREATE TABLE IF NOT EXISTS user_instruments (
    user_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    PRIMARY KEY (user_id, instrument_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
);

-- Koppeltabel: gebruiker speelt in orkest(en)
CREATE TABLE IF NOT EXISTS user_orchestras (
    user_id TEXT NOT NULL,
    orchestra_id TEXT NOT NULL,
    PRIMARY KEY (user_id, orchestra_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

-- Muzieklijsten per orkest
CREATE TABLE IF NOT EXISTS music_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    orchestra_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1, -- 0 = verborgen voor leden, 1 = zichtbaar
    list_type TEXT NOT NULL DEFAULT 'regular', -- 'regular' of 'concert'
    concert_date TEXT, -- Datum van het concert (ISO 8601)
    concert_location TEXT, -- Locatie van het concert
    deleted_at DATETIME DEFAULT NULL, -- Soft delete timestamp (NULL = actief)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

-- Muziekstukken
CREATE TABLE IF NOT EXISTS music_pieces (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    arranger TEXT,
    instrument_id TEXT,
    tuning TEXT, -- Stemming van het instrument in dit stuk
    group_number TEXT, -- Groepnummer (1, 2, etc.)
    clef TEXT, -- Muzieksleutel (sol, fa, etc.)
    file_path TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    youtube_url TEXT,
    association_id TEXT NOT NULL,
    is_shared BOOLEAN DEFAULT 0, -- Toegankelijk voor andere verenigingen
    uploaded_by TEXT,
    imslp_source TEXT, -- IMSLP download URL if imported from IMSLP
    deleted_at DATETIME DEFAULT NULL, -- Soft delete timestamp (NULL = actief)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Koppeltabel: muziekstukken op lijsten
CREATE TABLE IF NOT EXISTS music_list_pieces (
    music_list_id TEXT NOT NULL,
    music_piece_id TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (music_list_id, music_piece_id),
    FOREIGN KEY (music_list_id) REFERENCES music_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE
);

-- Favoriete muziekstukken per gebruiker
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id TEXT NOT NULL,
    music_title_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, music_title_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
);

-- Recent bekeken items per gebruiker
CREATE TABLE IF NOT EXISTS user_recent_views (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_title TEXT NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Practice tracking per gebruiker per stuk
CREATE TABLE IF NOT EXISTS practice_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    music_title_id TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    practiced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
);

-- PDF annotaties per gebruiker per stuk
CREATE TABLE IF NOT EXISTS pdf_annotations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    music_piece_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    annotation_type TEXT NOT NULL,
    x_position REAL NOT NULL,
    y_position REAL NOT NULL,
    width REAL,
    height REAL,
    content TEXT,
    -- Vrije-vorm tekenpad (annotations.ts POST /drawings): de punten staan als
    -- JSON in data, met de bijbehorende penstijl. De velden hierboven beschrijven
    -- een rechthoekige annotatie; beide paden delen deze tabel.
    data TEXT,
    stroke_width REAL,
    opacity REAL,
    is_shared INTEGER DEFAULT 0,
    color TEXT DEFAULT '#FFFF00',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE
);

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User sessions voor sessiebeheer
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at TEXT, -- Soft revocation: ingetrokken sessies geven 401
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Titel metadata (YouTube, beschrijving, speelduur per titel)
CREATE TABLE IF NOT EXISTS music_titles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    composer TEXT, -- Componist (voor Buma/Stemra)
    arranger TEXT,
    youtube_url TEXT,
    description TEXT,
    duration_seconds INTEGER DEFAULT 0,
    grade TEXT, -- Moeilijkheidsgraad (bijv. 1, 2, 3, 4, 5 of 1.5, 2+, etc.)
    mp3_file_path TEXT, -- Pad naar MP3 preview bestand
    is_shared BOOLEAN DEFAULT 0, -- Mag gedeeld worden met andere verenigingen
    internal_notes TEXT, -- Interne notities alleen zichtbaar voor muziekcommissie
    streaming_links TEXT, -- JSON: {spotify_url, apple_music_url, youtube_music_url}
    imslp_work_id TEXT, -- IMSLP work/page ID
    imslp_permalink TEXT, -- IMSLP permanent link to work
    association_id TEXT NOT NULL,
    deleted_at DATETIME DEFAULT NULL, -- Soft delete timestamp (NULL = actief)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(title, arranger, association_id)
);

-- Genres voor muziekstukken
CREATE TABLE IF NOT EXISTS genres (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Koppeltabel: titel heeft genre(s)
CREATE TABLE IF NOT EXISTS music_title_genres (
    music_title_id TEXT NOT NULL,
    genre_id TEXT NOT NULL,
    PRIMARY KEY (music_title_id, genre_id),
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

-- Toegang tot gedeelde muziekstukken per vereniging (legacy, niet meer gebruikt)
CREATE TABLE IF NOT EXISTS shared_music_access (
    music_piece_id TEXT NOT NULL,
    association_id TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (music_piece_id, association_id),
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Toegang tot gedeelde titels per vereniging
CREATE TABLE IF NOT EXISTS shared_title_access (
    music_title_id TEXT NOT NULL,
    association_id TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (music_title_id, association_id),
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Foutmeldingen voor bladmuziek (Meldkamer)
CREATE TABLE IF NOT EXISTS piece_issues (
    id TEXT PRIMARY KEY,
    music_piece_id TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    page_number INTEGER,
    measure_number TEXT,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open', -- open, in_review, resolved, rejected
    resolution_notes TEXT,
    resolved_by TEXT,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Uitleningen (Leen-systeem)
CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    music_title_id TEXT NOT NULL,
    borrower_name TEXT NOT NULL,
    borrower_email TEXT,
    borrower_organization TEXT,
    notes TEXT,
    date_out DATETIME DEFAULT CURRENT_TIMESTAMP,
    expected_return DATETIME,
    date_returned DATETIME,
    status TEXT DEFAULT 'active', -- active, returned, overdue
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Activiteitenlog voor statistieken
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL, -- view, download, play_audio, etc.
    entity_type TEXT NOT NULL, -- music_piece, music_title, etc.
    entity_id TEXT NOT NULL,
    metadata TEXT, -- JSON met extra info
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Wachtwoord reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE, -- SHA-256 hash van het reset token
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- MFA recovery codes (alleen SHA-256 hashes, plaintext wordt eenmalig getoond)
CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexen voor betere performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_association ON users(association_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_orchestras_association ON orchestras(association_id);
CREATE INDEX IF NOT EXISTS idx_music_pieces_instrument ON music_pieces(instrument_id);
CREATE INDEX IF NOT EXISTS idx_music_pieces_association ON music_pieces(association_id);
CREATE INDEX IF NOT EXISTS idx_music_pieces_title ON music_pieces(title);
CREATE INDEX IF NOT EXISTS idx_instrument_aliases_alias ON instrument_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_music_titles_title ON music_titles(title);
CREATE INDEX IF NOT EXISTS idx_music_titles_association ON music_titles(association_id);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name);
CREATE INDEX IF NOT EXISTS idx_piece_issues_piece ON piece_issues(music_piece_id);
CREATE INDEX IF NOT EXISTS idx_piece_issues_status ON piece_issues(status);
CREATE INDEX IF NOT EXISTS idx_loans_title ON loans(music_title_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user ON mfa_recovery_codes(user_id);

-- Standaard repetitiedagen (wekelijks terugkerend)
CREATE TABLE IF NOT EXISTS rehearsal_default_days (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    orchestra_id TEXT, -- NULL = alle orkesten
    day_of_week INTEGER NOT NULL, -- 0=zondag, 1=maandag, ..., 6=zaterdag
    start_time TEXT NOT NULL, -- HH:MM formaat
    end_time TEXT NOT NULL,   -- HH:MM formaat
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL
);

-- Repetities (individuele afspraken, inclusief extra en vervallen)
CREATE TABLE IF NOT EXISTS rehearsals (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    orchestra_id TEXT, -- NULL = alle orkesten
    date TEXT NOT NULL, -- YYYY-MM-DD formaat
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    type TEXT NOT NULL DEFAULT 'regular', -- regular, extra, cancelled
    notes TEXT,
    spond_event_id TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Stukken die tijdens een repetitie geoefend worden
CREATE TABLE IF NOT EXISTS rehearsal_pieces (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL,
    title TEXT NOT NULL,
    notes TEXT, -- Aanwijzingen van de dirigent
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE
);

-- Spond-integratie configuratie
CREATE TABLE IF NOT EXISTS spond_config (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    group_id TEXT, -- Default Spond groep-ID (fallback)
    sync_enabled BOOLEAN DEFAULT 0,
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Spond groepen per orkest (voor verenigingen met meerdere orkesten)
CREATE TABLE IF NOT EXISTS spond_orchestra_groups (
    id TEXT PRIMARY KEY,
    orchestra_id TEXT NOT NULL UNIQUE,
    spond_group_id TEXT NOT NULL,
    spond_group_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

-- Spond lid koppeling met systeem gebruikers
CREATE TABLE IF NOT EXISTS spond_member_links (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    spond_member_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    spond_member_name TEXT,
    spond_member_email TEXT, -- Email voor betere matching
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(association_id, spond_member_id)
);

CREATE INDEX IF NOT EXISTS idx_spond_member_links_spond_id ON spond_member_links(spond_member_id);
CREATE INDEX IF NOT EXISTS idx_spond_member_links_user ON spond_member_links(user_id);
-- Note: idx_spond_member_links_email is created in init.ts migration after adding the column

-- Spond aanwezigheid per repetitie
CREATE TABLE IF NOT EXISTS rehearsal_attendance (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL,
    user_id TEXT,
    spond_member_id TEXT, -- Voor leden die alleen in Spond staan
    member_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown', -- accepted, declined, waiting, unknown
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rehearsals_association ON rehearsals(association_id);
CREATE INDEX IF NOT EXISTS idx_rehearsals_date ON rehearsals(date);
CREATE INDEX IF NOT EXISTS idx_rehearsal_pieces_rehearsal ON rehearsal_pieces(rehearsal_id);
CREATE INDEX IF NOT EXISTS idx_rehearsal_attendance_rehearsal ON rehearsal_attendance(rehearsal_id);

-- ===========================================
-- INSTRUMENTENBEHEER (Equipment Management)
-- ===========================================

-- Fysieke instrumenten (bruikleen-inventaris)
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
);

-- Schade/reparatie logboek voor instrumenten
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
);

-- Bruikleen-historie voor instrumenten
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
);

CREATE INDEX IF NOT EXISTS idx_equipment_association ON equipment(association_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_user ON equipment(current_user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_damage_equipment ON equipment_damage_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_equipment ON equipment_loans(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_user ON equipment_loans(user_id);

-- ===========================================
-- UNIFORMEN-INVENTARIS (Uniform Management)
-- ===========================================

-- Uniform onderdelen
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
);

-- Uniform sets (bijv. Concert Set A, Mars Set B)
CREATE TABLE IF NOT EXISTS uniform_sets (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Onderdelen die in een set horen
CREATE TABLE IF NOT EXISTS uniform_set_requirements (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    FOREIGN KEY (set_id) REFERENCES uniform_sets(id) ON DELETE CASCADE
);

-- Uitgifte-historie voor uniformen
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
);

CREATE INDEX IF NOT EXISTS idx_uniform_items_association ON uniform_items(association_id);
CREATE INDEX IF NOT EXISTS idx_uniform_items_type ON uniform_items(item_type);
CREATE INDEX IF NOT EXISTS idx_uniform_items_status ON uniform_items(status);
CREATE INDEX IF NOT EXISTS idx_uniform_items_user ON uniform_items(current_user_id);
CREATE INDEX IF NOT EXISTS idx_uniform_sets_association ON uniform_sets(association_id);
CREATE INDEX IF NOT EXISTS idx_uniform_assignments_item ON uniform_assignments(uniform_item_id);
CREATE INDEX IF NOT EXISTS idx_uniform_assignments_user ON uniform_assignments(user_id);

-- ===========================================
-- CONCERT-ARCHIEF (Concert Archive)
-- ===========================================

-- Concert types (aanpasbaar per vereniging)
CREATE TABLE IF NOT EXISTS concert_types (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, value)
);

-- Concerten
CREATE TABLE IF NOT EXISTS concerts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    end_date TEXT,
    location TEXT,
    venue_type TEXT,
    concert_type TEXT,
    description TEXT,
    notes TEXT,
    created_by TEXT,
    -- Accessibility fields
    wheelchair_spaces INTEGER DEFAULT 0,
    companion_spaces INTEGER DEFAULT 0,
    hearing_loop_available BOOLEAN DEFAULT 0,
    accessible_parking_info TEXT,
    accessibility_info TEXT,
    accessibility_contact_email TEXT,
    accessibility_contact_phone TEXT,
    -- Venue layout (for seated events)
    venue_layout_id TEXT,
    is_seated_event BOOLEAN DEFAULT 0,
    deleted_at DATETIME DEFAULT NULL, -- Soft delete timestamp (NULL = actief)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (venue_layout_id) REFERENCES venue_layouts(id) ON DELETE SET NULL
);

-- Concert programma (gespeelde stukken)
CREATE TABLE IF NOT EXISTS concert_program (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    music_title_id TEXT,
    title TEXT NOT NULL,
    composer TEXT, -- Componist (voor Buma/Stemra)
    arranger TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    part_of_set TEXT,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL
);

-- Concert media (foto's, video's, audio, posters)
CREATE TABLE IF NOT EXISTS concert_media (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    media_type TEXT NOT NULL,
    url TEXT,
    file_path TEXT,
    description TEXT,
    uploaded_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Concert bezetting (wie speelde mee)
CREATE TABLE IF NOT EXISTS concert_attendance (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    user_id TEXT,
    member_name TEXT NOT NULL,
    instrument_played TEXT,
    notes TEXT,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(concert_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_concerts_association ON concerts(association_id);
CREATE INDEX IF NOT EXISTS idx_concerts_date ON concerts(date);
CREATE INDEX IF NOT EXISTS idx_concerts_type ON concerts(concert_type);
CREATE INDEX IF NOT EXISTS idx_concert_program_concert ON concert_program(concert_id);
CREATE INDEX IF NOT EXISTS idx_concert_program_title ON concert_program(music_title_id);
CREATE INDEX IF NOT EXISTS idx_concert_media_concert ON concert_media(concert_id);
CREATE INDEX IF NOT EXISTS idx_concert_attendance_concert ON concert_attendance(concert_id);
CREATE INDEX IF NOT EXISTS idx_concert_attendance_user ON concert_attendance(user_id);

-- ===========================================
-- ENTRA ID SYNCHRONISATIE
-- ===========================================

-- Job Title naar Instrument mapping tabel
CREATE TABLE IF NOT EXISTS job_title_instrument_mappings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    job_title TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    UNIQUE(association_id, job_title)
);

CREATE INDEX IF NOT EXISTS idx_job_title_mappings_association ON job_title_instrument_mappings(association_id);
CREATE INDEX IF NOT EXISTS idx_job_title_mappings_title ON job_title_instrument_mappings(job_title);

-- ===========================================
-- AUDIT LOGS (Beheer logging)
-- ===========================================

-- Audit log tabel voor het bijhouden van alle wijzigingen
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
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at);

-- ===========================================
-- ORKEST OPSTELLING (Seating Arrangement)
-- ===========================================

-- Secties/rijen in de opstelling per orkest
CREATE TABLE IF NOT EXISTS seating_sections (
    id TEXT PRIMARY KEY,
    orchestra_id TEXT NOT NULL,
    name TEXT NOT NULL,
    row_number INTEGER NOT NULL, -- 1 = eerste rij (vooraan), 2 = tweede rij, etc.
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
    UNIQUE(orchestra_id, row_number)
);

-- Instrumentgroepen die in een sectie/rij thuishoren
CREATE TABLE IF NOT EXISTS seating_section_instruments (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0, -- volgorde binnen de rij (links naar rechts)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES seating_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    UNIQUE(section_id, instrument_id)
);

-- Vaste zitplaats-toewijzingen (wie zit normaal waar)
CREATE TABLE IF NOT EXISTS seating_assignments (
    id TEXT PRIMARY KEY,
    orchestra_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    position_in_section INTEGER NOT NULL DEFAULT 0, -- positie binnen de sectie (0 = links, oplopend naar rechts)
    seat_label TEXT, -- optioneel label bijv. "1e stem", "2e stem"
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES seating_sections(id) ON DELETE CASCADE,
    UNIQUE(orchestra_id, user_id)
);

-- Buren-relaties (wie zit naast wie - optionele voorkeuren)
CREATE TABLE IF NOT EXISTS seating_neighbors (
    id TEXT PRIMARY KEY,
    orchestra_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    neighbor_user_id TEXT NOT NULL,
    preference TEXT NOT NULL DEFAULT 'preferred', -- 'preferred' = wil naast, 'avoid' = liever niet naast
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (neighbor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(orchestra_id, user_id, neighbor_user_id)
);

-- Per-repetitie opstelling (gegenereerd op basis van aanwezigen)
CREATE TABLE IF NOT EXISTS rehearsal_seating (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL,
    user_id TEXT,
    spond_member_id TEXT, -- Voor leden die alleen in Spond staan
    member_name TEXT NOT NULL,
    instrument_name TEXT,
    section_id TEXT,
    row_number INTEGER NOT NULL,
    position_in_row INTEGER NOT NULL, -- positie binnen de rij (0 = links)
    is_conductor BOOLEAN DEFAULT 0, -- true als dit de dirigent is
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (section_id) REFERENCES seating_sections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_seating_sections_orchestra ON seating_sections(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_seating_section_instruments_section ON seating_section_instruments(section_id);
CREATE INDEX IF NOT EXISTS idx_seating_assignments_orchestra ON seating_assignments(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_seating_assignments_user ON seating_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_seating_neighbors_orchestra ON seating_neighbors(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_seating_neighbors_user ON seating_neighbors(user_id);
CREATE INDEX IF NOT EXISTS idx_rehearsal_seating_rehearsal ON rehearsal_seating(rehearsal_id);

-- ===========================================
-- SEATING NOTIFICATIES (WhatsApp/Webhook)
-- ===========================================

-- Instellingen voor opstelling notificaties per orkest
CREATE TABLE IF NOT EXISTS seating_notification_settings (
    id TEXT PRIMARY KEY,
    orchestra_id TEXT NOT NULL UNIQUE,
    notification_type TEXT NOT NULL DEFAULT 'webhook', -- 'webhook' of 'whatsapp'
    webhook_url TEXT, -- URL voor webhook type
    twilio_account_sid TEXT, -- Twilio Account SID voor WhatsApp
    twilio_auth_token TEXT, -- Twilio Auth Token (encrypted)
    twilio_whatsapp_from TEXT, -- Twilio WhatsApp nummer (bijv. whatsapp:+14155238886)
    twilio_whatsapp_to TEXT, -- Bestemmingsnummer(s), komma-gescheiden (bijv. whatsapp:+31612345678)
    minutes_before INTEGER NOT NULL DEFAULT 15, -- Hoeveel minuten voor de repetitie
    enabled BOOLEAN DEFAULT 1,
    include_image BOOLEAN DEFAULT 1, -- Of de afbeelding meegestuurd moet worden
    message_template TEXT, -- Optioneel aangepaste berichttekst
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

-- Log van verstuurde notificaties
CREATE TABLE IF NOT EXISTS seating_notification_logs (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT NOT NULL,
    orchestra_id TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed
    error_message TEXT,
    webhook_response TEXT,
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_seating_notification_settings_orchestra ON seating_notification_settings(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_seating_notification_logs_rehearsal ON seating_notification_logs(rehearsal_id);
CREATE INDEX IF NOT EXISTS idx_seating_notification_logs_status ON seating_notification_logs(status);

-- ===========================================
-- ONBOARDING & OFFBOARDING
-- ===========================================

-- Onboarding taken voor tracking
CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    association_id TEXT NOT NULL,
    task_type TEXT NOT NULL, -- m365_create, harmonie_create, spond_invite, spond_link
    status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed, skipped
    error_message TEXT,
    metadata TEXT, -- JSON met extra info (bijv. tijdelijk wachtwoord)
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Pending Spond koppelingen (voor leden die nog moeten koppelen)
CREATE TABLE IF NOT EXISTS pending_spond_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    association_id TEXT NOT NULL,
    expected_email TEXT, -- Email waarmee lid zich moet aanmelden in Spond
    expected_name TEXT, -- Naam waarmee lid zich moet aanmelden
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_user ON onboarding_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_status ON onboarding_tasks(status);
CREATE INDEX IF NOT EXISTS idx_pending_spond_links_email ON pending_spond_links(expected_email);
CREATE INDEX IF NOT EXISTS idx_pending_spond_links_user ON pending_spond_links(user_id);

-- ===========================================
-- M365 INTEGRATIE UITBREIDING
-- ===========================================

-- M365 groep mappings voor orkesten
CREATE TABLE IF NOT EXISTS m365_group_mappings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    orchestra_id TEXT,
    group_name TEXT NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'orchestra', -- orchestra, percussion, special
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_m365_group_mappings_association ON m365_group_mappings(association_id);
CREATE INDEX IF NOT EXISTS idx_m365_group_mappings_orchestra ON m365_group_mappings(orchestra_id);

-- Instrument naar Job Title mapping (voor M365 functietitel)
CREATE TABLE IF NOT EXISTS instrument_job_title_mappings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    job_title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    UNIQUE(association_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS idx_instrument_job_title_mappings_association ON instrument_job_title_mappings(association_id);
CREATE INDEX IF NOT EXISTS idx_instrument_job_title_mappings_instrument ON instrument_job_title_mappings(instrument_id);

-- ===========================================
-- AUDIO RECORDER (Repetitie opnames)
-- ===========================================

-- Audio opnames van repetities/secties
CREATE TABLE IF NOT EXISTS audio_recordings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    orchestra_id TEXT,
    rehearsal_id TEXT, -- Optioneel gekoppeld aan een repetitie
    music_title_id TEXT, -- Optioneel gekoppeld aan een muziekstuk
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL, -- In bytes
    duration_seconds INTEGER NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'audio/webm',
    recorded_by TEXT NOT NULL,
    is_public BOOLEAN DEFAULT 0, -- Zichtbaar voor alle leden
    section_instrument_id TEXT, -- Als het een sectie-opname is
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE SET NULL,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (section_instrument_id) REFERENCES instruments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audio_recordings_association ON audio_recordings(association_id);
CREATE INDEX IF NOT EXISTS idx_audio_recordings_orchestra ON audio_recordings(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_audio_recordings_rehearsal ON audio_recordings(rehearsal_id);
CREATE INDEX IF NOT EXISTS idx_audio_recordings_title ON audio_recordings(music_title_id);
CREATE INDEX IF NOT EXISTS idx_audio_recordings_user ON audio_recordings(recorded_by);
CREATE INDEX IF NOT EXISTS idx_audio_recordings_date ON audio_recordings(created_at);

-- ===========================================
-- STEMGROEP CHAT (Section Chat)
-- ===========================================

-- Chat kanalen per stemgroep/sectie
CREATE TABLE IF NOT EXISTS section_chat_channels (
    id TEXT PRIMARY KEY,
    orchestra_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL, -- Instrument/stemgroep
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    UNIQUE(orchestra_id, instrument_id)
);

-- Chat berichten
CREATE TABLE IF NOT EXISTS section_chat_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    reply_to_id TEXT, -- Voor replies op andere berichten
    is_pinned BOOLEAN DEFAULT 0,
    is_edited BOOLEAN DEFAULT 0,
    edited_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES section_chat_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_id) REFERENCES section_chat_messages(id) ON DELETE SET NULL
);

-- Gelezen status per gebruiker per kanaal
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
);

CREATE INDEX IF NOT EXISTS idx_section_chat_channels_orchestra ON section_chat_channels(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_section_chat_channels_instrument ON section_chat_channels(instrument_id);
CREATE INDEX IF NOT EXISTS idx_section_chat_messages_channel ON section_chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_section_chat_messages_user ON section_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_section_chat_messages_date ON section_chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_section_chat_read_status_channel ON section_chat_read_status(channel_id);
CREATE INDEX IF NOT EXISTS idx_section_chat_read_status_user ON section_chat_read_status(user_id);

-- ===========================================
-- UITGEBREIDE PUSH NOTIFICATIES
-- ===========================================

-- Notificatie voorkeuren per gebruiker
CREATE TABLE IF NOT EXISTS notification_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    new_music BOOLEAN DEFAULT 1, -- Nieuwe muziek toegevoegd
    rehearsal_changes BOOLEAN DEFAULT 1, -- Repetitie wijzigingen
    seating_updates BOOLEAN DEFAULT 1, -- Zitplaats updates
    chat_messages BOOLEAN DEFAULT 1, -- Nieuwe chat berichten
    practice_reminders BOOLEAN DEFAULT 1, -- Oefenherinneringen
    concert_reminders BOOLEAN DEFAULT 1, -- Concert herinneringen
    email_enabled BOOLEAN DEFAULT 1,
    push_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Notificaties queue/history
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- new_music, rehearsal_change, seating_update, chat_message, practice_reminder, concert_reminder
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data TEXT, -- JSON met extra data (links, IDs, etc.)
    is_read BOOLEAN DEFAULT 0,
    sent_push BOOLEAN DEFAULT 0,
    sent_email BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_date ON notifications(created_at);

-- ===========================================
-- REHEARSAL PLANNER (Per-stuk oefen schema's)
-- ===========================================

-- Oefen schema's per muziekstuk
CREATE TABLE IF NOT EXISTS practice_schedules (
    id TEXT PRIMARY KEY,
    music_title_id TEXT NOT NULL,
    orchestra_id TEXT NOT NULL,
    target_date TEXT NOT NULL, -- Datum waarop het stuk klaar moet zijn
    priority INTEGER DEFAULT 1, -- 1=laag, 2=normaal, 3=hoog
    notes TEXT, -- Instructies van de dirigent
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(music_title_id, orchestra_id)
);

-- Mijlpalen/doelen per oefen schema
CREATE TABLE IF NOT EXISTS practice_schedule_milestones (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    title TEXT NOT NULL, -- bijv. "Noten kennen", "Dynamiek", "Tempo"
    description TEXT,
    target_date TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT 0,
    completed_at DATETIME,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES practice_schedules(id) ON DELETE CASCADE
);

-- Per-sectie voortgang per mijlpaal
CREATE TABLE IF NOT EXISTS practice_section_progress (
    id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL, -- Sectie/stemgroep
    status TEXT DEFAULT 'pending', -- pending, in_progress, completed
    notes TEXT,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (milestone_id) REFERENCES practice_schedule_milestones(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(milestone_id, instrument_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_schedules_title ON practice_schedules(music_title_id);
CREATE INDEX IF NOT EXISTS idx_practice_schedules_orchestra ON practice_schedules(orchestra_id);
CREATE INDEX IF NOT EXISTS idx_practice_schedules_date ON practice_schedules(target_date);
CREATE INDEX IF NOT EXISTS idx_practice_milestones_schedule ON practice_schedule_milestones(schedule_id);
CREATE INDEX IF NOT EXISTS idx_practice_section_progress_milestone ON practice_section_progress(milestone_id);
CREATE INDEX IF NOT EXISTS idx_practice_section_progress_instrument ON practice_section_progress(instrument_id);

-- ===========================================
-- TICKETING SYSTEM (Concert Ticket Sales)
-- ===========================================

-- Ticket types per concert (e.g., Regular, VIP, Early Bird)
CREATE TABLE IF NOT EXISTS ticket_types (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    sale_start DATETIME,
    sale_end DATETIME,
    max_per_order INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE
);

-- Individual tickets purchased
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    ticket_type_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    user_id TEXT,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'valid', -- valid, used, cancelled, refunded
    qr_code TEXT NOT NULL UNIQUE,
    seat_info TEXT,
    used_at DATETIME,
    validated_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES ticket_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Ticket orders (a purchase can contain multiple tickets)
CREATE TABLE IF NOT EXISTS ticket_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    concert_id TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, refunding (kortstondig, tijdens het terugbetalen), cancelled, refunded, expired
    payment_id TEXT,
    payment_method TEXT,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_phone TEXT,
    notes TEXT,
    expires_at DATETIME,
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE
);

-- Order line items
CREATE TABLE IF NOT EXISTS ticket_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    ticket_type_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES ticket_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
);

-- Payment webhook logs for debugging
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL, -- stripe, mollie
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    processed BOOLEAN DEFAULT 0,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_concert ON ticket_types(concert_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(ticket_type_id);
CREATE INDEX IF NOT EXISTS idx_tickets_qr ON tickets(qr_code);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_concert ON ticket_orders(concert_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_user ON ticket_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_orders_status ON ticket_orders(status);
CREATE INDEX IF NOT EXISTS idx_ticket_order_items_order ON ticket_order_items(order_id);

-- Ticket transfers (for transferring tickets between users)
CREATE TABLE IF NOT EXISTS ticket_transfers (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    from_user_id TEXT,
    from_email TEXT NOT NULL,
    from_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    transfer_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, cancelled, expired
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    accepted_at DATETIME,
    cancelled_at DATETIME,
    accepted_by_user_id TEXT,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket ON ticket_transfers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_code ON ticket_transfers(transfer_code);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_from_user ON ticket_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_recipient ON ticket_transfers(recipient_email);
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_status ON ticket_transfers(status);

-- ===========================================
-- SECURITY: IP WHITELIST
-- ===========================================

-- IP whitelist for admin route access control
CREATE TABLE IF NOT EXISTS ip_whitelist (
    id TEXT PRIMARY KEY,
    association_id TEXT, -- NULL = global (applies to all associations)
    ip_address TEXT NOT NULL, -- IP address or CIDR notation (e.g., 192.168.1.0/24)
    description TEXT, -- Human-readable description (e.g., "Office network")
    is_enabled BOOLEAN DEFAULT 1,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_whitelist_association ON ip_whitelist(association_id);
CREATE INDEX IF NOT EXISTS idx_ip_whitelist_enabled ON ip_whitelist(is_enabled);

-- ===========================================
-- CALENDAR SYNC (Google & Apple Calendar)
-- ===========================================

-- User calendar settings and tokens
CREATE TABLE IF NOT EXISTS user_calendar_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    feed_token TEXT NOT NULL, -- Token for iCal feed URL authentication
    google_refresh_token TEXT, -- Google OAuth refresh token (encrypted)
    google_access_token TEXT, -- Google OAuth access token
    google_token_expires_at TEXT, -- When the access token expires
    google_calendar_id TEXT DEFAULT 'primary', -- Target Google Calendar ID
    include_rehearsals BOOLEAN DEFAULT 1,
    include_concerts BOOLEAN DEFAULT 1,
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- OAuth state tokens for CSRF protection
CREATE TABLE IF NOT EXISTS oauth_states (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    state TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_settings_user ON user_calendar_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_calendar_settings_feed_token ON user_calendar_settings(feed_token);
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- ===========================================
-- MULTI-CHANNEL NOTIFICATIONS (WhatsApp, Telegram)
-- ===========================================

-- User notification channel links (WhatsApp, Telegram, etc.)
CREATE TABLE IF NOT EXISTS user_notification_channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel_type TEXT NOT NULL, -- 'whatsapp', 'telegram'
    channel_id TEXT NOT NULL, -- Phone number for WhatsApp, chat_id for Telegram
    verified BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, channel_type)
);

-- Per-channel notification preferences
CREATE TABLE IF NOT EXISTS notification_channel_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'email', 'push', 'whatsapp', 'telegram'
    enabled BOOLEAN DEFAULT 1,
    settings TEXT, -- JSON with channel-specific settings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, channel)
);

-- Per notification type channel preferences
CREATE TABLE IF NOT EXISTS notification_type_channels (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    notification_type TEXT NOT NULL, -- 'new_music', 'rehearsal_change', etc.
    channels TEXT NOT NULL, -- JSON array of enabled channels for this type
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, notification_type)
);

-- Telegram link codes (for account linking)
CREATE TABLE IF NOT EXISTS telegram_link_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- WhatsApp verification codes
CREATE TABLE IF NOT EXISTS whatsapp_verifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    phone_number TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_notification_channels_user ON user_notification_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_channels_type ON user_notification_channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_notification_channel_preferences_user ON notification_channel_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_type_channels_user ON notification_type_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_code ON telegram_link_codes(code);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_expires ON telegram_link_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_verifications_user ON whatsapp_verifications(user_id);

-- ===========================================
-- MULTI-ORGANIZATION COLLABORATION
-- ===========================================

-- Shared libraries for inter-association collaboration
CREATE TABLE IF NOT EXISTS shared_libraries (
    id TEXT PRIMARY KEY,
    owner_association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT 0, -- If true, any association can request access
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Titles shared in a library
CREATE TABLE IF NOT EXISTS shared_library_titles (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    title_id TEXT NOT NULL,
    shared_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    shared_by TEXT NOT NULL,
    FOREIGN KEY (library_id) REFERENCES shared_libraries(id) ON DELETE CASCADE,
    FOREIGN KEY (title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(library_id, title_id)
);

-- Access control for shared libraries
CREATE TABLE IF NOT EXISTS library_access (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL,
    association_id TEXT NOT NULL,
    access_level TEXT NOT NULL DEFAULT 'view', -- view, download, contribute
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    granted_by TEXT NOT NULL,
    FOREIGN KEY (library_id) REFERENCES shared_libraries(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(library_id, association_id)
);

-- Collaboration requests between associations
CREATE TABLE IF NOT EXISTS collaboration_requests (
    id TEXT PRIMARY KEY,
    from_association_id TEXT NOT NULL,
    to_association_id TEXT NOT NULL,
    library_id TEXT, -- Optional: request access to specific library
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected
    message TEXT,
    response_message TEXT,
    responded_by TEXT,
    responded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (to_association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (library_id) REFERENCES shared_libraries(id) ON DELETE SET NULL,
    FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Imported titles tracking (attribution)
CREATE TABLE IF NOT EXISTS imported_titles (
    id TEXT PRIMARY KEY,
    title_id TEXT NOT NULL, -- The new title in our library
    source_title_id TEXT NOT NULL, -- The original title from shared library
    source_library_id TEXT NOT NULL,
    source_association_id TEXT NOT NULL,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    imported_by TEXT NOT NULL,
    FOREIGN KEY (title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (source_library_id) REFERENCES shared_libraries(id) ON DELETE SET NULL,
    FOREIGN KEY (source_association_id) REFERENCES associations(id) ON DELETE SET NULL,
    FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shared_libraries_owner ON shared_libraries(owner_association_id);
CREATE INDEX IF NOT EXISTS idx_shared_libraries_public ON shared_libraries(is_public);
CREATE INDEX IF NOT EXISTS idx_shared_library_titles_library ON shared_library_titles(library_id);
CREATE INDEX IF NOT EXISTS idx_shared_library_titles_title ON shared_library_titles(title_id);
CREATE INDEX IF NOT EXISTS idx_library_access_library ON library_access(library_id);
CREATE INDEX IF NOT EXISTS idx_library_access_association ON library_access(association_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_requests_from ON collaboration_requests(from_association_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_requests_to ON collaboration_requests(to_association_id);
CREATE INDEX IF NOT EXISTS idx_collaboration_requests_status ON collaboration_requests(status);
CREATE INDEX IF NOT EXISTS idx_imported_titles_title ON imported_titles(title_id);
CREATE INDEX IF NOT EXISTS idx_imported_titles_source ON imported_titles(source_title_id);

-- ===========================================
-- GUEST LIST (Free Tickets / Comps)
-- ===========================================

-- Guest list entries for free tickets
CREATE TABLE IF NOT EXISTS guest_list (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    order_number TEXT, -- Auto-generated order number (e.g., GL-2024-001)
    organisation TEXT, -- Organisation name for the guest
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    ticket_count INTEGER NOT NULL DEFAULT 1,
    ticket_type_id TEXT, -- Optional: link to specific ticket type for statistics
    notes TEXT,
    tickets_sent BOOLEAN DEFAULT 0,
    sent_at DATETIME,
    order_id TEXT, -- Link to ticket_orders when tickets are sent
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE SET NULL,
    FOREIGN KEY (order_id) REFERENCES ticket_orders(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_guest_list_concert ON guest_list(concert_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_email ON guest_list(email);
CREATE INDEX IF NOT EXISTS idx_guest_list_sent ON guest_list(tickets_sent);
CREATE INDEX IF NOT EXISTS idx_guest_list_order ON guest_list(order_id);

-- ===========================================
-- PAYMENT SETTINGS (Mollie/Stripe Configuration)
-- ===========================================

-- Payment provider settings per association
CREATE TABLE IF NOT EXISTS payment_settings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'mollie', -- 'mollie' or 'stripe'
    mollie_profile_id TEXT, -- Mollie profile/organization ID (live)
    mollie_api_key_encrypted TEXT, -- Encrypted LIVE API key
    mollie_test_profile_id TEXT, -- Mollie profile/organization ID (test)
    mollie_test_api_key_encrypted TEXT, -- Encrypted TEST API key
    mollie_mode TEXT NOT NULL DEFAULT 'live', -- 'live' or 'test' - which key is active
    stripe_account_id TEXT, -- Stripe Connect account ID
    stripe_publishable_key TEXT,
    pass_fees_to_customer BOOLEAN DEFAULT 0, -- Whether to add payment fees to ticket price
    is_connected BOOLEAN DEFAULT 0,
    can_receive_payments BOOLEAN DEFAULT 0,
    can_receive_payouts BOOLEAN DEFAULT 0,
    connected_at DATETIME,
    last_status_check DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Payment method fees (for displaying to users)
CREATE TABLE IF NOT EXISTS payment_method_fees (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    method TEXT NOT NULL, -- 'ideal', 'creditcard', 'bancontact', etc.
    provider_fee REAL NOT NULL DEFAULT 0, -- Fee charged by provider (e.g., 0.35)
    customer_fee REAL NOT NULL DEFAULT 0, -- Fee passed to customer
    is_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, method)
);

CREATE INDEX IF NOT EXISTS idx_payment_settings_association ON payment_settings(association_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_fees_association ON payment_method_fees(association_id);

-- =============================================
-- WP5: Open Music Metadata (MusicXML / JSKOS)
-- =============================================

-- Extended metadata for music titles (MusicXML compatible)
CREATE TABLE IF NOT EXISTS music_metadata (
    id TEXT PRIMARY KEY,
    music_title_id TEXT NOT NULL UNIQUE,

    -- MusicXML work info
    work_number TEXT,           -- Opus/catalog number: "Op. 67", "K. 545", "BWV 1068"
    movement_number INTEGER,    -- Movement number within work
    movement_title TEXT,        -- Title of movement/part

    -- Additional creators (beyond composer/arranger in music_titles)
    lyricist TEXT,              -- Lyricist or poet

    -- Rights and source
    rights TEXT,                -- Copyright information
    source TEXT,                -- Publisher, edition, or source

    -- Encoding info (from MusicXML)
    encoding_software TEXT,     -- Software that created the MusicXML
    encoding_date TEXT,         -- Date of MusicXML encoding (ISO 8601)

    -- Structured data
    parts TEXT,                 -- JSON: instrumentation from part-list

    -- Original MusicXML for round-trip export
    musicxml_raw TEXT,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
);

-- JSKOS vocabulary cache for instruments, genres, composers
CREATE TABLE IF NOT EXISTS vocabulary_cache (
    uri TEXT PRIMARY KEY,
    vocabulary_type TEXT NOT NULL,  -- 'instrument', 'genre', 'composer'

    -- Labels (multilingual JSON)
    pref_label TEXT NOT NULL,       -- JSON: {"en": "Flute", "nl": "Fluit", "de": "Flöte"}
    alt_labels TEXT,                -- JSON: ["alternative name 1", "alternative name 2"]

    -- Hierarchy
    broader TEXT,                   -- JSON: parent concept URIs
    narrower TEXT,                  -- JSON: child concept URIs

    -- Extra metadata
    notation TEXT,                  -- Short code (e.g., "sca" for flute)
    definition TEXT,                -- JSON: scope notes in multiple languages

    -- Cache management
    source_url TEXT,                -- URL where we fetched this concept
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME             -- When to refresh from source
);

-- Link music titles to instruments from vocabulary
CREATE TABLE IF NOT EXISTS music_title_instruments (
    music_title_id TEXT NOT NULL,
    instrument_uri TEXT NOT NULL,
    count INTEGER DEFAULT 1,        -- Number of this instrument needed
    is_optional BOOLEAN DEFAULT 0,  -- Optional/cue part
    notes TEXT,                     -- "1st chair only", "doubles piccolo"

    PRIMARY KEY (music_title_id, instrument_uri),
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_uri) REFERENCES vocabulary_cache(uri) ON DELETE SET NULL
);

-- Link music titles to genres from vocabulary
CREATE TABLE IF NOT EXISTS music_title_vocabulary (
    music_title_id TEXT NOT NULL,
    vocabulary_uri TEXT NOT NULL,
    vocabulary_type TEXT NOT NULL,  -- 'genre', 'style', 'form'

    PRIMARY KEY (music_title_id, vocabulary_uri),
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (vocabulary_uri) REFERENCES vocabulary_cache(uri) ON DELETE SET NULL
);

-- Indexes for music metadata
CREATE INDEX IF NOT EXISTS idx_music_metadata_title ON music_metadata(music_title_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_cache_type ON vocabulary_cache(vocabulary_type);
CREATE INDEX IF NOT EXISTS idx_vocabulary_cache_notation ON vocabulary_cache(notation);
CREATE INDEX IF NOT EXISTS idx_music_title_instruments_title ON music_title_instruments(music_title_id);
CREATE INDEX IF NOT EXISTS idx_music_title_instruments_uri ON music_title_instruments(instrument_uri);
CREATE INDEX IF NOT EXISTS idx_music_title_vocabulary_title ON music_title_vocabulary(music_title_id);
CREATE INDEX IF NOT EXISTS idx_music_title_vocabulary_type ON music_title_vocabulary(vocabulary_type);

-- =====================================================
-- EXTERNAL CONTACTS MODULE
-- =====================================================

-- Contact categories (configurable per association)
CREATE TABLE IF NOT EXISTS contact_categories (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_categories_assoc ON contact_categories(association_id);

-- External contacts (organizations, persons, venues, vendors)
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('organization', 'person', 'venue', 'vendor')),
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    mobile TEXT,
    address_line TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'NL',
    iban TEXT,
    iban_holder_name TEXT,
    bic TEXT,
    vat_number TEXT,
    chamber_of_commerce TEXT,
    website TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    promoted_to_user_id TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (promoted_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_assoc ON contacts(association_id);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(is_active);

-- Link contacts to categories (many-to-many)
CREATE TABLE IF NOT EXISTS contact_category_links (
    contact_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (contact_id, category_id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES contact_categories(id) ON DELETE CASCADE
);

-- Contact persons for organization-type contacts
CREATE TABLE IF NOT EXISTS contact_persons (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    is_primary INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_persons_contact ON contact_persons(contact_id);

-- =====================================================
-- CUSTOM FIELDS MODULE
-- =====================================================

-- Custom field definitions (configurable per association)
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'user', 'orchestra', 'rehearsal', 'concert', 'music_piece', 'loan', 'instrument', 'contact'
    )),
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN (
        'text', 'textarea', 'number', 'date', 'datetime',
        'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'file'
    )),
    field_options TEXT,
    is_required INTEGER NOT NULL DEFAULT 0,
    is_unique INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN (
        'all', 'admin_only', 'committee_plus', 'self_only'
    )),
    self_editable INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    placeholder TEXT,
    default_value TEXT,
    validation_regex TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_assoc ON custom_field_definitions(association_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_entity ON custom_field_definitions(entity_type);

-- Custom field values
CREATE TABLE IF NOT EXISTS custom_field_values (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    value_text TEXT,
    value_number REAL,
    value_date DATETIME,
    value_boolean INTEGER,
    value_json TEXT,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_definition_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(field_definition_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_def ON custom_field_values(field_definition_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity ON custom_field_values(entity_type, entity_id);

-- =====================================================
-- PRIVACY SETTINGS MODULE
-- =====================================================

-- Per-user privacy settings for each field
CREATE TABLE IF NOT EXISTS user_privacy_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN (
        'admin_only', 'committee', 'orchestra', 'section', 'all_members', 'public'
    )),
    custom_field_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (custom_field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    UNIQUE(user_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_user_privacy_user ON user_privacy_settings(user_id);

-- Association-wide privacy defaults
CREATE TABLE IF NOT EXISTS association_privacy_defaults (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    field_name TEXT NOT NULL,
    default_visibility TEXT NOT NULL,
    purpose_statement TEXT,
    is_required INTEGER DEFAULT 0,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_assoc_privacy_assoc ON association_privacy_defaults(association_id);

-- Privacy consent tracking
CREATE TABLE IF NOT EXISTS privacy_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    consented_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_privacy_consents_user ON privacy_consents(user_id);

-- =====================================================
-- POLLS MODULE
-- =====================================================

-- Polls (voting/surveys)
CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    poll_type TEXT NOT NULL DEFAULT 'single' CHECK (poll_type IN ('single', 'multiple', 'ranked')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'archived')),
    is_anonymous INTEGER DEFAULT 0,
    show_results_before_close INTEGER DEFAULT 0,
    allow_comments INTEGER DEFAULT 1,
    max_selections INTEGER,
    starts_at DATETIME,
    ends_at DATETIME,
    target_orchestras TEXT,
    target_roles TEXT,
    -- Datumpeiling: de winnende optie kan automatisch een repetitie opleveren.
    -- routes/polls.ts schrijft en leest deze drie kolommen. Ze ontbraken
    -- eerder volledig, waardoor het aanmaken van een peiling faalde met
    -- "table polls has no column named is_date_poll".
    is_date_poll INTEGER NOT NULL DEFAULT 0,
    auto_create_rehearsal INTEGER NOT NULL DEFAULT 0,
    target_orchestra_id TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (target_orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_polls_assoc ON polls(association_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_polls_created_by ON polls(created_by);

-- Poll options/choices
CREATE TABLE IF NOT EXISTS poll_options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    option_text TEXT NOT NULL,
    option_description TEXT,
    -- Machineleesbare waarde achter de optietekst. Voor datumpeilingen is
    -- dat de datum in YYYY-MM-DD, die de auto-aanmaak van een repetitie leest.
    option_value TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);

-- Poll votes
CREATE TABLE IF NOT EXISTS poll_votes (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rank_position INTEGER,
    voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(option_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_single ON poll_votes(poll_id, option_id, user_id);

-- Poll comments
CREATE TABLE IF NOT EXISTS poll_comments (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES poll_comments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_poll_comments_poll ON poll_comments(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_comments_user ON poll_comments(user_id);

-- =====================================================
-- TASKS MODULE
-- =====================================================

-- Task lists (projects/categories for tasks)
CREATE TABLE IF NOT EXISTS task_lists (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_lists_assoc ON task_lists(association_id);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    task_list_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATETIME,
    reminder_at DATETIME,
    estimated_hours REAL,
    actual_hours REAL,
    sort_order INTEGER DEFAULT 0,
    related_entity_type TEXT,
    related_entity_id TEXT,
    created_by TEXT NOT NULL,
    assigned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (task_list_id) REFERENCES task_lists(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_assoc ON tasks(association_id);
CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(task_list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- Task assignments (for multiple assignees)
CREATE TABLE IF NOT EXISTS task_assignments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id);

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- Task checklists (subtasks)
CREATE TABLE IF NOT EXISTS task_checklist_items (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    content TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    completed_by TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);

-- Task templates (predefined tasks with checklists)
CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    task_list_id TEXT,
    priority TEXT DEFAULT 'medium',
    estimated_hours REAL,
    checklist_items TEXT, -- JSON array of checklist item strings
    is_active BOOLEAN DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (task_list_id) REFERENCES task_lists(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_templates_assoc ON task_templates(association_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON task_templates(is_active);

-- =====================================================
-- POSTS/NEWS MODULE
-- =====================================================

-- Post categories
CREATE TABLE IF NOT EXISTS post_categories (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_post_categories_assoc ON post_categories(association_id);

-- Posts/News articles
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    content_format TEXT DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'html')),
    featured_image TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    is_pinned INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    allow_comments INTEGER DEFAULT 1,
    view_count INTEGER DEFAULT 0,
    target_orchestras TEXT,
    target_roles TEXT,
    published_at DATETIME,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_assoc ON posts(association_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published_at);
CREATE INDEX IF NOT EXISTS idx_posts_pinned ON posts(is_pinned);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_slug ON posts(association_id, slug);

-- Post to category mapping
CREATE TABLE IF NOT EXISTS post_category_mapping (
    post_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (post_id, category_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES post_categories(id) ON DELETE CASCADE
);

-- Post comments
CREATE TABLE IF NOT EXISTS post_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_id TEXT,
    is_approved INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES post_comments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user ON post_comments(user_id);

-- Post attachments
CREATE TABLE IF NOT EXISTS post_attachments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_attachments_post ON post_attachments(post_id);

-- Post read tracking
CREATE TABLE IF NOT EXISTS post_reads (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- EMAIL BULK MAILING MODULE
-- =====================================================

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    is_system INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_templates_assoc ON email_templates(association_id);

-- Email campaigns/mailings
CREATE TABLE IF NOT EXISTS email_campaigns (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    template_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
    target_type TEXT NOT NULL CHECK (target_type IN ('all', 'orchestras', 'roles', 'custom')),
    target_orchestras TEXT,
    target_roles TEXT,
    target_user_ids TEXT,
    scheduled_at DATETIME,
    sent_at DATETIME,
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_assoc ON email_campaigns(association_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);

-- Email campaign recipients (tracking per recipient)
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
    sent_at DATETIME,
    opened_at DATETIME,
    clicked_at DATETIME,
    bounce_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign ON email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_user ON email_campaign_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_email_recipients_status ON email_campaign_recipients(status);

-- Bijlagen bij een mailing
CREATE TABLE IF NOT EXISTS email_campaign_attachments (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    uploaded_by TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_campaign ON email_campaign_attachments(campaign_id);

-- =====================================================
-- ACCOUNTING / BOEKHOUDING MODULE
-- =====================================================

-- Boekjaren
CREATE TABLE IF NOT EXISTS fiscal_years (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    is_current INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fiscal_years_assoc ON fiscal_years(association_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_years_current ON fiscal_years(association_id, is_current);

-- Grootboekrekeningen (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN (
        'asset', 'liability', 'equity', 'income', 'expense'
    )),
    account_subtype TEXT CHECK (account_subtype IN (
        'bank', 'cash', 'receivable', 'payable', 'inventory',
        'fixed_asset', 'current_liability', 'long_term_liability',
        'retained_earnings', 'membership_fees', 'donations', 'grants',
        'ticket_sales', 'sponsoring', 'personnel', 'materials', 'rent',
        'utilities', 'insurance', 'depreciation', 'other'
    )),
    parent_id TEXT,
    description TEXT,
    is_system INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    opening_balance REAL DEFAULT 0,
    current_balance REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL,
    UNIQUE(association_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_assoc ON accounts(association_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);

-- Kostenplaatsen (Cost Centers)
CREATE TABLE IF NOT EXISTS cost_centers (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    orchestra_id TEXT,
    is_active INTEGER DEFAULT 1,
    budget_amount REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    UNIQUE(association_id, code)
);

CREATE INDEX IF NOT EXISTS idx_cost_centers_assoc ON cost_centers(association_id);

-- Contributie-categorieën
CREATE TABLE IF NOT EXISTS membership_fee_types (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'yearly' CHECK (frequency IN ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time')),
    age_min INTEGER,
    age_max INTEGER,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    income_account_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (income_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_fee_types_assoc ON membership_fee_types(association_id);

-- Lidmaatschappen (koppeling user -> contributie)
CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    fee_type_id TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled', 'expired')),
    discount_percentage REAL DEFAULT 0,
    discount_reason TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (fee_type_id) REFERENCES membership_fee_types(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_fee_type ON memberships(fee_type_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);

-- Bankrekeningen
CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    iban TEXT NOT NULL,
    bic TEXT,
    bank_name TEXT,
    is_primary INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    balance REAL DEFAULT 0,
    last_sync_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    UNIQUE(association_id, iban)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_assoc ON bank_accounts(association_id);

-- Relaties (debiteur/crediteur)
CREATE TABLE IF NOT EXISTS accounting_relations (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    relation_type TEXT NOT NULL CHECK (relation_type IN ('customer', 'supplier', 'both')),
    user_id TEXT,
    contact_id TEXT,
    relation_number TEXT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address_line TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'NL',
    iban TEXT,
    vat_number TEXT,
    payment_term_days INTEGER DEFAULT 30,
    receivable_account_id TEXT,
    payable_account_id TEXT,
    credit_limit REAL,
    balance REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (receivable_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (payable_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_acc_relations_assoc ON accounting_relations(association_id);
CREATE INDEX IF NOT EXISTS idx_acc_relations_user ON accounting_relations(user_id);
CREATE INDEX IF NOT EXISTS idx_acc_relations_contact ON accounting_relations(contact_id);

-- Facturen
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    fiscal_year_id TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('sales', 'purchase', 'credit_note')),
    relation_id TEXT NOT NULL,
    user_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled', 'written_off')),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    reference TEXT,
    description TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    vat_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    amount_paid REAL DEFAULT 0,
    amount_due REAL GENERATED ALWAYS AS (total - amount_paid) VIRTUAL,
    currency TEXT DEFAULT 'EUR',
    payment_reference TEXT,
    sepa_mandate_id TEXT,
    notes TEXT,
    sent_at DATETIME,
    paid_at DATETIME,
    reminder_count INTEGER DEFAULT 0,
    last_reminder_at DATETIME,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE RESTRICT,
    FOREIGN KEY (relation_id) REFERENCES accounting_relations(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE(association_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_assoc ON invoices(association_id);
CREATE INDEX IF NOT EXISTS idx_invoices_relation ON invoices(relation_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_fiscal ON invoices(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);

-- Factuurregels
CREATE TABLE IF NOT EXISTS invoice_lines (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL,
    vat_rate REAL DEFAULT 0,
    vat_amount REAL DEFAULT 0,
    line_total REAL NOT NULL,
    account_id TEXT,
    cost_center_id TEXT,
    membership_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL,
    FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- Transacties (journaalboekingen)
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    fiscal_year_id TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'journal', 'payment', 'receipt', 'bank', 'opening', 'closing', 'transfer'
    )),
    reference TEXT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    invoice_id TEXT,
    bank_statement_line_id TEXT,
    is_reconciled INTEGER DEFAULT 0,
    reconciled_at DATETIME,
    -- Geboekt (definitief) versus concept. Een geboekte transactie is niet meer
    -- te bewerken of te verwijderen; afletteren tegen een bankregel staat daar
    -- los van en gebruikt is_reconciled.
    is_posted INTEGER NOT NULL DEFAULT 0,
    posted_at DATETIME,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE RESTRICT,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE(association_id, transaction_number)
);

CREATE INDEX IF NOT EXISTS idx_transactions_assoc ON transactions(association_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fiscal ON transactions(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id);

-- Transactieregels (debet/credit boekingen)
CREATE TABLE IF NOT EXISTS transaction_lines (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    account_id TEXT NOT NULL,
    cost_center_id TEXT,
    description TEXT,
    debit_amount REAL DEFAULT 0,
    credit_amount REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transaction_lines_trans ON transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_lines_account ON transaction_lines(account_id);

-- Bankafschriften
CREATE TABLE IF NOT EXISTS bank_statements (
    id TEXT PRIMARY KEY,
    bank_account_id TEXT NOT NULL,
    statement_number TEXT,
    statement_date DATE NOT NULL,
    opening_balance REAL NOT NULL,
    closing_balance REAL NOT NULL,
    total_debit REAL DEFAULT 0,
    total_credit REAL DEFAULT 0,
    line_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'processing', 'reconciled', 'closed')),
    import_file_name TEXT,
    imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reconciled_at DATETIME,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date ON bank_statements(statement_date);

-- Bankafschriftregels
CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id TEXT PRIMARY KEY,
    statement_id TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    booking_date DATE NOT NULL,
    value_date DATE,
    amount REAL NOT NULL,
    counterparty_name TEXT,
    counterparty_iban TEXT,
    description TEXT,
    reference TEXT,
    transaction_type TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'manual', 'ignored')),
    matched_invoice_id TEXT,
    matched_relation_id TEXT,
    transaction_id TEXT,
    match_confidence REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reconciled_at DATETIME,
    FOREIGN KEY (statement_id) REFERENCES bank_statements(id) ON DELETE CASCADE,
    FOREIGN KEY (matched_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (matched_relation_id) REFERENCES accounting_relations(id) ON DELETE SET NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_lines_statement ON bank_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_lines_status ON bank_statement_lines(status);
CREATE INDEX IF NOT EXISTS idx_bank_lines_invoice ON bank_statement_lines(matched_invoice_id);

-- Budgetten
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    fiscal_year_id TEXT NOT NULL,
    name TEXT NOT NULL,
    account_id TEXT,
    cost_center_id TEXT,
    budget_type TEXT NOT NULL CHECK (budget_type IN ('income', 'expense')),
    amount REAL NOT NULL,
    jan_amount REAL, feb_amount REAL, mar_amount REAL,
    apr_amount REAL, may_amount REAL, jun_amount REAL,
    jul_amount REAL, aug_amount REAL, sep_amount REAL,
    oct_amount REAL, nov_amount REAL, dec_amount REAL,
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_budgets_assoc ON budgets(association_id);
CREATE INDEX IF NOT EXISTS idx_budgets_fiscal ON budgets(fiscal_year_id);

-- Donaties
CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    fiscal_year_id TEXT NOT NULL,
    relation_id TEXT,
    donor_name TEXT NOT NULL,
    donor_email TEXT,
    donor_address TEXT,
    amount REAL NOT NULL,
    donation_date DATE NOT NULL,
    donation_type TEXT NOT NULL CHECK (donation_type IN ('one_time', 'recurring', 'in_kind', 'legacy')),
    payment_method TEXT,
    campaign TEXT,
    is_anonymous INTEGER DEFAULT 0,
    is_tax_deductible INTEGER DEFAULT 1,
    receipt_number TEXT,
    receipt_sent_at DATETIME,
    notes TEXT,
    account_id TEXT,
    transaction_id TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE RESTRICT,
    FOREIGN KEY (relation_id) REFERENCES accounting_relations(id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_donations_assoc ON donations(association_id);
CREATE INDEX IF NOT EXISTS idx_donations_fiscal ON donations(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donation_date);

-- SEPA Mandaten
CREATE TABLE IF NOT EXISTS sepa_mandates (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    mandate_reference TEXT NOT NULL,
    mandate_type TEXT NOT NULL CHECK (mandate_type IN ('RCUR', 'OOFF')),
    iban TEXT NOT NULL,
    bic TEXT,
    signature_date DATE NOT NULL,
    signature_location TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    first_collection_date DATE,
    last_collection_date DATE,
    sequence_type TEXT DEFAULT 'RCUR' CHECK (sequence_type IN ('FRST', 'RCUR', 'FNAL', 'OOFF')),
    cancelled_at DATETIME,
    cancellation_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (relation_id) REFERENCES accounting_relations(id) ON DELETE CASCADE,
    UNIQUE(association_id, mandate_reference)
);

CREATE INDEX IF NOT EXISTS idx_sepa_mandates_assoc ON sepa_mandates(association_id);
CREATE INDEX IF NOT EXISTS idx_sepa_mandates_relation ON sepa_mandates(relation_id);

-- SEPA Batches (incasso-batches)
CREATE TABLE IF NOT EXISTS sepa_batches (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    bank_account_id TEXT NOT NULL,
    batch_reference TEXT NOT NULL,
    batch_type TEXT NOT NULL CHECK (batch_type IN ('DD', 'CT')),
    collection_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'submitted', 'processed', 'failed')),
    total_amount REAL NOT NULL DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    xml_file_path TEXT,
    generated_at DATETIME,
    submitted_at DATETIME,
    processed_at DATETIME,
    error_message TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE(association_id, batch_reference)
);

CREATE INDEX IF NOT EXISTS idx_sepa_batches_assoc ON sepa_batches(association_id);

-- SEPA Batch Items
CREATE TABLE IF NOT EXISTS sepa_batch_items (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    invoice_id TEXT,
    mandate_id TEXT NOT NULL,
    relation_id TEXT NOT NULL,
    amount REAL NOT NULL,
    reference TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'rejected', 'returned')),
    rejection_reason TEXT,
    return_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (batch_id) REFERENCES sepa_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    FOREIGN KEY (mandate_id) REFERENCES sepa_mandates(id) ON DELETE RESTRICT,
    FOREIGN KEY (relation_id) REFERENCES accounting_relations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sepa_items_batch ON sepa_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_sepa_items_invoice ON sepa_batch_items(invoice_id);

-- Buma/Stemra rapportage
CREATE TABLE IF NOT EXISTS music_performance_reports (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    concert_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'accepted')),
    total_works INTEGER DEFAULT 0,
    total_duration_minutes INTEGER DEFAULT 0,
    audience_count INTEGER,
    venue_capacity INTEGER,
    submitted_at DATETIME,
    accepted_at DATETIME,
    reference_number TEXT,
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_perf_reports_assoc ON music_performance_reports(association_id);
CREATE INDEX IF NOT EXISTS idx_perf_reports_concert ON music_performance_reports(concert_id);

-- Buma/Stemra rapportage regels
CREATE TABLE IF NOT EXISTS music_performance_report_lines (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    music_title_id TEXT,
    title TEXT NOT NULL,
    composer TEXT,
    arranger TEXT,
    publisher TEXT,
    duration_minutes INTEGER,
    is_original INTEGER DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES music_performance_reports(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_perf_report_lines_report ON music_performance_report_lines(report_id);

-- ===========================================
-- PHASE D: OPERATIONS MODULES
-- ===========================================

-- ===========================================
-- PROJECTS MODULE
-- ===========================================

-- Projects (group of rehearsals + concerts)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled', 'archived')),
    project_type TEXT DEFAULT 'concert' CHECK (project_type IN ('concert', 'competition', 'festival', 'tour', 'recording', 'other')),
    orchestra_id TEXT,
    budget REAL,
    notes TEXT,
    cover_image_path TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_projects_assoc ON projects(association_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects(start_date, end_date);

-- Project members (specific participants for a project)
CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'participant' CHECK (role IN ('participant', 'leader', 'coordinator', 'soloist', 'substitute')),
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('invited', 'confirmed', 'declined', 'tentative')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- Link projects to concerts
CREATE TABLE IF NOT EXISTS project_concerts (
    project_id TEXT NOT NULL,
    concert_id TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, concert_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE
);

-- Concrete instanties van een repetitie(serie).
--
-- rehearsals is de serie/afspraak, rehearsal_instances is de losse
-- gebeurtenis waar projecten, resource bookings, equipment loans en
-- vervangingsverzoeken naar verwijzen. De tabel ontbrak eerder volledig,
-- terwijl project_rehearsals, resource_bookings en equipment_loans er een
-- foreign key naartoe hebben: daardoor faalde elke DELETE op een tabel in
-- die keten (waaronder de GDPR-purge van gebruikers) met
-- "no such table: main.rehearsal_instances".
--
-- Alle kolommen buiten id zijn nullable: de bestaande call sites in
-- routes/polls.ts vullen onderling verschillende subsets.
CREATE TABLE IF NOT EXISTS rehearsal_instances (
    id TEXT PRIMARY KEY,
    rehearsal_id TEXT,
    association_id TEXT,
    orchestra_id TEXT,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    status TEXT DEFAULT 'scheduled', -- scheduled, cancelled, completed
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rehearsal_instances_rehearsal ON rehearsal_instances(rehearsal_id);
CREATE INDEX IF NOT EXISTS idx_rehearsal_instances_date ON rehearsal_instances(date);

-- Link projects to rehearsals
CREATE TABLE IF NOT EXISTS project_rehearsals (
    project_id TEXT NOT NULL,
    rehearsal_instance_id TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (project_id, rehearsal_instance_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (rehearsal_instance_id) REFERENCES rehearsal_instances(id) ON DELETE CASCADE
);

-- Project setlist (music pieces for the project)
CREATE TABLE IF NOT EXISTS project_setlist (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    music_title_id TEXT,
    custom_title TEXT,
    sort_order INTEGER DEFAULT 0,
    duration_minutes INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_project_setlist_project ON project_setlist(project_id);

-- ===========================================
-- TOURS MODULE
-- ===========================================

-- Tours (multi-day concert trips)
CREATE TABLE IF NOT EXISTS tours (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    project_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    destination TEXT,
    country TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'confirmed', 'active', 'completed', 'cancelled')),
    budget REAL,
    cost_per_person REAL,
    max_participants INTEGER,
    registration_deadline DATE,
    notes TEXT,
    cover_image_path TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tours_assoc ON tours(association_id);
CREATE INDEX IF NOT EXISTS idx_tours_dates ON tours(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tours_status ON tours(status);

-- Tour participants
CREATE TABLE IF NOT EXISTS tour_participants (
    id TEXT PRIMARY KEY,
    tour_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'registered' CHECK (status IN ('invited', 'registered', 'confirmed', 'declined', 'cancelled', 'waitlist')),
    registration_date DATETIME,
    room_preference TEXT,
    dietary_requirements TEXT,
    emergency_contact TEXT,
    emergency_phone TEXT,
    paid_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tour_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_participants_tour ON tour_participants(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_participants_user ON tour_participants(user_id);

-- Tour days/schedule
CREATE TABLE IF NOT EXISTS tour_days (
    id TEXT PRIMARY KEY,
    tour_id TEXT NOT NULL,
    day_date DATE NOT NULL,
    day_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE,
    UNIQUE(tour_id, day_date)
);

CREATE INDEX IF NOT EXISTS idx_tour_days_tour ON tour_days(tour_id);

-- Tour activities (events within a tour day)
CREATE TABLE IF NOT EXISTS tour_activities (
    id TEXT PRIMARY KEY,
    tour_day_id TEXT NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('travel', 'rehearsal', 'concert', 'meal', 'accommodation', 'sightseeing', 'free_time', 'meeting', 'other')),
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    address TEXT,
    start_time TIME,
    end_time TIME,
    is_mandatory BOOLEAN DEFAULT 1,
    cost REAL,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tour_day_id) REFERENCES tour_days(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tour_activities_day ON tour_activities(tour_day_id);

-- Tour accommodations
CREATE TABLE IF NOT EXISTS tour_accommodations (
    id TEXT PRIMARY KEY,
    tour_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    check_in_date DATE,
    check_out_date DATE,
    room_count INTEGER,
    cost_per_night REAL,
    total_cost REAL,
    confirmation_number TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tour_accommodations_tour ON tour_accommodations(tour_id);

-- Tour room assignments
CREATE TABLE IF NOT EXISTS tour_room_assignments (
    id TEXT PRIMARY KEY,
    accommodation_id TEXT NOT NULL,
    room_number TEXT,
    room_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accommodation_id) REFERENCES tour_accommodations(id) ON DELETE CASCADE
);

-- Tour room occupants
CREATE TABLE IF NOT EXISTS tour_room_occupants (
    room_assignment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (room_assignment_id, user_id),
    FOREIGN KEY (room_assignment_id) REFERENCES tour_room_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tour transport
CREATE TABLE IF NOT EXISTS tour_transport (
    id TEXT PRIMARY KEY,
    tour_id TEXT NOT NULL,
    transport_type TEXT NOT NULL CHECK (transport_type IN ('bus', 'train', 'plane', 'ferry', 'car', 'other')),
    provider TEXT,
    departure_location TEXT,
    departure_time DATETIME,
    arrival_location TEXT,
    arrival_time DATETIME,
    vehicle_info TEXT,
    booking_reference TEXT,
    cost REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tour_transport_tour ON tour_transport(tour_id);

-- ===========================================
-- RESOURCES/BOOKING MODULE
-- ===========================================

-- Resource categories
CREATE TABLE IF NOT EXISTS resource_categories (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    UNIQUE(association_id, name)
);

-- Resources (bookable items: rooms, equipment, vehicles)
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('room', 'vehicle', 'equipment', 'instrument', 'service', 'other')),
    location TEXT,
    capacity INTEGER,
    is_active BOOLEAN DEFAULT 1,
    requires_approval BOOLEAN DEFAULT 0,
    approved_by_roles TEXT,
    min_booking_hours REAL,
    max_booking_hours REAL,
    advance_booking_days INTEGER,
    cost_per_hour REAL,
    cost_per_day REAL,
    deposit_amount REAL,
    image_path TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES resource_categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_resources_assoc ON resources(association_id);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type);

-- Resource availability (blocked times, regular availability)
CREATE TABLE IF NOT EXISTS resource_availability (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    availability_type TEXT NOT NULL CHECK (availability_type IN ('available', 'blocked', 'maintenance')),
    day_of_week INTEGER,
    start_time TIME,
    end_time TIME,
    start_date DATE,
    end_date DATE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resource_availability_resource ON resource_availability(resource_id);

-- Resource bookings
CREATE TABLE IF NOT EXISTS resource_bookings (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
    related_rehearsal_id TEXT,
    related_concert_id TEXT,
    related_project_id TEXT,
    approved_by TEXT,
    approved_at DATETIME,
    rejection_reason TEXT,
    actual_start DATETIME,
    actual_end DATETIME,
    notes TEXT,
    internal_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_rehearsal_id) REFERENCES rehearsal_instances(id) ON DELETE SET NULL,
    FOREIGN KEY (related_concert_id) REFERENCES concerts(id) ON DELETE SET NULL,
    FOREIGN KEY (related_project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_resource ON resource_bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON resource_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON resource_bookings(start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON resource_bookings(status);

-- Recurring booking patterns
CREATE TABLE IF NOT EXISTS booking_recurrence (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'biweekly', 'monthly')),
    day_of_week INTEGER,
    day_of_month INTEGER,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ===========================================
-- EQUIPMENT INVENTORY MODULE
-- ===========================================

-- Equipment categories
CREATE TABLE IF NOT EXISTS equipment_categories (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    parent_id TEXT,
    color TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES equipment_categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_categories_assoc ON equipment_categories(association_id);

-- Equipment items
CREATE TABLE IF NOT EXISTS equipment_items (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    inventory_number TEXT,
    serial_number TEXT,
    brand TEXT,
    model TEXT,
    equipment_type TEXT NOT NULL CHECK (equipment_type IN ('instrument', 'accessory', 'audio', 'lighting', 'furniture', 'transport', 'misc')),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'repair', 'retired', 'lost', 'sold')),
    condition TEXT DEFAULT 'good' CHECK (condition IN ('new', 'excellent', 'good', 'fair', 'poor', 'broken')),
    location TEXT,
    storage_location TEXT,
    purchase_date DATE,
    purchase_price REAL,
    current_value REAL,
    depreciation_years INTEGER,
    warranty_expiry DATE,
    last_maintenance DATE,
    next_maintenance DATE,
    maintenance_interval_months INTEGER,
    insurance_value REAL,
    insurance_policy TEXT,
    is_loanable BOOLEAN DEFAULT 1,
    requires_training BOOLEAN DEFAULT 0,
    image_path TEXT,
    manual_path TEXT,
    notes TEXT,
    qr_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES equipment_categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_assoc ON equipment_items(association_id);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment_items(category_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment_items(status);
CREATE INDEX IF NOT EXISTS idx_equipment_inventory ON equipment_items(inventory_number);

-- Bruikleen op de equipment_items-inventaris.
--
-- Let op: dit is NIET dezelfde tabel als equipment_loans hierboven. Die hoort
-- bij de oudere equipment-tabel (instrumenten, gebruikt door maintenance.ts)
-- en heeft een andere kolomindeling. Omdat beide CREATE TABLE IF NOT EXISTS
-- heetten, won de eerste en kreeg routes/equipment.ts een tabel met de
-- verkeerde kolommen. Vandaar de eigen naam.
CREATE TABLE IF NOT EXISTS equipment_item_loans (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    checkout_date DATETIME NOT NULL,
    expected_return_date DATETIME,
    actual_return_date DATETIME,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned', 'overdue', 'lost')),
    condition_at_checkout TEXT,
    condition_at_return TEXT,
    checkout_notes TEXT,
    return_notes TEXT,
    related_concert_id TEXT,
    related_rehearsal_id TEXT,
    related_project_id TEXT,
    created_by TEXT NOT NULL,
    returned_to TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_concert_id) REFERENCES concerts(id) ON DELETE SET NULL,
    FOREIGN KEY (related_rehearsal_id) REFERENCES rehearsal_instances(id) ON DELETE SET NULL,
    FOREIGN KEY (related_project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (returned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_equipment ON equipment_item_loans(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_user ON equipment_item_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_status ON equipment_item_loans(status);
CREATE INDEX IF NOT EXISTS idx_equipment_item_loans_dates ON equipment_item_loans(checkout_date, expected_return_date);

-- Schaderapportages op de equipment_items-inventaris (routes/equipment.ts)
CREATE TABLE IF NOT EXISTS equipment_damage_reports (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'severe', 'unusable')),
    photos TEXT,
    repair_cost REAL,
    repaired_at DATETIME,
    repaired_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (repaired_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_damage_reports_item ON equipment_damage_reports(item_id);

-- Equipment maintenance records
CREATE TABLE IF NOT EXISTS equipment_maintenance (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL,
    maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('inspection', 'cleaning', 'repair', 'service', 'calibration', 'replacement')),
    description TEXT NOT NULL,
    performed_date DATE NOT NULL,
    performed_by TEXT,
    external_provider TEXT,
    cost REAL,
    parts_replaced TEXT,
    next_maintenance_date DATE,
    notes TEXT,
    receipt_path TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_equipment ON equipment_maintenance(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_date ON equipment_maintenance(performed_date);

-- Equipment reservations (for future use)
CREATE TABLE IF NOT EXISTS equipment_reservations (
    id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    purpose TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
    related_concert_id TEXT,
    related_project_id TEXT,
    approved_by TEXT,
    approved_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment_items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_concert_id) REFERENCES concerts(id) ON DELETE SET NULL,
    FOREIGN KEY (related_project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equipment_reservations_equipment ON equipment_reservations(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_user ON equipment_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_dates ON equipment_reservations(start_date, end_date);

-- ===========================================
-- PHASE E: OUTFITS MODULE
-- ===========================================

-- Outfit definitions (concert attire)
CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color_code TEXT,
    image_path TEXT,
    items TEXT, -- JSON array of required items
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_outfits_association ON outfits(association_id);

-- Link concerts to outfits
CREATE TABLE IF NOT EXISTS concert_outfits (
    id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    outfit_id TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (concert_id) REFERENCES concerts(id) ON DELETE CASCADE,
    FOREIGN KEY (outfit_id) REFERENCES outfits(id) ON DELETE CASCADE,
    UNIQUE(concert_id, outfit_id)
);

-- ===========================================
-- PHASE E: PUBLIC CALENDAR EMBEDDING
-- ===========================================

-- Public calendar settings (for website embed)
CREATE TABLE IF NOT EXISTS public_calendar_settings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL UNIQUE,
    is_enabled INTEGER DEFAULT 0,
    embed_token TEXT UNIQUE,
    show_concert_details INTEGER DEFAULT 1,
    show_rehearsals INTEGER DEFAULT 0,
    show_locations INTEGER DEFAULT 1,
    custom_css TEXT,
    allowed_origins TEXT, -- JSON array of allowed embed origins
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- ===========================================
-- PHASE E: WIKI MODULE
-- ===========================================

-- Wiki pages
CREATE TABLE IF NOT EXISTS wiki_pages (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    content_format TEXT DEFAULT 'markdown' CHECK (content_format IN ('markdown', 'html')),
    parent_id TEXT,
    sort_order INTEGER DEFAULT 0,
    is_published INTEGER DEFAULT 1,
    visibility TEXT DEFAULT 'members' CHECK (visibility IN ('public', 'members', 'committee', 'admin')),
    allow_comments INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES wiki_pages(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(association_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_association ON wiki_pages(association_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug ON wiki_pages(slug);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_parent ON wiki_pages(parent_id);

-- Wiki page versions (history)
CREATE TABLE IF NOT EXISTS wiki_page_versions (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    change_summary TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(page_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_wiki_versions_page ON wiki_page_versions(page_id);

-- Wiki attachments
CREATE TABLE IF NOT EXISTS wiki_attachments (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ===========================================
-- PHASE E: WORKFLOW AUTOMATION
-- ===========================================

-- Workflow definitions
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    run_once_per_entity INTEGER DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_association ON workflows(association_id);
CREATE INDEX IF NOT EXISTS idx_workflows_active ON workflows(is_active);

-- Workflow triggers
CREATE TABLE IF NOT EXISTS workflow_triggers (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'schedule', 'event', 'date_field', 'manual'
    )),
    event_name TEXT, -- e.g., 'user.created', 'concert.upcoming', 'rehearsal.reminder'
    schedule_cron TEXT, -- For schedule triggers
    date_field_entity TEXT, -- e.g., 'concert', 'rehearsal'
    date_field_name TEXT, -- e.g., 'date', 'registration_deadline'
    days_before INTEGER DEFAULT 0,
    days_after INTEGER DEFAULT 0,
    time_of_day TEXT, -- HH:MM format
    conditions TEXT, -- JSON conditions
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow ON workflow_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type ON workflow_triggers(trigger_type);

-- Workflow actions
CREATE TABLE IF NOT EXISTS workflow_actions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'send_email', 'send_notification', 'create_task', 'update_field',
        'add_to_group', 'remove_from_group', 'webhook', 'delay'
    )),
    action_order INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL, -- JSON configuration for the action
    conditions TEXT, -- JSON conditions for this specific action
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_actions_workflow ON workflow_actions(workflow_id);

-- Workflow execution log
CREATE TABLE IF NOT EXISTS workflow_executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    trigger_id TEXT,
    triggered_by TEXT, -- 'system', 'manual', 'schedule'
    triggered_by_user_id TEXT,
    entity_type TEXT, -- e.g., 'user', 'concert', 'rehearsal'
    entity_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at DATETIME,
    completed_at DATETIME,
    error_message TEXT,
    execution_log TEXT, -- JSON log of actions executed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (trigger_id) REFERENCES workflow_triggers(id) ON DELETE SET NULL,
    FOREIGN KEY (triggered_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_entity ON workflow_executions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_date ON workflow_executions(created_at);

-- Workflow entity tracking (to prevent duplicate runs)
CREATE TABLE IF NOT EXISTS workflow_entity_runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    trigger_id TEXT NOT NULL,
    last_run_at DATETIME NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (trigger_id) REFERENCES workflow_triggers(id) ON DELETE CASCADE,
    UNIQUE(workflow_id, entity_type, entity_id, trigger_id)
);

-- ===========================================
-- FAILED IMPORTS TRACKING
-- ===========================================

-- Track failed imports for recovery
CREATE TABLE IF NOT EXISTS failed_imports (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_path TEXT,
    import_type TEXT NOT NULL DEFAULT 'pdf', -- pdf, zip, cloud, imslp
    error_message TEXT NOT NULL,
    error_code TEXT,
    metadata_json TEXT, -- Store any parsed metadata for retry
    source_info TEXT, -- Additional info about the source (e.g., cloud provider, IMSLP URL)
    list_id TEXT, -- Target music list if specified
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'failed', -- failed, retrying, recovered, dismissed
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_retry_at DATETIME,
    recovered_at DATETIME,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (list_id) REFERENCES music_lists(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_failed_imports_association ON failed_imports(association_id);
CREATE INDEX IF NOT EXISTS idx_failed_imports_status ON failed_imports(status);
CREATE INDEX IF NOT EXISTS idx_failed_imports_created_by ON failed_imports(created_by);
CREATE INDEX IF NOT EXISTS idx_failed_imports_created_at ON failed_imports(created_at);

-- ===========================================
-- AVG / PRIVACY EN ZOEKGESCHIEDENIS
-- ===========================================
-- Deze drie tabellen werden voorheen bij elk verzoek door routes/gdpr.ts en
-- routes/search.ts zelf aangemaakt met CREATE TABLE IF NOT EXISTS. Dat werkte,
-- maar zette DDL in een request-pad en hield ze buiten schema.ts, de migraties
-- en elke schemacontrole.

-- Verwijderverzoeken van gebruikers (AVG art. 17)
CREATE TABLE IF NOT EXISTS deletion_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    processed_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bewaartermijnen per gegevenssoort, per vereniging
CREATE TABLE IF NOT EXISTS data_retention_settings (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    data_type TEXT NOT NULL,
    retention_days INTEGER NOT NULL,
    auto_delete INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(association_id, data_type)
);

-- Recente zoekopdrachten per gebruiker
CREATE TABLE IF NOT EXISTS user_recent_searches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    query TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_recent_searches_user ON user_recent_searches(user_id);

-- ===========================================
-- MODULES (aan/uit per vereniging)
-- ===========================================
-- Alleen afwijkingen van de standaard uit backend/src/modules/registry.ts.
-- Geen rij betekent: de standaard geldt. Uitzetten verbergt de module, het
-- verwijdert geen gegevens; zie docs/MODULES.md.
CREATE TABLE IF NOT EXISTS association_modules (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    module_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(association_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_association_modules_association ON association_modules(association_id);
`;
