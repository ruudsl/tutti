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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexen voor betere performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_association ON users(association_id);
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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
    status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, cancelled, refunded, expired
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
`;
