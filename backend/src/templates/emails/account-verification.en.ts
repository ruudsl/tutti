import { AccountVerificationEmailData, EmailContent } from './types';

export function getAccountVerificationEmailContent(data: AccountVerificationEmailData): EmailContent {
  const subject = 'Verify your email address - Harmonie App';

  const text = `
Hello ${data.userName},

Thank you for registering with the Harmonie App.

Click the following link to verify your email address:
${data.verificationUrl}

If you did not create an account, you can safely ignore this email.

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
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verify your email address</h2>
    <p>Hello ${data.userName},</p>
    <p>Thank you for registering with the Harmonie App.</p>
    <p>Click the button below to verify your email address:</p>
    <a href="${data.verificationUrl}" class="button">Verify email address</a>
    <p>Or copy this link into your browser:<br>
    <a href="${data.verificationUrl}">${data.verificationUrl}</a></p>
    <div class="footer">
      <p>If you did not create an account, you can safely ignore this email.</p>
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
