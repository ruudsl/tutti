import { PollNotificationEmailData, EmailContent } from './types';

/**
 * Format date according to German locale
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function getPollNotificationEmailContent(data: PollNotificationEmailData): EmailContent {
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Neue Umfrage: "${data.pollTitle}"`;

  const text = `
Hallo ${data.userName},

Eine neue Umfrage wartet auf Sie: "${data.pollTitle}".
${formattedDeadline ? `\nDie Umfrage endet am ${formattedDeadline}.\n` : ''}
Geben Sie Ihre Stimme ab unter:
${data.pollUrl}

Vielen Dank für Ihre Teilnahme!

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
    <h2>Neue Umfrage</h2>
    <p>Hallo ${data.userName},</p>
    <div class="card">
      <p>Eine neue Umfrage wartet auf Sie:</p>
      <h3 style="margin: 8px 0;">${data.pollTitle}</h3>
      ${formattedDeadline ? `<p>Die Umfrage endet am <strong>${formattedDeadline}</strong>.</p>` : ''}
    </div>
    <a href="${data.pollUrl}" class="button">Jetzt abstimmen</a>
    <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
    <a href="${data.pollUrl}">${data.pollUrl}</a></p>
    <div class="footer">
      <p>Vielen Dank für Ihre Teilnahme!</p>
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
