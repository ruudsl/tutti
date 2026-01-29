// Database schema voor de harmonie muziek applicatie

export const schema = `
-- Verenigingen (voor het delen van muziekstukken tussen verenigingen)
CREATE TABLE IF NOT EXISTS associations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, tuning)
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
    role TEXT NOT NULL DEFAULT 'member', -- admin, music_committee, member
    association_id TEXT,
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

-- Toegang tot gedeelde muziekstukken per vereniging
CREATE TABLE IF NOT EXISTS shared_music_access (
    music_piece_id TEXT NOT NULL,
    association_id TEXT NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (music_piece_id, association_id),
    FOREIGN KEY (music_piece_id) REFERENCES music_pieces(id) ON DELETE CASCADE,
    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE
);

-- Indexen voor betere performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_association ON users(association_id);
CREATE INDEX IF NOT EXISTS idx_orchestras_association ON orchestras(association_id);
CREATE INDEX IF NOT EXISTS idx_music_pieces_instrument ON music_pieces(instrument_id);
CREATE INDEX IF NOT EXISTS idx_music_pieces_association ON music_pieces(association_id);
CREATE INDEX IF NOT EXISTS idx_music_pieces_title ON music_pieces(title);
CREATE INDEX IF NOT EXISTS idx_instrument_aliases_alias ON instrument_aliases(alias);
`;
