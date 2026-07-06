import { WelcomeEmailData, EmailContent } from './types';

export function getWelcomeEmailContent(data: WelcomeEmailData): EmailContent {
  const subject = `Welcome to ${data.associationName} - Harmonie App`;

  const text = `
Hello ${data.userName},

An account has been created for you in the Harmonie App of ${data.associationName}.

You can log in at:
${data.loginUrl}

Tip: change your password via your profile settings right after your first login.

Enjoy!

Best regards,
The Harmonie Team
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
    <h2>Welcome to ${data.associationName}!</h2>
    <p>Hello ${data.userName},</p>
    <div class="card">
      <p>An account has been created for you in the Harmonie App of <strong>${data.associationName}</strong>.</p>
      <p>Click the button below to log in:</p>
      <a href="${data.loginUrl}" class="button">Log in</a>
      <p>Or copy this link into your browser:<br>
      <a href="${data.loginUrl}">${data.loginUrl}</a></p>
    </div>
    <p><strong>Tip:</strong> change your password via your profile settings right after your first login.</p>
    <div class="footer">
      <p>Enjoy!</p>
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
