import { UitnodigingEmailData, EmailContent } from './types';

export function getUitnodigingEmailContent(d: UitnodigingEmailData): EmailContent {
  const subject = `Invitation to ${d.verenigingsnaam} on Tutti`;

  const text = `
Hello,

${d.uitnodiger} invites you to join ${d.verenigingsnaam} on Tutti.

Open the link and log in with this e-mail address to accept the invitation. The link is valid for ${d.dagenGeldig} days.

${d.aannameUrl}

Don't have a Tutti account yet? Ask ${d.uitnodiger} to create one for you.

Not expecting this invitation? You can ignore this e-mail.

Kind regards,
Tutti
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
    <p>Hello,</p>
    <div class="card">
      <p>${d.uitnodiger} invites you to join ${d.verenigingsnaam} on Tutti.</p>
      <p>Open the link and log in with this e-mail address to accept the invitation. The link is valid for ${d.dagenGeldig} days.</p>
      <a href="${d.aannameUrl}" class="button">View invitation</a>
      <p>Or copy this link into your browser:<br>
      <a href="${d.aannameUrl}">${d.aannameUrl}</a></p>
    </div>
    <p>Don't have a Tutti account yet? Ask ${d.uitnodiger} to create one for you.</p>
    <div class="footer">
      <p>Not expecting this invitation? You can ignore this e-mail.</p>
      <p>Kind regards,<br>Tutti</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
