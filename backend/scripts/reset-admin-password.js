#!/usr/bin/env node
/**
 * Zet het wachtwoord van een beheerder opnieuw, rechtstreeks in het
 * databasebestand. Voor als niemand meer kan inloggen en "Wachtwoord vergeten"
 * niet werkt omdat er nog geen e-mail is ingesteld.
 *
 * Gebruik (met de server gestopt - anders schrijft die het bestand straks
 * weer terug zoals het in zijn geheugen staat):
 *
 *   DB_PATH=/pad/naar/tutti.db node backend/scripts/reset-admin-password.js [wachtwoord] [e-mailadres]
 *
 * Zonder wachtwoord maakt het script er een en toont het één keer. Er is geen
 * vast standaardwachtwoord: dat was `admin123`, en een script dat zonder
 * argument een bekend wachtwoord zet, zet het ook als iemand het argument
 * vergeet. E-mailadres zonder opgave: admin@harmonie.nl, het account dat een
 * verse installatie aanmaakt (src/database/init.ts).
 *
 * Bij het volgende inloggen moet de gebruiker het wachtwoord zelf wijzigen.
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/harmonie.db');
// Dezelfde grens als MIN_WACHTWOORDLENGTE in src/validation/schemas.ts.
const MIN_WACHTWOORDLENGTE = 8;
const STANDAARD_EMAIL = 'admin@harmonie.nl';

async function main() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const opgegeven = process.argv[2];
  const email = process.argv[3] || STANDAARD_EMAIL;
  if (opgegeven !== undefined && opgegeven.length < MIN_WACHTWOORDLENGTE) {
    console.error(`Het wachtwoord moet minimaal ${MIN_WACHTWOORDLENGTE} tekens hebben.`);
    process.exit(1);
  }
  const wachtwoord = opgegeven ?? crypto.randomBytes(18).toString('base64url');

  // Meteen lezen in plaats van eerst kijken of het bestand bestaat: tussen
  // die twee stappen kan het bestand veranderen.
  let inhoud;
  try {
    inhoud = fs.readFileSync(DB_PATH);
  } catch (fout) {
    console.error('Database niet te lezen op:', DB_PATH, `(${fout.code || fout.message})`);
    process.exit(1);
  }
  const db = new SQL.Database(inhoud);
  const zoek = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)');
  zoek.bind([email]);
  const gevonden = zoek.step();
  zoek.free();
  if (!gevonden) {
    console.error(`Geen gebruiker met e-mailadres ${email}.`);
    db.close();
    process.exit(1);
  }

  const kolommen = db.exec('PRAGMA table_info(users)')[0].values.map((rij) => rij[1]);
  const moetWijzigen = kolommen.includes('moet_wachtwoord_wijzigen') ? ', moet_wachtwoord_wijzigen = 1' : '';
  db.run(`UPDATE users SET password_hash = ?${moetWijzigen} WHERE LOWER(email) = LOWER(?)`, [
    bcrypt.hashSync(wachtwoord, 10),
    email,
  ]);

  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();

  console.log(`Wachtwoord opnieuw gezet voor ${email}.`);
  if (opgegeven === undefined) {
    console.log(`Nieuw wachtwoord: ${wachtwoord}`);
  }
}

main().catch((fout) => {
  console.error('Fout:', fout);
  process.exit(1);
});
