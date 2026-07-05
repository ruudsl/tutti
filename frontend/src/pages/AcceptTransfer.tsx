import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getTransferByCode, acceptTicketTransfer } from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

export default function AcceptTransfer() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.acceptTransfer');

  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [isAccepting, setIsAccepting] = useState(false);

  // Fetch transfer details
  const {
    data: transfer,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.transferByCode(code || ''),
    queryFn: () => getTransferByCode(code!),
    enabled: !!code,
    retry: false,
  });

  // Accept transfer mutation
  const acceptMutation = useMutation({
    mutationFn: (transferCode: string) => acceptTicketTransfer(transferCode),
    onSuccess: () => {
      showSuccess(t('ticketTransfer.acceptSuccess'));
      queryClient.invalidateQueries({ queryKey: queryKeys.myTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.transferableTickets });
      navigate('/my-tickets');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
      setIsAccepting(false);
    },
  });

  const handleAccept = () => {
    if (code) {
      setIsAccepting(true);
      acceptMutation.mutate(code);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(currentLocale(), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString(currentLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Check if transfer is expired
  const isExpired = transfer?.expiresAt && new Date(transfer.expiresAt) < new Date();
  const isCancelled = transfer?.status === 'cancelled';
  const isAlreadyAccepted = transfer?.status === 'accepted';
  const canAccept = transfer?.status === 'pending' && !isExpired;

  if (isLoading) {
    return (
      <div>
        <h1>{t('ticketTransfer.acceptTransfer')}</h1>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={3} columns={2} />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !transfer) {
    return (
      <div>
        <h1>{t('ticketTransfer.acceptTransfer')}</h1>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', color: 'var(--danger)' }}>
              &#10060;
            </span>
            <h3>{t('ticketTransfer.transferNotFound')}</h3>
            <p style={{ color: 'var(--text-light)' }}>{t('ticketTransfer.transferNotFoundDescription')}</p>
            {user ? (
              <Link to="/my-tickets" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                {t('ticketTransfer.goToMyTickets')}
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                {t('common.login')}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>{t('ticketTransfer.acceptTransfer')}</h1>

      <div className="card">
        <div className="card-body">
          {/* Status Messages */}
          {isExpired && <div className="alert alert-error mb-3">{t('ticketTransfer.transferExpired')}</div>}
          {isCancelled && <div className="alert alert-error mb-3">{t('ticketTransfer.transferCancelledByOwner')}</div>}
          {isAlreadyAccepted && (
            <div className="alert alert-success mb-3">{t('ticketTransfer.transferAlreadyAccepted')}</div>
          )}

          {/* Transfer Details */}
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: 'var(--surface-color)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0' }}>{t('ticketTransfer.ticketDetails')}</h3>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <strong>{t('ticketTransfer.concert')}:</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '1.125rem' }}>{transfer.ticket.concert.name}</p>
              </div>

              <div>
                <strong>{t('ticketTransfer.date')}:</strong>
                <p style={{ margin: '0.25rem 0 0' }}>
                  {formatDate(transfer.ticket.concert.date)}
                  {transfer.ticket.concert.location && (
                    <span style={{ color: 'var(--text-light)' }}> - {transfer.ticket.concert.location}</span>
                  )}
                </p>
              </div>

              <div>
                <strong>{t('ticketTransfer.ticketType')}:</strong>
                <p style={{ margin: '0.25rem 0 0' }}>{transfer.ticket.ticketType}</p>
              </div>

              <div>
                <strong>{t('ticketTransfer.transferredTo')}:</strong>
                <p style={{ margin: '0.25rem 0 0' }}>
                  {transfer.recipientName} ({transfer.recipientEmail})
                </p>
              </div>

              {transfer.expiresAt && (
                <div>
                  <strong>{t('ticketTransfer.validUntil')}:</strong>
                  <p style={{ margin: '0.25rem 0 0', color: isExpired ? 'var(--danger)' : 'inherit' }}>
                    {formatDateTime(transfer.expiresAt)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {canAccept && (
            <>
              {!user ? <div className="alert alert-warning mb-3">{t('ticketTransfer.loginRequired')}</div> : null}

              <div className="flex gap-2">
                {user ? (
                  <button className="btn btn-primary" onClick={handleAccept} disabled={isAccepting} style={{ flex: 1 }}>
                    {isAccepting ? t('accessibility.processing') : t('ticketTransfer.acceptTicket')}
                  </button>
                ) : (
                  <Link
                    to={`/login?redirect=/tickets/transfer/accept/${code}`}
                    className="btn btn-primary"
                    style={{ flex: 1, textAlign: 'center' }}
                  >
                    {t('ticketTransfer.loginToAccept')}
                  </Link>
                )}
              </div>
            </>
          )}

          {/* Already accepted - go to tickets */}
          {isAlreadyAccepted && user && (
            <Link to="/my-tickets" className="btn btn-primary">
              {t('ticketTransfer.goToMyTickets')}
            </Link>
          )}

          {/* Expired or cancelled - back to home */}
          {(isExpired || isCancelled) && (
            <Link to="/" className="btn btn-outline">
              {t('common.backToHome')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
