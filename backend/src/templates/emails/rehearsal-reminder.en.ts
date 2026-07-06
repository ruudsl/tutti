import { RehearsalReminderEmailData, EmailContent } from './types';

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

export function getRehearsalReminderEmailContent(data: RehearsalReminderEmailData): EmailContent {
  const formattedDate = formatDate(data.rehearsalDate);
  const timeRange = data.endTime ? `${data.startTime} - ${data.endTime}` : data.startTime;

  const subject = `Reminder: rehearsal on ${formattedDate}`;

  const programText =
    data.program && data.program.length > 0
      ? `\nProgramme:\n${data.program.map((piece) => `- ${piece}`).join('\n')}\n`
      : '';

  const text = `
Hello ${data.userName},

A reminder for the upcoming rehearsal${data.orchestraName ? ` of ${data.orchestraName}` : ''}:

Date: ${formattedDate}
Time: ${timeRange}${data.location ? `\nLocation: ${data.location}` : ''}
${programText}
See you there!

Best regards,
The Harmonie Team
`;

  const programHtml =
    data.program && data.program.length > 0
      ? `
            <h3 style="margin-bottom: 8px;">Programme</h3>
            <ul style="margin-top: 0;">
                ${data.program.map((piece) => `<li>${piece}</li>`).join('\n                ')}
            </ul>`
      : '';

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
    <h2>Reminder: rehearsal</h2>
    <p>Hello ${data.userName},</p>
    <p>A reminder for the upcoming rehearsal${data.orchestraName ? ` of <strong>${data.orchestraName}</strong>` : ''}:</p>
    <div class="card">
      <div class="detail-row"><span class="detail-label">Date:</span><span>${formattedDate}</span></div>
      <div class="detail-row"><span class="detail-label">Time:</span><span>${timeRange}</span></div>
      ${data.location ? `<div class="detail-row"><span class="detail-label">Location:</span><span>${data.location}</span></div>` : ''}
      ${programHtml}
    </div>
    <p>See you there!</p>
    <div class="footer">
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
