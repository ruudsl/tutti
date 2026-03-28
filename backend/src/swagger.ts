import swaggerJsdoc from 'swagger-jsdoc';
import config from './config';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Harmonie Muziek API',
            version: '1.0.0',
            description: `
# Harmonie Muziek API

REST API voor het beheren van muziekstukken, leden, orkesten en meer voor harmonie verenigingen.

## Authenticatie

Deze API gebruikt JWT Bearer tokens voor authenticatie. Verkrijg een token via het \`/auth/login\` endpoint en stuur deze mee in de \`Authorization\` header:

\`\`\`
Authorization: Bearer <your-token>
\`\`\`

## Rollen

- **admin**: Volledige toegang tot alle functionaliteiten
- **music_committee**: Beheer van muziekstukken en lijsten
- **equipment_committee**: Beheer van instrumenten en uniformen
- **conductor**: Beheer van repetities
- **member**: Basis leestoegang en eigen gegevens

## Rate Limiting

- Algemene API limiet: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs / 60000} minuten
- Login limiet: ${config.authRateLimitMaxRequests} pogingen per 15 minuten
            `,
            contact: {
                name: 'Harmonie API Support',
            },
            license: {
                name: 'MIT',
            },
        },
        servers: [
            {
                url: `http://localhost:${config.port}/api`,
                description: 'Development server',
            },
            {
                url: '/api',
                description: 'Current server',
            },
        ],
        tags: [
            { name: 'Auth', description: 'Authenticatie en gebruikerssessies' },
            { name: 'Users', description: 'Gebruikersbeheer' },
            { name: 'Instruments', description: 'Instrumentenbeheer' },
            { name: 'Orchestras', description: 'Orkestbeheer' },
            { name: 'Music Lists', description: 'Muzieklijsten per orkest' },
            { name: 'Music Pieces', description: 'Muziekstukken (PDF partijen)' },
            { name: 'Genres', description: 'Muziekgenres' },
            { name: 'Associations', description: 'Verenigingsbeheer' },
            { name: 'Backup', description: 'Backup en restore functionaliteit' },
            { name: 'Issues', description: 'Meldingen over muziekstukken' },
            { name: 'Loans', description: 'Uitleenbeheer voor muziek' },
            { name: 'Activity', description: 'Activiteit en statistieken' },
            { name: 'Settings', description: 'Verenigingsinstellingen' },
            { name: 'Rehearsals', description: 'Repetities en planning' },
            { name: 'Spond', description: 'Spond integratie' },
            { name: 'Equipment', description: 'Instrumentenbeheer (verenigingseigendom)' },
            { name: 'Uniforms', description: 'Uniformenbeheer' },
            { name: 'Concerts', description: 'Concertenbeheer' },
            { name: 'Favorites', description: 'Favoriete muziekstukken' },
            { name: 'Practice', description: 'Oefenlogboek' },
            { name: 'Recent', description: 'Recent bekeken items' },
            { name: 'Annotations', description: 'PDF annotaties' },
            { name: 'Sessions', description: 'Sessiebeheer' },
            { name: 'Audio Recordings', description: 'Audio opnames' },
            { name: 'Section Chat', description: 'Sectie chat' },
            { name: 'Notifications', description: 'Notificaties' },
            { name: 'Practice Schedules', description: 'Oefenschema\'s' },
            { name: 'GDPR', description: 'AVG/GDPR functionaliteit' },
            { name: 'Search', description: 'Zoekfunctionaliteit' },
            { name: 'Audit Logs', description: 'Audit logging' },
            { name: 'Seating', description: 'Opstelling' },
            { name: 'Onboarding', description: 'Onboarding nieuwe leden' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token verkregen via /auth/login',
                },
            },
            schemas: {
                // Common response schemas
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', description: 'Foutmelding', example: 'Niet gevonden.' },
                    },
                    required: ['error'],
                },
                Success: {
                    type: 'object',
                    properties: {
                        message: { type: 'string', description: 'Succesbericht', example: 'Succesvol opgeslagen.' },
                    },
                },
                Pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', description: 'Huidige pagina', example: 1 },
                        limit: { type: 'integer', description: 'Items per pagina', example: 25 },
                        total: { type: 'integer', description: 'Totaal aantal items', example: 100 },
                        totalPages: { type: 'integer', description: 'Totaal aantal paginas', example: 4 },
                        hasNext: { type: 'boolean', description: 'Heeft volgende pagina', example: true },
                        hasPrev: { type: 'boolean', description: 'Heeft vorige pagina', example: false },
                    },
                },
                PaginatedResponse: {
                    type: 'object',
                    properties: {
                        data: { type: 'array', items: {}, description: 'Array van items' },
                        pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                },
                // Auth schemas
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'user@example.com' },
                        password: { type: 'string', format: 'password', minLength: 8, example: 'wachtwoord123' },
                        mfaCode: { type: 'string', description: '6-cijferige MFA code (indien MFA ingeschakeld)', example: '123456' },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        token: { type: 'string', description: 'JWT access token' },
                        user: { $ref: '#/components/schemas/User' },
                        requiresMfa: { type: 'boolean', description: 'True als MFA code nodig is' },
                    },
                },
                ChangePasswordRequest: {
                    type: 'object',
                    required: ['currentPassword', 'newPassword'],
                    properties: {
                        currentPassword: { type: 'string', format: 'password' },
                        newPassword: { type: 'string', format: 'password', minLength: 8 },
                    },
                },
                // User schemas
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
                        email: { type: 'string', format: 'email', example: 'muzikant@harmonie.nl' },
                        firstName: { type: 'string', example: 'Jan' },
                        lastName: { type: 'string', example: 'de Musicus' },
                        role: { type: 'string', enum: ['admin', 'music_committee', 'equipment_committee', 'conductor', 'member'], example: 'member' },
                        associationId: { type: 'string', format: 'uuid', nullable: true },
                        associationName: { type: 'string', nullable: true, example: 'Harmonie St. Cecilia' },
                        mfaEnabled: { type: 'boolean', example: false },
                        instruments: { type: 'array', items: { $ref: '#/components/schemas/Instrument' } },
                        orchestras: { type: 'array', items: { $ref: '#/components/schemas/Orchestra' } },
                    },
                },
                CreateUserRequest: {
                    type: 'object',
                    required: ['email', 'password', 'firstName', 'lastName'],
                    properties: {
                        email: { type: 'string', format: 'email' },
                        password: { type: 'string', format: 'password', minLength: 8 },
                        firstName: { type: 'string', minLength: 1 },
                        lastName: { type: 'string', minLength: 1 },
                        role: { type: 'string', enum: ['admin', 'music_committee', 'member'], default: 'member' },
                        instrumentIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                        orchestraIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    },
                },
                UpdateUserRequest: {
                    type: 'object',
                    properties: {
                        email: { type: 'string', format: 'email' },
                        firstName: { type: 'string' },
                        lastName: { type: 'string' },
                        role: { type: 'string', enum: ['admin', 'music_committee', 'member'] },
                        password: { type: 'string', format: 'password', minLength: 8 },
                        instrumentIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                        orchestraIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    },
                },
                // Instrument schemas
                Instrument: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Trompet' },
                        tuning: { type: 'string', nullable: true, example: 'Bes' },
                        clef: { type: 'string', enum: ['sol', 'fa', 'ut'], example: 'sol' },
                        aliases: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string', format: 'uuid' },
                                    name: { type: 'string', example: 'Trumpet' },
                                },
                            },
                        },
                    },
                },
                CreateInstrumentRequest: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string', example: 'Klarinet' },
                        tuning: { type: 'string', example: 'Bes' },
                        clef: { type: 'string', enum: ['sol', 'fa', 'ut'], default: 'sol' },
                        aliases: { type: 'array', items: { type: 'string' }, example: ['Clarinet', 'Clarinette'] },
                    },
                },
                // Orchestra schemas
                Orchestra: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Groot Orkest' },
                        memberCount: { type: 'integer', example: 45 },
                        listCount: { type: 'integer', example: 3 },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                CreateOrchestraRequest: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                        name: { type: 'string', example: 'Jeugdorkest' },
                    },
                },
                // Genre schema
                Genre: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Mars' },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                // Music Piece schemas
                MusicPiece: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        title: { type: 'string', example: 'Fanfare for the Common Man' },
                        arranger: { type: 'string', nullable: true, example: 'Aaron Copland' },
                        tuning: { type: 'string', nullable: true, example: 'Bes' },
                        groupNumber: { type: 'string', nullable: true, example: '1' },
                        clef: { type: 'string', nullable: true, example: 'sol' },
                        youtubeUrl: { type: 'string', nullable: true, example: 'https://www.youtube.com/watch?v=...' },
                        originalFilename: { type: 'string', example: 'fanfare_trompet1.pdf' },
                        instrumentId: { type: 'string', format: 'uuid', nullable: true },
                        instrumentName: { type: 'string', nullable: true, example: 'Trompet' },
                    },
                },
                // Music List schemas
                MusicList: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Kerstconcert 2024' },
                        orchestraId: { type: 'string', format: 'uuid' },
                        orchestraName: { type: 'string', example: 'Groot Orkest' },
                        position: { type: 'integer', example: 0 },
                        pieceCount: { type: 'integer', example: 12 },
                        titleCount: { type: 'integer', example: 8 },
                        isActive: { type: 'boolean', example: true },
                        listType: { type: 'string', enum: ['regular', 'concert'], example: 'concert' },
                        concertDate: { type: 'string', format: 'date', nullable: true },
                        concertLocation: { type: 'string', nullable: true },
                        totalDuration: { type: 'integer', description: 'Total duration in seconds', example: 3600 },
                    },
                },
                CreateMusicListRequest: {
                    type: 'object',
                    required: ['name', 'orchestraId'],
                    properties: {
                        name: { type: 'string' },
                        orchestraId: { type: 'string', format: 'uuid' },
                        listType: { type: 'string', enum: ['regular', 'concert'], default: 'regular' },
                        concertDate: { type: 'string', format: 'date' },
                        concertLocation: { type: 'string' },
                    },
                },
                // Association schema
                Association: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Harmonie St. Cecilia' },
                        createdAt: { type: 'string', format: 'date-time' },
                        memberCount: { type: 'integer', example: 75 },
                        orchestraCount: { type: 'integer', example: 2 },
                    },
                },
                // Backup schema
                BackupInfo: {
                    type: 'object',
                    properties: {
                        database: {
                            type: 'object',
                            properties: {
                                size: { type: 'integer' },
                                sizeFormatted: { type: 'string', example: '15.2 MB' },
                            },
                        },
                        pdfFiles: {
                            type: 'object',
                            properties: {
                                count: { type: 'integer', example: 250 },
                                size: { type: 'integer' },
                                sizeFormatted: { type: 'string', example: '1.5 GB' },
                            },
                        },
                        mp3Files: {
                            type: 'object',
                            properties: {
                                count: { type: 'integer', example: 25 },
                                size: { type: 'integer' },
                                sizeFormatted: { type: 'string', example: '250 MB' },
                            },
                        },
                        total: {
                            type: 'object',
                            properties: {
                                size: { type: 'integer' },
                                sizeFormatted: { type: 'string', example: '1.76 GB' },
                            },
                        },
                    },
                },
                // Issue schema
                Issue: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        musicPieceId: { type: 'string', format: 'uuid' },
                        pageNumber: { type: 'integer', nullable: true },
                        measureNumber: { type: 'integer', nullable: true },
                        description: { type: 'string' },
                        status: { type: 'string', enum: ['open', 'in_review', 'resolved', 'rejected'] },
                        resolutionNotes: { type: 'string', nullable: true },
                        resolvedAt: { type: 'string', format: 'date-time', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                    },
                },
                // Loan schema
                Loan: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        musicTitleId: { type: 'string', format: 'uuid' },
                        borrowerName: { type: 'string' },
                        borrowerEmail: { type: 'string', format: 'email', nullable: true },
                        borrowerOrganization: { type: 'string', nullable: true },
                        notes: { type: 'string', nullable: true },
                        dateOut: { type: 'string', format: 'date-time' },
                        expectedReturn: { type: 'string', format: 'date', nullable: true },
                        dateReturned: { type: 'string', format: 'date-time', nullable: true },
                        status: { type: 'string', enum: ['active', 'overdue', 'returned'] },
                    },
                },
                // Rehearsal schema
                Rehearsal: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        date: { type: 'string', format: 'date' },
                        startTime: { type: 'string', example: '19:30' },
                        endTime: { type: 'string', example: '22:00' },
                        location: { type: 'string', nullable: true },
                        type: { type: 'string', enum: ['regular', 'extra', 'cancelled'] },
                        notes: { type: 'string', nullable: true },
                        orchestraId: { type: 'string', format: 'uuid', nullable: true },
                        orchestraName: { type: 'string', nullable: true },
                        pieceCount: { type: 'integer' },
                        acceptedCount: { type: 'integer' },
                        declinedCount: { type: 'integer' },
                    },
                },
                // Equipment schema
                Equipment: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        instrumentType: { type: 'string', example: 'Bes-Trompet' },
                        brandModel: { type: 'string', nullable: true, example: 'Yamaha YTR-2330' },
                        serialNumber: { type: 'string', nullable: true },
                        yearOfManufacture: { type: 'integer', nullable: true, example: 2020 },
                        status: { type: 'string', enum: ['available', 'on_loan', 'in_repair', 'written_off', 'personal'] },
                        notes: { type: 'string', nullable: true },
                        maintenanceIntervalMonths: { type: 'integer', example: 12 },
                        lastMaintenanceDate: { type: 'string', format: 'date', nullable: true },
                        nextMaintenanceDate: { type: 'string', format: 'date', nullable: true },
                        purchasePrice: { type: 'number', nullable: true },
                        currentValue: { type: 'number', nullable: true },
                        currentUser: { $ref: '#/components/schemas/User', nullable: true },
                    },
                },
                // Uniform schema
                UniformItem: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        itemType: { type: 'string', example: 'jacket' },
                        sizeStandard: { type: 'string', nullable: true, example: 'M' },
                        color: { type: 'string', nullable: true },
                        condition: { type: 'string', enum: ['good', 'fair', 'poor'] },
                        status: { type: 'string', enum: ['available', 'issued', 'in_repair', 'written_off'] },
                    },
                },
                // Concert schema
                Concert: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        name: { type: 'string', example: 'Kerstconcert 2024' },
                        date: { type: 'string', format: 'date' },
                        endDate: { type: 'string', format: 'date', nullable: true },
                        location: { type: 'string', nullable: true },
                        venueType: { type: 'string', nullable: true },
                        concertType: { type: 'string', nullable: true },
                        description: { type: 'string', nullable: true },
                    },
                },
                // Favorite schema
                Favorite: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        title: { type: 'string' },
                        arranger: { type: 'string', nullable: true },
                        youtubeUrl: { type: 'string', nullable: true },
                        durationSeconds: { type: 'integer', nullable: true },
                        grade: { type: 'string', nullable: true },
                        pieceCount: { type: 'integer' },
                        favoritedAt: { type: 'string', format: 'date-time' },
                    },
                },
                // Practice Log schema
                PracticeLog: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        durationMinutes: { type: 'integer', example: 30 },
                        notes: { type: 'string', nullable: true },
                        practicedAt: { type: 'string', format: 'date-time' },
                        musicTitle: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                title: { type: 'string' },
                                arranger: { type: 'string', nullable: true },
                            },
                        },
                    },
                },
                // Practice Stats schema
                PracticeStats: {
                    type: 'object',
                    properties: {
                        totalMinutes: { type: 'integer' },
                        weekMinutes: { type: 'integer' },
                        monthMinutes: { type: 'integer' },
                        currentStreak: { type: 'integer', description: 'Consecutive days practiced' },
                        mostPracticed: { type: 'array', items: { $ref: '#/components/schemas/Favorite' } },
                    },
                },
                // Activity Stats schema
                ActivityStats: {
                    type: 'object',
                    properties: {
                        topPieces: { type: 'array', items: { type: 'object' } },
                        recentActivity: { type: 'array', items: { type: 'object' } },
                        userActivity: { type: 'array', items: { type: 'object' } },
                        totals: {
                            type: 'object',
                            properties: {
                                total_activities: { type: 'integer' },
                                active_users: { type: 'integer' },
                                total_downloads: { type: 'integer' },
                                total_views: { type: 'integer' },
                            },
                        },
                        period: { type: 'integer', example: 30 },
                    },
                },
                // Settings schema
                AssociationSettings: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        displayName: { type: 'string' },
                        logoPath: { type: 'string', nullable: true },
                        logoUrl: { type: 'string', nullable: true },
                        theme: { type: 'object', nullable: true },
                    },
                },
                // SMTP Settings schema
                SmtpSettings: {
                    type: 'object',
                    properties: {
                        host: { type: 'string' },
                        port: { type: 'integer', example: 587 },
                        secure: { type: 'boolean' },
                        user: { type: 'string' },
                        from: { type: 'string' },
                        enabled: { type: 'boolean' },
                        configured: { type: 'boolean' },
                    },
                },
            },
            responses: {
                UnauthorizedError: {
                    description: 'Access token is missing or invalid',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: { error: 'Niet geautoriseerd.' },
                        },
                    },
                },
                ForbiddenError: {
                    description: 'Insufficient permissions',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: { error: 'Geen toegang.' },
                        },
                    },
                },
                NotFoundError: {
                    description: 'Resource not found',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: { error: 'Niet gevonden.' },
                        },
                    },
                },
                ConflictError: {
                    description: 'Resource already exists',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: { error: 'Bestaat al.' },
                        },
                    },
                },
                ValidationError: {
                    description: 'Validation error',
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/Error' },
                            example: { error: 'Ongeldige invoer.' },
                        },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
