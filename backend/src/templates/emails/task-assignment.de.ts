import { TaskAssignmentEmailData, EmailContent } from './types';

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

export function getTaskAssignmentEmailContent(data: TaskAssignmentEmailData): EmailContent {
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Aufgabe zugewiesen: "${data.taskTitle}"`;

  const text = `
Hallo ${data.userName},

Ihnen wurde eine Aufgabe zugewiesen${data.assignedBy ? ` von ${data.assignedBy}` : ''}:

Aufgabe: ${data.taskTitle}${formattedDeadline ? `\nFrist: ${formattedDeadline}` : ''}

Sehen Sie sich die Aufgabe hier an:
${data.taskUrl}

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
    <h2>Aufgabe zugewiesen</h2>
    <p>Hallo ${data.userName},</p>
    <p>Ihnen wurde eine Aufgabe zugewiesen${data.assignedBy ? ` von <strong>${data.assignedBy}</strong>` : ''}:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.taskTitle}</h3>
      ${formattedDeadline ? `<div class="detail-row"><span class="detail-label">Frist:</span><span>${formattedDeadline}</span></div>` : ''}
    </div>
    <a href="${data.taskUrl}" class="button">Aufgabe ansehen</a>
    <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
    <a href="${data.taskUrl}">${data.taskUrl}</a></p>
    <div class="footer">
      <p>Mit freundlichen Grüßen,<br>Das Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
