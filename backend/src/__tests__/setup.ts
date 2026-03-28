/**
 * Test setup file
 * Initializes in-memory SQLite database for testing
 */

import { vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Mock the database module BEFORE importing app
vi.mock('../database/connection', () => {
    return import('./testDb');
});

// Mock email utility to prevent sending actual emails during tests
vi.mock('../utils/email', () => ({
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
process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
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
