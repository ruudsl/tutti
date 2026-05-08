import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { showSuccess, showError } from '../utils/toast';
import {
  TourDetail,
  addTourTransport,
  deleteTourTransport,
  AddTourTransportData,
} from '../api/tours';

type Transport = TourDetail['transport'][number];

interface TourTransportSectionProps {
  tourId: string;
  transport: Transport[];
  onRefresh: () => void;
}

const TRANSPORT_TYPES = [
  'bus',
  'train',
  'plane',
  'ferry',
  'car',
  'other',
] as const;

const TRANSPORT_ICONS: Record<string, 'truck' | 'globe'> = {
  bus: 'truck',
  train: 'truck',
  plane: 'globe',
  ferry: 'globe',
  car: 'truck',
  other: 'truck',
};

export function TourTransportSection({
  tourId,
  transport,
  onRefresh,
}: TourTransportSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);

  const addMutation = useMutation({
    mutationFn: (data: AddTourTransportData) => addTourTransport(tourId, data),
    onSuccess: (result) => {
      showSuccess(result.message || t('tours.transportAdded'));
      queryClient.invalidateQueries({ queryKey: ['tour', tourId] });
      onRefresh();
      setShowAddModal(false);
    },
    onError: () => showError(t('tours.errorAddTransport')),
  });

  const deleteMutation = useMutation({
    mutationFn: (transportId: string) => deleteTourTransport(tourId, transportId),
    onSuccess: () => {
      showSuccess(t('tours.transportDeleted'));
      queryClient.invalidateQueries({ queryKey: ['tour', tourId] });
      onRefresh();
    },
    onError: () => showError(t('tours.errorDeleteTransport')),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-lg">{t('tours.transport')}</h4>
        <button
          className="btn btn-primary btn-sm gap-1"
          onClick={() => setShowAddModal(true)}
        >
          <Icon name="plus" size={16} aria-hidden={true} />
          {t('tours.addTransport')}
        </button>
      </div>

      {transport.length === 0 ? (
        <div className="text-center py-8 text-base-content/60">
          <Icon name="truck" size={32} className="mx-auto mb-2 opacity-50" aria-hidden={true} />
          <p>{t('tours.noTransport')}</p>
          <p className="text-sm mt-1">{t('tours.addTransportHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transport.map((tr) => (
            <div key={tr.id} className="card bg-base-200">
              <div className="card-body p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon
                        name={TRANSPORT_ICONS[tr.transportType] || 'truck'}
                        size={18}
                        className="text-primary"
                        aria-hidden={true}
                      />
                      <span className="badge badge-primary">{t(`tours.transportTypes.${tr.transportType}`) || tr.transportType}</span>
                      {tr.provider && (
                        <span className="text-base-content/70">{tr.provider}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Departure */}
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-success mt-1.5 flex-shrink-0" role="img" aria-label={t('tours.departure')} />
                        <div>
                          <div className="text-xs text-base-content/60 uppercase">
                            {t('tours.departure')}
                          </div>
                          <div className="font-medium">
                            {tr.departureLocation || '-'}
                          </div>
                          {tr.departureTime && (
                            <div className="text-sm text-base-content/70">
                              {tr.departureTime}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Arrival */}
                      <div className="flex items-start gap-2">
                        <div className="w-3 h-3 rounded-full bg-error mt-1.5 flex-shrink-0" role="img" aria-label={t('tours.arrival')} />
                        <div>
                          <div className="text-xs text-base-content/60 uppercase">
                            {t('tours.arrival')}
                          </div>
                          <div className="font-medium">
                            {tr.arrivalLocation || '-'}
                          </div>
                          {tr.arrivalTime && (
                            <div className="text-sm text-base-content/70">
                              {tr.arrivalTime}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn btn-ghost btn-sm btn-square text-error"
                    onClick={() => {
                      if (confirm(t('tours.confirmDeleteTransport'))) {
                        deleteMutation.mutate(tr.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    aria-label={t('common.delete')}
                  >
                    <Icon name="trash" size={16} aria-hidden={true} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Transport Modal */}
      {showAddModal && (
        <AddTransportModal
          onClose={() => setShowAddModal(false)}
          onSubmit={(data) => addMutation.mutate(data)}
          isPending={addMutation.isPending}
        />
      )}
    </div>
  );
}

function AddTransportModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: AddTourTransportData) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<AddTourTransportData>({
    type: 'bus',
    departureTime: '',
    arrivalTime: '',
    from: '',
    to: '',
    details: '',
  });

  const canSubmit =
    formData.type.trim().length > 0 &&
    formData.departureTime.trim().length > 0 &&
    formData.arrivalTime.trim().length > 0 &&
    formData.from.trim().length > 0 &&
    formData.to.trim().length > 0;

  const handleSubmit = () => {
    if (canSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <Modal onClose={onClose} title={t('tours.addTransport')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('tours.transportType')} *</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          >
            {TRANSPORT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`tours.transportTypes.${type}`) || type}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.from')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.from}
              onChange={(e) => setFormData({ ...formData, from: e.target.value })}
              placeholder={t('tours.departureLocationPlaceholder')}
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.to')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.to}
              onChange={(e) => setFormData({ ...formData, to: e.target.value })}
              placeholder={t('tours.arrivalLocationPlaceholder')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.departureTime')} *</span>
            </label>
            <input
              type="datetime-local"
              className="input input-bordered"
              value={formData.departureTime}
              onChange={(e) =>
                setFormData({ ...formData, departureTime: e.target.value })
              }
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('tours.arrivalTime')} *</span>
            </label>
            <input
              type="datetime-local"
              className="input input-bordered"
              value={formData.arrivalTime}
              onChange={(e) =>
                setFormData({ ...formData, arrivalTime: e.target.value })
              }
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('tours.details')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.details || ''}
            onChange={(e) => setFormData({ ...formData, details: e.target.value })}
            rows={2}
            placeholder={t('tours.transportDetailsPlaceholder')}
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

export default TourTransportSection;
