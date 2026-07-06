import { ConcertReminderEmailData, EmailContent } from './types';

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

export function getConcertReminderEmailContent(data: ConcertReminderEmailData): EmailContent {
  const formattedDate = formatDate(data.concertDate);

  const subject = `Erinnerung: Konzert "${data.concertName}" am ${formattedDate}`;

  const text = `
Hallo ${data.userName},

Eine Erinnerung an das kommende Konzert:

Konzert: ${data.concertName}
Datum: ${formattedDate}${data.location ? `\nOrt: ${data.location}` : ''}${data.startTime ? `\nBeginn: ${data.startTime}` : ''}

Wir zählen auf Ihre Anwesenheit. Viel Erfolg!

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
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Erinnerung: Konzert</h2>
    <p>Hallo ${data.userName},</p>
    <p>Eine Erinnerung an das kommende Konzert:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.concertName}</h3>
      <div class="detail-row"><span class="detail-label">Datum:</span><span>${formattedDate}</span></div>
      ${data.location ? `<div class="detail-row"><span class="detail-label">Ort:</span><span>${data.location}</span></div>` : ''}
      ${data.startTime ? `<div class="detail-row"><span class="detail-label">Beginn:</span><span>${data.startTime}</span></div>` : ''}
    </div>
    <p>Wir zählen auf Ihre Anwesenheit. Viel Erfolg!</p>
    <div class="footer">
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
