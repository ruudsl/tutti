import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  useConcerts,
  useConcert,
  useConcertTypes,
  useConcertYears,
  useConcertStatistics,
  usePieceHistory,
  useCreateConcert,
  useUpdateConcert,
  useDeleteConcert,
  useAddConcertProgramItem,
  useDeleteConcertProgramItem,
  useAddConcertMedia,
  useDeleteConcertMedia,
  useAddConcertAttendanceBulk,
  useDeleteConcertAttendance,
  useExportConcertProgram,
  useExportBumaStemra,
} from '../hooks/useConcerts';
import { useUsers } from '../hooks/useUsers';
import { Icon } from '../components/Icon';
import { useMusicTitles } from '../hooks/useMusicTitles';
import { Modal, FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AddToCalendarButton } from '../components/CalendarSync';
import AccessibilityInfo, { AccessibilityIndicator } from '../components/AccessibilityInfo';
import { getConcertTickets, createTicketType, updateTicketType, deleteTicketType } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import type { Concert, TicketType } from '../types';

export default function Concerts() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.concerts');

  // Tab state
  const [activeTab, setActiveTab] = useState<'list' | 'statistics' | 'history'>('list');

  // Filters
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  const [deletingConcert, setDeletingConcert] = useState<Concert | null>(null);
  const [viewingConcert, setViewingConcert] = useState<string | null>(null);
  const [showAddProgramModal, setShowAddProgramModal] = useState(false);
  const [showAddMediaModal, setShowAddMediaModal] = useState(false);
  const [showAddAttendanceModal, setShowAddAttendanceModal] = useState(false);
  const [showBumaStemraModal, setShowBumaStemraModal] = useState(false);
  const [searchTitle, setSearchTitle] = useState('');

  // Buma/Stemra export state - default to last year
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const [bumaStemraStartDate, setBumaStemraStartDate] = useState(oneYearAgo.toISOString().split('T')[0]);
  const [bumaStemraEndDate, setBumaStemraEndDate] = useState(today.toISOString().split('T')[0]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    endDate: '',
    location: '',
    concertType: '',
    description: '',
    notes: '',
  });

  const [programFormData, setProgramFormData] = useState({
    title: '',
    arranger: '',
    notes: '',
    partOfSet: '',
    musicTitleId: '',
  });

  const [mediaFormData, setMediaFormData] = useState({
    mediaType: 'photo',
    url: '',
    description: '',
  });

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Ticket management state
  const [showAddTicketTypeModal, setShowAddTicketTypeModal] = useState(false);
  const [editingTicketType, setEditingTicketType] = useState<TicketType | null>(null);
  const [deletingTicketType, setDeletingTicketType] = useState<TicketType | null>(null);
  const [ticketTypeFormData, setTicketTypeFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    description: '',
    maxPerOrder: '10',
    saleStart: '',
    saleEnd: '',
    serviceFee: '',
    showServiceFeeSeparate: false,
  });

  // Data fetching
  const { data: concertsData, isLoading } = useConcerts({
    search: search || undefined,
    year: yearFilter || undefined,
    concertType: typeFilter || undefined,
  });
  const { data: typesData } = useConcertTypes();
  const { data: years = [] } = useConcertYears();
  const { data: statistics } = useConcertStatistics();
  const { data: concertDetail } = useConcert(viewingConcert || '');
  const { data: users = [] } = useUsers();
  const { data: musicTitles = [] } = useMusicTitles();
  const { data: pieceHistoryData } = usePieceHistory(searchTitle);

  // Ticket data for the viewing concert
  const { data: ticketData, refetch: refetchTickets } = useQuery({
    queryKey: ['concert-tickets', viewingConcert],
    queryFn: () => getConcertTickets(viewingConcert!),
    enabled: !!viewingConcert,
  });

  // Ticket mutations
  const createTicketTypeMutation = useMutation({
    mutationFn: (data: { name: string; price: number; quantity: number; description?: string; maxPerOrder?: number; saleStart?: string; saleEnd?: string; serviceFee?: number; showServiceFeeSeparate?: boolean }) =>
      createTicketType(viewingConcert!, data),
    onSuccess: () => {
      showSuccess(t('tickets.ticketTypeCreated'));
      refetchTickets();
      setShowAddTicketTypeModal(false);
      resetTicketTypeForm();
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateTicketTypeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; price: number; quantity: number; description?: string; maxPerOrder?: number; saleStart?: string; saleEnd?: string; serviceFee?: number; showServiceFeeSeparate?: boolean }> }) =>
      updateTicketType(id, data),
    onSuccess: () => {
      showSuccess(t('tickets.ticketTypeUpdated'));
      refetchTickets();
      setEditingTicketType(null);
      resetTicketTypeForm();
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const deleteTicketTypeMutation = useMutation({
    mutationFn: (id: string) => deleteTicketType(id),
    onSuccess: () => {
      showSuccess(t('tickets.ticketTypeDeleted'));
      refetchTickets();
      setDeletingTicketType(null);
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  // Mutations
  const createMutation = useCreateConcert();
  const updateMutation = useUpdateConcert();
  const deleteMutation = useDeleteConcert();
  const addProgramMutation = useAddConcertProgramItem();
  const deleteProgramMutation = useDeleteConcertProgramItem();
  const addMediaMutation = useAddConcertMedia();
  const deleteMediaMutation = useDeleteConcertMedia();
  const addAttendanceMutation = useAddConcertAttendanceBulk();
  const deleteAttendanceMutation = useDeleteConcertAttendance();
  const exportProgramMutation = useExportConcertProgram();
  const exportBumaStemraMutation = useExportBumaStemra();

  const concerts = concertsData?.data || [];
  const concertTypes = typesData?.concertTypes || [];
  const mediaTypes = typesData?.mediaTypes || [];

  const resetForm = () => {
    setFormData({
      name: '',
      date: '',
      endDate: '',
      location: '',
      concertType: '',
      description: '',
      notes: '',
    });
  };

  const resetTicketTypeForm = () => {
    setTicketTypeFormData({
      name: '',
      price: '',
      quantity: '',
      description: '',
      maxPerOrder: '10',
      saleStart: '',
      saleEnd: '',
      serviceFee: '',
      showServiceFeeSeparate: false,
    });
  };

  // Convert datetime-local value to ISO 8601 format
  const toISODateTime = (localDateTime: string): string | undefined => {
    if (!localDateTime) return undefined;
    // datetime-local gives "YYYY-MM-DDTHH:mm", we need full ISO with timezone
    const date = new Date(localDateTime);
    if (isNaN(date.getTime())) return undefined;
    return date.toISOString();
  };

  const handleCreateTicketType = async (e: React.FormEvent) => {
    e.preventDefault();
    createTicketTypeMutation.mutate({
      name: ticketTypeFormData.name,
      price: parseFloat(ticketTypeFormData.price),
      quantity: parseInt(ticketTypeFormData.quantity, 10),
      description: ticketTypeFormData.description || undefined,
      maxPerOrder: parseInt(ticketTypeFormData.maxPerOrder, 10) || 10,
      saleStart: toISODateTime(ticketTypeFormData.saleStart),
      saleEnd: toISODateTime(ticketTypeFormData.saleEnd),
      serviceFee: ticketTypeFormData.serviceFee ? parseFloat(ticketTypeFormData.serviceFee) : 0,
      showServiceFeeSeparate: ticketTypeFormData.showServiceFeeSeparate,
    });
  };

  const handleUpdateTicketType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicketType) return;
    updateTicketTypeMutation.mutate({
      id: editingTicketType.id,
      data: {
        name: ticketTypeFormData.name,
        price: parseFloat(ticketTypeFormData.price),
        quantity: parseInt(ticketTypeFormData.quantity, 10),
        description: ticketTypeFormData.description || undefined,
        maxPerOrder: parseInt(ticketTypeFormData.maxPerOrder, 10) || 10,
        saleStart: toISODateTime(ticketTypeFormData.saleStart),
        saleEnd: toISODateTime(ticketTypeFormData.saleEnd),
        serviceFee: ticketTypeFormData.serviceFee ? parseFloat(ticketTypeFormData.serviceFee) : 0,
        showServiceFeeSeparate: ticketTypeFormData.showServiceFeeSeparate,
      },
    });
  };

  // Convert ISO date to datetime-local format (YYYY-MM-DDTHH:mm)
  const toDateTimeLocal = (isoDate: string | null): string => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '';
    // Format as YYYY-MM-DDTHH:mm for datetime-local input
    return date.toISOString().slice(0, 16);
  };

  const openEditTicketTypeModal = (ticketType: TicketType) => {
    setEditingTicketType(ticketType);
    setTicketTypeFormData({
      name: ticketType.name,
      price: ticketType.price.toString(),
      quantity: ticketType.quantity.toString(),
      description: ticketType.description || '',
      maxPerOrder: ticketType.maxPerOrder.toString(),
      saleStart: toDateTimeLocal(ticketType.saleStart),
      saleEnd: toDateTimeLocal(ticketType.saleEnd),
      serviceFee: ticketType.serviceFee ? ticketType.serviceFee.toString() : '',
      showServiceFeeSeparate: ticketType.showServiceFeeSeparate || false,
    });
  };

  const getTicketSaleUrl = (concertId: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/tickets/${concertId}`;
  };

  const copyTicketUrl = (concertId: string) => {
    navigator.clipboard.writeText(getTicketSaleUrl(concertId));
    showSuccess(t('tickets.urlCopied'));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      name: formData.name,
      date: formData.date,
      endDate: formData.endDate || undefined,
      location: formData.location || undefined,
      concertType: formData.concertType || undefined,
      description: formData.description || undefined,
      notes: formData.notes || undefined,
    });
    setShowAddModal(false);
    resetForm();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConcert) return;
    await updateMutation.mutateAsync({
      id: editingConcert.id,
      data: {
        name: formData.name,
        date: formData.date,
        endDate: formData.endDate || undefined,
        location: formData.location || undefined,
        concertType: formData.concertType || undefined,
        description: formData.description || undefined,
        notes: formData.notes || undefined,
      },
    });
    setEditingConcert(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingConcert) return;
    await deleteMutation.mutateAsync(deletingConcert.id);
    setDeletingConcert(null);
  };

  const handleAddProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingConcert) return;
    await addProgramMutation.mutateAsync({
      concertId: viewingConcert,
      item: {
        title: programFormData.title,
        arranger: programFormData.arranger || undefined,
        notes: programFormData.notes || undefined,
        partOfSet: programFormData.partOfSet || undefined,
        musicTitleId: programFormData.musicTitleId || undefined,
      },
    });
    setShowAddProgramModal(false);
    setProgramFormData({ title: '', arranger: '', notes: '', partOfSet: '', musicTitleId: '' });
  };

  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingConcert) return;
    await addMediaMutation.mutateAsync({
      concertId: viewingConcert,
      media: {
        mediaType: mediaFormData.mediaType,
        url: mediaFormData.url || undefined,
        description: mediaFormData.description || undefined,
      },
    });
    setShowAddMediaModal(false);
    setMediaFormData({ mediaType: 'photo', url: '', description: '' });
  };

  const handleAddAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingConcert || selectedUserIds.length === 0) return;
    await addAttendanceMutation.mutateAsync({
      concertId: viewingConcert,
      userIds: selectedUserIds,
    });
    setShowAddAttendanceModal(false);
    setSelectedUserIds([]);
  };

  const handleExportBumaStemra = async (e: React.FormEvent) => {
    e.preventDefault();
    await exportBumaStemraMutation.mutateAsync({
      startDate: bumaStemraStartDate,
      endDate: bumaStemraEndDate,
    });
    setShowBumaStemraModal(false);
  };

  const openEditModal = (concert: Concert) => {
    setEditingConcert(concert);
    setFormData({
      name: concert.name,
      date: concert.date,
      endDate: concert.endDate || '',
      location: concert.location || '',
      concertType: concert.concertType || '',
      description: concert.description || '',
      notes: concert.notes || '',
    });
  };

  const getConcertTypeLabel = (value: string) => {
    const type = concertTypes.find((t) => t.value === value);
    return type?.label || value;
  };

  const getMediaTypeLabel = (value: string) => {
    const type = mediaTypes.find((t) => t.value === value);
    return type?.label || value;
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('concerts.title')}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={8} columns={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('concerts.title')}
          <span className="badge badge-primary ml-2">{concerts.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + {t('concerts.newConcert')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${activeTab === 'list' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('list')}
        >
          {t('concerts.title')}
        </button>
        <button
          className={`btn ${activeTab === 'statistics' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('statistics')}
        >
          {t('concerts.statistics')}
        </button>
        <button
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('history')}
        >
          {t('concerts.pieceHistory')}
        </button>
      </div>

      {activeTab === 'list' && (
        <>
          {/* Filters */}
          <div className="card mb-3">
            <div className="card-body">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('concerts.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ maxWidth: '250px' }}
                />
                <select
                  className="form-control"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  style={{ maxWidth: '150px' }}
                >
                  <option value="">{t('concerts.allYears')}</option>
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <select
                  className="form-control"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{ maxWidth: '180px' }}
                >
                  <option value="">{t('concerts.allTypes')}</option>
                  {concertTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Concerts Table */}
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.date')}</th>
                    <th>{t('concerts.location')}</th>
                    <th>{t('concerts.concertType')}</th>
                    <th>{t('concerts.program')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {concerts.map((concert) => (
                    <tr key={concert.id}>
                      <td>
                        <strong>{concert.name}</strong>
                        <AccessibilityIndicator hasAccessibilityInfo={concert.hasAccessibilityInfo || false} />
                      </td>
                      <td>{concert.date}</td>
                      <td>{concert.location || '-'}</td>
                      <td>{concert.concertType ? getConcertTypeLabel(concert.concertType) : '-'}</td>
                      <td>
                        <span className="badge badge-outline">{concert.programCount} {t('concerts.programCount')}</span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => setViewingConcert(concert.id)}
                          >
                            <Icon name="eye" size={16} />
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openEditModal(concert)}
                          >
                            <Icon name="pencil" size={16} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeletingConcert(concert)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {concerts.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#666' }}>
                        {t('concerts.noConcerts')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'statistics' && statistics && (
        <div className="card">
          <div className="card-body">
            <div className="flex justify-between items-center mb-3">
              <h3 style={{ margin: 0 }}>{t('concerts.statistics')}</h3>
              <button
                className="btn btn-outline"
                onClick={() => setShowBumaStemraModal(true)}
              >
                {t('concerts.bumaStemraExport')}
              </button>
            </div>
            <div className="flex gap-3 mb-3">
              <div className="card" style={{ flex: 1, padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{statistics.totalConcerts}</div>
                <div>{t('concerts.totalConcerts')}</div>
              </div>
            </div>

            <h4>{t('concerts.mostPlayedPieces')}</h4>
            {statistics.mostPlayedPieces.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('myMusic.table.title')}</th>
                    <th>{t('concerts.timesPlayed', { count: 0 }).replace('0x', '#')}</th>
                    <th>{t('concerts.lastPlayed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.mostPlayedPieces.slice(0, 10).map((piece, i) => (
                    <tr key={i}>
                      <td><strong>{piece.title}</strong></td>
                      <td><span className="badge badge-primary">{piece.playCount}x</span></td>
                      <td>{piece.lastPlayed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: '#666' }}>Geen data.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('concerts.whenLastPlayed')}</h3>
            <div className="form-group">
              <input
                type="text"
                className="form-control"
                placeholder={t('concerts.searchPieceHistory')}
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                style={{ maxWidth: '400px' }}
              />
            </div>

            {searchTitle && pieceHistoryData && (
              <div>
                <h4>"{pieceHistoryData.title}"</h4>
                <p>
                  {pieceHistoryData.playCount > 0 ? (
                    <>
                      {t('concerts.timesPlayed', { count: pieceHistoryData.playCount })} -
                      {t('concerts.lastPlayed')}: {pieceHistoryData.lastPlayed}
                    </>
                  ) : (
                    t('concerts.neverPlayed')
                  )}
                </p>

                {pieceHistoryData.history.length > 0 && (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('common.date')}</th>
                        <th>{t('concerts.concertName')}</th>
                        <th>{t('concerts.location')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pieceHistoryData.history.map((h, i) => (
                        <tr key={i}>
                          <td>{h.date}</td>
                          <td>{h.concertName}</td>
                          <td>{h.location || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Concert Modal */}
      {(showAddModal || editingConcert) && (
        <FormModal
          title={editingConcert ? t('concerts.edit') : t('concerts.newConcert')}
          onClose={() => {
            setShowAddModal(false);
            setEditingConcert(null);
            resetForm();
          }}
          onSubmit={editingConcert ? handleUpdate : handleCreate}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('concerts.concertName')} *</label>
            <input
              type="text"
              className="form-control"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('concerts.date')} *</label>
              <input
                type="date"
                className="form-control"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('concerts.endDate')}</label>
              <input
                type="date"
                className="form-control"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.location')}</label>
            <input
              type="text"
              className="form-control"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.concertType')}</label>
            <select
              className="form-control"
              value={formData.concertType}
              onChange={(e) => setFormData({ ...formData, concertType: e.target.value })}
            >
              <option value="">--</option>
              {concertTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.description')}</label>
            <textarea
              className="form-control"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
        </FormModal>
      )}

      {/* View Concert Detail Modal */}
      {viewingConcert && concertDetail && (
        <Modal
          title={concertDetail.name}
          onClose={() => setViewingConcert(null)}
          size="large"
        >
          <div className="mb-3">
            <div className="flex justify-between items-start">
              <div>
                <p><strong>{t('common.date')}:</strong> {concertDetail.date}</p>
                <p><strong>{t('concerts.location')}:</strong> {concertDetail.location || '-'}</p>
                {concertDetail.concertType && (
                  <p><strong>{t('concerts.concertType')}:</strong> {getConcertTypeLabel(concertDetail.concertType)}</p>
                )}
              </div>
              <AddToCalendarButton type="concert" id={concertDetail.id} />
            </div>
          </div>

          {/* Accessibility Info Section */}
          {(concertDetail.wheelchairSpaces || concertDetail.companionSpaces ||
            concertDetail.hearingLoopAvailable || concertDetail.accessibleParkingInfo ||
            concertDetail.accessibilityInfo) && (
            <AccessibilityInfo
              wheelchairSpaces={concertDetail.wheelchairSpaces || 0}
              companionSpaces={concertDetail.companionSpaces || 0}
              hearingLoopAvailable={concertDetail.hearingLoopAvailable || false}
              accessibleParkingInfo={concertDetail.accessibleParkingInfo || undefined}
              additionalInfo={concertDetail.accessibilityInfo || undefined}
              contactEmail={concertDetail.accessibilityContactEmail || undefined}
              contactPhone={concertDetail.accessibilityContactPhone || undefined}
            />
          )}

          {/* Program Section */}
          <div className="flex justify-between items-center mb-2">
            <h4 style={{ margin: 0 }}>{t('concerts.program')}</h4>
            <div className="flex gap-2">
              <button className="btn btn-outline btn-sm" onClick={() => exportProgramMutation.mutate(viewingConcert)}>
                {t('concerts.exportProgram')}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddProgramModal(true)}>
                + {t('concerts.addProgramItem')}
              </button>
            </div>
          </div>
          {concertDetail.program.length > 0 ? (
            <table className="table mb-3">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('concerts.programTitle')}</th>
                  <th>{t('concerts.programArranger')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {concertDetail.program.map((item, i) => (
                  <tr key={item.id}>
                    <td>{i + 1}</td>
                    <td><strong>{item.title}</strong></td>
                    <td>{item.arranger || '-'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteProgramMutation.mutate({ concertId: viewingConcert, programId: item.id })}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666' }}>{t('concerts.noProgramItems')}</p>
          )}

          {/* Media Section */}
          <div className="flex justify-between items-center mb-2">
            <h4 style={{ margin: 0 }}>{t('concerts.media')}</h4>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddMediaModal(true)}>
              + {t('concerts.addMedia')}
            </button>
          </div>
          {concertDetail.media.length > 0 ? (
            <div className="flex gap-2 flex-wrap mb-3">
              {concertDetail.media.map((m) => (
                <div key={m.id} className="card" style={{ padding: '0.5rem', minWidth: '150px' }}>
                  <div><strong>{getMediaTypeLabel(m.mediaType)}</strong></div>
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem' }}>
                      {m.description || 'Link'}
                    </a>
                  )}
                  <button
                    className="btn btn-danger btn-sm mt-1"
                    onClick={() => deleteMediaMutation.mutate({ concertId: viewingConcert, mediaId: m.id })}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#666' }}>{t('concerts.noMedia')}</p>
          )}

          {/* Tickets Section */}
          <div className="flex justify-between items-center mb-2">
            <h4 style={{ margin: 0 }}>{t('tickets.title')}</h4>
            <div className="flex gap-2">
              <Link
                to={`/concerts/${viewingConcert}/guest-list`}
                className="btn btn-outline btn-sm"
              >
                {t('guestList.title')}
              </Link>
              {ticketData?.ticketTypes && ticketData.ticketTypes.length > 0 && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => copyTicketUrl(viewingConcert)}
                  title={t('tickets.copyUrl')}
                >
                  {t('tickets.copyUrl')}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddTicketTypeModal(true)}>
                + {t('tickets.addTicketType')}
              </button>
            </div>
          </div>
          {ticketData?.ticketTypes && ticketData.ticketTypes.length > 0 && (
            <div className="card mb-3" style={{ backgroundColor: 'var(--bg-secondary)', padding: '0.75rem' }}>
              <small style={{ color: 'var(--text-muted)' }}>{t('tickets.publicUrl')}:</small>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{getTicketSaleUrl(viewingConcert)}</code>
              </div>
            </div>
          )}
          {ticketData?.ticketTypes && ticketData.ticketTypes.length > 0 ? (
            <table className="table mb-3">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('tickets.price')}</th>
                  <th>{t('tickets.available')}</th>
                  <th>{t('common.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ticketData.ticketTypes.map((tt) => (
                  <tr key={tt.id}>
                    <td>
                      <strong>{tt.name}</strong>
                      {tt.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tt.description}</div>}
                    </td>
                    <td>EUR {tt.price.toFixed(2)}</td>
                    <td>{tt.available} / {tt.quantity}</td>
                    <td>
                      {tt.available === 0 ? (
                        <span className="badge badge-danger">{t('tickets.soldOut')}</span>
                      ) : tt.onSale ? (
                        <span className="badge badge-success">{t('tickets.onSale')}</span>
                      ) : (
                        <span className="badge badge-warning">{t('tickets.notOnSale')}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEditTicketTypeModal(tt)}
                        >
                          <Icon name="pencil" size={16} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingTicketType(tt)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666', marginBottom: '1rem' }}>{t('tickets.noTicketTypes')}</p>
          )}

          {/* Attendance Section */}
          <div className="flex justify-between items-center mb-2">
            <h4 style={{ margin: 0 }}>{t('concerts.attendance')}</h4>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddAttendanceModal(true)}>
              + {t('concerts.bulkAddAttendance')}
            </button>
          </div>
          {concertDetail.attendance.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('concerts.memberName')}</th>
                  <th>{t('concerts.instrumentPlayed')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {concertDetail.attendance.map((a) => (
                  <tr key={a.id}>
                    <td>{a.memberName}</td>
                    <td>{a.instrumentPlayed || '-'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteAttendanceMutation.mutate({ concertId: viewingConcert, attendanceId: a.id })}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666' }}>{t('concerts.noAttendance')}</p>
          )}
        </Modal>
      )}

      {/* Add Program Modal */}
      {showAddProgramModal && viewingConcert && (
        <FormModal
          title={t('concerts.addProgramItem')}
          onClose={() => setShowAddProgramModal(false)}
          onSubmit={handleAddProgram}
          isSubmitting={addProgramMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('concerts.selectFromRepertoire')}</label>
            <select
              className="form-control"
              value={programFormData.musicTitleId}
              onChange={(e) => {
                const selectedIndex = parseInt(e.target.value);
                if (!isNaN(selectedIndex) && musicTitles[selectedIndex]) {
                  const selectedTitle = musicTitles[selectedIndex];
                  setProgramFormData({
                    ...programFormData,
                    musicTitleId: selectedTitle.id || '',
                    title: selectedTitle.title,
                    arranger: selectedTitle.arranger || '',
                  });
                } else {
                  setProgramFormData({
                    ...programFormData,
                    musicTitleId: '',
                  });
                }
              }}
            >
              <option value="">-- {t('common.select')} --</option>
              {musicTitles.map((title, index) => (
                <option key={`${title.title}-${title.arranger || ''}-${index}`} value={index}>
                  {title.title} {title.arranger ? `(${title.arranger})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.programTitle')} *</label>
            <input
              type="text"
              className="form-control"
              value={programFormData.title}
              onChange={(e) => setProgramFormData({ ...programFormData, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.programArranger')}</label>
            <input
              type="text"
              className="form-control"
              value={programFormData.arranger}
              onChange={(e) => setProgramFormData({ ...programFormData, arranger: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.programPartOfSet')}</label>
            <input
              type="text"
              className="form-control"
              value={programFormData.partOfSet}
              onChange={(e) => setProgramFormData({ ...programFormData, partOfSet: e.target.value })}
              placeholder={t('concerts.programPartOfSetPlaceholder')}
            />
          </div>
        </FormModal>
      )}

      {/* Add Media Modal */}
      {showAddMediaModal && viewingConcert && (
        <FormModal
          title={t('concerts.addMedia')}
          onClose={() => setShowAddMediaModal(false)}
          onSubmit={handleAddMedia}
          isSubmitting={addMediaMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('concerts.mediaType')} *</label>
            <select
              className="form-control"
              value={mediaFormData.mediaType}
              onChange={(e) => setMediaFormData({ ...mediaFormData, mediaType: e.target.value })}
              required
            >
              {mediaTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.mediaUrl')}</label>
            <input
              type="url"
              className="form-control"
              value={mediaFormData.url}
              onChange={(e) => setMediaFormData({ ...mediaFormData, url: e.target.value })}
              placeholder={t('concerts.mediaUrlPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('concerts.mediaDescription')}</label>
            <input
              type="text"
              className="form-control"
              value={mediaFormData.description}
              onChange={(e) => setMediaFormData({ ...mediaFormData, description: e.target.value })}
            />
          </div>
        </FormModal>
      )}

      {/* Add Attendance Modal */}
      {showAddAttendanceModal && viewingConcert && (
        <FormModal
          title={t('concerts.bulkAddAttendance')}
          onClose={() => { setShowAddAttendanceModal(false); setSelectedUserIds([]); }}
          onSubmit={handleAddAttendance}
          isSubmitting={addAttendanceMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('users.title')}</label>
            <div style={{ maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.5rem' }}>
              {users.map((user) => (
                <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUserIds([...selectedUserIds, user.id]);
                      } else {
                        setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                      }
                    }}
                  />
                  {user.firstName} {user.lastName}
                </label>
              ))}
            </div>
            <small style={{ color: '#666' }}>{selectedUserIds.length} geselecteerd</small>
          </div>
        </FormModal>
      )}

      {/* Buma/Stemra Export Modal */}
      {showBumaStemraModal && (
        <FormModal
          title={t('concerts.bumaStemraExport')}
          onClose={() => setShowBumaStemraModal(false)}
          onSubmit={handleExportBumaStemra}
          isSubmitting={exportBumaStemraMutation.isPending}
          submitLabel={t('concerts.downloadExport')}
        >
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            {t('concerts.bumaStemraDescription')}
          </p>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('concerts.startDate')}</label>
              <input
                type="date"
                className="form-control"
                value={bumaStemraStartDate}
                onChange={(e) => setBumaStemraStartDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('concerts.endDateExport')}</label>
              <input
                type="date"
                className="form-control"
                value={bumaStemraEndDate}
                onChange={(e) => setBumaStemraEndDate(e.target.value)}
                required
              />
            </div>
          </div>
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingConcert && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('concerts.deleteConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingConcert(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}

      {/* Add/Edit Ticket Type Modal */}
      {(showAddTicketTypeModal || editingTicketType) && (
        <FormModal
          title={editingTicketType ? t('tickets.editTicketType') : t('tickets.addTicketType')}
          onClose={() => {
            setShowAddTicketTypeModal(false);
            setEditingTicketType(null);
            resetTicketTypeForm();
          }}
          onSubmit={editingTicketType ? handleUpdateTicketType : handleCreateTicketType}
          isSubmitting={createTicketTypeMutation.isPending || updateTicketTypeMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('common.name')} *</label>
            <input
              type="text"
              className="form-control"
              value={ticketTypeFormData.name}
              onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, name: e.target.value })}
              placeholder={t('tickets.ticketTypePlaceholder')}
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('tickets.price')} (EUR) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                value={ticketTypeFormData.price}
                onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, price: e.target.value })}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('tickets.quantity')} *</label>
              <input
                type="number"
                min="1"
                className="form-control"
                value={ticketTypeFormData.quantity}
                onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, quantity: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('common.description')}</label>
            <input
              type="text"
              className="form-control"
              value={ticketTypeFormData.description}
              onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, description: e.target.value })}
              placeholder={t('tickets.ticketTypeDescPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('tickets.maxPerOrder')}</label>
            <input
              type="number"
              min="1"
              max="50"
              className="form-control"
              value={ticketTypeFormData.maxPerOrder}
              onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, maxPerOrder: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('tickets.saleStart')}</label>
              <input
                type="datetime-local"
                className="form-control"
                value={ticketTypeFormData.saleStart}
                onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, saleStart: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('tickets.saleEnd')}</label>
              <input
                type="datetime-local"
                className="form-control"
                value={ticketTypeFormData.saleEnd}
                onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, saleEnd: e.target.value })}
              />
            </div>
          </div>
          <hr style={{ margin: '1rem 0' }} />
          <div className="form-group">
            <label className="form-label">{t('tickets.ticketTypeServiceFee')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-control"
              value={ticketTypeFormData.serviceFee}
              onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, serviceFee: e.target.value })}
              placeholder="0.00"
            />
            <small style={{ color: 'var(--text-light)' }}>
              {t('tickets.ticketTypeServiceFeeHelp')}
            </small>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ticketTypeFormData.showServiceFeeSeparate}
                onChange={(e) => setTicketTypeFormData({ ...ticketTypeFormData, showServiceFeeSeparate: e.target.checked })}
              />
              {t('tickets.showServiceFeeSeparate')}
            </label>
            <small style={{ color: 'var(--text-light)', display: 'block', marginTop: '0.25rem' }}>
              {t('tickets.showServiceFeeSeparateHelp')}
            </small>
          </div>
        </FormModal>
      )}

      {/* Delete Ticket Type Confirmation */}
      {deletingTicketType && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('tickets.deleteTicketTypeConfirm', { name: deletingTicketType.name })}
          confirmLabel={t('common.delete')}
          onConfirm={() => deleteTicketTypeMutation.mutate(deletingTicketType.id)}
          onCancel={() => setDeletingTicketType(null)}
          isLoading={deleteTicketTypeMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
