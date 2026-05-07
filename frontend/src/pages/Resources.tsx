import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { getResources, getResourceCategories, createResource, createResourceBooking, Resource, ResourceType, CreateResourceData } from '../api/resources';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';

const TYPE_ICONS: Record<ResourceType, string> = {
  room: 'building',
  vehicle: 'truck',
  equipment: 'package',
  instrument: 'music',
  service: 'wrench',
  other: 'package',
};

export default function Resources() {
  const { t } = useTranslation();
  useDocumentTitle('resources.title');
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<ResourceType | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState<Resource | null>(null);

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['resources', typeFilter],
    queryFn: () => getResources(typeFilter ? { type: typeFilter } : undefined),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['resource-categories'],
    queryFn: getResourceCategories,
  });

  const availableResources = resources.filter(r => r.isActive);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('resources.title')}</h1>
        <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" size={18} />
          {t('resources.new')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('resources.total')}</div>
            <div className="text-2xl font-bold">{resources.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('resources.available')}</div>
            <div className="text-2xl font-bold text-success">{availableResources.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('resources.categories')}</div>
            <div className="text-2xl font-bold">{categories.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('resources.rooms')}</div>
            <div className="text-2xl font-bold">{resources.filter(r => r.resourceType === 'room').length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          className="select select-bordered select-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ResourceType | '')}
        >
          <option value="">{t('resources.allTypes')}</option>
          <option value="room">{t('resources.types.room')}</option>
          <option value="vehicle">{t('resources.types.vehicle')}</option>
          <option value="equipment">{t('resources.types.equipment')}</option>
          <option value="instrument">{t('resources.types.instrument')}</option>
          <option value="service">{t('resources.types.service')}</option>
          <option value="other">{t('resources.types.other')}</option>
        </select>
      </div>

      {/* Resources Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : resources.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="package" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('resources.noResources')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map(resource => (
            <div key={resource.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 rounded-lg p-2">
                      <Icon name={TYPE_ICONS[resource.resourceType] as any} size={20} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{resource.name}</h3>
                      <span className="text-xs text-base-content/60">{t(`resources.types.${resource.resourceType}`)}</span>
                    </div>
                  </div>
                  <span className={`badge ${resource.isActive ? 'badge-success' : 'badge-ghost'}`}>
                    {resource.isActive ? t('resources.active') : t('resources.inactive')}
                  </span>
                </div>

                {resource.description && (
                  <p className="text-sm text-base-content/70 line-clamp-2">{resource.description}</p>
                )}

                <div className="flex flex-wrap gap-2 text-sm text-base-content/60">
                  {resource.location && (
                    <span className="flex items-center gap-1">
                      <Icon name="mapPin" size={14} />
                      {resource.location}
                    </span>
                  )}
                  {resource.capacity && (
                    <span className="flex items-center gap-1">
                      <Icon name="users" size={14} />
                      {resource.capacity} {t('resources.capacity')}
                    </span>
                  )}
                </div>

                {(resource.costPerHour || resource.costPerDay) && (
                  <div className="text-sm">
                    {resource.costPerHour && <span>€{resource.costPerHour}/uur</span>}
                    {resource.costPerHour && resource.costPerDay && ' | '}
                    {resource.costPerDay && <span>€{resource.costPerDay}/dag</span>}
                  </div>
                )}

                <div className="card-actions justify-end mt-2">
                  {resource.isActive && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setShowBookingModal(resource)}
                    >
                      {t('resources.book')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <ResourceModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['resources'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {showBookingModal && (
        <BookingModal
          resource={showBookingModal}
          onClose={() => setShowBookingModal(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['resources'] });
            setShowBookingModal(null);
          }}
        />
      )}
    </div>
  );
}

function ResourceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateResourceData>({
    name: '',
    description: '',
    resourceType: 'room',
  });

  const createMutation = useMutation({
    mutationFn: createResource,
    onSuccess: () => {
      showSuccess(t('resources.created'));
      onSuccess();
    },
    onError: () => showError(t('resources.errorCreate')),
  });

  const canSubmit = formData.name.trim().length > 0;

  return (
    <Modal onClose={onClose} title={t('resources.new')}>
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

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.type')}</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.resourceType}
            onChange={(e) => setFormData({ ...formData, resourceType: e.target.value as ResourceType })}
          >
            <option value="room">{t('resources.types.room')}</option>
            <option value="vehicle">{t('resources.types.vehicle')}</option>
            <option value="equipment">{t('resources.types.equipment')}</option>
            <option value="instrument">{t('resources.types.instrument')}</option>
            <option value="service">{t('resources.types.service')}</option>
            <option value="other">{t('resources.types.other')}</option>
          </select>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.location')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.location || ''}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
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

function BookingModal({ resource, onClose, onSuccess }: { resource: Resource; onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    title: '',
    startDatetime: '',
    endDatetime: '',
    description: '',
  });

  const bookMutation = useMutation({
    mutationFn: () => createResourceBooking({
      resourceId: resource.id,
      ...formData,
    }),
    onSuccess: (data) => {
      showSuccess(data.message);
      onSuccess();
    },
    onError: () => showError(t('resources.errorBook')),
  });

  const canSubmit = formData.title.trim().length > 0 && formData.startDatetime && formData.endDatetime;

  return (
    <Modal onClose={onClose} title={t('resources.bookResource', { name: resource.name })}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.bookingTitle')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('resources.startTime')} *</span>
            </label>
            <input
              type="datetime-local"
              className="input input-bordered"
              value={formData.startDatetime}
              onChange={(e) => setFormData({ ...formData, startDatetime: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('resources.endTime')} *</span>
            </label>
            <input
              type="datetime-local"
              className="input input-bordered"
              value={formData.endDatetime}
              onChange={(e) => setFormData({ ...formData, endDatetime: e.target.value })}
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
            rows={2}
          />
        </div>

        {resource.requiresApproval && (
          <div className="alert alert-info">
            <Icon name="info" size={16} />
            <span>{t('resources.requiresApproval')}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn-primary"
            onClick={() => bookMutation.mutate()}
            disabled={!canSubmit || bookMutation.isPending}
          >
            {bookMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('resources.book')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
