import { AvailabilityRequestEmailData, EmailContent } from './types';

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

export function getAvailabilityRequestEmailContent(data: AvailabilityRequestEmailData): EmailContent {
  const formattedDate = formatDate(data.eventDate);
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Geef je beschikbaarheid door voor "${data.eventName}"`;

  const text = `
Hallo ${data.userName},

We willen graag weten of je beschikbaar bent voor de volgende activiteit:

Activiteit: ${data.eventName}
Datum: ${formattedDate}${formattedDeadline ? `\nReageren vóór: ${formattedDeadline}` : ''}

Geef je beschikbaarheid door via:
${data.respondUrl}

Alvast bedankt!

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
    .detail-row { padding: 8px 0; border-bottom: 1px solid #eee; }
    .detail-label { font-weight: 600; display: inline-block; width: 130px; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Beschikbaarheid doorgeven</h2>
    <p>Hallo ${data.userName},</p>
    <p>We willen graag weten of je beschikbaar bent voor de volgende activiteit:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.eventName}</h3>
      <div class="detail-row"><span class="detail-label">Datum:</span><span>${formattedDate}</span></div>
      ${formattedDeadline ? `<div class="detail-row"><span class="detail-label">Reageren vóór:</span><span>${formattedDeadline}</span></div>` : ''}
    </div>
    <a href="${data.respondUrl}" class="button">Beschikbaarheid doorgeven</a>
    <p>Of kopieer deze link in je browser:<br>
    <a href="${data.respondUrl}">${data.respondUrl}</a></p>
    <div class="footer">
      <p>Alvast bedankt!</p>
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
