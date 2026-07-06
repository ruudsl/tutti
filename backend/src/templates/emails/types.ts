/**
 * Shared types for e-mail templates.
 *
 * Every template exists in three language variants ({name}.nl.ts, {name}.en.ts,
 * {name}.de.ts). Each variant exports a function that takes the template's data
 * interface and returns an EmailContent object.
 */

/** The rendered content of an e-mail template. */
export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Languages supported by the e-mail templates. */
export type EmailLanguage = 'nl' | 'en' | 'de';

/** A single language variant of a template. */
export type EmailTemplate<TData> = (data: TData) => EmailContent;

/** All language variants of a template. */
export type EmailTemplateVariants<TData> = Record<EmailLanguage, EmailTemplate<TData>>;

/** Data for the password reset e-mail. */
export interface PasswordResetEmailData {
  userName: string;
  resetUrl: string;
}

/** Data for the welcome e-mail (new account). */
export interface WelcomeEmailData {
  userName: string;
  associationName: string;
  loginUrl: string;
}

/** Data for the rehearsal reminder e-mail. */
export interface RehearsalReminderEmailData {
  userName: string;
  /** ISO date string (e.g. "2026-07-05") */
  rehearsalDate: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  orchestraName?: string | null;
  /** Pieces on the programme, if known. */
  program?: string[];
}

/** Data for the concert reminder e-mail. */
export interface ConcertReminderEmailData {
  userName: string;
  concertName: string;
  /** ISO date string */
  concertDate: string;
  location?: string | null;
  /** Start time of the concert (aanvang). */
  startTime?: string | null;
}

/** Data for the availability request e-mail. */
export interface AvailabilityRequestEmailData {
  userName: string;
  eventName: string;
  /** ISO date string */
  eventDate: string;
  /** Link where the user can submit their availability. */
  respondUrl: string;
  /** Optional deadline (ISO date string) for responding. */
  deadline?: string | null;
}

/** Data for the poll notification e-mail (new poll). */
export interface PollNotificationEmailData {
  userName: string;
  pollTitle: string;
  /** Optional deadline (ISO date string) after which the poll closes. */
  deadline?: string | null;
  pollUrl: string;
}

/** Data for the task assignment e-mail. */
export interface TaskAssignmentEmailData {
  userName: string;
  taskTitle: string;
  /** Optional deadline (ISO date string). */
  deadline?: string | null;
  taskUrl: string;
  /** Name of the person who assigned the task. */
  assignedBy?: string | null;
}

/** Data for the account verification e-mail. */
export interface AccountVerificationEmailData {
  userName: string;
  verificationUrl: string;
}
