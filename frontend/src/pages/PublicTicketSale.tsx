import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getConcertTickets } from '../api';
import TicketPurchase from '../components/TicketPurchase';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function PublicTicketSale() {
  const { t } = useTranslation();
  const { concertId } = useParams<{ concertId: string }>();
  const navigate = useNavigate();
  useDocumentTitle('tickets.buyTickets');

  const { data: ticketInfo, isLoading, error } = useQuery({
    queryKey: ['public-tickets', concertId],
    queryFn: () => getConcertTickets(concertId!),
    enabled: !!concertId,
  });

  if (isLoading) {
    return (
      <div className="public-ticket-page">
        <div className="public-ticket-container">
          <div className="loading">
            <div className="spinner"></div>
            <span>{t('common.loading')}</span>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (error || !ticketInfo) {
    return (
      <div className="public-ticket-page">
        <div className="public-ticket-container">
          <div className="error-card">
            <h2>{t('tickets.concertNotFound')}</h2>
            <p>{t('tickets.concertNotFoundDesc')}</p>
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  const concert = ticketInfo.concert;
  const hasTickets = ticketInfo.ticketTypes.length > 0;
  const concertDate = new Date(concert.date);
  const isPastConcert = concertDate < new Date();

  return (
    <div className="public-ticket-page">
      <div className="public-ticket-container">
        {/* Concert Header */}
        <div className="concert-header">
          <h1>{concert.name}</h1>
          <div className="concert-meta">
            <span className="concert-date">
              {concertDate.toLocaleDateString('nl-NL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {concert.endDate && ` - ${new Date(concert.endDate).toLocaleDateString('nl-NL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}`}
            </span>
            {concert.location && (
              <span className="concert-location">{concert.location}</span>
            )}
          </div>
          {concert.description && (
            <p className="concert-description">{concert.description}</p>
          )}
        </div>

        {/* Ticket Purchase Section */}
        <div className="ticket-section">
          {isPastConcert ? (
            <div className="notice-card">
              <h3>{t('tickets.concertPassed')}</h3>
              <p>{t('tickets.concertPassedDesc')}</p>
            </div>
          ) : !hasTickets ? (
            <div className="notice-card">
              <h3>{t('tickets.noTicketsAvailable')}</h3>
              <p>{t('tickets.checkBackLater')}</p>
            </div>
          ) : (
            <TicketPurchase
              concertId={concertId!}
              onSuccess={(orderId) => {
                navigate(`/tickets/order/${orderId}`);
              }}
            />
          )}
        </div>
      </div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .public-ticket-page {
    min-height: 100vh;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
    padding: 2rem;
  }

  .public-ticket-container {
    max-width: 700px;
    margin: 0 auto;
  }

  .concert-header {
    text-align: center;
    margin-bottom: 2rem;
    padding: 2rem;
    background: var(--card-bg);
    border-radius: 1rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .concert-header h1 {
    font-size: 2rem;
    margin: 0 0 1rem 0;
    color: var(--text-primary);
  }

  .concert-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--text-muted);
  }

  .concert-date {
    font-size: 1.1rem;
    text-transform: capitalize;
  }

  .concert-location {
    font-size: 1rem;
  }

  .concert-description {
    margin-top: 1rem;
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .ticket-section {
    background: var(--card-bg);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .notice-card {
    text-align: center;
    padding: 2rem;
  }

  .notice-card h3 {
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .notice-card p {
    color: var(--text-muted);
    margin: 0;
  }

  .error-card {
    text-align: center;
    padding: 3rem;
    background: var(--card-bg);
    border-radius: 1rem;
  }

  .error-card h2 {
    color: var(--danger);
    margin: 0 0 0.5rem 0;
  }

  .error-card p {
    color: var(--text-muted);
    margin: 0;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    background: var(--card-bg);
    border-radius: 1rem;
  }

  @media (max-width: 768px) {
    .public-ticket-page {
      padding: 1rem;
    }

    .concert-header {
      padding: 1.5rem;
    }

    .concert-header h1 {
      font-size: 1.5rem;
    }

    .ticket-section {
      padding: 1rem;
    }
  }
`;
