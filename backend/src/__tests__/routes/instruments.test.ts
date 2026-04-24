/**
 * Integration tests for instruments routes
 * Tests: CRUD operations, aliases, role-based authorization
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import app from '../testApp';
import testDb from '../testDb';
import { invalidateAllCache } from '../../middleware/cache';
import {
    createTestEnvironment,
    createTestInstrument,
} from '../testUtils';

describe('Instruments Routes', () => {
    let adminToken: string;
    let memberToken: string;
    let musicCommitteeToken: string;

    beforeEach(() => {
        // Clear the in-memory response cache between tests
        invalidateAllCache();
        const env = createTestEnvironment();
        adminToken = env.adminToken;
        memberToken = env.memberToken;
        musicCommitteeToken = env.musicCommitteeToken;
    });

    describe('GET /api/instruments', () => {
        it('should return all instruments', async () => {
            createTestInstrument({ name: 'Trumpet', tuning: 'Bb', clef: 'sol' });
            createTestInstrument({ name: 'Tuba', tuning: 'C', clef: 'fa' });

            const response = await request(app)
                .get('/api/instruments')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBe(2);
            expect(response.body[0]).toHaveProperty('name');
            expect(response.body[0]).toHaveProperty('tuning');
            expect(response.body[0]).toHaveProperty('clef');
            expect(response.body[0]).toHaveProperty('aliases');
        });

        it('should include aliases when present', async () => {
            const instrument = createTestInstrument({ name: 'Trumpet', tuning: 'Bb' });
            const aliasId = uuidv4();
            testDb
                .prepare('INSERT INTO instrument_aliases (id, instrument_id, alias) VALUES (?, ?, ?)')
                .run(aliasId, instrument.id, 'Trompet');

            const response = await request(app)
                .get('/api/instruments')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            const trumpet = response.body.find((i: any) => i.name === 'Trumpet');
            expect(trumpet.aliases).toHaveLength(1);
            expect(trumpet.aliases[0].name).toBe('Trompet');
        });

        it('should return empty array when no instruments exist', async () => {
            const response = await request(app)
                .get('/api/instruments')
                .set('Authorization', `Bearer ${memberToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        it('should require authentication', async () => {
            const response = await request(app).get('/api/instruments');

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/instruments', () => {
        it('should create a new instrument as admin', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Clarinet',
                    tuning: 'Bb',
                    clef: 'sol',
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
        });

        it('should create a new instrument as music_committee', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${musicCommitteeToken}`)
                .send({
                    name: 'Saxophone',
                    tuning: 'Eb',
                    clef: 'sol',
                });

            expect(response.status).toBe(201);
        });

        it('should reject creation by regular member', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${memberToken}`)
                .send({
                    name: 'Oboe',
                    clef: 'sol',
                });

            expect(response.status).toBe(403);
        });

        it('should default clef to "sol" when not provided', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Flute' });

            expect(response.status).toBe(201);

            const listResponse = await request(app)
                .get('/api/instruments')
                .set('Authorization', `Bearer ${memberToken}`);
            const flute = listResponse.body.find((i: any) => i.name === 'Flute');
            expect(flute.clef).toBe('sol');
        });

        it('should reject duplicate instrument with same name, tuning, clef', async () => {
            createTestInstrument({ name: 'Trumpet', tuning: 'Bb', clef: 'sol' });

            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Trumpet',
                    tuning: 'Bb',
                    clef: 'sol',
                });

            expect(response.status).toBe(409);
        });

        it('should allow same name with different tuning', async () => {
            createTestInstrument({ name: 'Trumpet', tuning: 'Bb', clef: 'sol' });

            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Trumpet',
                    tuning: 'C',
                    clef: 'sol',
                });

            expect(response.status).toBe(201);
        });

        it('should reject empty name', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: '' });

            expect(response.status).toBe(400);
        });

        it('should reject invalid clef', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Piccolo',
                    clef: 'invalid',
                });

            expect(response.status).toBe(400);
        });

        it('should create instrument with aliases', async () => {
            const response = await request(app)
                .post('/api/instruments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Trumpet',
                    tuning: 'Bb',
                    aliases: ['Trompet', 'Tromba'],
                });

            expect(response.status).toBe(201);

            const listResponse = await request(app)
                .get('/api/instruments')
                .set('Authorization', `Bearer ${memberToken}`);
            const trumpet = listResponse.body.find((i: any) => i.name === 'Trumpet');
            expect(trumpet.aliases.map((a: any) => a.name).sort()).toEqual(['Tromba', 'Trompet']);
        });
    });
});
