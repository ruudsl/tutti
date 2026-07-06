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

// Mock the database utilities to use the test database
vi.mock('../utils/database', async () => {
  // Get the test database module
  const testDbModule = await import('./testDb');
  const db = testDbModule.default;

  const withTransaction = <T>(fn: () => T): T => {
    const transaction = db.transaction(fn);
    return transaction();
  };

  const getPaginationParams = (query: any) => {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 25));
    const offset = (page - 1) * limit;
    return { offset, limit, page };
  };

  const createPaginatedResult = <T>(data: T[], total: number, page: number, limit: number) => {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  };

  return {
    withTransaction,
    getPaginationParams,
    createPaginatedResult,
  };
});

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

beforeAll(async () => {
  await testDb.init();
});

beforeEach(async () => {
  // Reset database to clean state before each test
  await testDb.reset();
});

afterAll(() => {
  // Cleanup if needed
});

export { testDb };
