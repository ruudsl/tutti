# Email Templates

This document describes the email templates used in Tutti for transactional emails.

## Overview

Tutti uses TypeScript-based email templates that generate both plain text and HTML versions of emails. Templates support multiple languages (Dutch, English, German).

## Template Location

Email templates are located in:
```
/backend/src/templates/emails/
```

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

## Creating New Templates

### 1. Create the template file

Create a new file in `/backend/src/templates/emails/` with the naming convention:
```
{template-name}.{lang}.ts
```

### 2. Template structure

```typescript
import { YourDataType } from '../../services/yourService';

export function getYourEmailContent(data: YourDataType): { 
  subject: string; 
  text: string; 
  html: string;
} {
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
4. Update the email service to select the correct template based on user language

## Email Service Integration

Templates are used by the email service in `/backend/src/services/email.ts`:

```typescript
import { getTicketEmailContent } from '../templates/emails/ticket-confirmation.nl';

// Send email
const { subject, text, html } = getTicketEmailContent(data);
await sendEmail({
  to: data.buyerEmail,
  subject,
  text,
  html,
});
```

## Testing Templates

To preview email templates during development:

1. Use a tool like [Mailtrap](https://mailtrap.io/) or [Mailhog](https://github.com/mailhog/MailHog)
2. Configure SMTP settings to point to the test service
3. Trigger the email flow in the application
4. Review the rendered email

## Future Templates to Add

The following email templates should be created:

- [ ] Password reset
- [ ] Welcome email (new user)
- [ ] Rehearsal reminder
- [ ] Concert reminder
- [ ] Availability request
- [ ] Poll notification
- [ ] Task assignment
- [ ] Account verification
