import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

// Default mappings: instrument name, tuning, job title
const defaultJobTitleMappings = [
    { instrumentName: 'Clarinet', tuning: 'Bb', jobTitle: 'Klarinettist' },
    { instrumentName: 'Bass Clarinet', tuning: 'Bb', jobTitle: 'Bas Klarinettist' },
    { instrumentName: 'Eb Clarinet', tuning: 'Eb', jobTitle: 'Klarinettist' },
    { instrumentName: 'Alto Clarinet', tuning: 'Eb', jobTitle: 'Klarinettist' },
    { instrumentName: 'Euphonium', tuning: 'Bb', jobTitle: 'Baritonist' },
    { instrumentName: 'Flute', tuning: 'C', jobTitle: 'Dwarsfluitist' },
    { instrumentName: 'Piccolo', tuning: 'C', jobTitle: 'Dwarsfluitist' },
    { instrumentName: 'Oboe', tuning: 'C', jobTitle: 'Hoboïst' },
    { instrumentName: 'Tenor Saxophone', tuning: 'Bb', jobTitle: 'Tenor Saxofonist' },
    { instrumentName: 'French Horn', tuning: 'F', jobTitle: 'Hoornist' },
    { instrumentName: 'Percussion', tuning: null, jobTitle: 'Slagwerker' },
    { instrumentName: 'Timpani', tuning: null, jobTitle: 'Slagwerker' },
    { instrumentName: 'Mallets', tuning: 'C', jobTitle: 'Slagwerker' },
    { instrumentName: 'Trombone', tuning: 'C', jobTitle: 'Trombonist' },
    { instrumentName: 'Bass Trombone', tuning: 'C', jobTitle: 'Trombonist' },
    { instrumentName: 'Alto Saxophone', tuning: 'Eb', jobTitle: 'Alt Saxofonist' },
    { instrumentName: 'Baritone Saxophone', tuning: 'Eb', jobTitle: 'Bariton Saxofonist' },
    { instrumentName: 'Soprano Saxophone', tuning: 'Bb', jobTitle: 'Saxofonist' },
    { instrumentName: 'Trumpet', tuning: 'Bb', jobTitle: 'Trompetist' },
    { instrumentName: 'Cornet', tuning: 'Bb', jobTitle: 'Trompetist' },
    { instrumentName: 'Flugelhorn', tuning: 'Bb', jobTitle: 'Trompetist' },
    { instrumentName: 'Conductor', tuning: null, jobTitle: 'Dirigent' },
    { instrumentName: 'String Bass', tuning: 'C', jobTitle: 'Bassist' },
    { instrumentName: 'Electric Bass', tuning: null, jobTitle: 'Bassist' },
    { instrumentName: 'Bass Guitar', tuning: null, jobTitle: 'Bassist' },
    { instrumentName: 'Bassoon', tuning: 'C', jobTitle: 'Fagottist' },
    { instrumentName: 'Tuba', tuning: 'C', jobTitle: 'Bassist' },
    { instrumentName: 'Tuba', tuning: 'Bb', jobTitle: 'Bassist' },
    { instrumentName: 'Tuba', tuning: 'Eb', jobTitle: 'Bassist' },
];

async function seedMappings() {
    await db.init();

    // Get all associations
    const associations = db.prepare('SELECT id, name FROM associations').all() as { id: string; name: string }[];
    console.log(`Found ${associations.length} association(s)`);

    for (const association of associations) {
        console.log(`\nProcessing association: ${association.name} (${association.id})`);

        let added = 0;
        let skipped = 0;
        let notFound = 0;

        for (const mapping of defaultJobTitleMappings) {
            // Find the instrument
            const instrument = db.prepare(
                mapping.tuning !== null
                    ? 'SELECT id FROM instruments WHERE name = ? AND tuning = ?'
                    : 'SELECT id FROM instruments WHERE name = ? AND tuning IS NULL'
            ).get(...(mapping.tuning !== null ? [mapping.instrumentName, mapping.tuning] : [mapping.instrumentName])) as { id: string } | undefined;

            if (!instrument) {
                console.log(`  ⚠ Instrument not found: ${mapping.instrumentName} (${mapping.tuning || 'no tuning'})`);
                notFound++;
                continue;
            }

            // Check if mapping already exists
            const existingMapping = db.prepare(
                'SELECT id FROM instrument_job_title_mappings WHERE association_id = ? AND instrument_id = ?'
            ).get(association.id, instrument.id);

            if (existingMapping) {
                skipped++;
                continue;
            }

            // Insert the mapping
            db.prepare(
                'INSERT INTO instrument_job_title_mappings (id, association_id, instrument_id, job_title) VALUES (?, ?, ?, ?)'
            ).run(uuidv4(), association.id, instrument.id, mapping.jobTitle);
            console.log(`  ✓ Added: ${mapping.instrumentName} → ${mapping.jobTitle}`);
            added++;
        }

        console.log(`\nSummary for ${association.name}:`);
        console.log(`  Added: ${added}`);
        console.log(`  Skipped (already exists): ${skipped}`);
        console.log(`  Instruments not found: ${notFound}`);
    }

    // Final count
    const totalMappings = db.prepare('SELECT COUNT(*) as count FROM instrument_job_title_mappings').get() as { count: number };
    console.log(`\nTotal mappings in database: ${totalMappings.count}`);

    process.exit(0);
}

seedMappings().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
