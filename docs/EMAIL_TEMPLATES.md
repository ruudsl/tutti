# Email Templates

This document describes the email templates used in Tutti for transactional emails.

## Overview

Tutti uses TypeScript-based email templates that generate both plain text and HTML versions of emails. Templates support multiple languages (Dutch, English, German).

## Template Location

Email templates are located in:

```
/backend/src/templates/emails/
```

## Structure

Each template exists in three language variants:

```
{template-name}.nl.ts
{template-name}.en.ts
{template-name}.de.ts
```

Every variant exports a `get{Name}EmailContent(data)` function that returns `{ subject, text, html }`. Shared data interfaces live in `/backend/src/templates/emails/types.ts`.

### Language selector helper

`/backend/src/templates/emails/index.ts` is the central entry point. It exports:

- `resolveEmailLanguage(language?: string | null): EmailLanguage` — normalizes any value to `'nl' | 'en' | 'de'`, defaulting to `'nl'` (users currently have no stored language preference, so most callers omit the argument).
- One selector per template that picks the right language variant and renders it, e.g.:

```typescript
import { getWelcomeEmail } from '../templates/emails';

const { subject, text, html } = getWelcomeEmail(
  { userName, associationName, loginUrl },
  'de', // optional; defaults to 'nl'
);
await sendEmail({ to, subject, text, html });
```

Available selectors: `getPasswordResetEmail`, `getWelcomeEmail`, `getRehearsalReminderEmail`, `getConcertReminderEmail`, `getAvailabilityRequestEmail`, `getPollNotificationEmail`, `getTaskAssignmentEmail`, `getAccountVerificationEmail`.

The ticket confirmation template predates this helper and has its own selector in `/backend/src/services/ticketing.ts` (`getEmailContentGenerator`).

## Available Templates

### Ticket Confirmation (`ticket-confirmation.{lang}.ts`)

Sent when a user purchases tickets for a concert.

**Languages:** `nl`, `en`, `de`

**Data Interface:**

```typescript
interface TicketEmailData {
  buyerName: string;
  buyerEmail: string;
  concertName: string;
  concertDate: string;
  concertLocation: string;
  ticketTypeName: string;
  quantity: number;
  orderTotal: number;
  ticketCode: string;
  qrCodeDataUrl: string;
  organizationName: string;
}
```

**Subject:** "Uw tickets voor {concertName}" (NL)

**Content includes:**

- Buyer greeting
- Concert details (name, date, location)
- Ticket information (type, quantity, total)
- Ticket code
- QR code (in HTML version)
- Organization footer

### Password Reset (`password-reset.{lang}.ts`)

Sent when a user requests a password reset. Wired up in `sendPasswordResetEmail` in `/backend/src/utils/email.ts`, called from the `/auth/forgot-password` route.

```typescript
interface PasswordResetEmailData {
  userName: string;
  resetUrl: string; // link with reset token, valid for 1 hour
}
```

### Welcome (`welcome.{lang}.ts`)

Sent when an admin creates a new user account. Wired up in the `POST /users` route (`/backend/src/routes/users.ts`); failures are logged but never block account creation.

```typescript
interface WelcomeEmailData {
  userName: string;
  associationName: string;
  loginUrl: string;
}
```

### Rehearsal Reminder (`rehearsal-reminder.{lang}.ts`)

Reminder for a single upcoming rehearsal. **Not yet wired to a flow.** The weekly digest (`/backend/src/scheduler/email-digest.ts`) aggregates all upcoming rehearsals into one summary e-mail with its own combined format, so this per-rehearsal template does not fit there. Intended integration point: a day-before rehearsal reminder scheduler, once such a job exists.

```typescript
interface RehearsalReminderEmailData {
  userName: string;
  rehearsalDate: string; // ISO date
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  orchestraName?: string | null;
  program?: string[]; // pieces on the programme
}
```

### Concert Reminder (`concert-reminder.{lang}.ts`)

Reminder for an upcoming concert (date, location, start time). **Not yet wired to a flow.** Intended integration point: a concert reminder scheduler or the concerts routes (`/backend/src/routes/concerts.ts`).

```typescript
interface ConcertReminderEmailData {
  userName: string;
  concertName: string;
  concertDate: string; // ISO date
  location?: string | null;
  startTime?: string | null; // aanvang
}
```

### Availability Request (`availability-request.{lang}.ts`)

