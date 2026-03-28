import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Re-mock logger to capture errors
vi.mock('../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: (...args: any[]) => console.error('ERROR LOG:', JSON.stringify(args, null, 2)),
        debug: vi.fn(),
    },
}));

import './setup';
import app from './testApp';
import testDb from './testDb';
import {
    createTestEnvironment,
    TestUser,
    TestAssociation,
} from './testUtils';

describe('Debug PUT /api/users/:id', () => {
    let association: TestAssociation;
    let adminUser: TestUser;
    let adminToken: string;
    let memberUser: TestUser;

    beforeEach(() => {
        const env = createTestEnvironment();
        association = env.association;
        adminUser = env.adminUser;
        adminToken = env.adminToken;
        memberUser = env.memberUser;
    });

    it('should verify test user exists before update', async () => {
        // Verify the user exists in the database
        const user = testDb.prepare('SELECT * FROM users WHERE id = ?').get(memberUser.id);
        console.log('User before update:', JSON.stringify(user, null, 2));
        expect(user).toBeDefined();
    });

    it('should update user as admin with debug', async () => {
        const updates = {
            firstName: 'Updated',
            lastName: 'Name',
        };

        try {
            const response = await request(app)
                .put(`/api/users/${memberUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updates);

            console.log('Response status:', response.status);
            console.log('Response body:', JSON.stringify(response.body, null, 2));

            expect(response.status).toBe(200);
        } catch (error) {
            console.error('Test error:', error);
            throw error;
        }
    });
});
