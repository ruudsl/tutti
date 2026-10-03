import { UitnodigingEmailData, EmailContent } from './types';

export function getUitnodigingEmailContent(d: UitnodigingEmailData): EmailContent {
  const subject = `Einladung zu ${d.verenigingsnaam} in Tutti`;

  const text = `
Hallo,

${d.uitnodiger} lädt Sie ein, Mitglied von ${d.verenigingsnaam} in Tutti zu werden.

Öffnen Sie den Link und melden Sie sich mit dieser E-Mail-Adresse an, um die Einladung anzunehmen. Der Link ist ${d.dagenGeldig} Tage gültig.

${d.aannameUrl}

Sie haben noch kein Tutti-Konto? Bitten Sie ${d.uitnodiger}, eines für Sie anzulegen.

Sie erwarten diese Einladung nicht? Dann können Sie diese E-Mail ignorieren.

Mit freundlichen Grüßen
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
      <p>${d.uitnodiger} lädt Sie ein, Mitglied von ${d.verenigingsnaam} in Tutti zu werden.</p>
      <p>Öffnen Sie den Link und melden Sie sich mit dieser E-Mail-Adresse an, um die Einladung anzunehmen. Der Link ist ${d.dagenGeldig} Tage gültig.</p>
      <a href="${d.aannameUrl}" class="button">Einladung ansehen</a>
      <p>Oder kopieren Sie diesen Link in Ihren Browser:<br>
      <a href="${d.aannameUrl}">${d.aannameUrl}</a></p>
    </div>
    <p>Sie haben noch kein Tutti-Konto? Bitten Sie ${d.uitnodiger}, eines für Sie anzulegen.</p>
    <div class="footer">
      <p>Sie erwarten diese Einladung nicht? Dann können Sie diese E-Mail ignorieren.</p>
      <p>Mit freundlichen Grüßen<br>Tutti</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, text, html };
}
