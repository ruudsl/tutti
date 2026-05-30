/**
 * Integration tests for music-pieces routes
 * Tests: CRUD operations for music pieces (titles)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
    createTestEnvironment,
    createTestInstrument,
    generateTestToken,
    TestUser,
    TestAssociation,
} from '../testUtils';
import { v4 as uuidv4 } from 'uuid';

// Helper to create a music title in the test database
function createTestMusicTitle(
    associationId: string,
    _createdBy: string,  // Not used - schema doesn't have created_by
    overrides: Partial<{
        id: string;
        title: string;
        composer: string;
        arranger: string;
        durationSeconds: number;
    }> = {}
) {
    const musicTitle = {
        id: overrides.id || uuidv4(),
        title: overrides.title || `Test Music Title ${Date.now()}`,
        composer: overrides.composer || 'Test Composer',
        arranger: overrides.arranger || null,
        durationSeconds: overrides.durationSeconds || 180,
        associationId,
    };

    testDb.prepare(
        `INSERT INTO music_titles (id, title, composer, arranger, duration_seconds, association_id)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
        musicTitle.id,
        musicTitle.title,
        musicTitle.composer,
        musicTitle.arranger,
        musicTitle.durationSeconds,
        musicTitle.associationId
    );

    return musicTitle;
}

describe('Music Pieces Routes', () => {
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

    describe('GET /api/music-pieces', () => {
        it('should return all music pieces for authenticated user', async () => {
            // Create some test music titles
            createTestMusicTitle(association.id, adminUser.id, { title: 'Symphony No. 5' });
            createTestMusicTitle(association.id, adminUser.id, { title: 'Concerto in D' });

            const response = await request(app)
                .get('/api/music-pieces')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(2);
        });

        it('should support search query', async () => {
            createTestMusicTitle(association.id, adminUser.id, { title: 'Symphony No. 5', composer: 'Beethoven' });
            createTestMusicTitle(association.id, adminUser.id, { title: 'Concerto in D', composer: 'Mozart' });

            const response = await request(app)
                .get('/api/music-pieces')
                .query({ search: 'Symphony' })
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].title).toBe('Symphony No. 5');
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/music-pieces');

            expect(response.status).toBe(401);
        });

        it('should only return music pieces from user association', async () => {
            // Create music title for our association
            createTestMusicTitle(association.id, adminUser.id, { title: 'Our Music' });

            // Create a different association and user
            const otherAssoc = {
                id: uuidv4(),
                name: 'Other Association',
            };
            testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssoc.id, otherAssoc.name);

            // Create a music title for other association
            const otherId = uuidv4();
            testDb.prepare(
                `INSERT INTO music_titles (id, title, composer, association_id, created_by)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(otherId, 'Other Music', 'Other Composer', otherAssoc.id, adminUser.id);

            const response = await request(app)
                .get('/api/music-pieces')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].title).toBe('Our Music');
        });
    });

    describe('GET /api/music-pieces/:id', () => {
        it('should return a specific music piece', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id, {
                title: 'Test Piece',
                composer: 'Test Composer',
            });

            const response = await request(app)
                .get(`/api/music-pieces/${musicTitle.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', musicTitle.id);
            expect(response.body).toHaveProperty('title', 'Test Piece');
            expect(response.body).toHaveProperty('composer', 'Test Composer');
        });

        it('should return 404 for non-existent music piece', async () => {
            const response = await request(app)
                .get(`/api/music-pieces/${uuidv4()}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(404);
        });

        it('should require authentication', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id);

            const response = await request(app)
                .get(`/api/music-pieces/${musicTitle.id}`);

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/music-pieces', () => {
        it('should create a new music piece (admin)', async () => {
            const response = await request(app)
                .post('/api/music-pieces')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'New Symphony',
                    composer: 'New Composer',
                    arranger: 'New Arranger',
                    durationSeconds: 300,
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('title', 'New Symphony');
            expect(response.body).toHaveProperty('composer', 'New Composer');
        });

        it('should create a new music piece (music committee)', async () => {
            const response = await request(app)
                .post('/api/music-pieces')
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    title: 'Committee Piece',
                    composer: 'Committee Composer',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('title', 'Committee Piece');
        });

        it('should fail for regular member', async () => {
            const response = await request(app)
                .post('/api/music-pieces')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    title: 'Member Piece',
                    composer: 'Member Composer',
                });

            expect(response.status).toBe(403);
        });

        it('should require title', async () => {
            const response = await request(app)
                .post('/api/music-pieces')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    composer: 'Only Composer',
                });

            expect(response.status).toBe(400);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .post('/api/music-pieces')
                .send({
                    title: 'Unauthenticated',
                    composer: 'No Auth',
                });

            expect(response.status).toBe(401);
        });
    });

    describe('PUT /api/music-pieces/:id', () => {
        it('should update a music piece (admin)', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id, {
                title: 'Original Title',
                composer: 'Original Composer',
            });

            const response = await request(app)
                .put(`/api/music-pieces/${musicTitle.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'Updated Title',
                    composer: 'Updated Composer',
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('title', 'Updated Title');
            expect(response.body).toHaveProperty('composer', 'Updated Composer');
        });

        it('should update a music piece (music committee)', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id);

            const response = await request(app)
                .put(`/api/music-pieces/${musicTitle.id}`)
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    title: 'Committee Updated',
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('title', 'Committee Updated');
        });

        it('should fail for regular member', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id);

            const response = await request(app)
                .put(`/api/music-pieces/${musicTitle.id}`)
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    title: 'Member Updated',
                });

            expect(response.status).toBe(403);
        });

        it('should return 404 for non-existent music piece', async () => {
            const response = await request(app)
                .put(`/api/music-pieces/${uuidv4()}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'Non-existent',
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/music-pieces/:id', () => {
        it('should delete a music piece (admin)', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id);

            const response = await request(app)
                .delete(`/api/music-pieces/${musicTitle.id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);

            // Verify deletion
            const deleted = testDb.prepare('SELECT * FROM music_titles WHERE id = ?').get(musicTitle.id);
            expect(deleted).toBeUndefined();
        });

        it('should fail for regular member', async () => {
            const musicTitle = createTestMusicTitle(association.id, adminUser.id);

            const response = await request(app)
                .delete(`/api/music-pieces/${musicTitle.id}`)
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });

        it('should return 404 for non-existent music piece', async () => {
            const response = await request(app)
                .delete(`/api/music-pieces/${uuidv4()}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(404);
        });
    });
});
