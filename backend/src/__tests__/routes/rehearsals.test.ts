/**
 * Integration tests for rehearsals routes
 * Tests: CRUD operations, default days, attendance, authorization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
    createTestEnvironment,
    createTestOrchestra,
    createTestRehearsal,
    createTestDefaultDay,
    createTestUser,
    addUserToOrchestra,
    generateTestToken,
    TestUser,
    TestAssociation,
    TestOrchestra,
    TestRehearsal,
} from '../testUtils';

describe('Rehearsals Routes', () => {
    let association: TestAssociation;
    let adminUser: TestUser;
    let adminToken: string;
    let memberUser: TestUser;
    let memberToken: string;
    let musicCommitteeUser: TestUser;
    let musicCommitteeToken: string;
    let conductorUser: TestUser;
    let conductorToken: string;

    beforeEach(() => {
        const env = createTestEnvironment();
        association = env.association;
        adminUser = env.adminUser;
        adminToken = env.adminToken;
        memberUser = env.memberUser;
        memberToken = env.memberToken;
        musicCommitteeUser = env.musicCommitteeUser;
        musicCommitteeToken = env.musicCommitteeToken;

        // Create conductor user for testing
        conductorUser = createTestUser(association.id, {
            email: 'conductor@test.com',
            firstName: 'Conductor',
            lastName: 'User',
            role: 'conductor',
        });
        conductorToken = generateTestToken(conductorUser);
    });

    // ==================
    // DEFAULT DAYS
    // ==================

    describe('GET /api/rehearsals/default-days', () => {
        it('should return list of default rehearsal days', async () => {
            createTestDefaultDay(association.id, {
                dayOfWeek: 1,
                startTime: '19:30',
                endTime: '21:30',
            });

            const response = await request(app)
                .get('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(1);
            expect(response.body[0]).toHaveProperty('day_of_week', 1);
            expect(response.body[0]).toHaveProperty('start_time', '19:30');
            expect(response.body[0]).toHaveProperty('end_time', '21:30');
        });

        it('should include orchestra name when linked', async () => {
            const orchestra = createTestOrchestra(association.id, { name: 'Default Day Orchestra' });
            createTestDefaultDay(association.id, {
                orchestraId: orchestra.id,
                dayOfWeek: 2,
            });

            const response = await request(app)
                .get('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body[0]).toHaveProperty('orchestra_name', 'Default Day Orchestra');
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/rehearsals/default-days');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/rehearsals/default-days', () => {
        it('should create default day as admin', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 3,
                    startTime: '20:00',
                    endTime: '22:00',
                    location: 'Rehearsal Hall',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('dayOfWeek', 3);
            expect(response.body).toHaveProperty('startTime', '20:00');
            expect(response.body).toHaveProperty('endTime', '22:00');
            expect(response.body).toHaveProperty('location', 'Rehearsal Hall');
        });

        it('should create default day as music committee', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    dayOfWeek: 4,
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(201);
        });

        it('should create default day as conductor', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${conductorToken}`)
                .send({
                    dayOfWeek: 5,
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(201);
        });

        it('should create default day with orchestra', async () => {
            const orchestra = createTestOrchestra(association.id, { name: 'Linked Orchestra' });

            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 1,
                    startTime: '19:30',
                    endTime: '21:30',
                    orchestraId: orchestra.id,
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('orchestraId', orchestra.id);
        });

        it('should fail with invalid day of week', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 7,  // Invalid (0-6 only)
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail with negative day of week', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: -1,
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without start time', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 1,
                    endTime: '21:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without end time', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 1,
                    startTime: '19:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail with invalid orchestra', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 1,
                    startTime: '19:00',
                    endTime: '21:00',
                    orchestraId: 'non-existent-orchestra',
                });

            expect(response.status).toBe(400);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .post('/api/rehearsals/default-days')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    dayOfWeek: 1,
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(403);
        });
    });

    describe('PUT /api/rehearsals/default-days/:id', () => {
        let defaultDay: { id: string };

        beforeEach(() => {
            defaultDay = createTestDefaultDay(association.id, {
                dayOfWeek: 1,
                startTime: '19:30',
                endTime: '21:30',
            });
        });

        it('should update default day as admin', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/default-days/${defaultDay.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 2,
                    startTime: '20:00',
                    endTime: '22:00',
                    location: 'New Location',
                });

            expect(response.status).toBe(200);

            // Verify update
            const updated = testDb.prepare(
                'SELECT * FROM rehearsal_default_days WHERE id = ?'
            ).get(defaultDay.id) as any;

            expect(updated.day_of_week).toBe(2);
            expect(updated.start_time).toBe('20:00');
            expect(updated.end_time).toBe('22:00');
            expect(updated.location).toBe('New Location');
        });

        it('should return 404 for non-existent default day', async () => {
            const response = await request(app)
                .put('/api/rehearsals/default-days/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    dayOfWeek: 1,
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(404);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/default-days/${defaultDay.id}`)
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    dayOfWeek: 1,
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/rehearsals/default-days/:id', () => {
        let defaultDay: { id: string };

        beforeEach(() => {
            defaultDay = createTestDefaultDay(association.id);
        });

        it('should delete default day as admin', async () => {
            const response = await request(app)
                .delete(`/api/rehearsals/default-days/${defaultDay.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Verify deletion
            const deleted = testDb.prepare(
                'SELECT * FROM rehearsal_default_days WHERE id = ?'
            ).get(defaultDay.id);

            expect(deleted).toBeUndefined();
        });

        it('should return 404 for non-existent default day', async () => {
            const response = await request(app)
                .delete('/api/rehearsals/default-days/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .delete(`/api/rehearsals/default-days/${defaultDay.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });
    });

    // ==================
    // REHEARSALS
    // ==================

    describe('GET /api/rehearsals', () => {
        it('should return list of rehearsals for member', async () => {
            createTestRehearsal(association.id, adminUser.id, {
                date: '2026-04-01',
            });
            createTestRehearsal(association.id, adminUser.id, {
                date: '2026-04-08',
            });

            const response = await request(app)
                .get('/api/rehearsals')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(2);
        });

        it('should filter by date range', async () => {
            createTestRehearsal(association.id, adminUser.id, { date: '2026-03-01' });
            createTestRehearsal(association.id, adminUser.id, { date: '2026-04-01' });
            createTestRehearsal(association.id, adminUser.id, { date: '2026-05-01' });

            const response = await request(app)
                .get('/api/rehearsals')
                .query({ startDate: '2026-03-15', endDate: '2026-04-15' })
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.length).toBe(1);
            expect(response.body[0].date).toBe('2026-04-01');
        });

        it('should include piece and attendance counts', async () => {
            const rehearsal = createTestRehearsal(association.id, adminUser.id);

            // Add a piece
            testDb.prepare(
                'INSERT INTO rehearsal_pieces (id, rehearsal_id, title, sort_order) VALUES (?, ?, ?, ?)'
            ).run('piece-1', rehearsal.id, 'Test Piece', 0);

            // Add attendance
            testDb.prepare(
                `INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status)
                 VALUES (?, ?, ?, ?)`
            ).run('att-1', rehearsal.id, 'Member 1', 'accepted');

            const response = await request(app)
                .get('/api/rehearsals')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body[0]).toHaveProperty('piece_count', 1);
            expect(response.body[0]).toHaveProperty('accepted_count', 1);
        });

        it('should filter by orchestra for non-managers', async () => {
            const orchestra1 = createTestOrchestra(association.id, { name: 'Orchestra 1' });
            const orchestra2 = createTestOrchestra(association.id, { name: 'Orchestra 2' });

            createTestRehearsal(association.id, adminUser.id, { orchestraId: orchestra1.id });
            createTestRehearsal(association.id, adminUser.id, { orchestraId: orchestra2.id });

            // Member is only in orchestra1
            addUserToOrchestra(memberUser.id, orchestra1.id);

            const response = await request(app)
                .get('/api/rehearsals')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            // Should only see rehearsals for orchestra1
            expect(response.body.length).toBe(1);
            expect(response.body[0].orchestra_id).toBe(orchestra1.id);
        });

        it('should show all orchestras for managers', async () => {
            const orchestra1 = createTestOrchestra(association.id, { name: 'Manager Orch 1' });
            const orchestra2 = createTestOrchestra(association.id, { name: 'Manager Orch 2' });

            createTestRehearsal(association.id, adminUser.id, { orchestraId: orchestra1.id });
            createTestRehearsal(association.id, adminUser.id, { orchestraId: orchestra2.id });

            const response = await request(app)
                .get('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body.length).toBe(2);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/rehearsals');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/rehearsals/:id', () => {
        let rehearsal: TestRehearsal;

        beforeEach(() => {
            rehearsal = createTestRehearsal(association.id, adminUser.id, {
                date: '2026-04-15',
                location: 'Main Hall',
                notes: 'Important rehearsal',
            });
        });

        it('should return single rehearsal with details', async () => {
            const response = await request(app)
                .get(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', rehearsal.id);
            expect(response.body).toHaveProperty('date', '2026-04-15');
            expect(response.body).toHaveProperty('location', 'Main Hall');
            expect(response.body).toHaveProperty('notes', 'Important rehearsal');
            expect(response.body).toHaveProperty('pieces');
            expect(response.body).toHaveProperty('attendance');
        });

        it('should include pieces', async () => {
            testDb.prepare(
                'INSERT INTO rehearsal_pieces (id, rehearsal_id, title, notes, sort_order) VALUES (?, ?, ?, ?, ?)'
            ).run('piece-detail', rehearsal.id, 'March of the Guard', 'Watch dynamics', 0);

            const response = await request(app)
                .get(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.pieces.length).toBe(1);
            expect(response.body.pieces[0]).toHaveProperty('title', 'March of the Guard');
            expect(response.body.pieces[0]).toHaveProperty('notes', 'Watch dynamics');
        });

        it('should include attendance', async () => {
            testDb.prepare(
                `INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status)
                 VALUES (?, ?, ?, ?)`
            ).run('att-detail', rehearsal.id, 'John Doe', 'accepted');

            const response = await request(app)
                .get(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.attendance.length).toBe(1);
            expect(response.body.attendance[0]).toHaveProperty('member_name', 'John Doe');
            expect(response.body.attendance[0]).toHaveProperty('status', 'accepted');
        });

        it('should return 404 for non-existent rehearsal', async () => {
            const response = await request(app)
                .get('/api/rehearsals/non-existent-id')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(404);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get(`/api/rehearsals/${rehearsal.id}`);

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/rehearsals', () => {
        it('should create rehearsal as admin', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-01',
                    startTime: '19:30',
                    endTime: '21:30',
                    location: 'Concert Hall',
                    type: 'regular',
                    notes: 'Season finale preparation',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('date', '2026-05-01');
            expect(response.body).toHaveProperty('startTime', '19:30');
            expect(response.body).toHaveProperty('endTime', '21:30');
            expect(response.body).toHaveProperty('location', 'Concert Hall');
            expect(response.body).toHaveProperty('type', 'regular');
            expect(response.body).toHaveProperty('notes', 'Season finale preparation');
        });

        it('should create rehearsal as music committee', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    date: '2026-05-02',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(201);
        });

        it('should create rehearsal as conductor', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${conductorToken}`)
                .send({
                    date: '2026-05-03',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(201);
        });

        it('should create rehearsal with orchestra', async () => {
            const orchestra = createTestOrchestra(association.id, { name: 'Rehearsal Orchestra' });

            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-04',
                    startTime: '19:00',
                    endTime: '21:00',
                    orchestraId: orchestra.id,
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('orchestraId', orchestra.id);
        });

        it('should default type to regular', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-05',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('type', 'regular');
        });

        it('should accept extra type', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-06',
                    startTime: '19:00',
                    endTime: '21:00',
                    type: 'extra',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('type', 'extra');
        });

        it('should accept cancelled type', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-07',
                    startTime: '19:00',
                    endTime: '21:00',
                    type: 'cancelled',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('type', 'cancelled');
        });

        it('should fail with invalid type', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-08',
                    startTime: '19:00',
                    endTime: '21:00',
                    type: 'invalid-type',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without date', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without start time', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-09',
                    endTime: '21:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without end time', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-10',
                    startTime: '19:00',
                });

            expect(response.status).toBe(400);
        });

        it('should fail with invalid orchestra', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-05-11',
                    startTime: '19:00',
                    endTime: '21:00',
                    orchestraId: 'non-existent-orchestra',
                });

            expect(response.status).toBe(400);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    date: '2026-05-12',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(403);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .post('/api/rehearsals')
                .send({
                    date: '2026-05-13',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(401);
        });
    });

    describe('PUT /api/rehearsals/:id', () => {
        let rehearsal: TestRehearsal;

        beforeEach(() => {
            rehearsal = createTestRehearsal(association.id, adminUser.id, {
                date: '2026-04-20',
                location: 'Original Location',
            });
        });

        it('should update rehearsal as admin', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-04-21',
                    startTime: '20:00',
                    endTime: '22:00',
                    location: 'Updated Location',
                    type: 'extra',
                    notes: 'Updated notes',
                });

            expect(response.status).toBe(200);

            // Verify update
            const updated = testDb.prepare(
                'SELECT * FROM rehearsals WHERE id = ?'
            ).get(rehearsal.id) as any;

            expect(updated.date).toBe('2026-04-21');
            expect(updated.start_time).toBe('20:00');
            expect(updated.end_time).toBe('22:00');
            expect(updated.location).toBe('Updated Location');
            expect(updated.type).toBe('extra');
            expect(updated.notes).toBe('Updated notes');
        });

        it('should update rehearsal as music committee', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    date: '2026-04-22',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(200);
        });

        it('should return 404 for non-existent rehearsal', async () => {
            const response = await request(app)
                .put('/api/rehearsals/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    date: '2026-04-23',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(404);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    date: '2026-04-24',
                    startTime: '19:00',
                    endTime: '21:00',
                });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/rehearsals/:id', () => {
        let rehearsal: TestRehearsal;

        beforeEach(() => {
            rehearsal = createTestRehearsal(association.id, adminUser.id);
        });

        it('should delete rehearsal as admin', async () => {
            const response = await request(app)
                .delete(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Verify deletion
            const deleted = testDb.prepare(
                'SELECT * FROM rehearsals WHERE id = ?'
            ).get(rehearsal.id);

            expect(deleted).toBeUndefined();
        });

        it('should cascade delete pieces and attendance', async () => {
            // Add piece
            testDb.prepare(
                'INSERT INTO rehearsal_pieces (id, rehearsal_id, title, sort_order) VALUES (?, ?, ?, ?)'
            ).run('del-piece', rehearsal.id, 'Delete Piece', 0);

            // Add attendance
            testDb.prepare(
                `INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status)
                 VALUES (?, ?, ?, ?)`
            ).run('del-att', rehearsal.id, 'Delete Member', 'accepted');

            await request(app)
                .delete(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            // Verify cascading deletion
            const pieces = testDb.prepare(
                'SELECT * FROM rehearsal_pieces WHERE rehearsal_id = ?'
            ).all(rehearsal.id);
            expect(pieces.length).toBe(0);

            const attendance = testDb.prepare(
                'SELECT * FROM rehearsal_attendance WHERE rehearsal_id = ?'
            ).all(rehearsal.id);
            expect(attendance.length).toBe(0);
        });

        it('should return 404 for non-existent rehearsal', async () => {
            const response = await request(app)
                .delete('/api/rehearsals/non-existent-id')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .delete(`/api/rehearsals/${rehearsal.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });
    });

    // ==================
    // REHEARSAL PIECES
    // ==================

    describe('PUT /api/rehearsals/:id/pieces', () => {
        let rehearsal: TestRehearsal;

        beforeEach(() => {
            rehearsal = createTestRehearsal(association.id, adminUser.id);
        });

        it('should set pieces for rehearsal', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}/pieces`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    pieces: [
                        { title: 'March No. 1', notes: 'Focus on dynamics' },
                        { title: 'Overture', notes: 'Watch tempo changes' },
                    ],
                });

            expect(response.status).toBe(200);

            // Verify pieces were created
            const pieces = testDb.prepare(
                'SELECT * FROM rehearsal_pieces WHERE rehearsal_id = ? ORDER BY sort_order'
            ).all(rehearsal.id) as any[];

            expect(pieces.length).toBe(2);
            expect(pieces[0].title).toBe('March No. 1');
            expect(pieces[0].notes).toBe('Focus on dynamics');
            expect(pieces[1].title).toBe('Overture');
            expect(pieces[1].notes).toBe('Watch tempo changes');
        });

        it('should replace existing pieces', async () => {
            // Add initial piece
            testDb.prepare(
                'INSERT INTO rehearsal_pieces (id, rehearsal_id, title, sort_order) VALUES (?, ?, ?, ?)'
            ).run('existing-piece', rehearsal.id, 'Old Piece', 0);

            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}/pieces`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    pieces: [
                        { title: 'New Piece', notes: 'New notes' },
                    ],
                });

            expect(response.status).toBe(200);

            const pieces = testDb.prepare(
                'SELECT * FROM rehearsal_pieces WHERE rehearsal_id = ?'
            ).all(rehearsal.id) as any[];

            expect(pieces.length).toBe(1);
            expect(pieces[0].title).toBe('New Piece');
        });

        it('should clear pieces when empty array', async () => {
            // Add initial piece
            testDb.prepare(
                'INSERT INTO rehearsal_pieces (id, rehearsal_id, title, sort_order) VALUES (?, ?, ?, ?)'
            ).run('to-clear', rehearsal.id, 'Clear Me', 0);

            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}/pieces`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    pieces: [],
                });

            expect(response.status).toBe(200);

            const pieces = testDb.prepare(
                'SELECT * FROM rehearsal_pieces WHERE rehearsal_id = ?'
            ).all(rehearsal.id);

            expect(pieces.length).toBe(0);
        });

        it('should fail with non-array pieces', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}/pieces`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    pieces: 'not-an-array',
                });

            expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent rehearsal', async () => {
            const response = await request(app)
                .put('/api/rehearsals/non-existent-id/pieces')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    pieces: [{ title: 'Test' }],
                });

            expect(response.status).toBe(404);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .put(`/api/rehearsals/${rehearsal.id}/pieces`)
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    pieces: [{ title: 'Forbidden' }],
                });

            expect(response.status).toBe(403);
        });
    });

    // ==================
    // GENERATE REHEARSALS
    // ==================

    describe('POST /api/rehearsals/generate', () => {
        beforeEach(() => {
            // Create default day on Monday
            createTestDefaultDay(association.id, {
                dayOfWeek: 1,  // Monday
                startTime: '19:30',
                endTime: '21:30',
                location: 'Default Location',
            });
        });

        it('should generate rehearsals from default days', async () => {
            // Generate for a week that has a Monday
            const response = await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    startDate: '2026-04-06',  // Monday
                    endDate: '2026-04-12',    // Sunday
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('count', 1);

            // Verify rehearsal was created
            const rehearsals = testDb.prepare(
                `SELECT * FROM rehearsals WHERE association_id = ? AND date = '2026-04-06'`
            ).all(association.id);

            expect(rehearsals.length).toBe(1);
        });

        it('should not create duplicates', async () => {
            // Generate once
            await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    startDate: '2026-04-06',
                    endDate: '2026-04-12',
                });

            // Generate again
            const response = await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    startDate: '2026-04-06',
                    endDate: '2026-04-12',
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('count', 0);  // No new rehearsals

            const rehearsals = testDb.prepare(
                `SELECT * FROM rehearsals WHERE association_id = ? AND date = '2026-04-06'`
            ).all(association.id);

            expect(rehearsals.length).toBe(1);  // Still just one
        });

        it('should fail without default days', async () => {
            // Clear default days
            testDb.prepare(
                'DELETE FROM rehearsal_default_days WHERE association_id = ?'
            ).run(association.id);

            const response = await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    startDate: '2026-04-06',
                    endDate: '2026-04-12',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without start date', async () => {
            const response = await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    endDate: '2026-04-12',
                });

            expect(response.status).toBe(400);
        });

        it('should fail without end date', async () => {
            const response = await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    startDate: '2026-04-06',
                });

            expect(response.status).toBe(400);
        });

        it('should deny access to regular members', async () => {
            const response = await request(app)
                .post('/api/rehearsals/generate')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    startDate: '2026-04-06',
                    endDate: '2026-04-12',
                });

            expect(response.status).toBe(403);
        });
    });

    // ==================
    // ATTENDANCE SUMMARY
    // ==================

    describe('GET /api/rehearsals/attendance/summary', () => {
        it('should return attendance summary', async () => {
            const rehearsal = createTestRehearsal(association.id, adminUser.id, {
                date: '2026-04-01',
            });

            // Add attendance records
            testDb.prepare(
                `INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status)
                 VALUES (?, ?, ?, ?)`
            ).run('sum-att-1', rehearsal.id, 'Alice', 'accepted');

            testDb.prepare(
                `INSERT INTO rehearsal_attendance (id, rehearsal_id, member_name, status)
                 VALUES (?, ?, ?, ?)`
            ).run('sum-att-2', rehearsal.id, 'Bob', 'declined');

            const response = await request(app)
                .get('/api/rehearsals/attendance/summary')
                .query({ from: '2026-04-01', to: '2026-04-30' })
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('members');
            expect(response.body).toHaveProperty('rehearsalCount', 1);
            expect(Array.isArray(response.body.members)).toBe(true);
        });

        it('should fail without date parameters', async () => {
            const response = await request(app)
                .get('/api/rehearsals/attendance/summary')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(400);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/rehearsals/attendance/summary')
                .query({ from: '2026-04-01', to: '2026-04-30' });

            expect(response.status).toBe(401);
        });
    });
});
