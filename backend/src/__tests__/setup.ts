/**
 * Test setup file
 * Initializes in-memory SQLite database for testing
 */

import { vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Create a synchronous reference to testDb that will be used in mocks
let testDbInstance: any = null;

// Mock the database module BEFORE importing app
vi.mock('../database/connection', async () => {
  const module = await import('./testDb');
  testDbInstance = module.default;
  return module;
});

// The database utilities themselves are not mocked: they import
// '../database/connection', which is already redirected to the test database
// above. Only the file-based logger is replaced so the helpers don't write to
// disk during tests.
vi.mock('../logging/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock email utility to prevent sending actual emails during tests
vi.mock('../utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

// Mock logger to reduce test noise
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock audit logging
vi.mock('../routes/audit-logs', () => ({
  logAuditEvent: vi.fn(),
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-must-be-at-least-32-characters';
process.env.CSRF_ENABLED = 'false';

import testDb from './testDb';
import { herstelAlleStroomonderbrekers } from '../utils/veerkracht';

beforeAll(async () => {
  await testDb.init();
});

beforeEach(async () => {
  // Reset database to clean state before each test
  await testDb.reset();

  // De stroomonderbrekers zijn gedeeld over de hele applicatie en dus ook over
  // alle tests in een bestand. Een test die een dienst vijf keer laat mislukken
  // zou de onderbreker openzetten en elke volgende test in datzelfde bestand
  // laten falen op iets wat die test niet doet. Elke test begint dicht.
  herstelAlleStroomonderbrekers();
});

afterAll(() => {
  // Cleanup if needed
});

export { testDb };
