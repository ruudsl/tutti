import { RehearsalReminderEmailData, EmailContent } from './types';

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

export function getRehearsalReminderEmailContent(data: RehearsalReminderEmailData): EmailContent {
  const formattedDate = formatDate(data.rehearsalDate);
  const timeRange = data.endTime ? `${data.startTime} - ${data.endTime}` : data.startTime;

  const subject = `Herinnering: repetitie op ${formattedDate}`;

  const programText =
    data.program && data.program.length > 0
      ? `\nProgramma:\n${data.program.map((piece) => `- ${piece}`).join('\n')}\n`
      : '';

  const text = `
Hallo ${data.userName},

Een herinnering voor de komende repetitie${data.orchestraName ? ` van ${data.orchestraName}` : ''}:

Datum: ${formattedDate}
Tijd: ${timeRange}${data.location ? `\nLocatie: ${data.location}` : ''}
${programText}
Tot dan!

Met vriendelijke groet,
Het Harmonie Team
`;

  const programHtml =
    data.program && data.program.length > 0
      ? `
            <h3 style="margin-bottom: 8px;">Programma</h3>
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
    <h2>Herinnering: repetitie</h2>
    <p>Hallo ${data.userName},</p>
    <p>Een herinnering voor de komende repetitie${data.orchestraName ? ` van <strong>${data.orchestraName}</strong>` : ''}:</p>
    <div class="card">
      <div class="detail-row"><span class="detail-label">Datum:</span><span>${formattedDate}</span></div>
      <div class="detail-row"><span class="detail-label">Tijd:</span><span>${timeRange}</span></div>
      ${data.location ? `<div class="detail-row"><span class="detail-label">Locatie:</span><span>${data.location}</span></div>` : ''}
      ${programHtml}
    </div>
    <p>Tot dan!</p>
    <div class="footer">
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
