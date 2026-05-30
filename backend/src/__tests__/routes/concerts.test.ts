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
    let musicCommitteeUser: TestUser;
    let musicCommitteeToken: string;

    beforeEach(() => {
        const env = createTestEnvironment();
        association = env.association;
        adminUser = env.adminUser;
        adminToken = env.adminToken;
        memberUser = env.memberUser;
        memberToken = env.memberToken;
        musicCommitteeUser = env.musicCommitteeUser;
        musicCommitteeToken = env.musicCommitteeToken;
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
                `INSERT INTO concerts (id, association_id, name, date)
                 VALUES (?, ?, ?, ?)`
            ).run(otherId, otherAssoc.id, 'Other Concert', '2026-12-25');

            const response = await request(app)
                .get('/api/concerts')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].name).toBe('Our Concert');
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

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/concerts/types');

            expect(response.status).toBe(401);
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
        });

        it('should create a new concert (music committee)', async () => {
            const response = await request(app)
                .post('/api/concerts')
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    name: 'Committee Concert',
                    date: '2026-11-15',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('name', 'Committee Concert');
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

        it('should fail for music committee (admin only)', async () => {
            const concert = createTestConcert(association.id, adminUser.id);

            const response = await request(app)
                .delete(`/api/concerts/${concert.id}`)
                .set('Authorization', `Bearer ${musicCommitteeToken}`);

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
    });
});
