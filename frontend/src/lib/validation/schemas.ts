import { z } from 'zod';

/**
 * Common validation patterns used across the application
 */

// ============================================
// Base field schemas
// ============================================

/** Email field with validation */
export const emailSchema = z.string().min(1).email();

/** Password field with minimum length */
export const passwordSchema = z.string().min(8);

/** Optional password (for edit forms where password change is optional) */
export const optionalPasswordSchema = z.string().min(8).optional().or(z.literal(''));

/** Name field (first name, last name, etc.) */
export const nameSchema = z.string().min(1).max(100);

/** Optional text field */
export const optionalTextSchema = z.string().max(500).optional().or(z.literal(''));

/** Required text field */
export const requiredTextSchema = z.string().min(1).max(500);

/** URL field */
export const urlSchema = z.string().url().optional().or(z.literal(''));

/** Date string in ISO format */
export const dateSchema = z.string().refine(
  (val) => !val || !isNaN(Date.parse(val)),
  { message: 'Invalid date format' }
);

/** Time string in HH:mm format */
export const timeSchema = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
  message: 'Invalid time format (HH:mm)',
});

/** UUID field */
export const uuidSchema = z.string().uuid();

/** Array of UUIDs (for multi-select fields) */
export const uuidArraySchema = z.array(z.string().uuid()).default([]);

// ============================================
// User schemas
// ============================================

/** Schema for creating a new user */
export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(['member', 'admin', 'music_committee', 'equipment_committee', 'uniforms_committee', 'conductor']).default('member'),
  instrumentIds: z.array(z.string()).default([]),
  orchestraIds: z.array(z.string()).default([]),
});

export type CreateUserFormData = z.infer<typeof createUserSchema>;

/** Schema for updating a user */
export const updateUserSchema = z.object({
  email: emailSchema,
  password: optionalPasswordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(['member', 'admin', 'music_committee', 'equipment_committee', 'uniforms_committee', 'conductor']).default('member'),
  instrumentIds: z.array(z.string()).default([]),
  orchestraIds: z.array(z.string()).default([]),
});

export type UpdateUserFormData = z.infer<typeof updateUserSchema>;

// ============================================
// Authentication schemas
// ============================================

/** Schema for login form */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  mfaCode: z.string().length(6).regex(/^\d+$/).optional().or(z.literal('')),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/** Schema for password reset request */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/** Schema for resetting password */
export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

/** Schema for changing password */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

// ============================================
// Concert schemas
// ============================================

/** Schema for creating/updating a concert */
export const concertSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().min(1),
  endDate: z.string().optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  venueType: z.string().optional().or(z.literal('')),
  concertType: z.string().optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export type ConcertFormData = z.infer<typeof concertSchema>;

// ============================================
// Rehearsal schemas
// ============================================

/** Schema for creating/updating a rehearsal */
export const rehearsalSchema = z.object({
  date: z.string().min(1),
  startTime: timeSchema,
  endTime: timeSchema,
  location: z.string().max(200).optional().or(z.literal('')),
  type: z.string().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  orchestraId: z.string().optional().or(z.literal('')),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    return data.startTime < data.endTime;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export type RehearsalFormData = z.infer<typeof rehearsalSchema>;

// ============================================
// Equipment schemas
// ============================================

/** Schema for creating/updating equipment */
export const equipmentSchema = z.object({
  instrumentType: z.string().min(1).max(100),
  brandModel: z.string().max(200).optional().or(z.literal('')),
  serialNumber: z.string().max(100).optional().or(z.literal('')),
  yearOfManufacture: z.coerce.number().int().min(1800).max(2100).optional().nullable(),
  status: z.enum(['available', 'on_loan', 'in_repair', 'written_off', 'personal']).default('available'),
  currentUserId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().or(z.literal('')),
  maintenanceIntervalMonths: z.coerce.number().int().min(1).max(120).optional().nullable(),
  lastMaintenanceDate: z.string().optional().or(z.literal('')),
  purchasePrice: z.coerce.number().min(0).optional().nullable(),
  currentValue: z.coerce.number().min(0).optional().nullable(),
});

export type EquipmentFormData = z.infer<typeof equipmentSchema>;

// ============================================
// Music list schemas
// ============================================

/** Schema for creating/updating a music list */
export const musicListSchema = z.object({
  name: z.string().min(1).max(200),
  orchestraId: z.string().min(1),
  listType: z.enum(['regular', 'concert']).default('regular'),
  concertDate: z.string().optional().nullable(),
  concertLocation: z.string().max(200).optional().nullable(),
});

export type MusicListFormData = z.infer<typeof musicListSchema>;

// ============================================
// Onboarding schemas
// ============================================

/** Schema for member onboarding */
export const onboardingSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  privateEmail: z.string().email().optional().or(z.literal('')),
  instrumentIds: z.array(z.string()).default([]),
  orchestraIds: z.array(z.string()).default([]),
  createM365Account: z.boolean().default(false),
  addToPercussionGroup: z.boolean().default(false),
});

export type OnboardingFormData = z.infer<typeof onboardingSchema>;

// ============================================
// Guest list schemas
// ============================================

/** Schema for adding a guest to the guest list */
export const guestSchema = z.object({
  name: z.string().min(1).max(200),
  email: emailSchema,
  ticketCount: z.coerce.number().int().min(1).max(20),
  ticketTypeId: z.string().optional().nullable(),
  organisation: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type GuestFormData = z.infer<typeof guestSchema>;

// ============================================
// Loan schemas
// ============================================

/** Schema for creating a music loan */
export const loanSchema = z.object({
  musicTitleId: z.string().min(1),
  borrowerName: z.string().min(1).max(200),
  borrowerEmail: z.string().email().optional().or(z.literal('')),
  borrowerOrganization: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
  expectedReturn: z.string().optional().or(z.literal('')),
});

export type LoanFormData = z.infer<typeof loanSchema>;
