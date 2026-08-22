import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { Modal, FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { useInstruments } from '../hooks/useInstruments';
import { useConcerts } from '../hooks/useConcerts';
import {
  useReplacementRequests,
  useReplacementRequest,
  useCreateReplacementRequest,
  useCancelReplacementRequest,
  useInviteMusician,
  useUpdateAssignment,
} from '../hooks/useReplacementRequests';
import { useExternalMusicianSearch } from '../hooks/useExternalMusicians';
import type {
  ReplacementRequest,
  ReplacementRequestDetail,
  CreateReplacementRequestData,
  ReplacementAssignment,
} from '../api/replacement-requests';

const URGENCY_COLORS: Record<string, string> = {
  low: 'badge-secondary',
  normal: 'badge-info',
  high: 'badge-warning',
  critical: 'badge-danger',
};

const URGENCY_LABELS: Record<string, string> = {
  low: 'Laag',
  normal: 'Normaal',
  high: 'Hoog',
  critical: 'Kritiek',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'badge-primary',
  partially_filled: 'badge-warning',
  filled: 'badge-success',
  cancelled: 'badge-secondary',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  partially_filled: 'Deels ingevuld',
  filled: 'Ingevuld',
  cancelled: 'Geannuleerd',
};

const ASSIGNMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'badge-warning',
  confirmed: 'badge-success',
  declined: 'badge-danger',
  completed: 'badge-primary',
  no_show: 'badge-secondary',
};

const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'In afwachting',
  confirmed: 'Bevestigd',
  declined: 'Afgewezen',
  completed: 'Voltooid',
  no_show: 'Niet verschenen',
};

interface CreateFormData {
  eventType: 'concert' | 'rehearsal';
  eventId: string;
  eventDate: string;
  instrumentId: string;
  positionsNeeded: number;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  notes: string;
  deadline: string;
}

const emptyCreateForm: CreateFormData = {
  eventType: 'concert',
  eventId: '',
  eventDate: '',
  instrumentId: '',
  positionsNeeded: 1,
  urgency: 'normal',
  notes: '',
  deadline: '',
};

