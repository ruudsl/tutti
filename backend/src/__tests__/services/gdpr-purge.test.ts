/**
 * Tests for the soft-delete purge step of the GDPR cleanup scheduler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestEnvironment, TestAssociation } from '../testUtils';
import { purgeSoftDeleted } from '../../scheduler/gdpr-cleanup';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe('GDPR cleanup: purgeSoftDeleted', () => {
  let association: TestAssociation;

  beforeEach(() => {
    const env = createTestEnvironment();
    association = env.association;
    delete process.env.SOFT_DELETE_RETENTION_DAYS;
  });

  it('should hard-delete soft-deleted rows older than the retention window', () => {
    // User soft-deleted 40 days ago (past default 30-day retention)
    const oldUserId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, association_id, deleted_at)
             VALUES (?, ?, 'hash', 'Old', 'Deleted', ?, ?)`,
      )
      .run(oldUserId, `deleted-1-old@test.com`, association.id, isoDaysAgo(40));

    // User soft-deleted 5 days ago (within retention)
    const recentUserId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, association_id, deleted_at)
             VALUES (?, ?, 'hash', 'Recent', 'Deleted', ?, ?)`,
      )
      .run(recentUserId, `deleted-2-recent@test.com`, association.id, isoDaysAgo(5));

    // Music piece soft-deleted 40 days ago
    const oldPieceId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO music_pieces (id, title, file_path, original_filename, association_id, deleted_at)
             VALUES (?, 'Old Piece', 'nonexistent.pdf', 'old.pdf', ?, ?)`,
      )
      .run(oldPieceId, association.id, isoDaysAgo(40));

    // Active (non-deleted) music piece
    const activePieceId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO music_pieces (id, title, file_path, original_filename, association_id)
             VALUES (?, 'Active Piece', 'active.pdf', 'active.pdf', ?)`,
      )
      .run(activePieceId, association.id);

    // Concert soft-deleted 40 days ago
    const oldConcertId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO concerts (id, association_id, name, date, deleted_at)
             VALUES (?, ?, 'Old Concert', '2026-01-01', ?)`,
      )
      .run(oldConcertId, association.id, isoDaysAgo(40));

    const results = purgeSoftDeleted();

    // Purged: old user, old piece, old concert
    expect(testDb.prepare('SELECT id FROM users WHERE id = ?').get(oldUserId)).toBeUndefined();
    expect(testDb.prepare('SELECT id FROM music_pieces WHERE id = ?').get(oldPieceId)).toBeUndefined();
    expect(testDb.prepare('SELECT id FROM concerts WHERE id = ?').get(oldConcertId)).toBeUndefined();

    // Kept: recently deleted user and active piece
    expect(testDb.prepare('SELECT id FROM users WHERE id = ?').get(recentUserId)).toBeDefined();
    expect(testDb.prepare('SELECT id FROM music_pieces WHERE id = ?').get(activePieceId)).toBeDefined();

    const byType = Object.fromEntries(results.map((r) => [r.data_type, r.deleted_count]));
    expect(byType.purged_users).toBe(1);
    expect(byType.purged_music_pieces).toBe(1);
    expect(byType.purged_concerts).toBe(1);
  });

  it('should respect SOFT_DELETE_RETENTION_DAYS from the environment', () => {
    process.env.SOFT_DELETE_RETENTION_DAYS = '3';

    const userId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, association_id, deleted_at)
             VALUES (?, ?, 'hash', 'Soft', 'Deleted', ?, ?)`,
      )
      .run(userId, `deleted-3-env@test.com`, association.id, isoDaysAgo(5));

    purgeSoftDeleted();

    // 5 days > 3-day retention: user is purged
    expect(testDb.prepare('SELECT id FROM users WHERE id = ?').get(userId)).toBeUndefined();

    delete process.env.SOFT_DELETE_RETENTION_DAYS;
  });
});
