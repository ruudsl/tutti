import { WelcomeEmailData, EmailContent } from './types';

export function getWelcomeEmailContent(data: WelcomeEmailData): EmailContent {
  const subject = `Willkommen bei ${data.associationName} - Harmonie App`;

  const text = `
Hallo ${data.userName},

Für Sie wurde ein Konto in der Harmonie App von ${data.associationName} erstellt.

Sie können sich hier anmelden:
${data.loginUrl}

Tipp: Ändern Sie nach der ersten Anmeldung direkt Ihr Passwort in Ihren Profileinstellungen.

Viel Spaß!

Mit freundlichen Grüßen,
Das Harmonie Team
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
    <h2>Willkommen bei ${data.associationName}!</h2>
    <p>Hallo ${data.userName},</p>
    <div class="card">
      <p>Für Sie wurde ein Konto in der Harmonie App von <strong>${data.associationName}</strong> erstellt.</p>
      <p>Klicken Sie auf die Schaltfläche unten, um sich anzumelden:</p>
      <a href="${data.loginUrl}" class="button">Anmelden</a>
      <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
      <a href="${data.loginUrl}">${data.loginUrl}</a></p>
    </div>
    <p><strong>Tipp:</strong> Ändern Sie nach der ersten Anmeldung direkt Ihr Passwort in Ihren Profileinstellungen.</p>
    <div class="footer">
      <p>Viel Spaß!</p>
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
