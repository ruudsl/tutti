/**
 * Integration tests for concerts routes
 * Tests: CRUD operations for concerts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
    createTestEnvironment,
    generateTestToken,
    TestUser,
    TestAssociation,
} from '../testUtils';
import { v4 as uuidv4 } from 'uuid';

// Helper to create a concert in the test database
function createTestConcert(
    associationId: string,
    createdBy: string,
    overrides: Partial<{
        id: string;
        name: string;
        date: string;
        endDate: string;
        location: string;
        concertType: string;
        description: string;
        notes: string;
    }> = {}
) {
    const concert = {
        id: overrides.id || uuidv4(),
        name: overrides.name || `Test Concert ${Date.now()}`,
        date: overrides.date || '2026-12-15',
        endDate: overrides.endDate || null,
        location: overrides.location || 'Test Venue',
        concertType: overrides.concertType || 'concert',
        description: overrides.description || null,
        notes: overrides.notes || null,
        associationId,
        createdBy,
    };

    testDb.prepare(
        `INSERT INTO concerts (id, association_id, name, date, end_date, location, concert_type, description, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        concert.id,
        concert.associationId,
        concert.name,
        concert.date,
        concert.endDate,
        concert.location,
        concert.concertType,
        concert.description,
        concert.notes,
        concert.createdBy
    );

    return concert;
}

describe('Concerts Routes', () => {
    let association: TestAssociation;
    let adminUser: TestUser;
    let adminToken: string;
    let memberUser: TestUser;
    let memberToken: string;

    beforeEach(() => {
        const env = createTestEnvironment();
        association = env.association;
        adminUser = env.adminUser;
        adminToken = env.adminToken;
        memberUser = env.memberUser;
        memberToken = env.memberToken;
    });

    describe('GET /api/concerts', () => {
        it('should return all concerts for authenticated user', async () => {
            createTestConcert(association.id, adminUser.id, { name: 'Spring Concert' });
            createTestConcert(association.id, adminUser.id, { name: 'Christmas Concert' });

            const response = await request(app)
                .get('/api/concerts')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(2);
        });

        it('should support filtering by date range', async () => {
            createTestConcert(association.id, adminUser.id, { name: 'Past Concert', date: '2025-01-01' });
            createTestConcert(association.id, adminUser.id, { name: 'Future Concert', date: '2027-01-01' });

            const response = await request(app)
                .get('/api/concerts')
                .query({ from: '2026-01-01', to: '2026-12-31' })
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            // Neither concert is in the 2026 range
            expect(response.body.data.length).toBe(0);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/concerts');

            expect(response.status).toBe(401);
        });

        it('should only return concerts from user association', async () => {
            createTestConcert(association.id, adminUser.id, { name: 'Our Concert' });

            // Create a different association
            const otherAssoc = {
                id: uuidv4(),
                name: 'Other Association',
            };
            testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssoc.id, otherAssoc.name);

            // Create a concert for other association
            const otherId = uuidv4();
            testDb.prepare(
                `INSERT INTO concerts (id, name, date, association_id, created_by)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(otherId, 'Other Concert', '2026-12-25', otherAssoc.id, adminUser.id);

            const response = await request(app)
                .get('/api/concerts')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].name).toBe('Our Concert');
        });

        it('should support pagination', async () => {
            // Create multiple concerts
            for (let i = 1; i <= 30; i++) {
                createTestConcert(association.id, adminUser.id, {
                    name: `Concert ${i}`,
                    date: `2026-${String(i).padStart(2, '0')}-01`,
                });
            }

            const response = await request(app)
                .get('/api/concerts')
                .query({ page: 1, limit: 10 })
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(10);
            expect(response.body.pagination).toHaveProperty('total', 30);
            expect(response.body.pagination).toHaveProperty('totalPages', 3);
        });
    });

    describe('GET /api/concerts/types', () => {
        it('should return concert types', async () => {
            const response = await request(app)
                .get('/api/concerts/types')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('concertTypes');
            expect(Array.isArray(response.body.concertTypes)).toBe(true);
        });
    });

    describe('GET /api/concerts/:id', () => {
        it('should return a specific concert', async () => {
            const concert = createTestConcert(association.id, adminUser.id, {
                name: 'Test Concert',
                location: 'Test Venue',
                date: '2026-12-25',
            });

            const response = await request(app)
                .get(`/api/concerts/${concert.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', concert.id);
            expect(response.body).toHaveProperty('name', 'Test Concert');
            expect(response.body).toHaveProperty('location', 'Test Venue');
        });

        it('should return 404 for non-existent concert', async () => {
            const response = await request(app)
                .get(`/api/concerts/${uuidv4()}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(404);
        });

        it('should require authentication', async () => {
            const concert = createTestConcert(association.id, adminUser.id);

            const response = await request(app)
                .get(`/api/concerts/${concert.id}`);

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/concerts', () => {
        it('should create a new concert (admin)', async () => {
            const response = await request(app)
                .post('/api/concerts')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'New Concert',
                    date: '2026-12-31',
                    location: 'Main Hall',
                    concertType: 'new_year',
                    description: 'New Year Concert',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('name', 'New Concert');
            expect(response.body).toHaveProperty('date', '2026-12-31');
        });

        it('should fail for regular member', async () => {
            const response = await request(app)
                .post('/api/concerts')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    name: 'Member Concert',
                    date: '2026-12-31',
                });

            expect(response.status).toBe(403);
        });

        it('should require name', async () => {
            const response = await request(app)
                .post('/api/concerts')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-12-31',
                });

            expect(response.status).toBe(400);
        });

        it('should require date', async () => {
            const response = await request(app)
                .post('/api/concerts')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Concert without date',
                });

            expect(response.status).toBe(400);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .post('/api/concerts')
                .send({
                    name: 'Unauthenticated Concert',
                    date: '2026-12-31',
                });

            expect(response.status).toBe(401);
        });
    });

    describe('PUT /api/concerts/:id', () => {
        it('should update a concert (admin)', async () => {
            const concert = createTestConcert(association.id, adminUser.id, {
                name: 'Original Name',
            });

            const response = await request(app)
                .put(`/api/concerts/${concert.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Updated Name',
                    location: 'Updated Venue',
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('name', 'Updated Name');
            expect(response.body).toHaveProperty('location', 'Updated Venue');
        });

        it('should fail for regular member', async () => {
            const concert = createTestConcert(association.id, adminUser.id);

            const response = await request(app)
                .put(`/api/concerts/${concert.id}`)
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    name: 'Member Updated',
                });

            expect(response.status).toBe(403);
        });

        it('should return 404 for non-existent concert', async () => {
            const response = await request(app)
                .put(`/api/concerts/${uuidv4()}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Non-existent',
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/concerts/:id', () => {
        it('should delete a concert (admin)', async () => {
            const concert = createTestConcert(association.id, adminUser.id);

            const response = await request(app)
                .delete(`/api/concerts/${concert.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Verify deletion
            const deleted = testDb.prepare('SELECT * FROM concerts WHERE id = ?').get(concert.id);
            expect(deleted).toBeUndefined();
        });

        it('should fail for regular member', async () => {
            const concert = createTestConcert(association.id, adminUser.id);

            const response = await request(app)
                .delete(`/api/concerts/${concert.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });

        it('should return 404 for non-existent concert', async () => {
            const response = await request(app)
                .delete(`/api/concerts/${uuidv4()}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('Concert Program Items', () => {
        let concertId: string;

        beforeEach(() => {
            const concert = createTestConcert(association.id, adminUser.id);
            concertId = concert.id;
        });

        describe('POST /api/concerts/:id/program', () => {
            it('should add a program item (admin)', async () => {
                const response = await request(app)
                    .post(`/api/concerts/${concertId}/program`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        title: 'Symphony No. 9',
                        composer: 'Beethoven',
                        sortOrder: 1,
                    });

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('id');
                expect(response.body).toHaveProperty('title', 'Symphony No. 9');
            });

            it('should fail for regular member', async () => {
                const response = await request(app)
                    .post(`/api/concerts/${concertId}/program`)
                    .set('Authorization', `Bearer ${memberToken}`)
                    .send({
                        title: 'Member Item',
                        composer: 'Member Composer',
                    });

                expect(response.status).toBe(403);
            });

            it('should require title', async () => {
                const response = await request(app)
                    .post(`/api/concerts/${concertId}/program`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        composer: 'Only Composer',
                    });

                expect(response.status).toBe(400);
            });
        });

        describe('GET /api/concerts/:id/program', () => {
            it('should return program items for concert', async () => {
                // Add program items
                testDb.prepare(
                    `INSERT INTO concert_program_items (id, concert_id, title, composer, sort_order)
                     VALUES (?, ?, ?, ?, ?)`
                ).run(uuidv4(), concertId, 'Item 1', 'Composer 1', 1);

                testDb.prepare(
                    `INSERT INTO concert_program_items (id, concert_id, title, composer, sort_order)
                     VALUES (?, ?, ?, ?, ?)`
                ).run(uuidv4(), concertId, 'Item 2', 'Composer 2', 2);

                const response = await request(app)
                    .get(`/api/concerts/${concertId}/program`)
                    .set('Authorization', `Bearer ${memberToken}`);

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBe(2);
            });
        });
    });
});
