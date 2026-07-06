import { PollNotificationEmailData, EmailContent } from './types';

/**
 * Format date according to English locale
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getPollNotificationEmailContent(data: PollNotificationEmailData): EmailContent {
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `New poll: "${data.pollTitle}"`;

  const text = `
Hello ${data.userName},

A new poll is waiting for you: "${data.pollTitle}".
${formattedDeadline ? `\nThe poll closes on ${formattedDeadline}.\n` : ''}
Cast your vote at:
${data.pollUrl}

Thank you for participating!

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
    <h2>New poll</h2>
    <p>Hello ${data.userName},</p>
    <div class="card">
      <p>A new poll is waiting for you:</p>
      <h3 style="margin: 8px 0;">${data.pollTitle}</h3>
      ${formattedDeadline ? `<p>The poll closes on <strong>${formattedDeadline}</strong>.</p>` : ''}
    </div>
    <a href="${data.pollUrl}" class="button">Vote now</a>
    <p>Or copy this link into your browser:<br>
    <a href="${data.pollUrl}">${data.pollUrl}</a></p>
    <div class="footer">
      <p>Thank you for participating!</p>
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
