/**
 * Central entry point for e-mail templates.
 *
 * Every template exists in three language variants ({name}.nl.ts, {name}.en.ts,
 * {name}.de.ts). This module exposes one selector function per template that
 * picks the right language variant (defaulting to Dutch) and renders it.
 *
 * Usage:
 *   import { getWelcomeEmail } from '../templates/emails';
 *   const { subject, text, html } = getWelcomeEmail(data, user.language);
 *   await sendEmail({ to, subject, text, html });
 */

import {
  EmailContent,
  EmailLanguage,
  EmailTemplateVariants,
  PasswordResetEmailData,
  WelcomeEmailData,
  RehearsalReminderEmailData,
  ConcertReminderEmailData,
  AvailabilityRequestEmailData,
  PollNotificationEmailData,
  TaskAssignmentEmailData,
  AccountVerificationEmailData,
} from './types';

import { getPasswordResetEmailContent as passwordResetNl } from './password-reset.nl';
import { getPasswordResetEmailContent as passwordResetEn } from './password-reset.en';
import { getPasswordResetEmailContent as passwordResetDe } from './password-reset.de';

import { getWelcomeEmailContent as welcomeNl } from './welcome.nl';
import { getWelcomeEmailContent as welcomeEn } from './welcome.en';
import { getWelcomeEmailContent as welcomeDe } from './welcome.de';

import { getRehearsalReminderEmailContent as rehearsalReminderNl } from './rehearsal-reminder.nl';
import { getRehearsalReminderEmailContent as rehearsalReminderEn } from './rehearsal-reminder.en';
import { getRehearsalReminderEmailContent as rehearsalReminderDe } from './rehearsal-reminder.de';

import { getConcertReminderEmailContent as concertReminderNl } from './concert-reminder.nl';
import { getConcertReminderEmailContent as concertReminderEn } from './concert-reminder.en';
import { getConcertReminderEmailContent as concertReminderDe } from './concert-reminder.de';

import { getAvailabilityRequestEmailContent as availabilityRequestNl } from './availability-request.nl';
import { getAvailabilityRequestEmailContent as availabilityRequestEn } from './availability-request.en';
import { getAvailabilityRequestEmailContent as availabilityRequestDe } from './availability-request.de';

import { getPollNotificationEmailContent as pollNotificationNl } from './poll-notification.nl';
import { getPollNotificationEmailContent as pollNotificationEn } from './poll-notification.en';
import { getPollNotificationEmailContent as pollNotificationDe } from './poll-notification.de';

import { getTaskAssignmentEmailContent as taskAssignmentNl } from './task-assignment.nl';
import { getTaskAssignmentEmailContent as taskAssignmentEn } from './task-assignment.en';
import { getTaskAssignmentEmailContent as taskAssignmentDe } from './task-assignment.de';

import { getAccountVerificationEmailContent as accountVerificationNl } from './account-verification.nl';
import { getAccountVerificationEmailContent as accountVerificationEn } from './account-verification.en';
import { getAccountVerificationEmailContent as accountVerificationDe } from './account-verification.de';

// Re-export types so callers only need one import path
export * from './types';

/**
 * Normalize an arbitrary language value to a supported e-mail language.
 * Defaults to Dutch ('nl'), the app's primary language. Users have no stored
 * language preference (yet), so callers typically omit the language argument.
 */
export function resolveEmailLanguage(language?: string | null): EmailLanguage {
  return language === 'en' || language === 'de' ? language : 'nl';
}

/**
 * Pick the language variant of a template and render it with the given data.
 */
function renderTemplate<TData>(
  variants: EmailTemplateVariants<TData>,
  data: TData,
  language?: string | null,
): EmailContent {
  return variants[resolveEmailLanguage(language)](data);
}

export function getPasswordResetEmail(data: PasswordResetEmailData, language?: string | null): EmailContent {
  return renderTemplate({ nl: passwordResetNl, en: passwordResetEn, de: passwordResetDe }, data, language);
}

export function getWelcomeEmail(data: WelcomeEmailData, language?: string | null): EmailContent {
  return renderTemplate({ nl: welcomeNl, en: welcomeEn, de: welcomeDe }, data, language);
}

export function getRehearsalReminderEmail(data: RehearsalReminderEmailData, language?: string | null): EmailContent {
  return renderTemplate({ nl: rehearsalReminderNl, en: rehearsalReminderEn, de: rehearsalReminderDe }, data, language);
}

export function getConcertReminderEmail(data: ConcertReminderEmailData, language?: string | null): EmailContent {
  return renderTemplate({ nl: concertReminderNl, en: concertReminderEn, de: concertReminderDe }, data, language);
}

export function getAvailabilityRequestEmail(
  data: AvailabilityRequestEmailData,
  language?: string | null,
): EmailContent {
  return renderTemplate(
    { nl: availabilityRequestNl, en: availabilityRequestEn, de: availabilityRequestDe },
    data,
    language,
  );
}

export function getPollNotificationEmail(data: PollNotificationEmailData, language?: string | null): EmailContent {
  return renderTemplate({ nl: pollNotificationNl, en: pollNotificationEn, de: pollNotificationDe }, data, language);
}

export function getTaskAssignmentEmail(data: TaskAssignmentEmailData, language?: string | null): EmailContent {
  return renderTemplate({ nl: taskAssignmentNl, en: taskAssignmentEn, de: taskAssignmentDe }, data, language);
}

export function getAccountVerificationEmail(
  data: AccountVerificationEmailData,
  language?: string | null,
): EmailContent {
  return renderTemplate(
    { nl: accountVerificationNl, en: accountVerificationEn, de: accountVerificationDe },
    data,
    language,
  );
}
