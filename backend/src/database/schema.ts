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
    role TEXT NOT NULL DEFAULT 'member', -- admin, music_committee, conductor, member
    association_id TEXT,
    mfa_secret TEXT, -- TOTP secret for MFA
    mfa_enabled BOOLEAN DEFAULT 0, -- Whether MFA is enabled
    microsoft_id TEXT, -- Microsoft Entra Object ID for SSO
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE SET NULL,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Koppeltabel: muziekstukken op lijsten
CREATE TABLE IF NOT EXISTS music_list_pieces (
    music_list_id TEXT NOT NULL,
    music_piece_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (music_list_id, music_piece_id),
    FOREIGN KEY (music_list_id) REFERENCES music_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE
);

-- Titel metadata (YouTube, beschrijving, speelduur per titel)
CREATE TABLE IF NOT EXISTS music_titles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    arranger TEXT,
    youtube_url TEXT,
    description TEXT,
    duration_seconds INTEGER DEFAULT 0,
    grade TEXT, -- Moeilijkheidsgraad (bijv. 1, 2, 3, 4, 5 of 1.5, 2+, etc.)
    mp3_file_path TEXT, -- Pad naar MP3 preview bestand
    is_shared BOOLEAN DEFAULT 0, -- Mag gedeeld worden met andere verenigingen
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
    group_id TEXT, -- Spond groep-ID om te synchroniseren
    sync_enabled BOOLEAN DEFAULT 0,
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

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
`;
