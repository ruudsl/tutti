import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getTicketByCode } from '../api';
import type { Ticket } from '../types';

interface TicketDisplayProps {
  ticket?: Ticket;
  ticketCode?: string;
  showDownload?: boolean;
}

export default function TicketDisplay({ ticket: propTicket, ticketCode, showDownload = true }: TicketDisplayProps) {
  const { t } = useTranslation();
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch ticket if code provided but not ticket object
  const { data: fetchedTicket, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketCode],
    queryFn: () => getTicketByCode(ticketCode!),
    enabled: !!ticketCode && !propTicket,
  });

  const ticket = propTicket || fetchedTicket;

  const handleDownloadPdf = async () => {
    if (!ticket) return;

    setIsDownloading(true);

    try {
      // Create a simple PDF-like HTML document
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert(t('tickets.popupBlocked'));
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${t('tickets.ticket')} - ${ticket.concert.name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              max-width: 600px;
              margin: 0 auto;
            }
            .ticket {
              border: 3px dashed #333;
              border-radius: 16px;
              padding: 32px;
              background: #fff;
            }
            .header {
              text-align: center;
              margin-bottom: 24px;
              padding-bottom: 24px;
              border-bottom: 2px dashed #ccc;
            }
            .header h1 {
              font-size: 24px;
              margin-bottom: 8px;
            }
            .header p {
              color: #666;
            }
            .qr-container {
              text-align: center;
              margin: 24px 0;
            }
            .qr-container img {
              border: 4px solid #000;
              border-radius: 8px;
            }
            .ticket-code {
              text-align: center;
              font-family: monospace;
              font-size: 20px;
              font-weight: bold;
              letter-spacing: 3px;
              margin: 16px 0;
            }
            .details {
              margin-top: 24px;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #eee;
            }
            .detail-label {
              font-weight: 600;
              color: #666;
            }
            .status {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .status-valid { background: #d4edda; color: #155724; }
            .status-used { background: #fff3cd; color: #856404; }
            .status-cancelled { background: #f8d7da; color: #721c24; }
            .footer {
              margin-top: 24px;
              padding-top: 16px;
              border-top: 2px dashed #ccc;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">
              <h1>${ticket.concert.name}</h1>
              <p>${new Date(ticket.concert.date).toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p>${ticket.concert.location || t('tickets.locationTba')}</p>
            </div>

            <div class="qr-container">
              <img src="${ticket.qrCodeDataUrl}" alt="QR Code" width="200" height="200" />
            </div>

            <div class="ticket-code">${ticket.code}</div>

            <div class="details">
              <div class="detail-row">
                <span class="detail-label">${t('tickets.ticketType')}</span>
                <span>${ticket.ticketType}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">${t('tickets.buyerName')}</span>
                <span>${ticket.buyerName}</span>
              </div>
              ${ticket.seatInfo ? `
              <div class="detail-row">
                <span class="detail-label">${t('tickets.seatInfo')}</span>
                <span>${ticket.seatInfo}</span>
              </div>
              ` : ''}
              <div class="detail-row">
                <span class="detail-label">${t('common.status')}</span>
                <span class="status status-${ticket.status}">${t(`tickets.status.${ticket.status}`)}</span>
              </div>
            </div>

            <div class="footer">
              <p>${t('tickets.showQrAtEntrance')}</p>
            </div>
          </div>

          <div class="no-print" style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="padding: 12px 24px; font-size: 16px; cursor: pointer;">
              ${t('tickets.printTicket')}
            </button>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="ticket-display">
        <div className="loading">
          <div className="spinner"></div>
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="ticket-display">
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--danger)' }}>{t('tickets.ticketNotFound')}</p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid':
        return 'var(--success)';
      case 'used':
        return 'var(--warning)';
      case 'cancelled':
      case 'refunded':
        return 'var(--danger)';
      default:
        return 'var(--text-light)';
    }
  };

  const isPastConcert = new Date(ticket.concert.date) < new Date();

  return (
    <div className="ticket-display">
      <div
        className="card"
        style={{
          maxWidth: '400px',
          margin: '0 auto',
          overflow: 'hidden',
          border: `3px dashed ${ticket.status === 'valid' ? 'var(--primary)' : 'var(--border-color)'}`,
        }}
      >
        {/* Concert Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
            color: 'white',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{ticket.concert.name}</h3>
          <p style={{ margin: 0, opacity: 0.9 }}>
            {new Date(ticket.concert.date).toLocaleDateString('nl-NL', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p style={{ margin: 0, opacity: 0.8, fontSize: '0.875rem' }}>
            {ticket.concert.location || t('tickets.locationTba')}
          </p>
        </div>

        {/* QR Code */}
        <div style={{ textAlign: 'center', padding: '1.5rem', backgroundColor: 'white' }}>
          {ticket.qrCodeDataUrl ? (
            <img
              src={ticket.qrCodeDataUrl}
              alt="Ticket QR Code"
              style={{
                width: '200px',
                height: '200px',
                border: '4px solid var(--text)',
                borderRadius: '8px',
              }}
            />
          ) : (
            <div
              style={{
                width: '200px',
                height: '200px',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--surface-color)',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: 'var(--text-light)' }}>{t('tickets.noQrCode')}</span>
            </div>
          )}

          {/* Ticket Code */}
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              letterSpacing: '2px',
              marginTop: '1rem',
              padding: '0.5rem',
              backgroundColor: 'var(--surface-color)',
              borderRadius: '4px',
            }}
          >
            {ticket.code}
          </div>
        </div>

        {/* Ticket Details */}
        <div className="card-body" style={{ borderTop: '2px dashed var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-light)' }}>{t('tickets.ticketType')}</span>
            <span style={{ fontWeight: 'bold' }}>{ticket.ticketType}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-light)' }}>{t('tickets.buyerName')}</span>
            <span>{ticket.buyerName}</span>
          </div>

          {ticket.seatInfo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-light)' }}>{t('tickets.seatInfo')}</span>
              <span>{ticket.seatInfo}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-light)' }}>{t('common.status')}</span>
            <span
              className="badge"
              style={{
                backgroundColor: getStatusColor(ticket.status),
                color: 'white',
              }}
            >
              {t(`tickets.status.${ticket.status}`)}
            </span>
          </div>

          {ticket.usedAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-light)' }}>{t('tickets.usedAt')}</span>
              <span>{new Date(ticket.usedAt).toLocaleString()}</span>
            </div>
          )}

          {ticket.price !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ color: 'var(--text-light)' }}>{t('tickets.price')}</span>
              <span>EUR {ticket.price.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {showDownload && ticket.status === 'valid' && !isPastConcert && (
          <div className="card-body" style={{ borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              style={{ width: '100%' }}
            >
              {isDownloading ? t('common.loading') : t('tickets.downloadPdf')}
            </button>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'var(--surface-color)',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-light)',
          }}
        >
          {t('tickets.showQrAtEntrance')}
        </div>
      </div>
    </div>
  );
}
