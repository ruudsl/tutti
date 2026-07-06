import { WelcomeEmailData, EmailContent } from './types';

export function getWelcomeEmailContent(data: WelcomeEmailData): EmailContent {
  const subject = `Welkom bij ${data.associationName} - Harmonie App`;

  const text = `
Hallo ${data.userName},

Er is een account voor je aangemaakt in de Harmonie App van ${data.associationName}.

Je kunt inloggen via:
${data.loginUrl}

Tip: wijzig na de eerste keer inloggen direct je wachtwoord via je profielinstellingen.

Veel plezier!

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
    .card { background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 20px 0; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Welkom bij ${data.associationName}!</h2>
    <p>Hallo ${data.userName},</p>
    <div class="card">
      <p>Er is een account voor je aangemaakt in de Harmonie App van <strong>${data.associationName}</strong>.</p>
      <p>Klik op de onderstaande knop om in te loggen:</p>
      <a href="${data.loginUrl}" class="button">Inloggen</a>
      <p>Of kopieer deze link in je browser:<br>
      <a href="${data.loginUrl}">${data.loginUrl}</a></p>
    </div>
    <p><strong>Tip:</strong> wijzig na de eerste keer inloggen direct je wachtwoord via je profielinstellingen.</p>
    <div class="footer">
      <p>Veel plezier!</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
