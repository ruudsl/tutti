import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { schema } from './schema';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/harmonie.db');

// Zorg ervoor dat de data directory bestaat
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db: DatabaseType = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(schema);

export default db;
