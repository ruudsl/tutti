import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import {
  getResources,
  getResourceCategories,
  getResourceBookings,
  getResource,
  createResource,
  createResourceBooking,
  deleteResource,
  Resource,
  ResourceType,
  CreateResourceData,
  ResourceBooking,
} from '../api/resources';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatDate } from '../utils/dateFormat';
import { formatCurrency } from '../utils/format';
import { ResourceAvailabilitySection } from '../components/ResourceAvailabilitySection';
import { ResourceCategoriesManager } from '../components/ResourceCategoriesManager';

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
  const [showCategoriesManager, setShowCategoriesManager] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['resources', typeFilter],
    queryFn: () => getResources(typeFilter ? { type: typeFilter } : undefined),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['resource-categories'],
    queryFn: getResourceCategories,
  });

  const calendarWeekEnd = useMemo(() => {
    const end = new Date(calendarWeekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }, [calendarWeekStart]);

  const { data: bookings = [] } = useQuery({
    queryKey: ['resource-bookings', calendarWeekStart.toISOString(), calendarWeekEnd.toISOString()],
    queryFn: () =>
      getResourceBookings({
        startDate: calendarWeekStart.toISOString().split('T')[0],
        endDate: calendarWeekEnd.toISOString().split('T')[0],
      }),
    enabled: viewMode === 'calendar',
  });

  const availableResources = resources.filter((r) => r.isActive);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-2xl font-bold">{t('resources.title')}</h1>
        <div className="flex gap-2">
          <button className="btn btn-outline gap-2" onClick={() => setShowCategoriesManager(true)}>
            <Icon name="folder" size={18} />
            {t('resources.manageCategories')}
          </button>
          <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={18} />
            {t('resources.new')}
          </button>
        </div>
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
            <div className="text-2xl font-bold">{resources.filter((r) => r.resourceType === 'room').length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
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
        <div className="btn-group">
          <button
            className={`btn btn-sm ${viewMode === 'grid' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <Icon name="package" size={16} />
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <Icon name="calendar" size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : resources.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="package" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('resources.noResources')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {resources.map((resource) => (
                <div key={resource.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
                  <div className="card-body">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 rounded-lg p-2">
                          <Icon name={TYPE_ICONS[resource.resourceType] as any} size={20} className="text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{resource.name}</h3>
                          <span className="text-xs text-base-content/60">
                            {t(`resources.types.${resource.resourceType}`)}
                          </span>
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
                        {resource.costPerHour && (
                          <span>{t('resources.perHour', { amount: formatCurrency(resource.costPerHour) })}</span>
                        )}
                        {resource.costPerHour && resource.costPerDay && ' | '}
                        {resource.costPerDay && (
                          <span>{t('resources.perDay', { amount: formatCurrency(resource.costPerDay) })}</span>
                        )}
                      </div>
                    )}

                    <div className="card-actions justify-end mt-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedResourceId(resource.id)}>
                        {t('common.details')}
                      </button>
                      {resource.isActive && (
                        <button className="btn btn-primary btn-sm" onClick={() => setShowBookingModal(resource)}>
                          {t('resources.book')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <ResourceCalendar
          resources={resources}
          bookings={bookings}
          weekStart={calendarWeekStart}
          onPrevWeek={() => {
            const prev = new Date(calendarWeekStart);
            prev.setDate(prev.getDate() - 7);
            setCalendarWeekStart(prev);
          }}
          onNextWeek={() => {
            const next = new Date(calendarWeekStart);
            next.setDate(next.getDate() + 7);
            setCalendarWeekStart(next);
          }}
          onToday={() => {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(now);
            monday.setDate(now.getDate() + diff);
            monday.setHours(0, 0, 0, 0);
            setCalendarWeekStart(monday);
          }}
          onBookResource={(resource) => setShowBookingModal(resource)}
        />
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

      {showCategoriesManager && <ResourceCategoriesManager onClose={() => setShowCategoriesManager(false)} />}

      {selectedResourceId && (
        <ResourceDetailModal
          resourceId={selectedResourceId}
          onClose={() => setSelectedResourceId(null)}
          onBook={(resource) => {
            setSelectedResourceId(null);
            setShowBookingModal(resource);
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

function BookingModal({
  resource,
  onClose,
  onSuccess,
}: {
  resource: Resource;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    title: '',
    startDatetime: '',
    endDatetime: '',
    description: '',
  });

  const bookMutation = useMutation({
    mutationFn: () =>
      createResourceBooking({
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
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
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

const BOOKING_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning/80',
  approved: 'bg-success/80',
  rejected: 'bg-error/80',
  cancelled: 'bg-base-300',
  completed: 'bg-primary/80',
};

function ResourceCalendar({
  resources,
  bookings,
  weekStart,
  onPrevWeek,
  onNextWeek,
  onToday,
  onBookResource,
}: {
  resources: Resource[];
  bookings: ResourceBooking[];
  weekStart: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onBookResource: (resource: Resource) => void;
}) {
  const { t } = useTranslation();

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      days.push(day);
    }
    return days;
  }, [weekStart]);

  const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const getBookingsForResourceOnDay = (resourceId: string, day: Date) => {
    const dayStr = day.toISOString().split('T')[0];
    return bookings.filter((b) => {
      if (b.resourceId !== resourceId) return false;
      const startDate = b.startDatetime.split('T')[0];
      const endDate = b.endDatetime.split('T')[0];
      return dayStr >= startDate && dayStr <= endDate;
    });
  };

  const activeResources = resources.filter((r) => r.isActive);

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="btn btn-sm btn-ghost" onClick={onPrevWeek}>
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onToday}>
            {t('resources.today')}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onNextWeek}>
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
        <h3 className="font-medium">
          {formatDate(weekStart.toISOString())} - {formatDate(weekDays[6].toISOString())}
        </h3>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th className="w-40">{t('resources.resource')}</th>
              {weekDays.map((day, idx) => {
                const isToday = day.toDateString() === new Date().toDateString();
                return (
                  <th key={idx} className={`text-center ${isToday ? 'bg-primary/10' : ''}`}>
                    <div className="text-xs text-base-content/60">{t(`resources.days.${dayNames[idx]}`)}</div>
                    <div className={`${isToday ? 'text-primary font-bold' : ''}`}>{day.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeResources.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-base-content/60">
                  {t('resources.noResources')}
                </td>
              </tr>
            ) : (
              activeResources.map((resource) => (
                <tr key={resource.id} className="hover">
                  <td>
                    <div className="flex items-center gap-2">
                      <Icon name={TYPE_ICONS[resource.resourceType] as any} size={16} className="text-primary" />
                      <div>
                        <div className="font-medium text-sm">{resource.name}</div>
                        <div className="text-xs text-base-content/60">{resource.location}</div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((day, idx) => {
                    const dayBookings = getBookingsForResourceOnDay(resource.id, day);
                    const isToday = day.toDateString() === new Date().toDateString();
                    return (
                      <td
                        key={idx}
                        className={`relative p-1 min-h-[60px] align-top cursor-pointer hover:bg-base-200 ${isToday ? 'bg-primary/5' : ''}`}
                        onClick={() => onBookResource(resource)}
                      >
                        {dayBookings.map((booking) => (
                          <div
                            key={booking.id}
                            className={`text-xs p-1 rounded mb-1 text-white truncate ${BOOKING_STATUS_COLORS[booking.status]}`}
                            title={`${booking.title} - ${booking.bookedByName}`}
                          >
                            {booking.title}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-warning/80" />
          <span>{t('resources.bookingStatuses.pending')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success/80" />
          <span>{t('resources.bookingStatuses.approved')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-primary/80" />
          <span>{t('resources.bookingStatuses.completed')}</span>
        </div>
      </div>
    </div>
  );
}

function ResourceDetailModal({
  resourceId,
  onClose,
  onBook,
}: {
  resourceId: string;
  onClose: () => void;
  onBook: (resource: Resource) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: resource, isLoading } = useQuery({
    queryKey: ['resource', resourceId],
    queryFn: () => getResource(resourceId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteResource(resourceId),
    onSuccess: () => {
      showSuccess(t('resources.deleted'));
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      onClose();
    },
    onError: () => showError(t('resources.errorDelete')),
  });

  if (isLoading || !resource) {
    return (
      <Modal onClose={onClose} title={t('resources.details')}>
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={resource.name} size="large">
      <div className="space-y-6">
        {/* Resource Info */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-3">
                <Icon name={TYPE_ICONS[resource.resourceType] as any} size={24} className="text-primary" />
              </div>
              <div>
                <span className="text-sm text-base-content/60">{t(`resources.types.${resource.resourceType}`)}</span>
                <div className={`badge ml-2 ${resource.isActive ? 'badge-success' : 'badge-ghost'}`}>
                  {resource.isActive ? t('resources.active') : t('resources.inactive')}
                </div>
              </div>
            </div>
          </div>

          {resource.description && <p className="text-base-content/70">{resource.description}</p>}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {resource.location && (
              <div>
                <div className="text-base-content/60 text-xs">{t('resources.location')}</div>
                <div className="flex items-center gap-1">
                  <Icon name="mapPin" size={14} />
                  {resource.location}
                </div>
              </div>
            )}
            {resource.capacity && (
              <div>
                <div className="text-base-content/60 text-xs">{t('resources.capacity')}</div>
                <div className="flex items-center gap-1">
                  <Icon name="users" size={14} />
                  {resource.capacity}
                </div>
              </div>
            )}
            {resource.costPerHour && (
              <div>
                <div className="text-base-content/60 text-xs">{t('resources.costPerHour')}</div>
                <div>{formatCurrency(resource.costPerHour)}</div>
              </div>
            )}
            {resource.costPerDay && (
              <div>
                <div className="text-base-content/60 text-xs">{t('resources.costPerDay')}</div>
                <div>{formatCurrency(resource.costPerDay)}</div>
              </div>
            )}
            {resource.minBookingHours && (
              <div>
                <div className="text-base-content/60 text-xs">{t('resources.minBookingHours')}</div>
                <div>{resource.minBookingHours}h</div>
              </div>
            )}
            {resource.maxBookingHours && (
              <div>
                <div className="text-base-content/60 text-xs">{t('resources.maxBookingHours')}</div>
                <div>{resource.maxBookingHours}h</div>
              </div>
            )}
          </div>

          {resource.requiresApproval && (
            <div className="alert alert-info">
              <Icon name="info" size={16} />
              <span>{t('resources.requiresApproval')}</span>
            </div>
          )}

          {resource.notes && (
            <div className="bg-base-200 p-3 rounded-lg">
              <div className="text-xs text-base-content/60 mb-1">{t('common.notes')}</div>
              <p className="text-sm">{resource.notes}</p>
            </div>
          )}
        </div>

        {/* Availability Rules Section */}
        <div className="divider" />
        <ResourceAvailabilitySection resourceId={resourceId} availability={resource.availability || []} />

        {/* Upcoming Bookings */}
        {resource.upcomingBookings && resource.upcomingBookings.length > 0 && (
          <>
            <div className="divider" />
            <div>
              <h4 className="font-medium mb-3">{t('resources.upcomingBookings')}</h4>
              <div className="space-y-2">
                {resource.upcomingBookings.slice(0, 5).map((booking) => (
                  <div key={booking.id} className="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{booking.title}</div>
                      <div className="text-xs text-base-content/60">
                        {formatDate(booking.startDatetime)} - {formatDate(booking.endDatetime)}
                      </div>
                    </div>
                    <span
                      className={`badge badge-sm ${BOOKING_STATUS_COLORS[booking.status]?.replace('bg-', 'badge-') || 'badge-ghost'}`}
                    >
                      {t(`resources.bookingStatuses.${booking.status}`)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <button className="btn btn-error btn-outline" onClick={() => setShowDeleteConfirm(true)}>
            <Icon name="trash" size={16} />
            {t('common.delete')}
          </button>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={onClose}>
              {t('common.close')}
            </button>
            {resource.isActive && (
              <button className="btn btn-primary" onClick={() => onBook(resource)}>
                {t('resources.book')}
              </button>
            )}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title={t('resources.deleteResource')}
          message={t('resources.confirmDelete')}
          confirmLabel={t('common.delete')}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </Modal>
  );
}
