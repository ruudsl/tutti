import { currentLocale } from '../utils/locale';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import {
  getGuestList,
  addGuest,
  updateGuest,
  deleteGuest,
  sendGuestTickets,
  sendAllGuestTickets,
  getConcertTickets,
} from '../api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { SkeletonTable } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import type { GuestListEntry, TicketType } from '../types';

export default function GuestList() {
  const { t } = useTranslation();
  const { concertId } = useParams<{ concertId: string }>();
  useDocumentTitle('pageTitle.guestList');

  const queryClient = useQueryClient();

  // Vast id voor het enige veld dat niet via FormField loopt (zie de opmerking daar)
  const ticketTypeVeldId = useId();

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [ticketsSentFilter, setTicketsSentFilter] = useState<string>('');

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showSendAllConfirm, setShowSendAllConfirm] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<GuestListEntry | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    organisation: '',
    name: '',
    email: '',
    ticketCount: 1,
    ticketTypeId: '' as string | null,
    notes: '',
  });

  // Fetch guest list
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['guestList', concertId, page, search, ticketsSentFilter],
    queryFn: () =>
      getGuestList(concertId!, {
        page,
        limit: 25,
        search: search || undefined,
        ticketsSent: ticketsSentFilter === '' ? undefined : ticketsSentFilter === 'true',
      }),
    enabled: !!concertId,
  });

  // Fetch ticket types for the concert
  const { data: ticketTypesData } = useQuery({
    queryKey: ['concertTicketTypes', concertId],
    queryFn: () => getConcertTickets(concertId!),
    enabled: !!concertId,
  });

  const ticketTypes = ticketTypesData?.ticketTypes || [];
  const entries = data?.entries || [];
  const pagination = data?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 };
  const summary = data?.summary || { totalGuests: 0, totalTickets: 0, ticketsSent: 0, ticketsPending: 0 };
  const concertName = entries[0]?.concertName || '';

  // Mutations
  const addMutation = useMutation({
    mutationFn: (guest: typeof formData) =>
      addGuest(concertId!, {
        ...guest,
        organisation: guest.organisation || null,
        ticketTypeId: guest.ticketTypeId || null,
        notes: guest.notes || null,
      }),
    onSuccess: () => {
      showSuccess(t('guestList.addSuccess'));
      setShowAddModal(false);
      resetForm();
      refetch();
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...guest }: { id: string } & Partial<typeof formData>) =>
      updateGuest(id, {
        ...guest,
        ticketTypeId: guest.ticketTypeId || null,
        notes: guest.notes || null,
      }),
    onSuccess: () => {
      showSuccess(t('guestList.updateSuccess'));
      setShowEditModal(false);
      setSelectedEntry(null);
      resetForm();
      refetch();
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGuest(id),
    onSuccess: () => {
      showSuccess(t('guestList.deleteSuccess'));
      setShowDeleteConfirm(false);
      setSelectedEntry(null);
      refetch();
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const sendTicketsMutation = useMutation({
    mutationFn: (id: string) => sendGuestTickets(id),
    onSuccess: (result) => {
      showSuccess(t('guestList.sendSuccess', { count: result.ticketCount }));
      setShowSendConfirm(false);
      setSelectedEntry(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['ticketStats'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const sendAllMutation = useMutation({
    mutationFn: () => sendAllGuestTickets(concertId!),
    onSuccess: (result) => {
      if (result.failed > 0) {
        showError(t('guestList.sendAllPartial', { sent: result.sent, failed: result.failed }));
      } else {
        showSuccess(t('guestList.sendAllSuccess', { count: result.sent }));
      }
      setShowSendAllConfirm(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['ticketStats'] });
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const resetForm = () => {
    setFormData({
      organisation: '',
      name: '',
      email: '',
      ticketCount: 1,
      ticketTypeId: '',
      notes: '',
    });
  };

  const openEditModal = (entry: GuestListEntry) => {
    setSelectedEntry(entry);
    setFormData({
      organisation: entry.organisation || '',
      name: entry.name,
      email: entry.email,
      ticketCount: entry.ticketCount,
      ticketTypeId: entry.ticketTypeId || '',
      notes: entry.notes || '',
    });
    setShowEditModal(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(currentLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <h1>{t('guestList.title')}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={10} columns={6} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1>{t('guestList.title')}</h1>
          {concertName && <p style={{ color: 'var(--text-light)', margin: 0 }}>{concertName}</p>}
        </div>
        <div className="flex gap-2">
          {summary.ticketsPending > 0 && (
            <button className="btn btn-outline" onClick={() => setShowSendAllConfirm(true)}>
              {t('guestList.sendAll')} ({summary.ticketsPending})
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            {t('guestList.addGuest')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('guestList.totalGuests')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{summary.totalGuests}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('guestList.totalTickets')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{summary.totalTickets}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('guestList.ticketsSent')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>{summary.ticketsSent}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding: '1rem' }}>
            <div style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('guestList.ticketsPending')}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
              {summary.ticketsPending}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="grid grid-cols-3 gap-2">
            {/* className="" houdt de omhullende div zonder klasse, zoals hij hier stond:
                dit is een rasterkolom, geen form-group met eigen ondermarge. */}
            <FormField label={t('common.search')} className="">
              <input
                type="text"
                className="form-control"
                placeholder={t('guestList.searchPlaceholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </FormField>
            <FormField label={t('common.status')} className="">
              <select
                className="form-control"
                value={ticketsSentFilter}
                onChange={(e) => {
                  setTicketsSentFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="true">{t('guestList.sent')}</option>
                <option value="false">{t('guestList.pending')}</option>
              </select>
            </FormField>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Link to={`/tickets/sales?concertId=${concertId}`} className="btn btn-outline">
                {t('guestList.viewPaidTickets')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Guest List Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('guestList.orderNumber')}</th>
                <th>{t('guestList.organisation')}</th>
                <th>{t('guestList.guest')}</th>
                <th>{t('guestList.ticketCount')}</th>
                <th>{t('guestList.addedBy')}</th>
                <th>{t('common.status')}</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                    {t('guestList.noGuests')}
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{entry.orderNumber || '-'}</span>
                    </td>
                    <td>{entry.organisation || <span style={{ color: 'var(--text-light)' }}>-</span>}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{entry.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{entry.email}</div>
                      {entry.notes && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
                          {entry.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '1.125rem', fontWeight: 500 }}>{entry.ticketCount}</span>
                    </td>
                    <td>
                      {entry.createdBy ? (
                        <div style={{ fontSize: '0.875rem' }}>
                          {entry.createdBy.firstName} {entry.createdBy.lastName}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-light)' }}>-</span>
                      )}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                        {formatDate(entry.createdAt)}
                      </div>
                    </td>
                    <td>
                      {entry.ticketsSent ? (
                        <span className="badge" style={{ backgroundColor: 'var(--success)', color: 'white' }}>
                          {t('guestList.sent')}
                        </span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: 'var(--warning)', color: 'white' }}>
                          {t('guestList.pending')}
                        </span>
                      )}
                      {entry.sentAt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                          {formatDate(entry.sentAt)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {!entry.ticketsSent && (
                          <>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openEditModal(entry)}
                              title={t('common.edit')}
                            >
                              &#9998;
                            </button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setShowSendConfirm(true);
                              }}
                              title={t('guestList.sendTickets')}
                            >
                              &#9993;
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setShowDeleteConfirm(true);
                              }}
                              title={t('common.delete')}
                              style={{ color: 'var(--danger)' }}
                            >
                              &#128465;
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div
            className="card-body"
            style={{
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: 'var(--text-light)' }}>
              {t('common.showingOf', {
                from: (page - 1) * pagination.limit + 1,
                to: Math.min(page * pagination.limit, pagination.total),
                total: pagination.total,
              })}
            </span>
            <div className="flex gap-1">
              <button className="btn btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                &laquo;
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={page === pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                &raquo;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Guest Modal */}
      {showAddModal && (
        <Modal
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
          title={t('guestList.addGuest')}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addMutation.mutate(formData);
            }}
          >
            <FormField label={t('guestList.organisation')}>
              <input
                type="text"
                className="form-control"
                value={formData.organisation}
                onChange={(e) => setFormData({ ...formData, organisation: e.target.value })}
                placeholder={t('guestList.organisationPlaceholder')}
              />
            </FormField>
            <FormField label={`${t('guestList.name')} *`}>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </FormField>
            <FormField label={`${t('guestList.email')} *`}>
              <input
                type="email"
                className="form-control"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </FormField>
            <FormField label={`${t('guestList.ticketCount')} *`}>
              <input
                type="number"
                className="form-control"
                min={1}
                max={20}
                value={formData.ticketCount}
                onChange={(e) => setFormData({ ...formData, ticketCount: parseInt(e.target.value) || 1 })}
                required
              />
            </FormField>
            {/* Met de hand gekoppeld in plaats van via FormField: naast label en veld
                staat hier ook nog een hulptekst in dezelfde form-group. FormField neemt
                één kindelement, en de hulptekst buiten de form-group zetten zou hem
                onder de ondermarge van 1rem laten wegzakken - los van het veld waar
                hij bij hoort. De aria-describedby leest de schermlezer nu wel voor. */}
            {ticketTypes.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor={ticketTypeVeldId}>
                  {t('guestList.ticketType')}
                </label>
                <select
                  id={ticketTypeVeldId}
                  aria-describedby={`${ticketTypeVeldId}-hulp`}
                  className="form-control"
                  value={formData.ticketTypeId || ''}
                  onChange={(e) => setFormData({ ...formData, ticketTypeId: e.target.value || null })}
                >
                  <option value="">{t('guestList.defaultTicket')}</option>
                  {ticketTypes.map((tt: TicketType) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name}
                    </option>
                  ))}
                </select>
                <small id={`${ticketTypeVeldId}-hulp`} style={{ color: 'var(--text-light)' }}>
                  {t('guestList.ticketTypeHelp')}
                </small>
              </div>
            )}
            <FormField label={t('guestList.notes')}>
              <textarea
                className="form-control"
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t('guestList.notesPlaceholder')}
              />
            </FormField>
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={addMutation.isPending}>
                {addMutation.isPending ? t('common.saving') : t('common.add')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Guest Modal */}
      {showEditModal && (
        <Modal
          onClose={() => {
            setShowEditModal(false);
            setSelectedEntry(null);
            resetForm();
          }}
          title={t('guestList.editGuest')}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedEntry) updateMutation.mutate({ id: selectedEntry.id, ...formData });
            }}
          >
            <FormField label={t('guestList.organisation')}>
              <input
                type="text"
                className="form-control"
                value={formData.organisation}
                onChange={(e) => setFormData({ ...formData, organisation: e.target.value })}
                placeholder={t('guestList.organisationPlaceholder')}
              />
            </FormField>
            <FormField label={`${t('guestList.name')} *`}>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </FormField>
            <FormField label={`${t('guestList.email')} *`}>
              <input
                type="email"
                className="form-control"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </FormField>
            <FormField label={`${t('guestList.ticketCount')} *`}>
              <input
                type="number"
                className="form-control"
                min={1}
                max={20}
                value={formData.ticketCount}
                onChange={(e) => setFormData({ ...formData, ticketCount: parseInt(e.target.value) || 1 })}
                required
              />
            </FormField>
            {ticketTypes.length > 0 && (
              <FormField label={t('guestList.ticketType')}>
                <select
                  className="form-control"
                  value={formData.ticketTypeId || ''}
                  onChange={(e) => setFormData({ ...formData, ticketTypeId: e.target.value || null })}
                >
                  <option value="">{t('guestList.defaultTicket')}</option>
                  {ticketTypes.map((tt: TicketType) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField label={t('guestList.notes')}>
              <textarea
                className="form-control"
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </FormField>
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedEntry(null);
                  resetForm();
                }}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Modal
          onClose={() => {
            setShowDeleteConfirm(false);
            setSelectedEntry(null);
          }}
          title={t('guestList.deleteConfirmTitle')}
        >
          <p>{t('guestList.deleteConfirmMessage', { name: selectedEntry?.name })}</p>
          <div className="flex justify-end gap-2 mt-3">
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setSelectedEntry(null);
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => selectedEntry && deleteMutation.mutate(selectedEntry.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('common.deleting') : t('common.delete')}
            </button>
          </div>
        </Modal>
      )}

      {/* Send Tickets Confirmation Modal */}
      {showSendConfirm && (
        <Modal
          onClose={() => {
            setShowSendConfirm(false);
            setSelectedEntry(null);
          }}
          title={t('guestList.sendConfirmTitle')}
        >
          <p>{t('guestList.sendConfirmMessage', { name: selectedEntry?.name, count: selectedEntry?.ticketCount })}</p>
          <p style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
            {t('guestList.sendConfirmEmail', { email: selectedEntry?.email })}
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <button
              className="btn btn-outline"
              onClick={() => {
                setShowSendConfirm(false);
                setSelectedEntry(null);
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => selectedEntry && sendTicketsMutation.mutate(selectedEntry.id)}
              disabled={sendTicketsMutation.isPending}
            >
              {sendTicketsMutation.isPending ? t('guestList.sending') : t('guestList.sendTickets')}
            </button>
          </div>
        </Modal>
      )}

      {/* Send All Confirmation Modal */}
      {showSendAllConfirm && (
        <Modal onClose={() => setShowSendAllConfirm(false)} title={t('guestList.sendAllConfirmTitle')}>
          <p>{t('guestList.sendAllConfirmMessage', { count: summary.ticketsPending })}</p>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn btn-outline" onClick={() => setShowSendAllConfirm(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => sendAllMutation.mutate()}
              disabled={sendAllMutation.isPending}
            >
              {sendAllMutation.isPending ? t('guestList.sending') : t('guestList.sendAll')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
