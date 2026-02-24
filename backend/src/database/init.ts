import db from './connection';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Standaard genres voor muziekstukken
const defaultGenres = [
    'Alternative',
    'American',
    'Ballad',
    'Baroque',
    'Blues',
    'Broadway',
    'Calypso',
    'Celtic',
    'Children',
    'Christmas',
    'Classical',
    'Concert',
    'Contemporary',
    'Contest',
    'Country',
    'Disney',
    'Festival',
    'Film/TV',
    'Folk',
    'Funk',
    'Gospel',
    'Graduation',
    'Halloween',
    'Hanukkah',
    'Hip-Hop',
    'Holiday',
    'Hymn',
    'Inspirational',
    'Irish',
    'Jazz',
    'Jewish',
    'Latin',
    'Latin American',
    'Love',
    'Musical/Show',
    'New Age',
    'Novelty',
    'Patriotic',
    'Pop',
    'Reggae',
    'Renaissance',
    'Rock',
    'Sacred',
    'Standards',
    'Traditional',
    'Video Game',
    'Winter',
    'World',
];

// Seed data voor instrumenten met aliassen
const instrumentsWithAliases = [
    { name: 'Alto Saxophone', tuning: 'Eb', aliases: ['Altsax', 'altsax', 'Alt Sax', 'Alt Saxofoon'] },
    { name: 'Tenor Saxophone', tuning: 'Bb', aliases: ['Tenorsax', 'tenorsax', 'Tenor Sax', 'Tenor Saxofoon'] },
    { name: 'Baritone Saxophone', tuning: 'Eb', aliases: ['Baritonsax', 'baritonsax', 'Bari Sax', 'Bariton Saxofoon', 'Bariton Saxophone', 'Baritone Saxofoon', 'Baritone Sax', 'Baritone sax'] },
    { name: 'Soprano Saxophone', tuning: 'Bb', aliases: ['Sopraansax', 'sopraansax', 'Sopraan Saxofoon'] },
    { name: 'Clarinet', tuning: 'Bb', aliases: ['Klarinet', 'klarinet', 'Bb Klarinet'] },
    { name: 'Bass Clarinet', tuning: 'Bb', aliases: ['Basklarinet', 'basklarinet', 'Bas Klarinet', 'Bas Clarinet'] },
    { name: 'Eb Clarinet', tuning: 'Eb', aliases: ['Es Klarinet', 'Eb Klarinet', 'Kleine Klarinet'] },
    { name: 'Flute', tuning: 'C', aliases: ['Fluit', 'fluit', 'Dwarsfluit'] },
    { name: 'Piccolo', tuning: 'C', aliases: ['piccolo', 'Pikkolofluit'] },
    { name: 'Oboe', tuning: 'C', aliases: ['Hobo', 'hobo'] },
    { name: 'Bassoon', tuning: 'C', aliases: ['Fagot', 'fagot'] },
    { name: 'Trumpet', tuning: 'Bb', aliases: ['Trompet', 'trompet', 'Bb Trompet'] },
    { name: 'Cornet', tuning: 'Bb', aliases: ['Kornet', 'kornet', 'Bb Kornet'] },
    { name: 'Flugelhorn', tuning: 'Bb', aliases: ['Bugel', 'bugel', 'Flugel'] },
    { name: 'French Horn', tuning: 'F', aliases: ['Hoorn', 'hoorn', 'F Hoorn', 'Waldhoorn', 'Horn'] },
    { name: 'Trombone', tuning: 'C', aliases: ['Schuiftrombone', 'trombone', 'Tenor Trombone'] },
    { name: 'Bass Trombone', tuning: 'C', aliases: ['Bastrombone', 'bastrombone'] },
    { name: 'Euphonium', tuning: 'Bb', aliases: ['Bariton', 'bariton', 'Eufonium', 'Baritone', 'Tenorhorn', 'Baritone Horn', 'Tenor Tuba', 'Euphonium, Tenor Tuba', 'Bariton, Euphonium'] },
    { name: 'Tuba', tuning: 'C', aliases: ['tuba', 'Bas Tuba', 'C Tuba'] },
    { name: 'Tuba', tuning: 'Bb', aliases: ['BBb Tuba', 'Bb Tuba'] },
    { name: 'Tuba', tuning: 'Eb', aliases: ['Eb Tuba', 'Es Tuba'] },
    { name: 'Percussion', tuning: null, aliases: ['Slagwerk', 'slagwerk', 'Drums', 'Percussie', 'Drumset', 'Bongo', 'Bongos', 'Glockenspiel', 'Mallet Percussion', 'Shaker', 'Vibraphone', 'Tambourine'] },
    { name: 'Timpani', tuning: null, aliases: ['Pauken', 'pauken'] },
    { name: 'Mallets', tuning: 'C', aliases: ['Klokkenspel', 'Xylofoon', 'Marimba', 'Vibrafoon'] },
    { name: 'String Bass', tuning: 'C', aliases: ['Contrabas', 'contrabas', 'Double Bass'] },
    { name: 'Electric Bass', tuning: null, aliases: ['Basgitaar', 'E-bas'] },
    { name: 'Guitar', tuning: null, aliases: ['Gitaar', 'gitaar', 'Electric Guitar'] },
    { name: 'Bass Guitar', tuning: null, aliases: ['Basgitaar', 'Bass Gitaar'] },
    { name: 'Piano', tuning: 'C', aliases: ['piano', 'Keyboard', 'Synthesizer'] },
    { name: 'Harp', tuning: 'C', aliases: ['harp'] },
    { name: 'Conductor', tuning: null, aliases: ['Score', 'Full score', 'Full Score'] },
    { name: 'Alto Clarinet', tuning: 'Eb', aliases: ['Altklarinet', 'Alt Klarinet'] },
    { name: 'Vocals', tuning: null, aliases: ['Voice', 'Choir'] },
    { name: 'Bariton,Euphonium', tuning: 'C', aliases: [] },
];

