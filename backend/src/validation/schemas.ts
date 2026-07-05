import { z } from 'zod';

// Common max lengths for string validation
const MAX_LENGTHS = {
  SHORT_TEXT: 100,
  MEDIUM_TEXT: 255,
  LONG_TEXT: 1000,
  DESCRIPTION: 5000,
  EMAIL: 254,
  UUID: 36,
} as const;

// Common max sizes for arrays
const MAX_ARRAY_SIZES = {
  SMALL: 20,
  MEDIUM: 100,
  LARGE: 500,
  BULK: 1000,
} as const;

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Ongeldig e-mailadres.').max(MAX_LENGTHS.EMAIL),
  password: z.string().min(1, 'Wachtwoord is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Huidig wachtwoord is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
  newPassword: z.string().min(6, 'Nieuw wachtwoord moet minimaal 6 tekens zijn.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

// User schemas
export const createUserSchema = z.object({
  email: z.string().email('Ongeldig e-mailadres.').max(MAX_LENGTHS.EMAIL),
  password: z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn.').max(MAX_LENGTHS.MEDIUM_TEXT),
  firstName: z.string().min(1, 'Voornaam is verplicht.').max(MAX_LENGTHS.SHORT_TEXT),
  lastName: z.string().min(1, 'Achternaam is verplicht.').max(MAX_LENGTHS.SHORT_TEXT),
  role: z
    .enum(['admin', 'music_committee', 'equipment_committee', 'uniforms_committee', 'conductor', 'member'])
    .optional()
    .default('member'),
  instrumentIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.SMALL, 'Te veel instrumenten geselecteerd.').optional(),
  orchestraIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.SMALL, 'Te veel orkesten geselecteerd.').optional(),
});

export const updateUserSchema = z.object({
  email: z.string().email('Ongeldig e-mailadres.').max(MAX_LENGTHS.EMAIL).optional(),
  password: z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn.').max(MAX_LENGTHS.MEDIUM_TEXT).optional(),
  firstName: z.string().min(1, 'Voornaam is verplicht.').max(MAX_LENGTHS.SHORT_TEXT).optional(),
  lastName: z.string().min(1, 'Achternaam is verplicht.').max(MAX_LENGTHS.SHORT_TEXT).optional(),
  role: z
    .enum(['admin', 'music_committee', 'equipment_committee', 'uniforms_committee', 'conductor', 'member'])
    .optional(),
  instrumentIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.SMALL, 'Te veel instrumenten geselecteerd.').optional(),
  orchestraIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.SMALL, 'Te veel orkesten geselecteerd.').optional(),
});

// Instrument schemas
export const createInstrumentSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.SHORT_TEXT),
  tuning: z.string().max(MAX_LENGTHS.SHORT_TEXT).optional(),
  clef: z.enum(['sol', 'fa', 'ut']).optional().default('sol'),
  aliases: z.array(z.string().max(MAX_LENGTHS.SHORT_TEXT)).max(MAX_ARRAY_SIZES.SMALL).optional(),
});

export const updateInstrumentSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.SHORT_TEXT),
  tuning: z.string().max(MAX_LENGTHS.SHORT_TEXT).optional(),
  clef: z.enum(['sol', 'fa', 'ut']).optional(),
});

export const addAliasSchema = z.object({
  alias: z.string().min(1, 'Alias is verplicht.').max(MAX_LENGTHS.SHORT_TEXT),
});

// Orchestra schemas
export const createOrchestraSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

export const updateOrchestraSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

// Music List schemas
export const createMusicListSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
  orchestraId: z.string().uuid('Ongeldig orkest ID.'),
  listType: z.enum(['regular', 'concert']).optional(),
  concertDate: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  concertLocation: z.string().max(MAX_LENGTHS.MEDIUM_TEXT).nullable().optional(),
});

export const updateMusicListSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
  listType: z.enum(['regular', 'concert']).optional(),
  concertDate: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  concertLocation: z.string().max(MAX_LENGTHS.MEDIUM_TEXT).nullable().optional(),
});

export const reorderMusicListsSchema = z.object({
  orchestraId: z.string().uuid('Ongeldig orkest ID.'),
  listIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.MEDIUM, 'Te veel lijsten.'),
});

export const addPieceToListSchema = z.object({
  pieceId: z.string().uuid('Ongeldig muziekstuk ID.'),
});

export const addTitleToListSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

export const reorderPiecesInListSchema = z.object({
  titleOrder: z.array(z.string().max(MAX_LENGTHS.MEDIUM_TEXT)).max(MAX_ARRAY_SIZES.LARGE, 'Te veel titels.'),
});

// Favorites schemas
export const addFavoriteSchema = z.object({
  musicTitleId: z.string().uuid('Ongeldig titel ID.'),
});

// Practice log schemas
export const createPracticeLogSchema = z.object({
  musicTitleId: z.string().uuid('Ongeldig titel ID.'),
  durationMinutes: z.number().int().min(1, 'Duur moet minimaal 1 minuut zijn.'),
  notes: z.string().nullable().optional(),
});

