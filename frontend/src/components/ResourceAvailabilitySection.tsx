import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import { addResourceAvailability, deleteResourceAvailability, AddAvailabilityData } from '../api/resources';
import { showSuccess, showError } from '../utils/toast';

interface AvailabilityRule {
  id: string;
  availabilityType: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

interface ResourceAvailabilitySectionProps {
  resourceId: string;
  availability: AvailabilityRule[];
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function ResourceAvailabilitySection({ resourceId, availability }: ResourceAvailabilitySectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingRule, setDeletingRule] = useState<AvailabilityRule | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => deleteResourceAvailability(resourceId, ruleId),
    onSuccess: () => {
      showSuccess(t('resources.availability.deleted'));
      queryClient.invalidateQueries({ queryKey: ['resource', resourceId] });
      setDeletingRule(null);
    },
    onError: () => showError(t('resources.availability.errorDelete')),
  });

  const formatDayOfWeek = (day: number) => {
    return t(`resources.days.${DAY_NAMES[day]}`);
  };

  const formatTime = (time?: string) => {
    if (!time) return '';
    return time.substring(0, 5); // HH:mm
  };

  const getRuleDescription = (rule: AvailabilityRule) => {
    if (rule.dayOfWeek !== undefined && rule.dayOfWeek !== null) {
      return `${formatDayOfWeek(rule.dayOfWeek)} ${formatTime(rule.startTime)} - ${formatTime(rule.endTime)}`;
    }
    if (rule.startDate && rule.endDate) {
      return `${rule.startDate} - ${rule.endDate}`;
    }
    if (rule.startDate) {
      return rule.startDate;
    }
    return t('resources.availability.custom');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">{t('resources.availability.title')}</h4>
        <button className="btn btn-sm btn-primary gap-1" onClick={() => setShowAddModal(true)}>
          <Icon name="plus" size={14} aria-hidden={true} />
          {t('resources.availability.addRule')}
        </button>
      </div>

      {availability.length === 0 ? (
        <div className="text-sm text-base-content/60 p-4 bg-base-200 rounded-lg text-center">
          <Icon name="calendar" size={24} className="mx-auto mb-2 opacity-50" aria-hidden={true} />
          <p>{t('resources.availability.noRules')}</p>
          <p className="text-xs mt-1">{t('resources.availability.noRulesHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {availability.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 bg-base-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${rule.availabilityType === 'available' ? 'bg-success' : 'bg-error'}`}
                  aria-hidden={true}
                />
                <div>
                  <div className="font-medium text-sm">{getRuleDescription(rule)}</div>
                  <div className="text-xs text-base-content/60">
                    {rule.availabilityType === 'available'
                      ? t('resources.availability.available')
                      : t('resources.availability.unavailable')}
                    {rule.reason && ` - ${rule.reason}`}
                  </div>
                </div>
              </div>
              <button
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => setDeletingRule(rule)}
                aria-label={t('common.delete')}
              >
                <Icon name="trash" size={16} aria-hidden={true} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddAvailabilityModal
          resourceId={resourceId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['resource', resourceId] });
            setShowAddModal(false);
          }}
        />
      )}

      {deletingRule && (
        <ConfirmDialog
          title={t('resources.availability.deleteRule')}
          message={t('resources.availability.deleteConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={() => deleteMutation.mutate(deletingRule.id)}
          onCancel={() => setDeletingRule(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}

interface AddAvailabilityModalProps {
  resourceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddAvailabilityModal({ resourceId, onClose, onSuccess }: AddAvailabilityModalProps) {
  const { t } = useTranslation();
  const [ruleType, setRuleType] = useState<'recurring' | 'dateRange'>('recurring');
  const [formData, setFormData] = useState({
    dayOfWeek: 1, // Monday
    startTime: '09:00',
    endTime: '17:00',
    isAvailable: true,
    startDate: '',
    endDate: '',
  });

  const addMutation = useMutation({
    mutationFn: (data: AddAvailabilityData) => addResourceAvailability(resourceId, data),
    onSuccess: () => {
      showSuccess(t('resources.availability.added'));
      onSuccess();
    },
    onError: () => showError(t('resources.availability.errorAdd')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: AddAvailabilityData = {
      startTime: formData.startTime,
      endTime: formData.endTime,
      isAvailable: formData.isAvailable,
    };

    if (ruleType === 'recurring') {
      data.dayOfWeek = formData.dayOfWeek;
    } else {
      if (formData.startDate) data.startDate = formData.startDate;
      if (formData.endDate) data.endDate = formData.endDate;
    }

    addMutation.mutate(data);
  };

  const canSubmit = formData.startTime && formData.endTime && (ruleType === 'recurring' || formData.startDate);

  return (
    <Modal onClose={onClose} title={t('resources.availability.addRule')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Rule Type */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.availability.ruleType')}</span>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ruleType"
                className="radio radio-sm"
                checked={ruleType === 'recurring'}
                onChange={() => setRuleType('recurring')}
              />
              <span className="text-sm">{t('resources.availability.recurring')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="ruleType"
                className="radio radio-sm"
                checked={ruleType === 'dateRange'}
                onChange={() => setRuleType('dateRange')}
              />
              <span className="text-sm">{t('resources.availability.dateRange')}</span>
            </label>
          </div>
        </div>

        {/* Day of Week (for recurring) */}
        {ruleType === 'recurring' && (
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('resources.availability.dayOfWeek')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.dayOfWeek}
              onChange={(e) => setFormData({ ...formData, dayOfWeek: parseInt(e.target.value) })}
            >
              <option value={1}>{t('resources.days.mon')}</option>
              <option value={2}>{t('resources.days.tue')}</option>
              <option value={3}>{t('resources.days.wed')}</option>
              <option value={4}>{t('resources.days.thu')}</option>
              <option value={5}>{t('resources.days.fri')}</option>
              <option value={6}>{t('resources.days.sat')}</option>
              <option value={0}>{t('resources.days.sun')}</option>
            </select>
          </div>
        )}

        {/* Date Range (for date-based) */}
        {ruleType === 'dateRange' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">{t('resources.availability.startDate')} *</span>
              </label>
              <input
                type="date"
                className="input input-bordered"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium">{t('resources.availability.endDate')}</span>
              </label>
              <input
                type="date"
                className="input input-bordered"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                min={formData.startDate}
              />
            </div>
          </div>
        )}

        {/* Time Range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('resources.availability.startTime')} *</span>
            </label>
            <input
              type="time"
              className="input input-bordered"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('resources.availability.endTime')} *</span>
            </label>
            <input
              type="time"
              className="input input-bordered"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              required
            />
          </div>
        </div>

        {/* Availability Status */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.availability.status')}</span>
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="isAvailable"
                className="radio radio-success radio-sm"
                checked={formData.isAvailable}
                onChange={() => setFormData({ ...formData, isAvailable: true })}
              />
              <span className="text-sm">{t('resources.availability.available')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="isAvailable"
                className="radio radio-error radio-sm"
                checked={!formData.isAvailable}
                onChange={() => setFormData({ ...formData, isAvailable: false })}
              />
              <span className="text-sm">{t('resources.availability.unavailable')}</span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit || addMutation.isPending}>
            {addMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ResourceAvailabilitySection;
