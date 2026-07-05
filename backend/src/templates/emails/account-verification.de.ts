import { AccountVerificationEmailData, EmailContent } from './types';

export function getAccountVerificationEmailContent(data: AccountVerificationEmailData): EmailContent {
  const subject = 'Bestätigen Sie Ihre E-Mail-Adresse - Harmonie App';

  const text = `
Hallo ${data.userName},

Vielen Dank für Ihre Registrierung bei der Harmonie App.

Klicken Sie auf den folgenden Link, um Ihre E-Mail-Adresse zu bestätigen:
${data.verificationUrl}

Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.

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
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Bestätigen Sie Ihre E-Mail-Adresse</h2>
    <p>Hallo ${data.userName},</p>
    <p>Vielen Dank für Ihre Registrierung bei der Harmonie App.</p>
    <p>Klicken Sie auf die Schaltfläche unten, um Ihre E-Mail-Adresse zu bestätigen:</p>
    <a href="${data.verificationUrl}" class="button">E-Mail-Adresse bestätigen</a>
    <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
    <a href="${data.verificationUrl}">${data.verificationUrl}</a></p>
    <div class="footer">
      <p>Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.</p>
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
