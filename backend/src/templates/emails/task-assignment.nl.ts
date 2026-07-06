import { TaskAssignmentEmailData, EmailContent } from './types';

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

export function getTaskAssignmentEmailContent(data: TaskAssignmentEmailData): EmailContent {
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Taak toegewezen: "${data.taskTitle}"`;

  const text = `
Hallo ${data.userName},

Er is een taak aan je toegewezen${data.assignedBy ? ` door ${data.assignedBy}` : ''}:

Taak: ${data.taskTitle}${formattedDeadline ? `\nDeadline: ${formattedDeadline}` : ''}

Bekijk de taak via:
${data.taskUrl}

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
    <h2>Taak toegewezen</h2>
    <p>Hallo ${data.userName},</p>
    <p>Er is een taak aan je toegewezen${data.assignedBy ? ` door <strong>${data.assignedBy}</strong>` : ''}:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.taskTitle}</h3>
      ${formattedDeadline ? `<div class="detail-row"><span class="detail-label">Deadline:</span><span>${formattedDeadline}</span></div>` : ''}
    </div>
    <a href="${data.taskUrl}" class="button">Bekijk taak</a>
    <p>Of kopieer deze link in je browser:<br>
    <a href="${data.taskUrl}">${data.taskUrl}</a></p>
    <div class="footer">
      <p>Met vriendelijke groet,<br>Het Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
