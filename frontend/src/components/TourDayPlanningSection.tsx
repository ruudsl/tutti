import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { formatDate } from '../utils/dateFormat';
import { showSuccess, showError } from '../utils/toast';
import {
  TourDay,
  addTourDay,
  deleteTourDay,
  addDayActivity,
  deleteDayActivity,
  AddTourDayData,
  AddDayActivityData,
} from '../api/tours';

interface TourDayPlanningSectionProps {
  tourId: string;
  days: TourDay[];
  onRefresh: () => void;
}

export function TourDayPlanningSection({ tourId, days, onRefresh }: TourDayPlanningSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddDayModal, setShowAddDayModal] = useState(false);
  const [addActivityForDay, setAddActivityForDay] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const addDayMutation = useMutation({
    mutationFn: (data: AddTourDayData) => addTourDay(tourId, data),
    onSuccess: (result) => {
      showSuccess(result.message || t('tours.dayAdded'));
      queryClient.invalidateQueries({ queryKey: ['tour', tourId] });
      onRefresh();
      setShowAddDayModal(false);
    },
    onError: () => showError(t('tours.errorAddDay')),
  });

  const deleteDayMutation = useMutation({
    mutationFn: (dayId: string) => deleteTourDay(tourId, dayId),
    onSuccess: () => {
      showSuccess(t('tours.dayDeleted'));
      queryClient.invalidateQueries({ queryKey: ['tour', tourId] });
      onRefresh();
    },
    onError: () => showError(t('tours.errorDeleteDay')),
  });

  const addActivityMutation = useMutation({
    mutationFn: ({ dayId, data }: { dayId: string; data: AddDayActivityData }) =>
      addDayActivity(tourId, dayId, data),
    onSuccess: (result) => {
      showSuccess(result.message || t('tours.activityAdded'));
      queryClient.invalidateQueries({ queryKey: ['tour', tourId] });
      onRefresh();
      setAddActivityForDay(null);
    },
    onError: () => showError(t('tours.errorAddActivity')),
  });

  const deleteActivityMutation = useMutation({
    mutationFn: ({ dayId, activityId }: { dayId: string; activityId: string }) =>
      deleteDayActivity(tourId, dayId, activityId),
    onSuccess: () => {
      showSuccess(t('tours.activityDeleted'));
      queryClient.invalidateQueries({ queryKey: ['tour', tourId] });
      onRefresh();
    },
    onError: () => showError(t('tours.errorDeleteActivity')),
  });

  const sortedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-lg">{t('tours.itinerary')}</h4>
        <button
          className="btn btn-primary btn-sm gap-1"
          onClick={() => setShowAddDayModal(true)}
        >
          <Icon name="plus" size={16} />
          {t('tours.addDay')}
        </button>
      </div>

      {sortedDays.length === 0 ? (
        <div className="text-center py-8 text-base-content/60">
          <Icon name="calendar" size={32} className="mx-auto mb-2 opacity-50" />
          <p>{t('tours.noDays')}</p>
          <p className="text-sm mt-1">{t('tours.addDayHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedDays.map((day) => {
            const isExpanded = expandedDay === day.id;
            return (
              <div key={day.id} className="card bg-base-200">
                <div className="card-body p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedDay(isExpanded ? null : day.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="badge badge-primary font-medium">
                        {t('tours.day')} {day.dayNumber}
                      </span>
                      <span className="font-medium">{formatDate(day.dayDate)}</span>
                      {day.title && (
                        <span className="text-base-content/70">- {day.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-ghost badge-sm">
                        {day.activities.length} {t('tours.activities')}
                      </span>
                      <Icon
                        name={isExpanded ? 'chevronUp' : 'chevronDown'}
                        size={20}
                        className="text-base-content/60"
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {day.description && (
                        <p className="text-sm text-base-content/70">{day.description}</p>
                      )}

                      {/* Activities List */}
                      {day.activities.length > 0 && (
                        <div className="space-y-2">
                          {day.activities.map((activity) => (
                            <div
                              key={activity.id}
                              className="flex items-start gap-3 p-3 bg-base-100 rounded-lg"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {activity.startTime && (
                                    <span className="text-sm font-mono text-primary">
                                      {activity.startTime}
                                    </span>
                                  )}
                                  <span className="font-medium">{activity.title}</span>
                                  <span className="badge badge-sm badge-ghost">
                                    {activity.activityType}
                                  </span>
                                  {activity.isMandatory && (
                                    <span className="badge badge-sm badge-warning">
                                      {t('tours.mandatory')}
                                    </span>
                                  )}
                                </div>
                                {activity.description && (
                                  <p className="text-sm text-base-content/60 mt-1">
                                    {activity.description}
                                  </p>
                                )}
                                {activity.location && (
                                  <div className="text-sm text-base-content/60 flex items-center gap-1 mt-1">
                                    <Icon name="mapPin" size={12} />
                                    {activity.location}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {activity.cost && (
                                  <span className="text-sm font-medium">
                                    {activity.cost.toFixed(2)}
                                  </span>
                                )}
                                <button
                                  className="btn btn-ghost btn-xs btn-square text-error"
                                  onClick={() =>
                                    deleteActivityMutation.mutate({
                                      dayId: day.id,
                                      activityId: activity.id,
                                    })
                                  }
                                  disabled={deleteActivityMutation.isPending}
                                  title={t('common.delete')}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Day Actions */}
                      <div className="flex gap-2 pt-2 border-t border-base-300">
                        <button
                          className="btn btn-sm btn-ghost gap-1"
                          onClick={() => setAddActivityForDay(day.id)}
                        >
                          <Icon name="plus" size={14} />
                          {t('tours.addActivity')}
                        </button>
                        <button
                          className="btn btn-sm btn-ghost text-error gap-1"
                          onClick={() => {
                            if (confirm(t('tours.confirmDeleteDay'))) {
                              deleteDayMutation.mutate(day.id);
                            }
                          }}
                          disabled={deleteDayMutation.isPending}
                        >
                          <Icon name="trash" size={14} />
                          {t('tours.deleteDay')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Day Modal */}
      {showAddDayModal && (
        <AddDayModal
          onClose={() => setShowAddDayModal(false)}
          onSubmit={(data) => addDayMutation.mutate(data)}
          isPending={addDayMutation.isPending}
        />
      )}

      {/* Add Activity Modal */}
      {addActivityForDay && (
        <AddActivityModal
          onClose={() => setAddActivityForDay(null)}
          onSubmit={(data) =>
            addActivityMutation.mutate({ dayId: addActivityForDay, data })
          }
          isPending={addActivityMutation.isPending}
        />
      )}
    </div>
  );
}

function AddDayModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: AddTourDayData) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<AddTourDayData>({
    date: '',
    title: '',
  });

  const canSubmit = formData.date.trim().length > 0;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <Modal onClose={onClose} title={t('tours.addDay')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.date')} *</span>
          </label>
          <input
            type="date"
            className="input input-bordered"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            autoFocus
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.title')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder={t('tours.dayTitlePlaceholder')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
          >
            {isPending && <span className="loading loading-spinner loading-sm" />}
            {t('common.add')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddActivityModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: AddDayActivityData) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<AddDayActivityData>({
    time: '',
    title: '',
    description: '',
    location: '',
  });

  const canSubmit = formData.time.trim().length > 0 && formData.title.trim().length > 0;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <Modal onClose={onClose} title={t('tours.addActivity')}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.time')} *</span>
            </label>
            <input
              type="time"
              className="input input-bordered"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              autoFocus
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('common.title')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.location')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.location || ''}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder={t('tours.locationPlaceholder')}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description || ''}
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
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
          >
            {isPending && <span className="loading loading-spinner loading-sm" />}
            {t('common.add')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default TourDayPlanningSection;
