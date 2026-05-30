/**
 * Integration tests for music-pieces routes
 * Tests: GET operations for music pieces (individual instrument parts/PDFs)
 *
 * Note: music_pieces are individual PDF files for instruments,
 * while music_titles represent the overall musical work.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import {
    createTestEnvironment,
    createTestInstrument,
    TestUser,
    TestAssociation,
} from '../testUtils';
import { v4 as uuidv4 } from 'uuid';

// Helper to create a music piece in the test database
function createTestMusicPiece(
    associationId: string,
    uploadedBy: string,
    overrides: Partial<{
        id: string;
        title: string;
        arranger: string;
        instrumentId: string;
        filePath: string;
        originalFilename: string;
    }> = {}
) {
    const musicPiece = {
        id: overrides.id || uuidv4(),
        title: overrides.title || `Test Music Piece ${Date.now()}`,
        arranger: overrides.arranger || null,
        instrumentId: overrides.instrumentId || null,
        filePath: overrides.filePath || '/uploads/test.pdf',
        originalFilename: overrides.originalFilename || 'test.pdf',
        associationId,
        uploadedBy,
    };

    testDb.prepare(
        `INSERT INTO music_pieces (id, title, arranger, instrument_id, file_path, original_filename, association_id, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        musicPiece.id,
        musicPiece.title,
        musicPiece.arranger,
        musicPiece.instrumentId,
        musicPiece.filePath,
        musicPiece.originalFilename,
        musicPiece.associationId,
        musicPiece.uploadedBy
    );

    return musicPiece;
}

describe('Music Pieces Routes', () => {
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

    describe('GET /api/music-pieces', () => {
        it('should return music pieces for authenticated user', async () => {
            // Create some test music pieces
            createTestMusicPiece(association.id, adminUser.id, { title: 'Symphony No. 5' });
            createTestMusicPiece(association.id, adminUser.id, { title: 'Concerto in D' });

            const response = await request(app)
                .get('/api/music-pieces')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should support search query', async () => {
            createTestMusicPiece(association.id, adminUser.id, { title: 'Symphony No. 5' });
            createTestMusicPiece(association.id, adminUser.id, { title: 'Concerto in D' });

            const response = await request(app)
                .get('/api/music-pieces')
                .query({ search: 'Symphony' })
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBeGreaterThanOrEqual(0);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/music-pieces');

            expect(response.status).toBe(401);
        });

        it('should only return music pieces from user association', async () => {
            // Create music piece for our association
            createTestMusicPiece(association.id, adminUser.id, { title: 'Our Music' });

            // Create a different association
            const otherAssoc = {
                id: uuidv4(),
                name: 'Other Association',
            };
            testDb.prepare('INSERT INTO associations (id, name) VALUES (?, ?)').run(otherAssoc.id, otherAssoc.name);

            // Create a music piece for other association
            const otherId = uuidv4();
            testDb.prepare(
                `INSERT INTO music_pieces (id, title, file_path, original_filename, association_id)
                 VALUES (?, ?, ?, ?, ?)`
            ).run(otherId, 'Other Music', '/test.pdf', 'test.pdf', otherAssoc.id);

            const response = await request(app)
                .get('/api/music-pieces')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            // Should only contain pieces from our association
            const titles = response.body.data.map((p: any) => p.title);
            expect(titles).not.toContain('Other Music');
        });
    });

    describe('GET /api/music-pieces/my-pieces', () => {
        it('should return user\'s own pieces', async () => {
            // Create instrument for user
            const instrument = createTestInstrument({ name: 'Clarinet' });

            // Assign instrument to user
            testDb.prepare('INSERT INTO user_instruments (user_id, instrument_id) VALUES (?, ?)')
                .run(memberUser.id, instrument.id);

            // Create music piece for that instrument
            createTestMusicPiece(association.id, adminUser.id, {
                title: 'Clarinet Part',
                instrumentId: instrument.id,
            });

            const response = await request(app)
                .get('/api/music-pieces/my-pieces')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/music-pieces/my-pieces');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/music-pieces/titles', () => {
        it('should return music titles (admin)', async () => {
            const response = await request(app)
                .get('/api/music-pieces/titles')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });

        it('should fail for regular member', async () => {
            const response = await request(app)
                .get('/api/music-pieces/titles')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(403);
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/music-pieces/titles');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/music-pieces/shared', () => {
        it('should return shared music pieces', async () => {
            // Create a shared piece
            const pieceId = uuidv4();
            testDb.prepare(
                `INSERT INTO music_pieces (id, title, file_path, original_filename, association_id, is_shared)
                 VALUES (?, ?, ?, ?, ?, 1)`
            ).run(pieceId, 'Shared Piece', '/test.pdf', 'test.pdf', association.id);

            const response = await request(app)
                .get('/api/music-pieces/shared')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('data');
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/music-pieces/shared');

            expect(response.status).toBe(401);
        });
    });
});