async function initializeDatabase() {
    console.log('Initializing database...');

    // Check if instruments already exist
    const existingInstruments = db.prepare('SELECT COUNT(*) as count FROM instruments').get() as { count: number };

    if (existingInstruments.count === 0) {
        console.log('Seeding instruments...');

        const insertInstrument = db.prepare(
            'INSERT INTO instruments (id, name, tuning) VALUES (?, ?, ?)'
        );
        const insertAlias = db.prepare(
            'INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)'
        );

        for (const instrument of instrumentsWithAliases) {
            const instrumentId = uuidv4();
            insertInstrument.run(instrumentId, instrument.name, instrument.tuning);

            for (const alias of instrument.aliases) {
                insertAlias.run(uuidv4(), instrumentId, alias);
            }
        }

        console.log(`Seeded ${instrumentsWithAliases.length} instruments with aliases`);
    }

    // Check if default association exists
    const existingAssociations = db.prepare('SELECT COUNT(*) as count FROM associations').get() as { count: number };

    if (existingAssociations.count === 0) {
        console.log('Creating default association...');
        const associationId = uuidv4();
        db.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(associationId, 'Harmonie');

        // Create default orchestra
        const orchestraId = uuidv4();
        db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(
            orchestraId,
            'Groot Orkest',
            associationId
        );

        // Create admin user with password from env var or generated random password
        const adminId = uuidv4();
        const adminPassword = process.env.ADMIN_INIT_PASSWORD || Math.random().toString(36).slice(-12) + 'A1!';
        const passwordHash = bcrypt.hashSync(adminPassword, 10);
        db.prepare(
            'INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(adminId, 'admin@harmonie.nl', passwordHash, 'Admin', 'Beheerder', 'admin', associationId);

        console.log('Created default association, orchestra, and admin user');
        console.log('Admin login: admin@harmonie.nl');
        if (process.env.ADMIN_INIT_PASSWORD) {
            console.log('Password: (set via ADMIN_INIT_PASSWORD env var)');
        } else {
            console.log(`Generated password: ${adminPassword}`);
            console.log('⚠️  Save this password! Set ADMIN_INIT_PASSWORD env var to use a custom password.');
        }
    }

    // Seed genres if they don't exist
    const existingGenres = db.prepare('SELECT COUNT(*) as count FROM genres').get() as { count: number };

    if (existingGenres.count === 0) {
        console.log('Seeding genres...');
        const insertGenre = db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)');

        for (const genre of defaultGenres) {
            insertGenre.run(uuidv4(), genre);
        }

        console.log(`Seeded ${defaultGenres.length} genres`);
    }

    // Migration: Replace old genres with new genre list
    try {
        const existingGenreRows = db.prepare('SELECT name FROM genres').all() as { name: string }[];
        const existingGenreNames = new Set(existingGenreRows.map(g => g.name));
        const newGenreNames = new Set(defaultGenres);

        // Remove genres not in the new list
        for (const name of existingGenreNames) {
            if (!newGenreNames.has(name)) {
                db.prepare('DELETE FROM genres WHERE name = ?').run(name);
                console.log(`Migration: Removed genre "${name}"`);
            }
        }

        // Add new genres that don't exist yet
        for (const name of defaultGenres) {
            if (!existingGenreNames.has(name)) {
                db.prepare('INSERT INTO genres (id, name) VALUES (?, ?)').run(uuidv4(), name);
            }
        }
    } catch (e) {
        console.error('Migration: Error updating genres', e);
    }

    // Migration: Add is_shared column to music_titles if it doesn't exist
    try {
        const tableInfo = db.prepare("PRAGMA table_info(music_titles)").all() as { name: string }[];
        const hasIsShared = tableInfo.some(col => col.name === 'is_shared');
        if (!hasIsShared) {
            console.log('Migration: Adding is_shared column to music_titles...');
            db.prepare('ALTER TABLE music_titles ADD COLUMN is_shared BOOLEAN DEFAULT 0').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet, which is fine
    }

    // Migration: Add MFA columns to users if they don't exist
    try {
        const userTableInfo = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
        const hasMfaSecret = userTableInfo.some(col => col.name === 'mfa_secret');
        if (!hasMfaSecret) {
            console.log('Migration: Adding MFA columns to users...');
            db.prepare('ALTER TABLE users ADD COLUMN mfa_secret TEXT').run();
            db.prepare('ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT 0').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet, which is fine
    }

    // Migration: Add grade and mp3_file_path columns to music_titles if they don't exist
    try {
        const titleTableInfo = db.prepare("PRAGMA table_info(music_titles)").all() as { name: string }[];
        const hasGrade = titleTableInfo.some(col => col.name === 'grade');
        if (!hasGrade) {
            console.log('Migration: Adding grade and mp3_file_path columns to music_titles...');
            db.prepare('ALTER TABLE music_titles ADD COLUMN grade TEXT').run();
            db.prepare('ALTER TABLE music_titles ADD COLUMN mp3_file_path TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet, which is fine
    }

    // Migration: Add display_name and logo_path columns to associations if they don't exist
    try {
        const assocTableInfo = db.prepare("PRAGMA table_info(associations)").all() as { name: string }[];
        const hasDisplayName = assocTableInfo.some(col => col.name === 'display_name');
        if (!hasDisplayName) {
            console.log('Migration: Adding display_name and logo_path columns to associations...');
            db.prepare('ALTER TABLE associations ADD COLUMN display_name TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN logo_path TEXT').run();
            console.log('Migration complete');
        }
        const hasThemeJson = assocTableInfo.some(col => col.name === 'theme_json');
        if (!hasThemeJson) {
            console.log('Migration: Adding theme_json column to associations...');
            db.prepare('ALTER TABLE associations ADD COLUMN theme_json TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet, which is fine
    }

    // Migration: Add orchestra_id to rehearsals and rehearsal_default_days
    try {
        const rehearsalTableInfo = db.prepare("PRAGMA table_info(rehearsals)").all() as { name: string }[];
        const hasOrchestraId = rehearsalTableInfo.some(col => col.name === 'orchestra_id');
        if (!hasOrchestraId) {
            console.log('Migration: Adding orchestra_id to rehearsals and rehearsal_default_days...');
            db.prepare('ALTER TABLE rehearsals ADD COLUMN orchestra_id TEXT REFERENCES orchestras(id) ON DELETE SET NULL').run();
            db.prepare('ALTER TABLE rehearsal_default_days ADD COLUMN orchestra_id TEXT REFERENCES orchestras(id) ON DELETE SET NULL').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Tables might not exist yet
    }

    // Migration: Add new instruments and aliases
    try {
        const addAliasIfNotExists = (instrumentName: string, tuning: string | null, alias: string) => {
            const instrument = db.prepare(
                tuning !== null
                    ? 'SELECT id FROM instruments WHERE name = ? AND tuning = ?'
                    : 'SELECT id FROM instruments WHERE name = ? AND tuning IS NULL'
            ).get(...(tuning !== null ? [instrumentName, tuning] : [instrumentName])) as { id: string } | undefined;
            if (!instrument) return;
            const existing = db.prepare(
                'SELECT id FROM instrument_aliases WHERE instrument_id = ? AND alias = ?'
            ).get(instrument.id, alias);
            if (!existing) {
                db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)').run(uuidv4(), instrument.id, alias);
            }
        };

        const addInstrumentIfNotExists = (name: string, tuning: string | null, aliases: string[]) => {
            const existing = db.prepare(
                tuning !== null
                    ? 'SELECT id FROM instruments WHERE name = ? AND tuning = ?'
                    : 'SELECT id FROM instruments WHERE name = ? AND tuning IS NULL'
            ).get(...(tuning !== null ? [name, tuning] : [name])) as { id: string } | undefined;
            if (existing) return;
            const instrumentId = uuidv4();
            db.prepare('INSERT INTO instruments (id, name, tuning) VALUES (?, ?, ?)').run(instrumentId, name, tuning);
            for (const alias of aliases) {
                db.prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)').run(uuidv4(), instrumentId, alias);
            }
            console.log(`Migration: Added instrument ${name}`);
        };

        // New aliases for existing instruments
        addAliasIfNotExists('Baritone Saxophone', 'Eb', 'Bariton Saxophone');
        addAliasIfNotExists('Baritone Saxophone', 'Eb', 'Baritone Saxofoon');
        addAliasIfNotExists('French Horn', 'F', 'Horn');
        addAliasIfNotExists('Percussion', null, 'Drumset');
        addAliasIfNotExists('Percussion', null, 'Bongo');
        addAliasIfNotExists('Percussion', null, 'Glockenspiel');
        addAliasIfNotExists('Percussion', null, 'Mallet Percussion');
        addAliasIfNotExists('Percussion', null, 'Shaker');
        addAliasIfNotExists('Percussion', null, 'Vibraphone');
        addAliasIfNotExists('Percussion', null, 'Tambourine');
        addAliasIfNotExists('Percussion', null, 'Bongos');
        addAliasIfNotExists('Bass Clarinet', 'Bb', 'Bas Clarinet');
        addAliasIfNotExists('Euphonium', 'Bb', 'Baritone');
        addAliasIfNotExists('Euphonium', 'Bb', 'Tenorhorn');
        addAliasIfNotExists('Euphonium', 'Bb', 'Baritone Horn');
        addAliasIfNotExists('Euphonium', 'Bb', 'Tenor Tuba');
        addAliasIfNotExists('Euphonium', 'Bb', 'Euphonium, Tenor Tuba');
        addAliasIfNotExists('Euphonium', 'Bb', 'Bariton, Euphonium');
        addAliasIfNotExists('Baritone Saxophone', 'Eb', 'Baritone Sax');
        addAliasIfNotExists('Baritone Saxophone', 'Eb', 'Baritone sax');
        addAliasIfNotExists('Guitar', null, 'Electric Guitar');
        addAliasIfNotExists('Piano', 'C', 'Synthesizer');
        addAliasIfNotExists('Vocals', null, 'Choir');

        // New instruments
        addInstrumentIfNotExists('Bass Guitar', null, ['Basgitaar', 'Bass Gitaar']);
        addInstrumentIfNotExists('Bariton,Euphonium', 'C', []);
        addInstrumentIfNotExists('Conductor', null, ['Score', 'Full score', 'Full Score']);
        addInstrumentIfNotExists('Alto Clarinet', 'Eb', ['Altklarinet', 'Alt Klarinet']);
        addInstrumentIfNotExists('Vocals', null, ['Voice']);
    } catch (e) {
        console.error('Migration: Error adding new instruments/aliases', e);
    }

    // Migration: Add microsoft_id to users and microsoft_config to associations
    try {
        const usersTableInfo = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
        const hasMicrosoftId = usersTableInfo.some(col => col.name === 'microsoft_id');
        if (!hasMicrosoftId) {
            console.log('Migration: Adding Microsoft Entra ID fields...');
            db.prepare('ALTER TABLE users ADD COLUMN microsoft_id TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN microsoft_client_id TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN microsoft_client_secret TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN microsoft_tenant_id TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN microsoft_enabled BOOLEAN DEFAULT 0').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add SMTP config columns to associations
    try {
        const assocSmtpInfo = db.prepare("PRAGMA table_info(associations)").all() as { name: string }[];
        const hasSmtpHost = assocSmtpInfo.some(col => col.name === 'smtp_host');
        if (!hasSmtpHost) {
            console.log('Migration: Adding SMTP config columns to associations...');
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_host TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_port INTEGER DEFAULT 587').run();
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_secure BOOLEAN DEFAULT 0').run();
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_user TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_pass TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_from TEXT').run();
            db.prepare('ALTER TABLE associations ADD COLUMN smtp_enabled BOOLEAN DEFAULT 0').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add last_login column to users
    try {
        const usersLoginInfo = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
        const hasLastLogin = usersLoginInfo.some(col => col.name === 'last_login');
        if (!hasLastLogin) {
            console.log('Migration: Adding last_login column to users...');
            db.prepare('ALTER TABLE users ADD COLUMN last_login DATETIME').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add internal_notes column to music_titles
    try {
        const titleNotesInfo = db.prepare("PRAGMA table_info(music_titles)").all() as { name: string }[];
        const hasInternalNotes = titleNotesInfo.some(col => col.name === 'internal_notes');
        if (!hasInternalNotes) {
            console.log('Migration: Adding internal_notes column to music_titles...');
            db.prepare('ALTER TABLE music_titles ADD COLUMN internal_notes TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add concert fields to music_lists
    try {
        const listTableInfo = db.prepare("PRAGMA table_info(music_lists)").all() as { name: string }[];
        const hasListType = listTableInfo.some(col => col.name === 'list_type');
        if (!hasListType) {
            console.log('Migration: Adding concert fields to music_lists...');
            db.prepare("ALTER TABLE music_lists ADD COLUMN list_type TEXT NOT NULL DEFAULT 'regular'").run();
            db.prepare('ALTER TABLE music_lists ADD COLUMN concert_date TEXT').run();
            db.prepare('ALTER TABLE music_lists ADD COLUMN concert_location TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add composer column to music_titles and concert_program (for Buma/Stemra export)
    try {
        const titleTableInfo = db.prepare("PRAGMA table_info(music_titles)").all() as { name: string }[];
        const hasComposer = titleTableInfo.some(col => col.name === 'composer');
        if (!hasComposer) {
            console.log('Migration: Adding composer column to music_titles...');
            db.prepare('ALTER TABLE music_titles ADD COLUMN composer TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    try {
        const programTableInfo = db.prepare("PRAGMA table_info(concert_program)").all() as { name: string }[];
        const hasComposer = programTableInfo.some(col => col.name === 'composer');
        if (!hasComposer) {
            console.log('Migration: Adding composer column to concert_program...');
            db.prepare('ALTER TABLE concert_program ADD COLUMN composer TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add is_conductor column to rehearsal_seating
    try {
        const seatingTableInfo = db.prepare("PRAGMA table_info(rehearsal_seating)").all() as { name: string }[];
        const hasIsConductor = seatingTableInfo.some(col => col.name === 'is_conductor');
        if (!hasIsConductor) {
            console.log('Migration: Adding is_conductor column to rehearsal_seating...');
            db.prepare('ALTER TABLE rehearsal_seating ADD COLUMN is_conductor BOOLEAN DEFAULT 0').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add spond_orchestra_groups table for orchestra-specific Spond groups
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spond_orchestra_groups'").get();
        if (!tables) {
            console.log('Migration: Creating spond_orchestra_groups table...');
            db.prepare(`
                CREATE TABLE IF NOT EXISTS spond_orchestra_groups (
                    id TEXT PRIMARY KEY,
                    orchestra_id TEXT NOT NULL UNIQUE,
                    spond_group_id TEXT NOT NULL,
                    spond_group_name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
                )
            `).run();
            console.log('Migration complete');
        }
    } catch (e) {
        console.error('Migration: Error creating spond_orchestra_groups table', e);
    }

    // Migration: Add spond_member_links table for persistent Spond member to user mappings
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='spond_member_links'").get();
        if (!tables) {
            console.log('Migration: Creating spond_member_links table...');
            db.prepare(`
                CREATE TABLE IF NOT EXISTS spond_member_links (
                    id TEXT PRIMARY KEY,
                    association_id TEXT NOT NULL,
                    spond_member_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    spond_member_name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (association_id) REFERENCES associations(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE(association_id, spond_member_id)
                )
            `).run();
            db.prepare('CREATE INDEX IF NOT EXISTS idx_spond_member_links_spond_id ON spond_member_links(spond_member_id)').run();
            db.prepare('CREATE INDEX IF NOT EXISTS idx_spond_member_links_user ON spond_member_links(user_id)').run();
            console.log('Migration complete');
        }
    } catch (e) {
        console.error('Migration: Error creating spond_member_links table', e);
    }

    // Migration: Add seating notification settings table
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seating_notification_settings'").get();
        if (!tables) {
            console.log('Migration: Creating seating_notification_settings table...');
            db.prepare(`
                CREATE TABLE IF NOT EXISTS seating_notification_settings (
                    id TEXT PRIMARY KEY,
                    orchestra_id TEXT NOT NULL UNIQUE,
                    webhook_url TEXT NOT NULL,
                    minutes_before INTEGER NOT NULL DEFAULT 15,
                    enabled BOOLEAN DEFAULT 1,
                    include_image BOOLEAN DEFAULT 1,
                    message_template TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
                )
            `).run();
            db.prepare('CREATE INDEX IF NOT EXISTS idx_seating_notification_settings_orchestra ON seating_notification_settings(orchestra_id)').run();
            console.log('Migration complete');
        }
    } catch (e) {
        console.error('Migration: Error creating seating_notification_settings table', e);
    }

    // Migration: Add seating notification logs table
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seating_notification_logs'").get();
        if (!tables) {
            console.log('Migration: Creating seating_notification_logs table...');
            db.prepare(`
                CREATE TABLE IF NOT EXISTS seating_notification_logs (
                    id TEXT PRIMARY KEY,
                    rehearsal_id TEXT NOT NULL,
                    orchestra_id TEXT NOT NULL,
                    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT NOT NULL DEFAULT 'pending',
                    error_message TEXT,
                    webhook_response TEXT,
                    FOREIGN KEY (rehearsal_id) REFERENCES rehearsals(id) ON DELETE CASCADE,
                    FOREIGN KEY (orchestra_id) REFERENCES orchestras(id) ON DELETE CASCADE
                )
            `).run();
            db.prepare('CREATE INDEX IF NOT EXISTS idx_seating_notification_logs_rehearsal ON seating_notification_logs(rehearsal_id)').run();
            db.prepare('CREATE INDEX IF NOT EXISTS idx_seating_notification_logs_status ON seating_notification_logs(status)').run();
            console.log('Migration complete');
        }
    } catch (e) {
        console.error('Migration: Error creating seating_notification_logs table', e);
    }

    // Migration: Add WhatsApp/Twilio columns to seating_notification_settings
    try {
        const notifTableInfo = db.prepare("PRAGMA table_info(seating_notification_settings)").all() as { name: string }[];
        const hasNotificationType = notifTableInfo.some(col => col.name === 'notification_type');
        if (!hasNotificationType) {
            console.log('Migration: Adding WhatsApp columns to seating_notification_settings...');
            db.prepare("ALTER TABLE seating_notification_settings ADD COLUMN notification_type TEXT NOT NULL DEFAULT 'webhook'").run();
            db.prepare('ALTER TABLE seating_notification_settings ADD COLUMN twilio_account_sid TEXT').run();
            db.prepare('ALTER TABLE seating_notification_settings ADD COLUMN twilio_auth_token TEXT').run();
            db.prepare('ALTER TABLE seating_notification_settings ADD COLUMN twilio_whatsapp_from TEXT').run();
            db.prepare('ALTER TABLE seating_notification_settings ADD COLUMN twilio_whatsapp_to TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    // Migration: Add profile_photo_path column to users
    try {
        const usersPhotoInfo = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
        const hasProfilePhoto = usersPhotoInfo.some(col => col.name === 'profile_photo_path');
        if (!hasProfilePhoto) {
            console.log('Migration: Adding profile_photo_path column to users...');
            db.prepare('ALTER TABLE users ADD COLUMN profile_photo_path TEXT').run();
            console.log('Migration complete');
        }
    } catch (e) {
        // Table might not exist yet
    }

    console.log('Database initialization complete!');
}

export { initializeDatabase };

// Run when executed directly (npm run db:init)
if (require.main === module) {
    (async () => {
        try {
            await db.init();
            await initializeDatabase();
            process.exit(0);
        } catch (error) {
            console.error('Database initialization failed:', error);
            process.exit(1);
        }
    })();
}
