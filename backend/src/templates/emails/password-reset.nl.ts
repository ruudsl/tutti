import { PasswordResetEmailData, EmailContent } from './types';

export function getPasswordResetEmailContent(data: PasswordResetEmailData): EmailContent {
  const subject = 'Wachtwoord herstellen - Harmonie App';

  const text = `
Hallo ${data.userName},

Je hebt een verzoek ingediend om je wachtwoord te herstellen voor de Harmonie App.

Klik op de volgende link om een nieuw wachtwoord in te stellen:
${data.resetUrl}

Deze link is 1 uur geldig.

Als je geen wachtwoord reset hebt aangevraagd, kun je deze email negeren.

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
    <h2>Wachtwoord herstellen</h2>
    <p>Hallo ${data.userName},</p>
    <p>Je hebt een verzoek ingediend om je wachtwoord te herstellen voor de Harmonie App.</p>
    <p>Klik op de onderstaande knop om een nieuw wachtwoord in te stellen:</p>
    <a href="${data.resetUrl}" class="button">Wachtwoord herstellen</a>
    <p>Of kopieer deze link in je browser:<br>
    <a href="${data.resetUrl}">${data.resetUrl}</a></p>
    <p><strong>Deze link is 1 uur geldig.</strong></p>
    <div class="footer">
      <p>Als je geen wachtwoord reset hebt aangevraagd, kun je deze email negeren.</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
