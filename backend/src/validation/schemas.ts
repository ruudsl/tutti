import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
    email: z.string().email('Ongeldig e-mailadres.'),
    password: z.string().min(1, 'Wachtwoord is verplicht.'),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Huidig wachtwoord is verplicht.'),
    newPassword: z.string().min(6, 'Nieuw wachtwoord moet minimaal 6 tekens zijn.'),
});

// User schemas
export const createUserSchema = z.object({
    email: z.string().email('Ongeldig e-mailadres.'),
    password: z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn.'),
    firstName: z.string().min(1, 'Voornaam is verplicht.'),
    lastName: z.string().min(1, 'Achternaam is verplicht.'),
    role: z.enum(['admin', 'music_committee', 'member']).optional().default('member'),
    instrumentIds: z.array(z.string().uuid()).optional(),
    orchestraIds: z.array(z.string().uuid()).optional(),
});

export const updateUserSchema = z.object({
    email: z.string().email('Ongeldig e-mailadres.').optional(),
    password: z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn.').optional(),
    firstName: z.string().min(1, 'Voornaam is verplicht.').optional(),
    lastName: z.string().min(1, 'Achternaam is verplicht.').optional(),
    role: z.enum(['admin', 'music_committee', 'member']).optional(),
    instrumentIds: z.array(z.string().uuid()).optional(),
    orchestraIds: z.array(z.string().uuid()).optional(),
});

// Instrument schemas
export const createInstrumentSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    tuning: z.string().optional(),
    clef: z.enum(['sol', 'fa', 'ut']).optional().default('sol'),
    aliases: z.array(z.string()).optional(),
});

export const updateInstrumentSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    tuning: z.string().optional(),
    clef: z.enum(['sol', 'fa', 'ut']).optional(),
});

export const addAliasSchema = z.object({
    alias: z.string().min(1, 'Alias is verplicht.'),
});

// Orchestra schemas
export const createOrchestraSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
});

export const updateOrchestraSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
});

// Music List schemas
export const createMusicListSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
    orchestraId: z.string().uuid('Ongeldig orkest ID.'),
});

export const updateMusicListSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
});

export const reorderMusicListsSchema = z.object({
    orchestraId: z.string().uuid('Ongeldig orkest ID.'),
    listIds: z.array(z.string().uuid()),
});

export const addPieceToListSchema = z.object({
    pieceId: z.string().uuid('Ongeldig muziekstuk ID.'),
});

export const addTitleToListSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht.'),
});

// Genre schemas
export const createGenreSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.').max(100, 'Naam mag maximaal 100 tekens zijn.'),
});

export const updateGenreSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.').max(100, 'Naam mag maximaal 100 tekens zijn.'),
});

// Music Piece schemas
export const updateMusicPieceSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht.'),
    arranger: z.string().nullable().optional(),
    instrumentId: z.string().uuid().nullable().optional(),
    tuning: z.string().nullable().optional(),
    groupNumber: z.string().nullable().optional(),
    clef: z.string().nullable().optional(),
    youtubeUrl: z.string().url().nullable().optional(),
});

export const updateTitleMetaSchema = z.object({
    title: z.string().min(1, 'Titel is verplicht.'),
    arranger: z.string().nullable().optional(),
    youtubeUrl: z.string().url().nullable().optional().or(z.literal('')),
    description: z.string().nullable().optional(),
    durationSeconds: z.number().int().min(0).optional(),
    grade: z.string().nullable().optional(),
    isShared: z.boolean().optional(),
    genreIds: z.array(z.string().uuid()).optional(),
});

// Share music piece schema
export const shareMusicPieceSchema = z.object({
    associationId: z.string().uuid('Ongeldig vereniging ID.'),
});

// Association schemas
export const createAssociationSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
});

export const updateAssociationSchema = z.object({
    name: z.string().min(1, 'Naam is verplicht.'),
});

// Validation helper
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}

// Safe validation (returns result object instead of throwing)
export function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: z.ZodError } {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}
