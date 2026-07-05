import { ConcertReminderEmailData, EmailContent } from './types';

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

export function getConcertReminderEmailContent(data: ConcertReminderEmailData): EmailContent {
  const formattedDate = formatDate(data.concertDate);

  const subject = `Reminder: concert "${data.concertName}" on ${formattedDate}`;

  const text = `
Hello ${data.userName},

A reminder for the upcoming concert:

Concert: ${data.concertName}
Date: ${formattedDate}${data.location ? `\nLocation: ${data.location}` : ''}${data.startTime ? `\nStarts at: ${data.startTime}` : ''}

We are counting on your attendance. Good luck!

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
    .detail-row { padding: 8px 0; border-bottom: 1px solid #eee; }
    .detail-label { font-weight: 600; display: inline-block; width: 130px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Reminder: concert</h2>
    <p>Hello ${data.userName},</p>
    <p>A reminder for the upcoming concert:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.concertName}</h3>
      <div class="detail-row"><span class="detail-label">Date:</span><span>${formattedDate}</span></div>
      ${data.location ? `<div class="detail-row"><span class="detail-label">Location:</span><span>${data.location}</span></div>` : ''}
      ${data.startTime ? `<div class="detail-row"><span class="detail-label">Starts at:</span><span>${data.startTime}</span></div>` : ''}
    </div>
    <p>We are counting on your attendance. Good luck!</p>
    <div class="footer">
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
