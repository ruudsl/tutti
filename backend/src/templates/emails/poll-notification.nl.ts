import { PollNotificationEmailData, EmailContent } from './types';

/**
 * Format date according to Dutch locale
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getPollNotificationEmailContent(data: PollNotificationEmailData): EmailContent {
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Nieuwe peiling: "${data.pollTitle}"`;

  const text = `
Hallo ${data.userName},

Er staat een nieuwe peiling voor je klaar: "${data.pollTitle}".
${formattedDeadline ? `\nDe peiling sluit op ${formattedDeadline}.\n` : ''}
Breng je stem uit via:
${data.pollUrl}

Bedankt voor je deelname!

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
    <h2>Nieuwe peiling</h2>
    <p>Hallo ${data.userName},</p>
    <div class="card">
      <p>Er staat een nieuwe peiling voor je klaar:</p>
      <h3 style="margin: 8px 0;">${data.pollTitle}</h3>
      ${formattedDeadline ? `<p>De peiling sluit op <strong>${formattedDeadline}</strong>.</p>` : ''}
    </div>
    <a href="${data.pollUrl}" class="button">Stem nu</a>
    <p>Of kopieer deze link in je browser:<br>
    <a href="${data.pollUrl}">${data.pollUrl}</a></p>
    <div class="footer">
      <p>Bedankt voor je deelname!</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
