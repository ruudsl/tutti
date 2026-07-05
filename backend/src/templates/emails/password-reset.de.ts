import { PasswordResetEmailData, EmailContent } from './types';

export function getPasswordResetEmailContent(data: PasswordResetEmailData): EmailContent {
  const subject = 'Passwort zurücksetzen - Harmonie App';

  const text = `
Hallo ${data.userName},

Sie haben angefordert, Ihr Passwort für die Harmonie App zurückzusetzen.

Klicken Sie auf den folgenden Link, um ein neues Passwort festzulegen:
${data.resetUrl}

Dieser Link ist 1 Stunde gültig.

Wenn Sie keine Passwort-Zurücksetzung angefordert haben, können Sie diese E-Mail ignorieren.

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
    <h2>Passwort zurücksetzen</h2>
    <p>Hallo ${data.userName},</p>
    <p>Sie haben angefordert, Ihr Passwort für die Harmonie App zurückzusetzen.</p>
    <p>Klicken Sie auf die Schaltfläche unten, um ein neues Passwort festzulegen:</p>
    <a href="${data.resetUrl}" class="button">Passwort zurücksetzen</a>
    <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
    <a href="${data.resetUrl}">${data.resetUrl}</a></p>
    <p><strong>Dieser Link ist 1 Stunde gültig.</strong></p>
    <div class="footer">
      <p>Wenn Sie keine Passwort-Zurücksetzung angefordert haben, können Sie diese E-Mail ignorieren.</p>
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
