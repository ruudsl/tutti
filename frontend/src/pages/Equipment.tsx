import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { getEquipment, createEquipment, deleteEquipment, getEquipmentTypes } from '../api/equipment';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';

const STATUS_COLORS: Record<string, string> = {
  available: 'badge-success',
  on_loan: 'badge-warning',
  in_repair: 'badge-info',
  written_off: 'badge-ghost',
  personal: 'badge-primary',
};

export default function Equipment() {
  const { t } = useTranslation();
  useDocumentTitle('equipment.title');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: equipmentData, isLoading } = useQuery({
    queryKey: ['equipment', search, statusFilter, typeFilter],
    queryFn: () => getEquipment({
      search: search || undefined,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
    }),
  });

  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: getEquipmentTypes,
  });

  const equipment = equipmentData?.data || [];

  const deleteMutation = useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => {
      showSuccess(t('equipment.deleted'));
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
    },
    onError: () => showError(t('equipment.errorDelete')),
  });

  const availableCount = equipment.filter(e => e.status === 'available').length;
  const onLoanCount = equipment.filter(e => e.status === 'on_loan').length;
  const inRepairCount = equipment.filter(e => e.status === 'in_repair').length;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('equipment.title')}</h1>
        <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" size={18} />
          {t('equipment.new')}
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('equipment.total')}</div>
            <div className="text-2xl font-bold">{equipment.length}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('equipment.available')}</div>
            <div className="text-2xl font-bold text-success">{availableCount}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('equipment.onLoan')}</div>
            <div className="text-2xl font-bold text-warning">{onLoanCount}</div>
          </div>
        </div>
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <div className="text-sm text-base-content/60">{t('equipment.inRepair')}</div>
            <div className="text-2xl font-bold text-info">{inRepairCount}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          className="input input-bordered input-sm w-48"
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('equipment.allStatuses')}</option>
          <option value="available">{t('equipment.statuses.available')}</option>
          <option value="on_loan">{t('equipment.statuses.on_loan')}</option>
          <option value="in_repair">{t('equipment.statuses.in_repair')}</option>
          <option value="written_off">{t('equipment.statuses.written_off')}</option>
          <option value="personal">{t('equipment.statuses.personal')}</option>
        </select>
        {equipmentTypes.length > 0 && (
          <select
            className="select select-bordered select-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">{t('equipment.allTypes')}</option>
            {equipmentTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        )}
      </div>

      {/* Equipment Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : equipment.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="package" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('equipment.noEquipment')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment.map(item => (
            <div key={item.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow">
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <h3 className="card-title text-lg">{item.instrumentType}</h3>
                  <span className={`badge ${STATUS_COLORS[item.status] || 'badge-ghost'}`}>
                    {t(`equipment.statuses.${item.status}`)}
                  </span>
                </div>

                {item.brandModel && (
                  <p className="text-sm text-base-content/70">{item.brandModel}</p>
                )}

                <div className="flex flex-wrap gap-2 text-sm text-base-content/60">
                  {item.serialNumber && (
                    <span className="flex items-center gap-1">
                      <Icon name="fileText" size={14} />
                      {item.serialNumber}
                    </span>
                  )}
                  {item.yearOfManufacture && (
                    <span className="flex items-center gap-1">
                      <Icon name="calendar" size={14} />
                      {item.yearOfManufacture}
                    </span>
                  )}
                </div>

                {item.currentUser && (
                  <div className="text-sm">
                    <span className="flex items-center gap-1">
                      <Icon name="user" size={14} />
                      {item.currentUser.firstName} {item.currentUser.lastName}
                    </span>
                  </div>
                )}

                {item.currentValue && (
                  <div className="text-sm font-medium">
                    {t('equipment.value')}: €{item.currentValue.toFixed(2)}
                  </div>
                )}

                <div className="card-actions justify-end mt-2">
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-ghost btn-sm">
                      <Icon name="menu" size={16} />
                    </label>
                    <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-10">
                      <li><button>{t('common.edit')}</button></li>
                      {item.status === 'available' && (
                        <li><button>{t('equipment.assignLoan')}</button></li>
                      )}
                      {item.status === 'on_loan' && (
                        <li><button>{t('equipment.returnLoan')}</button></li>
                      )}
                      <li><button>{t('equipment.recordMaintenance')}</button></li>
                      <li className="text-error">
                        <button onClick={() => {
                          if (confirm(t('equipment.confirmDelete'))) {
                            deleteMutation.mutate(item.id);
                          }
                        }}>{t('common.delete')}</button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <EquipmentModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            setShowCreateModal(false);
          }}
          equipmentTypes={equipmentTypes}
        />
      )}
    </div>
  );
}

function EquipmentModal({
  onClose,
  onSuccess,
  equipmentTypes,
}: {
  onClose: () => void;
  onSuccess: () => void;
  equipmentTypes: string[];
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    instrumentType: '',
    brandModel: '',
    serialNumber: '',
    yearOfManufacture: '',
    status: 'available',
    purchasePrice: '',
    currentValue: '',
    notes: '',
  });

  const createMutation = useMutation({
    mutationFn: createEquipment,
    onSuccess: () => {
      showSuccess(t('equipment.created'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorCreate')),
  });

  const canSubmit = formData.instrumentType.trim().length > 0;

  const handleSubmit = () => {
    createMutation.mutate({
      instrumentType: formData.instrumentType,
      brandModel: formData.brandModel || undefined,
      serialNumber: formData.serialNumber || undefined,
      yearOfManufacture: formData.yearOfManufacture ? parseInt(formData.yearOfManufacture) : undefined,
      status: formData.status,
      purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
      currentValue: formData.currentValue ? parseFloat(formData.currentValue) : undefined,
      notes: formData.notes || undefined,
    });
  };

  return (
    <Modal onClose={onClose} title={t('equipment.new')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('equipment.instrumentType')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            list="equipment-types"
            value={formData.instrumentType}
            onChange={(e) => setFormData({ ...formData, instrumentType: e.target.value })}
          />
          <datalist id="equipment-types">
            {equipmentTypes.map(type => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('equipment.brandModel')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.brandModel}
              onChange={(e) => setFormData({ ...formData, brandModel: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('equipment.serialNumber')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.serialNumber}
              onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('equipment.yearOfManufacture')}</span>
            </label>
            <input
              type="number"
              className="input input-bordered"
              min="1800"
              max={new Date().getFullYear()}
              value={formData.yearOfManufacture}
              onChange={(e) => setFormData({ ...formData, yearOfManufacture: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('common.status')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="available">{t('equipment.statuses.available')}</option>
              <option value="on_loan">{t('equipment.statuses.on_loan')}</option>
              <option value="in_repair">{t('equipment.statuses.in_repair')}</option>
              <option value="written_off">{t('equipment.statuses.written_off')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('equipment.purchasePrice')}</span>
            </label>
            <input
              type="number"
              className="input input-bordered"
              step="0.01"
              min="0"
              value={formData.purchasePrice}
              onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('equipment.currentValue')}</span>
            </label>
            <input
              type="number"
              className="input input-bordered"
              step="0.01"
              min="0"
              value={formData.currentValue}
              onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
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
