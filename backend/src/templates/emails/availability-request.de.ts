import { AvailabilityRequestEmailData, EmailContent } from './types';

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

export function getAvailabilityRequestEmailContent(data: AvailabilityRequestEmailData): EmailContent {
  const formattedDate = formatDate(data.eventDate);
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Bitte teilen Sie Ihre Verfügbarkeit für "${data.eventName}" mit`;

  const text = `
Hallo ${data.userName},

Wir möchten gerne wissen, ob Sie für die folgende Veranstaltung verfügbar sind:

Veranstaltung: ${data.eventName}
Datum: ${formattedDate}${formattedDeadline ? `\nAntworten bis: ${formattedDeadline}` : ''}

Teilen Sie Ihre Verfügbarkeit hier mit:
${data.respondUrl}

Vielen Dank im Voraus!

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
    .detail-row { padding: 8px 0; border-bottom: 1px solid #eee; }
    .detail-label { font-weight: 600; display: inline-block; width: 130px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verfügbarkeit mitteilen</h2>
    <p>Hallo ${data.userName},</p>
    <p>Wir möchten gerne wissen, ob Sie für die folgende Veranstaltung verfügbar sind:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.eventName}</h3>
      <div class="detail-row"><span class="detail-label">Datum:</span><span>${formattedDate}</span></div>
      ${formattedDeadline ? `<div class="detail-row"><span class="detail-label">Antworten bis:</span><span>${formattedDeadline}</span></div>` : ''}
    </div>
    <a href="${data.respondUrl}" class="button">Verfügbarkeit mitteilen</a>
    <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
    <a href="${data.respondUrl}">${data.respondUrl}</a></p>
    <div class="footer">
      <p>Vielen Dank im Voraus!</p>
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
