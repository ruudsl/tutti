import { AccountVerificationEmailData, EmailContent } from './types';

export function getAccountVerificationEmailContent(data: AccountVerificationEmailData): EmailContent {
  const subject = 'Bevestig je e-mailadres - Harmonie App';

  const text = `
Hallo ${data.userName},

Bedankt voor je registratie bij de Harmonie App.

Klik op de volgende link om je e-mailadres te bevestigen:
${data.verificationUrl}

Als je geen account hebt aangemaakt, kun je deze email negeren.

Met vriendelijke groet,
Het Harmonie Team
`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Bevestig je e-mailadres</h2>
    <p>Hallo ${data.userName},</p>
    <p>Bedankt voor je registratie bij de Harmonie App.</p>
    <p>Klik op de onderstaande knop om je e-mailadres te bevestigen:</p>
    <a href="${data.verificationUrl}" class="button">E-mailadres bevestigen</a>
    <p>Of kopieer deze link in je browser:<br>
    <a href="${data.verificationUrl}">${data.verificationUrl}</a></p>
    <div class="footer">
      <p>Als je geen account hebt aangemaakt, kun je deze email negeren.</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
