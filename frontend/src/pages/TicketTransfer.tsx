import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getTransferableTickets,
  initiateTicketTransfer,
  getPendingTransfers,
  cancelTicketTransfer,
  getTransferHistory,
} from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal, FormModal } from '../components/Modal';
import { SkeletonTable } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import type { TransferableTicket, TicketTransfer as TicketTransferType } from '../types';

type TabType = 'transfer' | 'pending' | 'history';

export default function TicketTransferPage() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.ticketTransfer');

  const queryClient = useQueryClient();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('transfer');

  // Modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TransferableTicket | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<TicketTransferType | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    recipientEmail: '',
    recipientName: '',
  });
  const [formErrors, setFormErrors] = useState({
    recipientEmail: '',
    recipientName: '',
  });

  // Fetch transferable tickets
  const { data: transferableTickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: queryKeys.transferableTickets,
    queryFn: getTransferableTickets,
  });

  // Fetch pending transfers
  const { data: pendingTransfers = [], isLoading: pendingLoading } = useQuery({
    queryKey: queryKeys.pendingTransfers,
    queryFn: getPendingTransfers,
  });

  // Fetch transfer history
  const { data: transferHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: queryKeys.transferHistory,
    queryFn: getTransferHistory,
  });

  // Initiate transfer mutation
  const transferMutation = useMutation({
    mutationFn: ({ ticketId, data }: { ticketId: string; data: typeof formData }) =>
      initiateTicketTransfer(ticketId, data),
    onSuccess: () => {
      showSuccess(t('ticketTransfer.transferInitiated'));
      setShowConfirmModal(false);
      setShowTransferModal(false);
      setSelectedTicket(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: queryKeys.transferableTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingTransfers });
      queryClient.invalidateQueries({ queryKey: queryKeys.myTickets });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  // Cancel transfer mutation
  const cancelMutation = useMutation({
    mutationFn: (transferId: string) => cancelTicketTransfer(transferId),
    onSuccess: () => {
      showSuccess(t('ticketTransfer.transferCancelled'));
      setShowCancelConfirm(false);
      setSelectedTransfer(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.transferableTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingTransfers });
      queryClient.invalidateQueries({ queryKey: queryKeys.myTickets });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const resetForm = () => {
    setFormData({
      recipientEmail: '',
      recipientName: '',
    });
    setFormErrors({
      recipientEmail: '',
      recipientName: '',
    });
  };

  const validateForm = (): boolean => {
    const errors = {
      recipientEmail: '',
      recipientName: '',
    };
    let isValid = true;

    if (!formData.recipientEmail.trim()) {
      errors.recipientEmail = t('ticketTransfer.validation.emailRequired');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.recipientEmail)) {
      errors.recipientEmail = t('ticketTransfer.validation.emailInvalid');
      isValid = false;
    }

    if (!formData.recipientName.trim()) {
      errors.recipientName = t('ticketTransfer.validation.nameRequired');
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const openTransferModal = (ticket: TransferableTicket) => {
    setSelectedTicket(ticket);
    resetForm();
    setShowTransferModal(true);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setShowConfirmModal(true);
    }
  };

  const confirmTransfer = () => {
    if (selectedTicket) {
      transferMutation.mutate({
        ticketId: selectedTicket.id,
        data: formData,
      });
    }
  };

  const openCancelConfirm = (transfer: TicketTransferType) => {
    setSelectedTransfer(transfer);
    setShowCancelConfirm(true);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'var(--warning)',
      accepted: 'var(--success)',
      cancelled: 'var(--danger)',
      expired: 'var(--text-light)',
    };

    return (
      <span
        className="badge"
        style={{
          backgroundColor: colors[status] || 'var(--text-light)',
          color: 'white',
        }}
      >
        {t(`ticketTransfer.status.${status}`)}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(currentLocale(), {
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

  // Render transferable tickets tab
  const renderTransferTab = () => {
    if (ticketsLoading) {
      return (
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={5} columns={4} />
          </div>
        </div>
      );
    }

    if (transferableTickets.length === 0) {
      return (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>&#127915;</span>
            <h3>{t('ticketTransfer.noTransferableTickets')}</h3>
            <p style={{ color: 'var(--text-light)' }}>{t('ticketTransfer.noTransferableTicketsDescription')}</p>
          </div>
        </div>
      );
    }

    // Group tickets by concert
    const ticketsByConcert = transferableTickets.reduce(
      (acc, ticket) => {
        const key = ticket.concert.id;
        if (!acc[key]) {
          acc[key] = {
            concert: ticket.concert,
            tickets: [],
          };
        }
        acc[key].tickets.push(ticket);
        return acc;
      },
      {} as Record<string, { concert: TransferableTicket['concert']; tickets: TransferableTicket[] }>,
    );

    return (
      <div className="flex gap-3" style={{ flexDirection: 'column' }}>
        {Object.values(ticketsByConcert).map(({ concert, tickets }) => (
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
                    {formatDate(concert.date)}
                    {concert.location && ` - ${concert.location}`}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: 0 }}>
              {tickets.map((ticket, index) => (
                <div
                  key={ticket.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    borderBottom: index < tickets.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>{ticket.ticketType}</strong>
                      {ticket.hasPendingTransfer && (
                        <span className="badge" style={{ backgroundColor: 'var(--warning)', color: 'white' }}>
                          {t('ticketTransfer.pendingTransfer')}
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-light)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                      {ticket.buyerName}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{ticket.code}</code>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => openTransferModal(ticket)}
                      disabled={ticket.hasPendingTransfer}
                    >
                      {t('ticketTransfer.transfer')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render pending transfers tab
  const renderPendingTab = () => {
    if (pendingLoading) {
      return (
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={5} columns={5} />
          </div>
        </div>
      );
    }

    if (pendingTransfers.length === 0) {
      return (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>&#128230;</span>
            <h3>{t('ticketTransfer.noPendingTransfers')}</h3>
            <p style={{ color: 'var(--text-light)' }}>{t('ticketTransfer.noPendingTransfersDescription')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>{t('ticketTransfer.ticket')}</th>
                <th>{t('ticketTransfer.recipient')}</th>
                <th>{t('ticketTransfer.concert')}</th>
                <th>{t('ticketTransfer.expires')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pendingTransfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td>
                    <strong>{transfer.ticket.ticketType}</strong>
                    <br />
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{transfer.ticket.code}</code>
                  </td>
                  <td>
                    <div>{transfer.recipientName}</div>
                    <small style={{ color: 'var(--text-light)' }}>{transfer.recipientEmail}</small>
                  </td>
                  <td>
                    <div>{transfer.ticket.concert.name}</div>
                    <small style={{ color: 'var(--text-light)' }}>{formatDate(transfer.ticket.concert.date)}</small>
                  </td>
                  <td>
                    <small>{formatDateTime(transfer.expiresAt)}</small>
                  </td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => openCancelConfirm(transfer)}
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                      {t('ticketTransfer.cancelTransfer')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render transfer history tab
  const renderHistoryTab = () => {
    if (historyLoading) {
      return (
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={5} columns={5} />
          </div>
        </div>
      );
    }

    if (transferHistory.length === 0) {
      return (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>&#128196;</span>
            <h3>{t('ticketTransfer.noHistory')}</h3>
            <p style={{ color: 'var(--text-light)' }}>{t('ticketTransfer.noHistoryDescription')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>{t('ticketTransfer.ticket')}</th>
                <th>{t('ticketTransfer.from')}</th>
                <th>{t('ticketTransfer.to')}</th>
                <th>{t('ticketTransfer.status')}</th>
                <th>{t('ticketTransfer.date')}</th>
              </tr>
            </thead>
            <tbody>
              {transferHistory.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.ticket.ticketType}</strong>
                    <br />
                    <small style={{ color: 'var(--text-light)' }}>{item.ticket.concert.name}</small>
                  </td>
                  <td>
                    <div>{item.fromName}</div>
                    <small style={{ color: 'var(--text-light)' }}>{item.fromEmail}</small>
                  </td>
                  <td>
                    <div>{item.toName}</div>
                    <small style={{ color: 'var(--text-light)' }}>{item.toEmail}</small>
                  </td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <small>{formatDateTime(item.transferredAt)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('ticketTransfer.title')}</h1>
      </div>

      <p style={{ color: 'var(--text-light)', marginBottom: '1.5rem' }}>{t('ticketTransfer.description')}</p>

      {/* Tab navigation */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${activeTab === 'transfer' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('transfer')}
        >
          {t('ticketTransfer.tabs.transfer')}
          {transferableTickets.length > 0 && (
            <span
              className="badge badge-primary ml-1"
              style={{
                backgroundColor: activeTab === 'transfer' ? 'white' : undefined,
                color: activeTab === 'transfer' ? 'var(--primary)' : undefined,
              }}
            >
              {transferableTickets.length}
            </span>
          )}
        </button>
        <button
          className={`btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('pending')}
        >
          {t('ticketTransfer.tabs.pending')}
          {pendingTransfers.length > 0 && (
            <span className="badge ml-1" style={{ backgroundColor: 'var(--warning)', color: 'white' }}>
              {pendingTransfers.length}
            </span>
          )}
        </button>
        <button
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('history')}
        >
          {t('ticketTransfer.tabs.history')}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'transfer' && renderTransferTab()}
      {activeTab === 'pending' && renderPendingTab()}
      {activeTab === 'history' && renderHistoryTab()}

      {/* Transfer Modal */}
      {showTransferModal && selectedTicket && (
        <FormModal
          title={t('ticketTransfer.transferTicket')}
          onClose={() => {
            setShowTransferModal(false);
            setSelectedTicket(null);
            resetForm();
          }}
          onSubmit={handleTransferSubmit}
          submitLabel={t('ticketTransfer.continue')}
          isSubmitting={false}
        >
          <div className="mb-3">
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--surface-color)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-color)',
              }}
            >
              <strong>{selectedTicket.ticketType}</strong>
              <p style={{ margin: '0.25rem 0 0', color: 'var(--text-light)' }}>{selectedTicket.concert.name}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--text-light)' }}>
                {formatDate(selectedTicket.concert.date)}
                {selectedTicket.concert.location && ` - ${selectedTicket.concert.location}`}
              </p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('ticketTransfer.recipientEmail')} <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="email"
              className={`form-control ${formErrors.recipientEmail ? 'is-invalid' : ''}`}
              value={formData.recipientEmail}
              onChange={(e) => setFormData({ ...formData, recipientEmail: e.target.value })}
              placeholder={t('ticketTransfer.recipientEmailPlaceholder')}
            />
            {formErrors.recipientEmail && <div className="invalid-feedback">{formErrors.recipientEmail}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">
              {t('ticketTransfer.recipientName')} <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              className={`form-control ${formErrors.recipientName ? 'is-invalid' : ''}`}
              value={formData.recipientName}
              onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
              placeholder={t('ticketTransfer.recipientNamePlaceholder')}
            />
            {formErrors.recipientName && <div className="invalid-feedback">{formErrors.recipientName}</div>}
          </div>

          <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
            {t('ticketTransfer.transferWarning')}
          </div>
        </FormModal>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedTicket && (
        <Modal title={t('ticketTransfer.confirmTransfer')} onClose={() => setShowConfirmModal(false)}>
          <p>{t('ticketTransfer.confirmMessage')}</p>
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--surface-color)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              margin: '1rem 0',
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>{t('ticketTransfer.ticket')}:</strong> {selectedTicket.ticketType}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>{t('ticketTransfer.concert')}:</strong> {selectedTicket.concert.name}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>{t('ticketTransfer.recipient')}:</strong> {formData.recipientName}
            </div>
            <div>
              <strong>{t('ticketTransfer.email')}:</strong> {formData.recipientEmail}
            </div>
          </div>
          <div className="flex gap-2 justify-end" style={{ marginTop: '1.5rem' }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={transferMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={confirmTransfer} disabled={transferMutation.isPending}>
              {transferMutation.isPending ? t('accessibility.processing') : t('ticketTransfer.confirmAndSend')}
            </button>
          </div>
        </Modal>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && selectedTransfer && (
        <Modal
          title={t('ticketTransfer.cancelTransfer')}
          onClose={() => {
            setShowCancelConfirm(false);
            setSelectedTransfer(null);
          }}
        >
          <p>{t('ticketTransfer.cancelConfirmMessage')}</p>
          <div
            style={{
              padding: '1rem',
              backgroundColor: 'var(--surface-color)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-color)',
              margin: '1rem 0',
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>{t('ticketTransfer.ticket')}:</strong> {selectedTransfer.ticket.ticketType}
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>{t('ticketTransfer.recipient')}:</strong> {selectedTransfer.recipientName}
            </div>
            <div>
              <strong>{t('ticketTransfer.email')}:</strong> {selectedTransfer.recipientEmail}
            </div>
          </div>
          <div className="flex gap-2 justify-end" style={{ marginTop: '1.5rem' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowCancelConfirm(false);
                setSelectedTransfer(null);
              }}
              disabled={cancelMutation.isPending}
            >
              {t('common.no')}
            </button>
            <button
              className="btn"
              style={{ backgroundColor: 'var(--danger)', color: 'white' }}
              onClick={() => cancelMutation.mutate(selectedTransfer.id)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? t('accessibility.processing') : t('ticketTransfer.yesCancel')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