export default function ReplacementRequests() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('replacementRequests.title');

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterUrgency, setFilterUrgency] = useState<string>('');
  const [filterEventType, setFilterEventType] = useState<string>('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<ReplacementRequest | null>(null);
  const [cancellingRequest, setCancellingRequest] = useState<ReplacementRequest | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRequestId, setInviteRequestId] = useState<string | null>(null);
  const [inviteInstrumentId, setInviteInstrumentId] = useState<string | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState<CreateFormData>(emptyCreateForm);
  const [selectedMusicianId, setSelectedMusicianId] = useState<string>('');
  const [inviteNotes, setInviteNotes] = useState('');
  const [inviteFee, setInviteFee] = useState<string>('');

  // Vast id voor het enige veld dat niet via FormField loopt (zie de opmerking daar)
  const muzikantVeldId = useId();

  const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE || user?.role === ROLES.CONDUCTOR;

  // Queries
  const { data: requests = [], isLoading } = useReplacementRequests({
    status: filterStatus || undefined,
    urgency: filterUrgency || undefined,
    eventType: filterEventType || undefined,
  });

  const { data: requestDetail } = useReplacementRequest(viewingRequest?.id || null);
  const { data: instruments = [] } = useInstruments();
  const { data: concertsData } = useConcerts();
  const concerts = concertsData?.data || [];
  const { data: suggestedMusicians = [] } = useExternalMusicianSearch(inviteInstrumentId, { activeOnly: true });

  // Mutations
  const createMutation = useCreateReplacementRequest();
  const cancelMutation = useCancelReplacementRequest();
  const inviteMutation = useInviteMusician();
  const updateAssignmentMutation = useUpdateAssignment();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: CreateReplacementRequestData = {
      eventType: createForm.eventType,
      eventId: createForm.eventId,
      eventDate: createForm.eventDate,
      instrumentId: createForm.instrumentId,
      positionsNeeded: createForm.positionsNeeded,
      urgency: createForm.urgency,
      notes: createForm.notes || null,
      deadline: createForm.deadline || null,
    };

    await createMutation.mutateAsync(data);
    setShowCreateModal(false);
    setCreateForm(emptyCreateForm);
  };

  const handleCancel = async () => {
    if (!cancellingRequest) return;
    await cancelMutation.mutateAsync(cancellingRequest.id);
    setCancellingRequest(null);
  };

  const openInviteModal = (request: ReplacementRequest | ReplacementRequestDetail) => {
    setInviteRequestId(request.id);
    setInviteInstrumentId(request.instrumentId);
    setSelectedMusicianId('');
    setInviteNotes('');
    setInviteFee('');
    setShowInviteModal(true);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteRequestId || !selectedMusicianId) return;

    await inviteMutation.mutateAsync({
      requestId: inviteRequestId,
      data: {
        externalMusicianId: selectedMusicianId,
        notes: inviteNotes || null,
        feeAmount: inviteFee ? parseFloat(inviteFee) : null,
      },
    });
    setShowInviteModal(false);
  };

  const handleAssignmentStatusChange = async (
    requestId: string,
    assignment: ReplacementAssignment,
    newStatus: string,
  ) => {
    await updateAssignmentMutation.mutateAsync({
      requestId,
      assignmentId: assignment.id,
      data: { status: newStatus as any },
    });
  };

  // Update event date when concert is selected
  const handleEventChange = (eventId: string) => {
    const concert = concerts.find((c) => c.id === eventId);
    setCreateForm({
      ...createForm,
      eventId,
      eventDate: concert?.date || '',
    });
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('replacementRequests.title')}</h1>
        <SkeletonTable rows={5} columns={7} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          {t('replacementRequests.title')}
          <span className="badge badge-primary ml-2">{requests.length}</span>
        </h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={16} className="mr-1" />
            {t('replacementRequests.createRequest')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="grid grid-cols-3 gap-2">
            <div className="form-group mb-0">
              <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">{t('replacementRequests.allStatuses')}</option>
                <option value="open">{STATUS_LABELS.open}</option>
                <option value="partially_filled">{STATUS_LABELS.partially_filled}</option>
                <option value="filled">{STATUS_LABELS.filled}</option>
                <option value="cancelled">{STATUS_LABELS.cancelled}</option>
              </select>
            </div>
            <div className="form-group mb-0">
              <select className="form-control" value={filterUrgency} onChange={(e) => setFilterUrgency(e.target.value)}>
                <option value="">{t('replacementRequests.allUrgencies')}</option>
                <option value="low">{URGENCY_LABELS.low}</option>
                <option value="normal">{URGENCY_LABELS.normal}</option>
                <option value="high">{URGENCY_LABELS.high}</option>
                <option value="critical">{URGENCY_LABELS.critical}</option>
              </select>
            </div>
            <div className="form-group mb-0">
              <select
                className="form-control"
                value={filterEventType}
                onChange={(e) => setFilterEventType(e.target.value)}
              >
                <option value="">{t('replacementRequests.allEventTypes')}</option>
                <option value="concert">{t('replacementRequests.concert')}</option>
                <option value="rehearsal">{t('replacementRequests.rehearsal')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {requests.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('replacementRequests.event')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('replacementRequests.instrument')}</th>
                  <th>{t('replacementRequests.positions')}</th>
                  <th>{t('replacementRequests.urgency')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <button
                        className="btn-link text-primary"
                        onClick={() => setViewingRequest(request)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        {request.eventName || request.eventType}
                      </button>
                      {request.eventLocation && <div className="text-muted text-sm">{request.eventLocation}</div>}
                    </td>
                    <td>{new Date(request.eventDate).toLocaleDateString()}</td>
                    <td>
                      {request.instrumentName}
                      {request.instrumentTuning && <span className="text-muted"> ({request.instrumentTuning})</span>}
                    </td>
                    <td>
                      {request.positionsFilled}/{request.positionsNeeded}
                      {request.confirmedCount > 0 && (
                        <span className="text-success ml-1">({request.confirmedCount} bevestigd)</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${URGENCY_COLORS[request.urgency]}`}>
                        {URGENCY_LABELS[request.urgency]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLORS[request.status]}`}>{STATUS_LABELS[request.status]}</span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setViewingRequest(request)}
                          title={t('common.details')}
                        >
                          <Icon name="eye" size={16} />
                        </button>
                        {canEdit && request.status !== 'filled' && request.status !== 'cancelled' && (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => openInviteModal(request)}
                              title={t('replacementRequests.invite')}
                            >
                              <Icon name="plus" size={16} />
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setCancellingRequest(request)}
                              title={t('common.cancel')}
                            >
                              <Icon name="close" size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state p-4">
              <Icon name="clipboard" size={48} className="text-muted mb-2" />
              <p>{t('replacementRequests.noRequests')}</p>
            </div>
          )}
        </div>
      </div>

      {/* View Request Modal */}
      {viewingRequest && requestDetail && (
        <Modal
          title={`${requestDetail.eventName || requestDetail.eventType} - ${requestDetail.instrumentName}`}
          onClose={() => setViewingRequest(null)}
          size="large"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label text-muted">{t('common.date')}</label>
                <p>{new Date(requestDetail.eventDate).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="form-label text-muted">{t('replacementRequests.urgency')}</label>
                <p>
                  <span className={`badge ${URGENCY_COLORS[requestDetail.urgency]}`}>
                    {URGENCY_LABELS[requestDetail.urgency]}
                  </span>
                </p>
              </div>
              <div>
                <label className="form-label text-muted">{t('common.status')}</label>
                <p>
                  <span className={`badge ${STATUS_COLORS[requestDetail.status]}`}>
                    {STATUS_LABELS[requestDetail.status]}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-muted">{t('replacementRequests.positions')}</label>
                <p>
                  {requestDetail.positionsFilled} / {requestDetail.positionsNeeded} {t('replacementRequests.filled')}
                </p>
              </div>
              {requestDetail.deadline && (
                <div>
                  <label className="form-label text-muted">{t('replacementRequests.deadline')}</label>
                  <p>{new Date(requestDetail.deadline).toLocaleDateString()}</p>
                </div>
              )}
            </div>

            {requestDetail.notes && (
              <div>
                <label className="form-label text-muted">{t('common.notes')}</label>
                <p style={{ whiteSpace: 'pre-wrap' }}>{requestDetail.notes}</p>
              </div>
            )}

            <div>
              <div className="page-header">
                <label className="form-label text-muted mb-0">{t('replacementRequests.invitations')}</label>
                {canEdit && requestDetail.status !== 'filled' && requestDetail.status !== 'cancelled' && (
                  <button className="btn btn-primary btn-sm" onClick={() => openInviteModal(requestDetail)}>
                    <Icon name="plus" size={16} className="mr-1" />
                    {t('replacementRequests.inviteMusician')}
                  </button>
                )}
              </div>

              {requestDetail.assignments.length > 0 ? (
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('replacementRequests.invited')}</th>
                      {canEdit && <th>{t('common.actions')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {requestDetail.assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>
                          {assignment.firstName} {assignment.lastName}
                          {assignment.email && <div className="text-muted text-sm">{assignment.email}</div>}
                        </td>
                        <td>
                          <span className={`badge ${ASSIGNMENT_STATUS_COLORS[assignment.status]}`}>
                            {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                          </span>
                        </td>
                        <td>
                          {new Date(assignment.invitedAt).toLocaleDateString()}
                          {assignment.respondedAt && (
                            <div className="text-muted text-sm">
                              {t('replacementRequests.responded')}:{' '}
                              {new Date(assignment.respondedAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        {canEdit && (
                          <td>
                            <select
                              className="form-control form-control-sm"
                              value={assignment.status}
                              onChange={(e) =>
                                handleAssignmentStatusChange(requestDetail.id, assignment, e.target.value)
                              }
                              disabled={updateAssignmentMutation.isPending}
                            >
                              <option value="pending">{ASSIGNMENT_STATUS_LABELS.pending}</option>
                              <option value="confirmed">{ASSIGNMENT_STATUS_LABELS.confirmed}</option>
                              <option value="declined">{ASSIGNMENT_STATUS_LABELS.declined}</option>
                              <option value="completed">{ASSIGNMENT_STATUS_LABELS.completed}</option>
                              <option value="no_show">{ASSIGNMENT_STATUS_LABELS.no_show}</option>
                            </select>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted">{t('replacementRequests.noInvitations')}</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Create Request Modal */}
      {showCreateModal && (
        <FormModal
          title={t('replacementRequests.createRequest')}
          onClose={() => {
            setShowCreateModal(false);
            setCreateForm(emptyCreateForm);
          }}
          onSubmit={handleCreate}
          submitLabel={t('common.create')}
          isSubmitting={createMutation.isPending}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label={`${t('replacementRequests.eventType')} *`}>
              <select
                className="form-control"
                value={createForm.eventType}
                onChange={(e) => setCreateForm({ ...createForm, eventType: e.target.value as any, eventId: '' })}
                required
              >
                <option value="concert">{t('replacementRequests.concert')}</option>
                <option value="rehearsal">{t('replacementRequests.rehearsal')}</option>
              </select>
            </FormField>
            {/* Het kind is hier een keuze tussen twee velden; wat het ook wordt, het is
                één element en krijgt dus het id van het label. */}
            <FormField label={`${t('replacementRequests.event')} *`}>
              {createForm.eventType === 'concert' ? (
                <select
                  className="form-control"
                  value={createForm.eventId}
                  onChange={(e) => handleEventChange(e.target.value)}
                  required
                >
                  <option value="">{t('replacementRequests.selectEvent')}</option>
                  {concerts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} - {new Date(c.date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="form-control"
                  value={createForm.eventId}
                  onChange={(e) => setCreateForm({ ...createForm, eventId: e.target.value })}
                  placeholder={t('replacementRequests.rehearsalId')}
                  required
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label={`${t('common.date')} *`}>
              <input
                type="date"
                className="form-control"
                value={createForm.eventDate}
                onChange={(e) => setCreateForm({ ...createForm, eventDate: e.target.value })}
                required
              />
            </FormField>
            <FormField label={`${t('replacementRequests.instrument')} *`}>
              <select
                className="form-control"
                value={createForm.instrumentId}
                onChange={(e) => setCreateForm({ ...createForm, instrumentId: e.target.value })}
                required
              >
                <option value="">{t('replacementRequests.selectInstrument')}</option>
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} {i.tuning ? `(${i.tuning})` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField label={`${t('replacementRequests.positions')} *`}>
              <input
                type="number"
                className="form-control"
                min="1"
                value={createForm.positionsNeeded}
                onChange={(e) => setCreateForm({ ...createForm, positionsNeeded: parseInt(e.target.value) || 1 })}
                required
              />
            </FormField>
            <FormField label={`${t('replacementRequests.urgency')} *`}>
              <select
                className="form-control"
                value={createForm.urgency}
                onChange={(e) => setCreateForm({ ...createForm, urgency: e.target.value as any })}
                required
              >
                <option value="low">{URGENCY_LABELS.low}</option>
                <option value="normal">{URGENCY_LABELS.normal}</option>
                <option value="high">{URGENCY_LABELS.high}</option>
                <option value="critical">{URGENCY_LABELS.critical}</option>
              </select>
            </FormField>
            <FormField label={t('replacementRequests.deadline')}>
              <input
                type="date"
                className="form-control"
                value={createForm.deadline}
                onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label={t('common.notes')}>
            <textarea
              className="form-control"
              rows={3}
              value={createForm.notes}
              onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
            />
          </FormField>
        </FormModal>
      )}

      {/* Invite Musician Modal */}
      {showInviteModal && (
        <FormModal
          title={t('replacementRequests.inviteMusician')}
          onClose={() => setShowInviteModal(false)}
          onSubmit={handleInvite}
          submitLabel={t('replacementRequests.invite')}
          isSubmitting={inviteMutation.isPending}
        >
          {/* Met de hand gekoppeld in plaats van via FormField: onder het veld staat nog
              een melding wanneer er geen muzikanten zijn. Die hoort binnen dezelfde
              form-group te blijven, en FormField neemt maar één kindelement. */}
          <div className="form-group">
            <label className="form-label" htmlFor={muzikantVeldId}>
              {t('replacementRequests.selectMusician')} *
            </label>
            <select
              id={muzikantVeldId}
              aria-describedby={suggestedMusicians.length === 0 ? `${muzikantVeldId}-melding` : undefined}
              className="form-control"
              value={selectedMusicianId}
              onChange={(e) => setSelectedMusicianId(e.target.value)}
              required
            >
              <option value="">{t('replacementRequests.chooseMusician')}</option>
              {suggestedMusicians.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName}
                  {m.rating && ` - ${m.rating} stars`}
                  {m.skillLevel && ` - ${m.skillLevel}`}
                </option>
              ))}
            </select>
            {suggestedMusicians.length === 0 && (
              <p id={`${muzikantVeldId}-melding`} className="text-muted text-sm mt-1">
                {t('replacementRequests.noMusiciansForInstrument')}
              </p>
            )}
          </div>

          <FormField label={t('replacementRequests.fee')}>
            <input
              type="number"
              className="form-control"
              step="0.01"
              min="0"
              value={inviteFee}
              onChange={(e) => setInviteFee(e.target.value)}
              placeholder="0.00"
            />
          </FormField>

          <FormField label={t('common.notes')}>
            <textarea
              className="form-control"
              rows={3}
              value={inviteNotes}
              onChange={(e) => setInviteNotes(e.target.value)}
              placeholder={t('replacementRequests.inviteNotesPlaceholder')}
            />
          </FormField>
        </FormModal>
      )}

      {/* Cancel Confirmation */}
      {cancellingRequest && (
        <ConfirmDialog
          title={t('replacementRequests.cancelRequest')}
          message={t('replacementRequests.cancelConfirm')}
          confirmLabel={t('common.cancel')}
          onConfirm={handleCancel}
          onCancel={() => setCancellingRequest(null)}
          isLoading={cancelMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
