/**
 * Test utilities for integration tests
 * Provides helper functions for authentication, seed data, etc.
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import testDb from './testDb';

// Test JWT secret (matches setup.ts)
const JWT_SECRET = 'test-jwt-secret-for-testing';

export interface TestUser {
    id: string;
    email: string;
    password: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'music_committee' | 'equipment_committee' | 'uniforms_committee' | 'conductor' | 'member';
    associationId: string;
    mfaEnabled?: boolean;
    mfaSecret?: string | null;
}

export interface TestAssociation {
    id: string;
    name: string;
}

export interface TestOrchestra {
    id: string;
    name: string;
    associationId: string;
}

export interface TestInstrument {
    id: string;
    name: string;
    tuning?: string;
    clef?: string;
}

export interface TestRehearsal {
    id: string;
    associationId: string;
    orchestraId?: string;
    date: string;
    startTime: string;
    endTime: string;
    location?: string;
    type: 'regular' | 'extra' | 'cancelled';
    notes?: string;
    createdBy: string;
}

/**
 * Generate a JWT token for a test user
 */
export function generateTestToken(user: TestUser): string {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            associationId: user.associationId,
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

/**
 * Generate an expired JWT token for testing auth failures
 */
export function generateExpiredToken(user: TestUser): string {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            associationId: user.associationId,
        },
        JWT_SECRET,
        { expiresIn: '-1h' }  // Already expired
    );
}

/**
 * Generate an invalid JWT token
 */
export function generateInvalidToken(): string {
    return 'invalid.jwt.token';
}

/**
 * Create a test association and insert into database
 */
export function createTestAssociation(overrides: Partial<TestAssociation> = {}): TestAssociation {
    const association: TestAssociation = {
        id: overrides.id || uuidv4(),
        name: overrides.name || `Test Association ${Date.now()}`,
    };

    testDb.prepare(
        'INSERT INTO associations (id, name) VALUES (?, ?)'
    ).run(association.id, association.name);

    return association;
}

/**
 * Create a test user and insert into database
 */
export function createTestUser(
    associationId: string,
    overrides: Partial<Omit<TestUser, 'passwordHash'>> = {}
): TestUser {
    const password = overrides.password || 'testpassword123';
    const passwordHash = bcrypt.hashSync(password, 10);

    const user: TestUser = {
        id: overrides.id || uuidv4(),
        email: overrides.email || `test-${Date.now()}@example.com`,
        password,
        passwordHash,
        firstName: overrides.firstName || 'Test',
        lastName: overrides.lastName || 'User',
        role: overrides.role || 'member',
        associationId,
        mfaEnabled: overrides.mfaEnabled || false,
        mfaSecret: overrides.mfaSecret || null,
    };

    testDb.prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, association_id, mfa_enabled, mfa_secret)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        user.id,
        user.email,
        user.passwordHash,
        user.firstName,
        user.lastName,
        user.role,
        user.associationId,
        user.mfaEnabled ? 1 : 0,
        user.mfaSecret
    );

    return user;
}

/**
 * Create a test orchestra and insert into database
 */
export function createTestOrchestra(
    associationId: string,
    overrides: Partial<TestOrchestra> = {}
): TestOrchestra {
    const orchestra: TestOrchestra = {
        id: overrides.id || uuidv4(),
        name: overrides.name || `Test Orchestra ${Date.now()}`,
        associationId,
    };

    testDb.prepare(
        'INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)'
    ).run(orchestra.id, orchestra.name, orchestra.associationId);

    return orchestra;
}

/**
 * Create a test instrument and insert into database
 */
export function createTestInstrument(overrides: Partial<TestInstrument> = {}): TestInstrument {
    const instrument: TestInstrument = {
        id: overrides.id || uuidv4(),
        name: overrides.name || `Test Instrument ${Date.now()}`,
        tuning: overrides.tuning ?? undefined,
        clef: overrides.clef || 'sol',
    };

    testDb.prepare(
        'INSERT INTO instruments (id, name, tuning, clef) VALUES (?, ?, ?, ?)'
    ).run(instrument.id, instrument.name, instrument.tuning || null, instrument.clef);

    return instrument;
}

/**
 * Create a test rehearsal and insert into database
 */
export function createTestRehearsal(
    associationId: string,
    createdBy: string,
    overrides: Partial<TestRehearsal> = {}
): TestRehearsal {
    const rehearsal: TestRehearsal = {
        id: overrides.id || uuidv4(),
        associationId,
        orchestraId: overrides.orchestraId ?? undefined,
        date: overrides.date || '2026-04-15',
        startTime: overrides.startTime || '19:30',
        endTime: overrides.endTime || '21:30',
        location: overrides.location || 'Test Location',
        type: overrides.type || 'regular',
        notes: overrides.notes ?? undefined,
        createdBy,
    };

    testDb.prepare(
        `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        rehearsal.id,
        rehearsal.associationId,
        rehearsal.orchestraId || null,
        rehearsal.date,
        rehearsal.startTime,
        rehearsal.endTime,
        rehearsal.location || null,
        rehearsal.type,
        rehearsal.notes || null,
        rehearsal.createdBy
    );

    return rehearsal;
}

/**
 * Add user to orchestra
 */
export function addUserToOrchestra(userId: string, orchestraId: string): void {
    testDb.prepare(
        'INSERT INTO user_orchestras (user_id, orchestra_id) VALUES (?, ?)'
    ).run(userId, orchestraId);
}

/**
 * Add instrument to user
 */
export function addInstrumentToUser(userId: string, instrumentId: string): void {
    testDb.prepare(
        'INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)'
    ).run(userId, instrumentId);
}

/**
 * Create default test day
 */
export function createTestDefaultDay(
    associationId: string,
    overrides: {
        id?: string;
        orchestraId?: string;
        dayOfWeek?: number;
        startTime?: string;
        endTime?: string;
        location?: string;
    } = {}
): { id: string } {
    const id = overrides.id || uuidv4();

    testDb.prepare(
        `INSERT INTO rehearsal_default_days (id, association_id, orchestra_id, day_of_week, start_time, end_time, location)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        associationId,
        overrides.orchestraId || null,
        overrides.dayOfWeek ?? 1,  // Monday
        overrides.startTime || '19:30',
        overrides.endTime || '21:30',
        overrides.location || 'Default Location'
    );

    return { id };
}

/**
 * Create standard test environment with association, admin user, and member user
 */
export function createTestEnvironment(): {
    association: TestAssociation;
    adminUser: TestUser;
    adminToken: string;
    memberUser: TestUser;
    memberToken: string;
    musicCommitteeUser: TestUser;
    musicCommitteeToken: string;
} {
    const association = createTestAssociation();

    const adminUser = createTestUser(association.id, {
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
    });

    const memberUser = createTestUser(association.id, {
        email: 'member@test.com',
        firstName: 'Member',
        lastName: 'User',
        role: 'member',
    });

    const musicCommitteeUser = createTestUser(association.id, {
        email: 'music@test.com',
        firstName: 'Music',
        lastName: 'Committee',
        role: 'music_committee',
    });

    return {
        association,
        adminUser,
        adminToken: generateTestToken(adminUser),
        memberUser,
        memberToken: generateTestToken(memberUser),
        musicCommitteeUser,
        musicCommitteeToken: generateTestToken(musicCommitteeUser),
    };
}
