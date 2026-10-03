import { UitnodigingEmailData, EmailContent } from './types';

export function getUitnodigingEmailContent(d: UitnodigingEmailData): EmailContent {
  const subject = `Uitnodiging voor ${d.verenigingsnaam} in Tutti`;

  const text = `
Hallo,

${d.uitnodiger} nodigt je uit om lid te worden van ${d.verenigingsnaam} in Tutti.

Open de link en log in met dit e-mailadres om de uitnodiging aan te nemen. De link is ${d.dagenGeldig} dagen geldig.

${d.aannameUrl}

Heb je nog geen account in Tutti? Vraag dan aan ${d.uitnodiger} om er een voor je aan te maken.

Verwacht je deze uitnodiging niet? Dan kun je deze e-mail negeren.

Met vriendelijke groet,
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
    <p>Hallo,</p>
    <div class="card">
      <p>${d.uitnodiger} nodigt je uit om lid te worden van ${d.verenigingsnaam} in Tutti.</p>
      <p>Open de link en log in met dit e-mailadres om de uitnodiging aan te nemen. De link is ${d.dagenGeldig} dagen geldig.</p>
      <a href="${d.aannameUrl}" class="button">Uitnodiging bekijken</a>
      <p>Of kopieer deze link in je browser:<br>
      <a href="${d.aannameUrl}">${d.aannameUrl}</a></p>
    </div>
    <p>Heb je nog geen account in Tutti? Vraag dan aan ${d.uitnodiger} om er een voor je aan te maken.</p>
    <div class="footer">
      <p>Verwacht je deze uitnodiging niet? Dan kun je deze e-mail negeren.</p>
      <p>Met vriendelijke groet,<br>Tutti</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