Asks a member to submit their availability for an event. **Not yet wired to a flow.** Intended integration point: the attendance/availability routes once a "request availability" action exists.

```typescript
interface AvailabilityRequestEmailData {
  userName: string;
  eventName: string;
  eventDate: string; // ISO date
  respondUrl: string;
  deadline?: string | null; // ISO date
}
```

### Poll Notification (`poll-notification.{lang}.ts`)

Notifies members of a new poll. **Not yet wired to a flow.** Poll creation (`POST /polls`) currently sends no e-mail; the existing `POST /polls/:id/remind` route sends a differently-worded _reminder_ to non-voters and keeps its own copy. Intended integration point: poll creation in `/backend/src/routes/polls.ts`.

```typescript
interface PollNotificationEmailData {
  userName: string;
  pollTitle: string;
  deadline?: string | null; // ISO date; poll closing date
  pollUrl: string;
}
```

### Task Assignment (`task-assignment.{lang}.ts`)

Notifies a member that a task has been assigned to them. **Not yet wired to a flow.** Intended integration point: the tasks routes once task assignment sends e-mail.

```typescript
interface TaskAssignmentEmailData {
  userName: string;
  taskTitle: string;
  deadline?: string | null; // ISO date
  taskUrl: string;
  assignedBy?: string | null;
}
```

### Account Verification (`account-verification.{lang}.ts`)

Asks a user to verify their e-mail address via a verification link. **Not yet wired to a flow.** There is currently no self-registration/e-mail-verification flow in the backend; integrate this once one exists.

```typescript
interface AccountVerificationEmailData {
  userName: string;
  verificationUrl: string;
}
```

## Creating New Templates

### 1. Create the template file

Create a new file in `/backend/src/templates/emails/` with the naming convention:

```
{template-name}.{lang}.ts
```

### 2. Template structure

```typescript
import { YourEmailData, EmailContent } from './types';

export function getYourEmailContent(data: YourEmailData): EmailContent {
  const subject = `Your subject line`;

  const text = `
Plain text version of the email.
Include all important information here.
  `;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Inline styles for email compatibility */
  </style>
</head>
<body>
  <!-- HTML version with styling -->
</body>
</html>
  `;

  return { subject, text, html };
}
```

### 3. Best practices

- **Always include plain text:** Some email clients don't render HTML
- **Inline CSS:** Email clients strip `<style>` tags; use inline styles
- **Test across clients:** Gmail, Outlook, Apple Mail all render differently
- **Keep it simple:** Avoid complex layouts that may break
- **Include unsubscribe link:** Required for marketing emails (GDPR)
- **Mobile-friendly:** Use responsive design patterns

## Localization

Each template has language-specific versions. When adding a new template:

1. Create the Dutch version first (`template.nl.ts`)
2. Create English version (`template.en.ts`)
3. Create German version (`template.de.ts`)
4. Add the data interface to `types.ts` and a selector function to `index.ts` so callers can pick the variant by language (defaults to `nl`)

## Email Service Integration

Templates are used together with `sendEmail` from `/backend/src/utils/email.ts`:

```typescript
import { sendEmail } from '../utils/email';
import { getPollNotificationEmail } from '../templates/emails';

const { subject, text, html } = getPollNotificationEmail(data /*, language */);
await sendEmail({
  to: user.email,
  subject,
  text,
  html,
  associationId, // optional: selects the association's SMTP config
});
```

## Testing Templates

To preview email templates during development:

1. Use a tool like [Mailtrap](https://mailtrap.io/) or [Mailhog](https://github.com/mailhog/MailHog)
2. Configure SMTP settings to point to the test service
3. Trigger the email flow in the application
4. Review the rendered email

## Template Status

- [x] Password reset — integrated (`sendPasswordResetEmail` in `/backend/src/utils/email.ts`)
- [x] Welcome email (new user) — integrated (`POST /users` in `/backend/src/routes/users.ts`)
- [x] Rehearsal reminder — template ready, awaiting a per-rehearsal reminder flow
- [x] Concert reminder — template ready, awaiting a concert reminder flow
- [x] Availability request — template ready, awaiting an availability request flow
- [x] Poll notification — template ready, awaiting e-mail notification on poll creation
- [x] Task assignment — template ready, awaiting e-mail notification on task assignment
- [x] Account verification — template ready, awaiting a self-registration/verification flow
