import { PasswordResetEmailData, EmailContent } from './types';

export function getPasswordResetEmailContent(data: PasswordResetEmailData): EmailContent {
  const subject = 'Reset your password - Harmonie App';

  const text = `
Hello ${data.userName},

You have requested to reset your password for the Harmonie App.

Click the following link to set a new password:
${data.resetUrl}

This link is valid for 1 hour.

If you did not request a password reset, you can safely ignore this email.

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
    <h2>Reset your password</h2>
    <p>Hello ${data.userName},</p>
    <p>You have requested to reset your password for the Harmonie App.</p>
    <p>Click the button below to set a new password:</p>
    <a href="${data.resetUrl}" class="button">Reset password</a>
    <p>Or copy this link into your browser:<br>
    <a href="${data.resetUrl}">${data.resetUrl}</a></p>
    <p><strong>This link is valid for 1 hour.</strong></p>
    <div class="footer">
      <p>If you did not request a password reset, you can safely ignore this email.</p>
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
