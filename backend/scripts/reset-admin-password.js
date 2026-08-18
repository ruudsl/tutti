#!/usr/bin/env node
/**
 * Reset admin password script
 * Usage: node reset-admin-password.js [new-password]
 * Default password: admin123
 */

const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/harmonie.db');

async function main() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.error('Database not found at:', DB_PATH);
    process.exit(1);
  }

  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  const newPassword = process.argv[2] || 'admin123';
  const passwordHash = bcrypt.hashSync(newPassword, 10);

  db.run('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, 'admin@harmonie.nl']);

  // Check if update was successful
  const stmt = db.prepare('SELECT id, email FROM users WHERE email = ?');
  stmt.bind(['admin@harmonie.nl']);

  if (stmt.step()) {
    console.log('Wachtwoord succesvol gereset voor admin@harmonie.nl');
    console.log('Nieuw wachtwoord:', newPassword);
  } else {
    console.error('Admin gebruiker niet gevonden!');
  }
  stmt.free();

  // Save database
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  db.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
