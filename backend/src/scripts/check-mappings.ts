import db from '../database/connection';

async function check() {
    await db.init();

    // Check associations
    const associations = db.prepare('SELECT id, name FROM associations').all();
    console.log('Associations:', associations);

    // Check instrument count
    const instrCount = db.prepare('SELECT COUNT(*) as count FROM instruments').get();
    console.log('Instruments count:', instrCount);

    // Check job title mappings count
    const mappings = db.prepare('SELECT COUNT(*) as count FROM instrument_job_title_mappings').get();
    console.log('Job title mappings count:', mappings);

    // Check if table exists
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='instrument_job_title_mappings'").get();
    console.log('Table exists:', !!tables);

    // Sample some instruments
    const sampleInstruments = db.prepare('SELECT id, name, tuning FROM instruments LIMIT 5').all();
    console.log('Sample instruments:', sampleInstruments);

    process.exit(0);
}

check();
