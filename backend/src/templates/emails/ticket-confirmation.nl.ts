import { TicketEmailData } from '../../services/ticketing';

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

/**
 * Format currency according to Dutch locale
 */
function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
}

export function getTicketEmailContent(data: TicketEmailData): { subject: string; text: string; html: string } {
    const formattedDate = formatDate(data.concertDate);
    const formattedTotal = formatCurrency(data.orderTotal);

    const subject = `Uw tickets voor ${data.concertName}`;

    const text = `
Beste ${data.buyerName},

Bedankt voor uw aankoop! Hier zijn uw ticketgegevens:

Concert: ${data.concertName}
Datum: ${formattedDate}
Locatie: ${data.concertLocation}
Tickettype: ${data.ticketTypeName}
Aantal: ${data.quantity}
Totaal: ${formattedTotal}

Uw ticketcode: ${data.ticketCode}

Toon de QR-code bij de ingang. U vindt de QR-code in de HTML-versie van deze e-mail of in uw account onder "Mijn Tickets".

We kijken ernaar uit u te zien!

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
        .header { text-align: center; margin-bottom: 30px; }
        .ticket-card { background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 20px 0; border: 2px dashed #dee2e6; }
        .qr-container { text-align: center; margin: 20px 0; }
        .qr-container img { border: 8px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .ticket-code { font-family: 'Courier New', monospace; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 2px; margin: 15px 0; }
        .details { margin: 20px 0; }
        .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #eee; }
        .detail-label { font-weight: 600; width: 120px; }
        .total { font-size: 1.25em; font-weight: bold; color: #2e7d32; margin-top: 15px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Uw Tickets</h1>
            <p>Bedankt voor uw aankoop!</p>
        </div>

        <div class="ticket-card">
            <h2 style="margin-top: 0; text-align: center;">${data.concertName}</h2>

            <div class="qr-container">
                <img src="${data.qrCodeDataUrl}" alt="Ticket QR-code" width="200" height="200" />
            </div>

            <div class="ticket-code">${data.ticketCode}</div>

            <div class="details">
                <div class="detail-row">
                    <span class="detail-label">Datum:</span>
                    <span>${formattedDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Locatie:</span>
                    <span>${data.concertLocation}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Tickettype:</span>
                    <span>${data.ticketTypeName}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Aantal:</span>
                    <span>${data.quantity}</span>
                </div>
            </div>

            <div class="total">Totaal: ${formattedTotal}</div>
        </div>

        <p style="text-align: center;">
            <strong>Toon de QR-code bij de ingang.</strong>
        </p>

        <div class="footer">
            <p>Deze e-mail dient als uw ticketbevestiging.</p>
            <p>Vragen? Neem contact op bij de locatie.</p>
        </div>
    </div>
</body>
</html>
`;

    return { subject, text, html };
}
