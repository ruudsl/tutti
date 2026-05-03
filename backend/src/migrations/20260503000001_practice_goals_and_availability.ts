/**
 * Migration: Practice goals, streaks, and member availability
 *
 * Adds:
 * - practice_goals: Daily/weekly practice targets
 * - practice_streaks: Track consecutive practice days
 * - member_availability: Schedule availability for rehearsals
 * - section_leader role support
 */

import db from '../database/connection';
import logger from '../utils/logger';

export const up = () => {
  logger.info('Running migration: practice_goals_and_availability (up)');

  // Practice goals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      goal_type TEXT NOT NULL CHECK (goal_type IN ('daily', 'weekly')),
      target_minutes INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, goal_type)
    )
  `);

  // Practice streaks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_streaks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_practice_date TEXT,
      streak_start_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )
  `);

  // Member availability table
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_availability (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('available', 'unavailable', 'maybe')),
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date)
    )
  `);

  // Add section_leader role check - alter users table role constraint
  // SQLite doesn't support ALTER CONSTRAINT, so we'll handle this in application logic
  // The role column already exists, we just add validation in the app

  // Index for member availability queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_member_availability_user
    ON member_availability(user_id, date)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_member_availability_date
    ON member_availability(date)
  `);

  // Index for practice goals
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_practice_goals_user
    ON practice_goals(user_id, is_active)
  `);

  logger.info('Migration completed: practice_goals_and_availability');
};

export const down = () => {
  logger.info('Running migration: practice_goals_and_availability (down)');

  db.exec(`DROP TABLE IF EXISTS member_availability`);
  db.exec(`DROP TABLE IF EXISTS practice_streaks`);
  db.exec(`DROP TABLE IF EXISTS practice_goals`);

  db.exec(`DROP INDEX IF EXISTS idx_member_availability_user`);
  db.exec(`DROP INDEX IF EXISTS idx_member_availability_date`);
  db.exec(`DROP INDEX IF EXISTS idx_practice_goals_user`);

  logger.info('Rollback completed: practice_goals_and_availability');
};