// PDF annotation schemas
export const createAnnotationSchema = z.object({
  musicPieceId: z.string().uuid('Ongeldig stuk ID.'),
  pageNumber: z.number().int().min(1),
  annotationType: z.enum(['highlight', 'note', 'drawing', 'text']),
  xPosition: z.number(),
  yPosition: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  content: z.string().optional(),
  color: z.string().optional(),
});

export const updateAnnotationSchema = z.object({
  xPosition: z.number().optional(),
  yPosition: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  content: z.string().optional(),
  color: z.string().optional(),
});

// Bulk operations schemas
export const bulkUpdatePiecesSchema = z.object({
  pieceIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.BULK, 'Te veel items voor bulk operatie.'),
  updates: z.object({
    instrumentId: z.string().uuid().nullable().optional(),
    addToListId: z.string().uuid().optional(),
    removeFromListId: z.string().uuid().optional(),
  }),
});

export const bulkDeletePiecesSchema = z.object({
  pieceIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.BULK, 'Te veel items voor bulk operatie.'),
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
  title: z.string().min(1, 'Titel is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
  arranger: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  instrumentId: z.string().uuid().nullable().optional(),
  tuning: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  groupNumber: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  clef: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  youtubeUrl: z.string().url().max(MAX_LENGTHS.LONG_TEXT).nullable().optional(),
});

export const updateTitleMetaSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
  arranger: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  youtubeUrl: z.string().url().max(MAX_LENGTHS.LONG_TEXT).nullable().optional().or(z.literal('')),
  description: z.string().max(MAX_LENGTHS.DESCRIPTION).nullable().optional(),
  durationSeconds: z.number().int().min(0).max(86400).optional(), // Max 24 hours
  grade: z.string().max(MAX_LENGTHS.SHORT_TEXT).nullable().optional(),
  isShared: z.boolean().optional(),
  genreIds: z.array(z.string().uuid()).max(MAX_ARRAY_SIZES.SMALL).optional(),
  internalNotes: z.string().max(MAX_LENGTHS.DESCRIPTION).nullable().optional(),
});

// Share music piece schema
export const shareMusicPieceSchema = z.object({
  associationId: z.string().uuid('Ongeldig vereniging ID.'),
});

// Association schemas
export const createAssociationSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

export const updateAssociationSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.').max(MAX_LENGTHS.MEDIUM_TEXT),
});

// Event schemas (used with the validate() middleware, see middleware/validate.ts)
export const createEventSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  eventType: z.string().optional(),
  status: z.enum(['planned', 'confirmed', 'cancelled', 'completed']).optional(),
  locationId: z.string().uuid().optional().nullable(),
  locationName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  indoorOutdoor: z.enum(['indoor', 'outdoor', 'both']).optional(),
  startDatetime: z.string().min(1, 'Start datum/tijd is verplicht'),
  endDatetime: z.string().optional(),
  setupTime: z.string().optional(),
  soundcheckTime: z.string().optional(),
  doorsTime: z.string().optional(),
  performanceTime: z.string().optional(),
  breakTime: z.string().optional(),
  packDownTime: z.string().optional(),
  expectedAudience: z.number().int().min(0).optional(),
  dressCode: z.string().optional(),
  description: z.string().optional(),
  internalNotes: z.string().optional(),
  publicNotes: z.string().optional(),
  feeAmount: z.number().optional(),
  feeCurrency: z.string().optional(),
  expensesBudget: z.number().optional(),
  isPublic: z.boolean().optional(),
  requiresTickets: z.boolean().optional(),
  weatherSensitive: z.boolean().optional(),
  backupLocationId: z.string().uuid().optional().nullable(),
  backupLocationName: z.string().optional(),
  concertId: z.string().uuid().optional().nullable(),
  orchestraIds: z.array(z.string().uuid()).optional(),
});

export const updateEventAttendanceSchema = z.object({
  status: z.enum(['pending', 'attending', 'not_attending', 'maybe']),
  instrumentId: z.string().uuid().optional().nullable(),
  transportNeeded: z.boolean().optional(),
  canDrive: z.boolean().optional(),
  availableSeats: z.number().int().min(0).optional(),
  dietaryRequirements: z.string().optional(),
  notes: z.string().optional(),
});

// Concert schemas (used with the validate() middleware)
export const createConcertSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  date: z.string().min(1, 'Datum is verplicht'),
  endDate: z.string().optional(),
  location: z.string().optional(),
  venueType: z.string().optional(),
  concertType: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  // Accessibility fields
  wheelchairSpaces: z.number().int().min(0).optional(),
  companionSpaces: z.number().int().min(0).optional(),
  hearingLoopAvailable: z.boolean().optional(),
  accessibleParkingInfo: z.string().optional(),
  accessibilityInfo: z.string().optional(),
  accessibilityContactEmail: z.string().email().optional().or(z.literal('')),
  accessibilityContactPhone: z.string().optional(),
});

export const updateConcertSchema = createConcertSchema.partial();

// Export max lengths for use in other validation
export { MAX_LENGTHS, MAX_ARRAY_SIZES };

// Validation helper
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Safe validation (returns result object instead of throwing)
export function validateSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
