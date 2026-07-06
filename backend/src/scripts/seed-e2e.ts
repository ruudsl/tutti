/**
 * E2E seed script
 *
 * Creates a deterministic test environment for Playwright E2E tests:
 * - one association ("E2E Vereniging")
 * - an admin user (e2e-admin@test.local) and a member user (e2e-member@test.local)
 * - one orchestra ("E2E Orkest") with both users as members
 * - a few music titles
 *
 * The script is idempotent (upserts): running it multiple times against the
 * same database always converges to the same state, and it re-activates the
 * users (clears soft-delete and lockout state) so a previous test run can
 * never leave the accounts unusable.
 *
 * Usage:
 *   DB_PATH=/tmp/e2e/harmonie-e2e.db npm run seed:e2e
 *
 * Environment:
 *   DB_PATH             - database file to seed (strongly recommended: a
 *                         dedicated E2E database, NOT the dev database)
 *   E2E_ADMIN_PASSWORD  - admin password (default: E2eTest!2026)
 *   E2E_MEMBER_PASSWORD - member password (default: same as admin password)
 */

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';

export const E2E_ASSOCIATION_NAME = 'E2E Vereniging';
export const E2E_ORCHESTRA_NAME = 'E2E Orkest';
export const E2E_ADMIN_EMAIL = 'e2e-admin@test.local';
export const E2E_MEMBER_EMAIL = 'e2e-member@test.local';
export const DEFAULT_E2E_PASSWORD = 'E2eTest!2026';

interface SeedUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'member';
  associationId: string;
}

/**
 * Insert-or-update an association by name. Returns its id.
 */
function upsertAssociation(name: string): string {
  const existing = db.prepare('SELECT id FROM associations WHERE name = ?').get(name) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }

  const id = uuidv4();
  db.prepare('INSERT INTO associations (id, name, display_name) VALUES (?, ?, ?)').run(id, name, name);
  console.log(`Created association "${name}"`);
  return id;
}

/**
 * Insert-or-update an orchestra by (name, association). Returns its id.
 */
function upsertOrchestra(name: string, associationId: string): string {
  const existing = db
    .prepare('SELECT id FROM orchestras WHERE name = ? AND association_id = ?')
    .get(name, associationId) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }

  const id = uuidv4();
  db.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(id, name, associationId);
  console.log(`Created orchestra "${name}"`);
  return id;
}

/**
 * Insert-or-update a user by email. Follows the current users schema:
 * status/soft-delete columns (status, deleted_at, email_before_delete),
 * lockout columns (failed_login_attempts, locked_until) and
 * password_changed_at are reset so the account is always usable.
 * Returns the user id.
 */
function upsertUser(input: SeedUserInput): string {
  const passwordHash = bcrypt.hashSync(input.password, 10);
  const now = new Date().toISOString();

  // A previous run may have soft-deleted the user (email is then moved to
  // email_before_delete), so match on either column.
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? OR email_before_delete = ?')
    .get(input.email, input.email) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE users
             SET email = ?,
                 password_hash = ?,
                 first_name = ?,
                 last_name = ?,
                 role = ?,
                 association_id = ?,
                 status = 'active',
                 mfa_enabled = 0,
                 mfa_secret = NULL,
                 password_changed_at = ?,
                 failed_login_attempts = 0,
                 locked_until = NULL,
                 deleted_at = NULL,
                 email_before_delete = NULL
             WHERE id = ?`,
    ).run(
      input.email,
      passwordHash,
      input.firstName,
      input.lastName,
      input.role,
      input.associationId,
      now,
      existing.id,
    );
    console.log(`Updated user ${input.email} (${input.role})`);
    return existing.id;
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO users (
            id, email, password_hash, first_name, last_name, role, status,
            association_id, password_changed_at, failed_login_attempts
         ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 0)`,
  ).run(id, input.email, passwordHash, input.firstName, input.lastName, input.role, input.associationId, now);
  console.log(`Created user ${input.email} (${input.role})`);
  return id;
}

/**
 * Link a user to an orchestra (idempotent).
 */
function ensureUserInOrchestra(userId: string, orchestraId: string): void {
  const existing = db
    .prepare('SELECT 1 as x FROM user_orchestras WHERE user_id = ? AND orchestra_id = ?')
    .get(userId, orchestraId);
  if (!existing) {
    db.prepare('INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)').run(userId, orchestraId);
  }
}

/**
 * Record privacy consent for a user (idempotent), so the privacy consent
 * gate does not block E2E flows on first login.
 */
function ensurePrivacyConsent(userId: string, version = '1.0'): void {
  const existing = db
    .prepare('SELECT id FROM privacy_consents WHERE user_id = ? AND consent_version = ?')
    .get(userId, version);
  if (!existing) {
    db.prepare(
      'INSERT INTO privacy_consents (id, user_id, consent_version, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
    ).run(uuidv4(), userId, version, '127.0.0.1', 'seed-e2e');
  }
}

/**
 * Insert-or-update a music title by (title, arranger, association).
 */
function upsertMusicTitle(
  associationId: string,
  title: string,
  composer: string,
  arranger: string,
  durationSeconds: number,
): string {
  const existing = db
    .prepare('SELECT id FROM music_titles WHERE title = ? AND arranger = ? AND association_id = ?')
    .get(title, arranger, associationId) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE music_titles SET composer = ?, duration_seconds = ?, deleted_at = NULL WHERE id = ?').run(
      composer,
      durationSeconds,
      existing.id,
    );
    return existing.id;
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO music_titles (id, title, composer, arranger, duration_seconds, association_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, title, composer, arranger, durationSeconds, associationId);
  console.log(`Created music title "${title}"`);
  return id;
}

export async function seedE2E(): Promise<void> {
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || DEFAULT_E2E_PASSWORD;
  const memberPassword = process.env.E2E_MEMBER_PASSWORD || adminPassword;

  await db.init();

  console.log(`Seeding E2E data into: ${process.env.DB_PATH || './data/harmonie.db (default)'}`);

  const associationId = upsertAssociation(E2E_ASSOCIATION_NAME);
  const orchestraId = upsertOrchestra(E2E_ORCHESTRA_NAME, associationId);

  const adminId = upsertUser({
    email: E2E_ADMIN_EMAIL,
    password: adminPassword,
    firstName: 'E2E',
    lastName: 'Admin',
    role: 'admin',
    associationId,
  });

  const memberId = upsertUser({
    email: E2E_MEMBER_EMAIL,
    password: memberPassword,
    firstName: 'E2E',
    lastName: 'Member',
    role: 'member',
    associationId,
  });

  ensureUserInOrchestra(adminId, orchestraId);
  ensureUserInOrchestra(memberId, orchestraId);

  ensurePrivacyConsent(adminId);
  ensurePrivacyConsent(memberId);

  upsertMusicTitle(associationId, 'E2E Ouverture', 'Ludwig van Testhoven', 'A. Ranger', 245);
  upsertMusicTitle(associationId, 'E2E Mars', 'Johann Smoke', 'B. Ranger', 180);
  upsertMusicTitle(associationId, 'E2E Finale', 'Clara Testmann', 'C. Ranger', 320);

  // Persist any pending (debounced) writes to disk before the process exits.
  db.flush();

  console.log('E2E seed complete.');
  console.log(`  Admin:  ${E2E_ADMIN_EMAIL}`);
  console.log(`  Member: ${E2E_MEMBER_EMAIL}`);
}

// Run when executed directly (npm run seed:e2e)
if (require.main === module) {
  seedE2E()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('E2E seed failed:', error);
      process.exit(1);
    });
}
