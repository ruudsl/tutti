import swaggerJsdoc from 'swagger-jsdoc';
import config from './config';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Harmonie Muziek API',
            version: '1.0.0',
            description: 'API voor het beheren van muziekstukken, leden en orkesten voor harmonie verenigingen',
            contact: {
                name: 'API Support',
            },
        },
        servers: [
            {
                url: `http://localhost:${config.port}/api`,
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        role: { type: 'string', enum: ['admin', 'music_committee', 'member'] },
                        associationId: { type: 'string', format: 'uuid', nullable: true },
                    },
                },
                Instrument: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        tuning: { type: 'string', nullable: true },
                        clef: { type: 'string', enum: ['sol', 'fa', 'ut'] },
                        aliases: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    name: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                Orchestra: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        memberCount: { type: 'integer' },
                        listCount: { type: 'integer' },
                    },
                },
                Genre: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                    },
                },
                MusicPiece: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        title: { type: 'string' },
                        arranger: { type: 'string', nullable: true },
                        tuning: { type: 'string', nullable: true },
                        groupNumber: { type: 'string', nullable: true },
                        clef: { type: 'string', nullable: true },
                        youtubeUrl: { type: 'string', nullable: true },
                        originalFilename: { type: 'string' },
                        instrumentId: { type: 'string', format: 'uuid', nullable: true },
                        instrumentName: { type: 'string', nullable: true },
                    },
                },
                MusicList: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string' },
                        orchestraId: { type: 'string', format: 'uuid' },
                        orchestraName: { type: 'string' },
                        position: { type: 'integer' },
                        pieceCount: { type: 'integer' },
                        isActive: { type: 'boolean' },
                    },
                },
                Pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                        total: { type: 'integer' },
                        totalPages: { type: 'integer' },
                        hasNext: { type: 'boolean' },
                        hasPrev: { type: 'boolean' },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
