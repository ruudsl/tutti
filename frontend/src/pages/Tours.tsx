import { formatCurrency } from '../utils/format';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import {
  getTours,
  getTour,
  createTour,
  registerForTour,
  cancelTourRegistration,
  TourStatus,
  CreateTourData,
  TourDetail,
} from '../api/tours';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { formatDate } from '../utils/dateFormat';
import { TourDayPlanningSection } from '../components/TourDayPlanningSection';
import { TourTransportSection } from '../components/TourTransportSection';

const STATUS_COLORS: Record<TourStatus, string> = {
  planning: 'badge-info',
  confirmed: 'badge-warning',
  active: 'badge-success',
  completed: 'badge-primary',
  cancelled: 'badge-error',
};

export default function Tours() {
  const { t } = useTranslation();
  useDocumentTitle('tours.title');
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  const { data: tours = [], isLoading } = useQuery({
    queryKey: ['tours'],
    queryFn: () => getTours(),
  });

  const registerMutation = useMutation({
    mutationFn: (tourId: string) => registerForTour(tourId),
    onSuccess: (data) => {
      showSuccess(data.message);
      queryClient.invalidateQueries({ queryKey: ['tours'] });
    },
    onError: () => showError(t('tours.errorRegister')),
  });

  const upcomingTours = tours.filter((t) => new Date(t.startDate) >= new Date());

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-2xl font-bold">{t('tours.title')}</h1>
        <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" size={18} />
          {t('tours.new')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('tours.total')}</div>
            <div className="text-2xl font-bold">{tours.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('tours.upcoming')}</div>
            <div className="text-2xl font-bold text-success">{upcomingTours.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('tours.participants')}</div>
            <div className="text-2xl font-bold">{tours.reduce((sum, t) => sum + t.participantCount, 0)}</div>
          </div>
        </div>
      </div>

      {/* Tours Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : tours.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="globe" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('tours.noTours')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tours.map((tour) => (
            <div
              key={tour.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedTourId(tour.id)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <h3 className="card-title text-lg">{tour.name}</h3>
                  <span className={`badge ${STATUS_COLORS[tour.status]}`}>{t(`tours.statuses.${tour.status}`)}</span>
                </div>

                {tour.destination && (
                  <div className="flex items-center gap-2 text-base-content/70">
                    <Icon name="mapPin" size={16} />
                    <span>
                      {tour.destination}
                      {tour.country ? `, ${tour.country}` : ''}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-base-content/60">
                  <span className="flex items-center gap-1">
                    <Icon name="calendar" size={14} />
                    {formatDate(tour.startDate)} - {formatDate(tour.endDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="users" size={14} />
                    {tour.participantCount}
                    {tour.maxParticipants ? ` / ${tour.maxParticipants}` : ''} {t('tours.participants')}
                  </span>
                </div>

                {tour.costPerPerson && (
                  <div className="text-sm">
                    <span className="font-medium">{t('tours.costPerPerson')}:</span>{' '}
                    {formatCurrency(tour.costPerPerson)}
                  </div>
                )}

                {tour.registrationDeadline && (
                  <div className="text-sm text-warning">
                    <Icon name="clock" size={14} className="inline mr-1" />
                    {t('tours.registrationDeadline')}: {formatDate(tour.registrationDeadline)}
                  </div>
                )}

                {/*
                  De hele kaart opent het detailvenster. Zonder de rem
                  hieronder deed één klik op "Aanmelden" twee dingen: hij
                  meldde aan én opende het venster, zodat de bevestiging
                  meteen achter een dialoog verdween.
                */}
                <div className="card-actions justify-end mt-2" onClick={(e) => e.stopPropagation()}>
                  {tour.status === 'planning' || tour.status === 'confirmed' ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => registerMutation.mutate(tour.id)}
                      disabled={registerMutation.isPending}
                    >
                      {t('tours.register')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <TourModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['tours'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {selectedTourId && (
        <TourDetailModal
          tourId={selectedTourId}
          onClose={() => setSelectedTourId(null)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['tours'] })}
        />
      )}
    </div>
  );
}

function TourModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateTourData>({
    name: '',
    description: '',
    destination: '',
    country: '',
    startDate: '',
    endDate: '',
  });

  const createMutation = useMutation({
    mutationFn: createTour,
    onSuccess: () => {
      showSuccess(t('tours.created'));
      onSuccess();
    },
    onError: () => showError(t('tours.errorCreate')),
  });

  const canSubmit = formData.name.trim().length > 0 && formData.startDate && formData.endDate;

  return (
    <Modal onClose={onClose} title={t('tours.new')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.destination')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.destination}
              onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.country')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.startDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.endDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const PARTICIPANT_STATUS_COLORS: Record<string, string> = {
  invited: 'badge-info',
  registered: 'badge-warning',
  confirmed: 'badge-success',
  declined: 'badge-error',
  cancelled: 'badge-error',
  waitlist: 'badge-warning',
};

function TourDetailModal({
  tourId,
  onClose,
  onRefresh,
}: {
  tourId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'days' | 'accommodations' | 'transport' | 'participants'>('days');

  const {
    data: tour,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['tour', tourId],
    queryFn: () => getTour(tourId),
  });

  const registerMutation = useMutation({
    mutationFn: () => registerForTour(tourId),
    onSuccess: (data) => {
      showSuccess(data.message);
      refetch();
      onRefresh();
    },
    onError: () => showError(t('tours.errorRegister')),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTourRegistration(tourId),
    onSuccess: () => {
      showSuccess(t('tours.registrationCancelled'));
      refetch();
      onRefresh();
    },
    onError: () => showError(t('tours.errorCancel')),
  });

  if (isLoading) {
    return (
      <Modal onClose={onClose} title={t('common.loading')}>
        <div className="flex justify-center p-8">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </Modal>
    );
  }

  if (!tour) {
    return (
      <Modal onClose={onClose} title={t('common.error')}>
        <p>{t('tours.notFound')}</p>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={tour.name} className="max-w-4xl">
      <div className="space-y-6">
        {/* Header Info */}
        <div className="flex flex-wrap items-center gap-4">
          <span className={`badge ${STATUS_COLORS[tour.status]} badge-lg`}>{t(`tours.statuses.${tour.status}`)}</span>
          {tour.destination && (
            <span className="flex items-center gap-1 text-base-content/70">
              <Icon name="mapPin" size={16} />
              {tour.destination}
              {tour.country ? `, ${tour.country}` : ''}
            </span>
          )}
          <span className="flex items-center gap-1 text-base-content/70">
            <Icon name="calendar" size={16} />
            {formatDate(tour.startDate)} - {formatDate(tour.endDate)}
          </span>
        </div>

        {tour.description && <p className="text-base-content/80">{tour.description}</p>}

        {/* Registration Section */}
        <div className="card bg-base-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-base-content/60">{t('tours.participants')}:</span>{' '}
                <span className="font-medium">
                  {tour.participantCount}
                  {tour.maxParticipants ? ` / ${tour.maxParticipants}` : ''}
                </span>
              </div>
              {tour.costPerPerson && (
                <div>
                  <span className="text-base-content/60">{t('tours.costPerPerson')}:</span>{' '}
                  <span className="font-medium">{formatCurrency(tour.costPerPerson)}</span>
                </div>
              )}
              {tour.registrationDeadline && (
                <div>
                  <span className="text-base-content/60">{t('tours.registrationDeadline')}:</span>{' '}
                  <span className="font-medium">{formatDate(tour.registrationDeadline)}</span>
                </div>
              )}
            </div>
            <div>
              {tour.myRegistration ? (
                <div className="flex items-center gap-2">
                  <span className={`badge ${PARTICIPANT_STATUS_COLORS[tour.myRegistration.status]}`}>
                    {t(`tours.participantStatuses.${tour.myRegistration.status}`)}
                  </span>
                  {(tour.myRegistration.status === 'registered' || tour.myRegistration.status === 'confirmed') && (
                    <button
                      className="btn btn-error btn-sm"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                    >
                      {t('tours.cancelRegistration')}
                    </button>
                  )}
                </div>
              ) : tour.status === 'planning' || tour.status === 'confirmed' ? (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => registerMutation.mutate()}
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
                  {t('tours.register')}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs tabs-boxed">
          <button className={`tab ${activeTab === 'days' ? 'tab-active' : ''}`} onClick={() => setActiveTab('days')}>
            <Icon name="calendar" size={16} className="mr-1" />
            {t('tours.days')} ({tour.days.length})
          </button>
          <button
            className={`tab ${activeTab === 'accommodations' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('accommodations')}
          >
            <Icon name="home" size={16} className="mr-1" />
            {t('tours.accommodations')} ({tour.accommodations.length})
          </button>
          <button
            className={`tab ${activeTab === 'transport' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('transport')}
          >
            <Icon name="truck" size={16} className="mr-1" />
            {t('tours.transport')} ({tour.transport.length})
          </button>
          <button
            className={`tab ${activeTab === 'participants' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('participants')}
          >
            <Icon name="users" size={16} className="mr-1" />
            {t('tours.participants')} ({tour.participants.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {activeTab === 'days' && (
            <TourDayPlanningSection tourId={tourId} days={tour.days} onRefresh={() => refetch()} />
          )}
          {activeTab === 'accommodations' && <TourAccommodationsTab accommodations={tour.accommodations} />}
          {activeTab === 'transport' && (
            <TourTransportSection tourId={tourId} transport={tour.transport} onRefresh={() => refetch()} />
          )}
          {activeTab === 'participants' && <TourParticipantsTab participants={tour.participants} />}
        </div>

        {/* Notes */}
        {tour.notes && (
          <div className="card bg-base-200 p-4">
            <h4 className="font-medium mb-2">{t('common.notes')}</h4>
            <p className="text-sm whitespace-pre-wrap">{tour.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TourAccommodationsTab({ accommodations }: { accommodations: TourDetail['accommodations'] }) {
  const { t } = useTranslation();

  if (accommodations.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="home" size={32} className="mx-auto mb-2 opacity-50" />
        <p>{t('tours.noAccommodations')}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {accommodations.map((acc) => (
        <div key={acc.id} className="card bg-base-200">
          <div className="card-body p-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-medium">{acc.name}</h4>
                {acc.address && (
                  <p className="text-sm text-base-content/60">
                    {acc.address}
                    {acc.city ? `, ${acc.city}` : ''}
                    {acc.country ? `, ${acc.country}` : ''}
                  </p>
                )}
              </div>
              {acc.totalCost && <span className="font-medium">{formatCurrency(acc.totalCost)}</span>}
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {(acc.checkInDate || acc.checkOutDate) && (
                <span className="flex items-center gap-1">
                  <Icon name="calendar" size={14} />
                  {acc.checkInDate && formatDate(acc.checkInDate)}
                  {acc.checkInDate && acc.checkOutDate && ' - '}
                  {acc.checkOutDate && formatDate(acc.checkOutDate)}
                </span>
              )}
              {acc.roomCount && (
                <span>
                  {acc.roomCount} {t('tours.rooms')}
                </span>
              )}
              {acc.phone && (
                <span className="flex items-center gap-1">
                  <Icon name="smartphone" size={14} />
                  {acc.phone}
                </span>
              )}
            </div>
            {acc.confirmationNumber && (
              <div className="text-sm">
                <span className="text-base-content/60">{t('tours.confirmationNumber')}:</span>{' '}
                <span className="font-mono">{acc.confirmationNumber}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TourParticipantsTab({ participants }: { participants: TourDetail['participants'] }) {
  const { t } = useTranslation();

  if (participants.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="users" size={32} className="mx-auto mb-2 opacity-50" />
        <p>{t('tours.noParticipants')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{t('common.name')}</th>
            <th>{t('common.email')}</th>
            <th>{t('common.status')}</th>
            <th>{t('tours.payment')}</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id}>
              <td>
                {p.firstName} {p.lastName}
              </td>
              <td className="text-base-content/70">{p.email}</td>
              <td>
                <span className={`badge badge-sm ${PARTICIPANT_STATUS_COLORS[p.status]}`}>
                  {t(`tours.participantStatuses.${p.status}`)}
                </span>
              </td>
              <td>
                {p.paidAmount > 0 ? (
                  <span>{formatCurrency(p.paidAmount)}</span>
                ) : (
                  <span className="text-base-content/50">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
