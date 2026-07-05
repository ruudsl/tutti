import { TaskAssignmentEmailData, EmailContent } from './types';

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

export function getTaskAssignmentEmailContent(data: TaskAssignmentEmailData): EmailContent {
  const formattedDeadline = data.deadline ? formatDate(data.deadline) : null;

  const subject = `Task assigned: "${data.taskTitle}"`;

  const text = `
Hello ${data.userName},

A task has been assigned to you${data.assignedBy ? ` by ${data.assignedBy}` : ''}:

Task: ${data.taskTitle}${formattedDeadline ? `\nDeadline: ${formattedDeadline}` : ''}

View the task at:
${data.taskUrl}

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
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Task assigned</h2>
    <p>Hello ${data.userName},</p>
    <p>A task has been assigned to you${data.assignedBy ? ` by <strong>${data.assignedBy}</strong>` : ''}:</p>
    <div class="card">
      <h3 style="margin-top: 0;">${data.taskTitle}</h3>
      ${formattedDeadline ? `<div class="detail-row"><span class="detail-label">Deadline:</span><span>${formattedDeadline}</span></div>` : ''}
    </div>
    <a href="${data.taskUrl}" class="button">View task</a>
    <p>Or copy this link into your browser:<br>
    <a href="${data.taskUrl}">${data.taskUrl}</a></p>
    <div class="footer">
      <p>Best regards,<br>The Harmonie Team</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
