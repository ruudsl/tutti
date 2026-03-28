import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getMyTickets } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import TicketDisplay from '../components/TicketDisplay';
import { SkeletonTable } from '../components/Skeleton';
import type { Ticket } from '../types';

export default function MyTickets() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.myTickets');

  const [viewingTicket, setViewingTicket] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');

  // Fetch user's tickets
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: queryKeys.myTickets,
    queryFn: getMyTickets,
  });

  // Filter tickets
  const now = new Date();
  const filteredTickets = tickets.filter((ticket) => {
    const concertDate = new Date(ticket.concert.date);
    if (filter === 'upcoming') {
      return concertDate >= now;
    } else if (filter === 'past') {
      return concertDate < now;
    }
    return true;
  });

  // Group by concert
  const ticketsByConcert = filteredTickets.reduce((acc, ticket) => {
    const key = ticket.concert.id;
    if (!acc[key]) {
      acc[key] = {
        concert: ticket.concert,
        tickets: [],
      };
    }
    acc[key].tickets.push(ticket);
    return acc;
  }, {} as Record<string, { concert: Ticket['concert']; tickets: Ticket[] }>);

  const sortedConcerts = Object.values(ticketsByConcert).sort((a, b) => {
    const dateA = new Date(a.concert.date).getTime();
    const dateB = new Date(b.concert.date).getTime();
    // Sort upcoming concerts ascending, past concerts descending
    if (filter === 'past') {
      return dateB - dateA;
    }
    return dateA - dateB;
  });

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      valid: 'var(--success)',
      used: 'var(--warning)',
      cancelled: 'var(--danger)',
      refunded: 'var(--danger)',
    };

    return (
      <span
        className="badge"
        style={{
          backgroundColor: colors[status] || 'var(--text-light)',
          color: 'white',
        }}
      >
        {t(`tickets.status.${status}`)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('tickets.myTickets')}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={5} columns={4} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('tickets.myTickets')}
          <span className="badge badge-primary ml-2">{tickets.length}</span>
        </h1>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${filter === 'upcoming' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setFilter('upcoming')}
        >
          {t('tickets.upcomingConcerts')}
        </button>
        <button
          className={`btn ${filter === 'past' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setFilter('past')}
        >
          {t('tickets.pastConcerts')}
        </button>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setFilter('all')}
        >
          {t('common.all')}
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>&#127915;</span>
            <h3>{t('tickets.noTickets')}</h3>
            <p style={{ color: 'var(--text-light)' }}>
              {t('tickets.noTicketsDescription')}
            </p>
          </div>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: 'var(--text-light)' }}>
              {filter === 'upcoming' ? t('tickets.noUpcomingTickets') : t('tickets.noPastTickets')}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3" style={{ flexDirection: 'column' }}>
          {sortedConcerts.map(({ concert, tickets: concertTickets }) => (
            <div key={concert.id} className="card">
              <div
                className="card-body"
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--surface-color)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{concert.name}</h3>
                    <p style={{ color: 'var(--text-light)', margin: '0.25rem 0 0' }}>
                      {new Date(concert.date).toLocaleDateString('nl-NL', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                      {concert.location && ` - ${concert.location}`}
                    </p>
                  </div>
                  <span className="badge badge-outline">
                    {concertTickets.length} {concertTickets.length === 1 ? t('tickets.ticket') : t('tickets.tickets')}
                  </span>
                </div>
              </div>

              <div style={{ padding: 0 }}>
                {concertTickets.map((ticket, index) => (
                  <div
                    key={ticket.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem',
                      borderBottom: index < concertTickets.length - 1 ? '1px solid var(--border-color)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>{ticket.ticketType}</strong>
                        {getStatusBadge(ticket.status)}
                      </div>
                      <p style={{ color: 'var(--text-light)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                        {ticket.buyerName}
                        {ticket.seatInfo && ` - ${ticket.seatInfo}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                        {ticket.code}
                      </code>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setViewingTicket(ticket)}
                      >
                        {t('tickets.viewTicket')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ticket Detail Modal */}
      {viewingTicket && (
        <Modal
          title={t('tickets.ticketDetails')}
          onClose={() => setViewingTicket(null)}
          size="medium"
        >
          <TicketDisplay ticket={viewingTicket} />
        </Modal>
      )}
    </div>
  );
}
