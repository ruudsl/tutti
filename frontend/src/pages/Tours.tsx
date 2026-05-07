import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { getTours, createTour, registerForTour, TourStatus, CreateTourData } from '../api/tours';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { formatDate } from '../utils/dateFormat';

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

  const upcomingTours = tours.filter(t => new Date(t.startDate) >= new Date());

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
          {[1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : tours.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="globe" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('tours.noTours')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tours.map(tour => (
            <div key={tour.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <h3 className="card-title text-lg">{tour.name}</h3>
                  <span className={`badge ${STATUS_COLORS[tour.status]}`}>
                    {t(`tours.statuses.${tour.status}`)}
                  </span>
                </div>

                {tour.destination && (
                  <div className="flex items-center gap-2 text-base-content/70">
                    <Icon name="mapPin" size={16} />
                    <span>{tour.destination}{tour.country ? `, ${tour.country}` : ''}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-base-content/60">
                  <span className="flex items-center gap-1">
                    <Icon name="calendar" size={14} />
                    {formatDate(tour.startDate)} - {formatDate(tour.endDate)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="users" size={14} />
                    {tour.participantCount}{tour.maxParticipants ? ` / ${tour.maxParticipants}` : ''} {t('tours.participants')}
                  </span>
                </div>

                {tour.costPerPerson && (
                  <div className="text-sm">
                    <span className="font-medium">{t('tours.costPerPerson')}:</span>{' '}
                    €{tour.costPerPerson.toFixed(2)}
                  </div>
                )}

                {tour.registrationDeadline && (
                  <div className="text-sm text-warning">
                    <Icon name="clock" size={14} className="inline mr-1" />
                    {t('tours.registrationDeadline')}: {formatDate(tour.registrationDeadline)}
                  </div>
                )}

                <div className="card-actions justify-end mt-2">
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
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
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
