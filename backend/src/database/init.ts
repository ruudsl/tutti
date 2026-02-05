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
    { name: 'Baritone Saxophone', tuning: 'Eb', aliases: ['Baritonsax', 'baritonsax', 'Bari Sax', 'Bariton Saxofoon', 'Bariton Saxophone'] },
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
    { name: 'Euphonium', tuning: 'Bb', aliases: ['Bariton', 'bariton', 'Eufonium', 'Baritone'] },
    { name: 'Tuba', tuning: 'C', aliases: ['tuba', 'Bas Tuba', 'C Tuba'] },
    { name: 'Tuba', tuning: 'Bb', aliases: ['BBb Tuba', 'Bb Tuba'] },
    { name: 'Tuba', tuning: 'Eb', aliases: ['Eb Tuba', 'Es Tuba'] },
    { name: 'Percussion', tuning: null, aliases: ['Slagwerk', 'slagwerk', 'Drums', 'Percussie', 'Drumset', 'Bongo', 'Glockenspiel', 'Mallet Percussion', 'Shaker', 'Vibraphone'] },
    { name: 'Timpani', tuning: null, aliases: ['Pauken', 'pauken'] },
    { name: 'Mallets', tuning: 'C', aliases: ['Klokkenspel', 'Xylofoon', 'Marimba', 'Vibrafoon'] },
    { name: 'String Bass', tuning: 'C', aliases: ['Contrabas', 'contrabas', 'Double Bass'] },
    { name: 'Electric Bass', tuning: null, aliases: ['Basgitaar', 'E-bas'] },
    { name: 'Guitar', tuning: null, aliases: ['Gitaar', 'gitaar'] },
    { name: 'Piano', tuning: 'C', aliases: ['piano', 'Keyboard'] },
    { name: 'Harp', tuning: 'C', aliases: ['harp'] },
    { name: 'Conductor', tuning: null, aliases: ['Score', 'Full score', 'Full Score'] },
    { name: 'Alto Clarinet', tuning: 'Eb', aliases: ['Altklarinet', 'Alt Klarinet'] },
    { name: 'Vocals', tuning: null, aliases: ['Voice'] },
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

        // Create admin user
        const adminId = uuidv4();
        const passwordHash = bcrypt.hashSync('admin123', 10);
        db.prepare(
            'INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(adminId, 'admin@harmonie.nl', passwordHash, 'Admin', 'Beheerder', 'admin', associationId);

        console.log('Created default association, orchestra, and admin user');
        console.log('Admin login: admin@harmonie.nl / admin123');
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
        addAliasIfNotExists('French Horn', 'F', 'Horn');
        addAliasIfNotExists('Percussion', null, 'Drumset');
        addAliasIfNotExists('Percussion', null, 'Bongo');
        addAliasIfNotExists('Percussion', null, 'Glockenspiel');
        addAliasIfNotExists('Percussion', null, 'Mallet Percussion');
        addAliasIfNotExists('Percussion', null, 'Shaker');
        addAliasIfNotExists('Percussion', null, 'Vibraphone');
        addAliasIfNotExists('Bass Clarinet', 'Bb', 'Bas Clarinet');
        addAliasIfNotExists('Euphonium', 'Bb', 'Baritone');

        // New instruments
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
