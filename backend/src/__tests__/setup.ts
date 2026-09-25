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
import { wisAlleInlogvertragingen } from '../utils/inlogvertraging';
import { stelOpzoekerInVoorTests } from '../utils/uitgaandAdres';

// Tests gaan niet het netwerk op, ook niet voor DNS. Adressen die een gebruiker
// opgeeft (webhooks) worden vóór het aanroepen opgezocht om interne adressen te
// weigeren; hier wijst elke naam naar een openbaar documentatieadres. Wie het
// weigeren zelf test, geeft een eigen opzoeker mee.
stelOpzoekerInVoorTests(async () => [{ address: '203.0.113.10' }]);

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

  // Hetzelfde voor de wachttijd na mislukte inlogpogingen: die staat in het
  // geheugen, per adres en IP-adres, en alle tests komen van hetzelfde IP.
  wisAlleInlogvertragingen();
});

afterAll(() => {
  // Cleanup if needed
});

export { testDb };
