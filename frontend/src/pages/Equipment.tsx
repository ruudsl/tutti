import { formatCurrency } from '../utils/format';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import {
  getEquipment,
  getEquipmentItem,
  createEquipment,
  deleteEquipment,
  getEquipmentTypes,
  createEquipmentLoan,
  returnEquipmentLoan,
  recordEquipmentMaintenance,
  addEquipmentDamageLog,
} from '../api/equipment';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../utils/dateFormat';
import { EquipmentStats } from '../components/EquipmentStats';
import type { EquipmentDetail, Equipment as EquipmentItem } from '../types';

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
  const { user } = useAuth();

  // De backend laat aanmaken, verwijderen, uitlenen, innemen, onderhoud en
  // schade alleen toe voor deze twee rollen (requireRole('admin',
  // 'equipment_committee') in backend/src/routes/equipment.ts). Zonder deze
  // grens zag een gewoon lid al die knoppen wel staan en kreeg het pas na het
  // invullen van het hele formulier een 403 terug.
  const magBeheren = user?.role === 'admin' || user?.role === 'equipment_committee';

  // Filters live in the URL so filtered views can be linked/bookmarked;
  // default values are omitted from the URL to keep it clean.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const typeFilter = searchParams.get('type') ?? '';

  const setFilterParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const setSearch = (value: string) => setFilterParam('search', value);
  const setStatusFilter = (value: string) => setFilterParam('status', value);
  const setTypeFilter = (value: string) => setFilterParam('type', value);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<EquipmentItem | null>(null);

  const {
    data: equipmentData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['equipment', search, statusFilter, typeFilter],
    queryFn: () =>
      getEquipment({
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
      queryClient.invalidateQueries({ queryKey: ['equipment-stats'] });
    },
    onError: () => showError(t('equipment.errorDelete')),
  });

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-2xl font-bold">{t('equipment.title')}</h1>
        {magBeheren && (
          <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={18} />
            {t('equipment.new')}
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <EquipmentStats />

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
            {equipmentTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Equipment Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : isError ? (
        // Zonder deze tak liep een mislukte aanroep uit op dezelfde lege staat
        // als een leeg magazijn: `equipmentData` blijft undefined en
        // `equipment` wordt een lege lijst. "Geen apparatuur gevonden" is dan
        // onwaar, en de uitnodiging om het eerste apparaat toe te voegen staat
        // er terwijl de inventaris gewoon niet opgehaald kon worden.
        <EmptyState variant="error" title={t('common.error')} />
      ) : equipment.length === 0 ? (
        <EmptyState
          icon="package"
          title={t('equipment.noEquipment')}
          description={t('equipment.noEquipmentDescription')}
          actionLabel={magBeheren ? t('equipment.new') : undefined}
          onAction={magBeheren ? () => setShowCreateModal(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipment.map((item) => (
            <div
              key={item.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedEquipmentId(item.id)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start">
                  <h3 className="card-title text-lg">{item.instrumentType}</h3>
                  <span className={`badge ${STATUS_COLORS[item.status] || 'badge-ghost'}`}>
                    {t(`equipment.statuses.${item.status}`)}
                  </span>
                </div>

                {item.brandModel && <p className="text-sm text-base-content/70">{item.brandModel}</p>}

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
                    {t('equipment.value')}: {formatCurrency(item.currentValue)}
                  </div>
                )}

                <div className="card-actions justify-end mt-2">
                  <div className="dropdown dropdown-end">
                    <label tabIndex={0} className="btn btn-ghost btn-sm">
                      <Icon name="menu" size={16} />
                    </label>
                    <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-10">
                      <li>
                        <button>{t('common.edit')}</button>
                      </li>
                      {item.status === 'available' && (
                        <li>
                          <button>{t('equipment.assignLoan')}</button>
                        </li>
                      )}
                      {item.status === 'on_loan' && (
                        <li>
                          <button>{t('equipment.returnLoan')}</button>
                        </li>
                      )}
                      <li>
                        <button>{t('equipment.recordMaintenance')}</button>
                      </li>
                      {magBeheren && (
                        <li className="text-error">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingItem(item);
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        </li>
                      )}
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

      {selectedEquipmentId && (
        <EquipmentDetailModal
          equipmentId={selectedEquipmentId}
          magBeheren={magBeheren}
          onClose={() => setSelectedEquipmentId(null)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['equipment'] })}
        />
      )}

      {deletingItem && (
        <ConfirmDialog
          title={t('equipment.deleteTitle')}
          message={t('equipment.confirmDelete', { name: deletingItem.instrumentType })}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(deletingItem.id, {
              onSuccess: () => setDeletingItem(null),
            });
          }}
          onCancel={() => setDeletingItem(null)}
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
  const veldId = useId();
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
          <label htmlFor={`${veldId}-instrumentType`} className="label">
            <span className="label-text font-medium">{t('equipment.instrumentType')} *</span>
          </label>
          <input
            id={`${veldId}-instrumentType`}
            type="text"
            className="input input-bordered"
            list="equipment-types"
            value={formData.instrumentType}
            onChange={(e) => setFormData({ ...formData, instrumentType: e.target.value })}
          />
          <datalist id="equipment-types">
            {equipmentTypes.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-brandModel`} className="label">
              <span className="label-text font-medium">{t('equipment.brandModel')}</span>
            </label>
            <input
              id={`${veldId}-brandModel`}
              type="text"
              className="input input-bordered"
              value={formData.brandModel}
              onChange={(e) => setFormData({ ...formData, brandModel: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-serialNumber`} className="label">
              <span className="label-text font-medium">{t('equipment.serialNumber')}</span>
            </label>
            <input
              id={`${veldId}-serialNumber`}
              type="text"
              className="input input-bordered"
              value={formData.serialNumber}
              onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-yearOfManufacture`} className="label">
              <span className="label-text font-medium">{t('equipment.yearOfManufacture')}</span>
            </label>
            <input
              id={`${veldId}-yearOfManufacture`}
              type="number"
              className="input input-bordered"
              min="1800"
              max={new Date().getFullYear()}
              value={formData.yearOfManufacture}
              onChange={(e) => setFormData({ ...formData, yearOfManufacture: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-status`} className="label">
              <span className="label-text font-medium">{t('common.status')}</span>
            </label>
            <select
              id={`${veldId}-status`}
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
            <label htmlFor={`${veldId}-purchasePrice`} className="label">
              <span className="label-text font-medium">{t('equipment.purchasePrice')}</span>
            </label>
            <input
              id={`${veldId}-purchasePrice`}
              type="number"
              className="input input-bordered"
              step="0.01"
              min="0"
              value={formData.purchasePrice}
              onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-currentValue`} className="label">
              <span className="label-text font-medium">{t('equipment.currentValue')}</span>
            </label>
            <input
              id={`${veldId}-currentValue`}
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
          <label htmlFor={`${veldId}-notes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-notes`}
            className="textarea textarea-bordered"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const DAMAGE_STATUS_COLORS: Record<string, string> = {
  reported: 'badge-warning',
  in_repair: 'badge-info',
  repaired: 'badge-success',
  written_off: 'badge-error',
};

function EquipmentDetailModal({
  equipmentId,
  magBeheren,
  onClose,
  onRefresh,
}: {
  equipmentId: string;
  magBeheren: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'info' | 'loans' | 'maintenance' | 'damage'>('info');
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [returnLoanId, setReturnLoanId] = useState<string | null>(null);

  const {
    data: equipment,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: () => getEquipmentItem(equipmentId),
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

  if (!equipment) {
    return (
      <Modal onClose={onClose} title={t('common.error')}>
        <p>{t('equipment.notFound')}</p>
      </Modal>
    );
  }

  const activeLoan = equipment.loanHistory.find((l) => !l.returnDate);

  return (
    <Modal onClose={onClose} title={equipment.instrumentType} className="max-w-3xl">
      <div className="space-y-6">
        {/* Header Info */}
        <div className="flex flex-wrap items-center gap-4">
          <span className={`badge ${STATUS_COLORS[equipment.status]} badge-lg`}>
            {t(`equipment.statuses.${equipment.status}`)}
          </span>
          {equipment.brandModel && <span className="text-base-content/70">{equipment.brandModel}</span>}
          {equipment.serialNumber && (
            <span className="font-mono text-sm text-base-content/60">S/N: {equipment.serialNumber}</span>
          )}
        </div>

        {/* Quick Actions */}
        {magBeheren && (
          <div className="flex flex-wrap gap-2">
            {equipment.status === 'available' && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowLoanModal(true)}>
                <Icon name="user" size={14} />
                {t('equipment.assignLoan')}
              </button>
            )}
            {activeLoan && (
              <button className="btn btn-warning btn-sm" onClick={() => setReturnLoanId(activeLoan.id)}>
                <Icon name="check" size={14} />
                {t('equipment.returnLoan')}
              </button>
            )}
            <button className="btn btn-info btn-sm" onClick={() => setShowMaintenanceModal(true)}>
              <Icon name="wrench" size={14} />
              {t('equipment.recordMaintenance')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowDamageModal(true)}>
              <Icon name="warning" size={14} />
              {t('equipment.reportDamage')}
            </button>
          </div>
        )}

        {/* Current User */}
        {equipment.currentUser && (
          <div className="alert alert-info">
            <Icon name="user" size={16} />
            <span>
              {t('equipment.currentlyWith')}:{' '}
              <strong>
                {equipment.currentUser.firstName} {equipment.currentUser.lastName}
              </strong>
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs tabs-boxed">
          <button className={`tab ${activeTab === 'info' ? 'tab-active' : ''}`} onClick={() => setActiveTab('info')}>
            <Icon name="info" size={16} className="mr-1" />
            {t('equipment.details')}
          </button>
          <button className={`tab ${activeTab === 'loans' ? 'tab-active' : ''}`} onClick={() => setActiveTab('loans')}>
            <Icon name="users" size={16} className="mr-1" />
            {t('equipment.loanHistory')} ({equipment.loanHistory.length})
          </button>
          <button
            className={`tab ${activeTab === 'maintenance' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('maintenance')}
          >
            <Icon name="wrench" size={16} className="mr-1" />
            {t('equipment.maintenance')}
          </button>
          <button
            className={`tab ${activeTab === 'damage' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('damage')}
          >
            <Icon name="warning" size={16} className="mr-1" />
            {t('equipment.damageLogs')} ({equipment.damageLogs.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[250px]">
          {activeTab === 'info' && <EquipmentInfoTab equipment={equipment} />}
          {activeTab === 'loans' && <EquipmentLoansTab loans={equipment.loanHistory} />}
          {activeTab === 'maintenance' && <EquipmentMaintenanceTab equipment={equipment} />}
          {activeTab === 'damage' && <EquipmentDamageTab logs={equipment.damageLogs} />}
        </div>
      </div>

      {showLoanModal && (
        <LoanModal
          equipmentId={equipmentId}
          onClose={() => setShowLoanModal(false)}
          onSuccess={() => {
            refetch();
            onRefresh();
            setShowLoanModal(false);
          }}
        />
      )}

      {returnLoanId && (
        <ReturnLoanModal
          equipmentId={equipmentId}
          loanId={returnLoanId}
          onClose={() => setReturnLoanId(null)}
          onSuccess={() => {
            refetch();
            onRefresh();
            setReturnLoanId(null);
          }}
        />
      )}

      {showMaintenanceModal && (
        <MaintenanceModal
          equipmentId={equipmentId}
          onClose={() => setShowMaintenanceModal(false)}
          onSuccess={() => {
            refetch();
            onRefresh();
            setShowMaintenanceModal(false);
          }}
        />
      )}

      {showDamageModal && (
        <DamageModal
          equipmentId={equipmentId}
          onClose={() => setShowDamageModal(false)}
          onSuccess={() => {
            refetch();
            setShowDamageModal(false);
          }}
        />
      )}
    </Modal>
  );
}

function EquipmentInfoTab({ equipment }: { equipment: EquipmentDetail }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="card bg-base-200 p-4">
        <h4 className="text-sm text-base-content/60">{t('equipment.yearOfManufacture')}</h4>
        <p className="font-medium">{equipment.yearOfManufacture || '-'}</p>
      </div>
      <div className="card bg-base-200 p-4">
        <h4 className="text-sm text-base-content/60">{t('equipment.purchasePrice')}</h4>
        <p className="font-medium">{formatCurrency(equipment.purchasePrice)}</p>
      </div>
      <div className="card bg-base-200 p-4">
        <h4 className="text-sm text-base-content/60">{t('equipment.currentValue')}</h4>
        <p className="font-medium">{formatCurrency(equipment.currentValue)}</p>
      </div>
      <div className="card bg-base-200 p-4">
        <h4 className="text-sm text-base-content/60">{t('equipment.maintenanceInterval')}</h4>
        <p className="font-medium">
          {equipment.maintenanceIntervalMonths} {t('equipment.months')}
        </p>
      </div>
      {equipment.notes && (
        <div className="col-span-2 card bg-base-200 p-4">
          <h4 className="text-sm text-base-content/60 mb-1">{t('common.notes')}</h4>
          <p className="whitespace-pre-wrap">{equipment.notes}</p>
        </div>
      )}
    </div>
  );
}

function EquipmentLoansTab({ loans }: { loans: EquipmentDetail['loanHistory'] }) {
  const { t } = useTranslation();

  if (loans.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="users" size={32} className="mx-auto mb-2 opacity-50" />
        <p>{t('equipment.noLoanHistory')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>{t('equipment.borrower')}</th>
            <th>{t('equipment.loanDate')}</th>
            <th>{t('equipment.returnDate')}</th>
            <th>{t('equipment.conditionAtLoan')}</th>
            <th>{t('equipment.conditionAtReturn')}</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id}>
              <td className="font-medium">
                {loan.user.firstName} {loan.user.lastName}
              </td>
              <td>{formatDate(loan.loanDate)}</td>
              <td>
                {loan.returnDate ? (
                  formatDate(loan.returnDate)
                ) : (
                  <span className="badge badge-warning badge-sm">{t('equipment.active')}</span>
                )}
              </td>
              <td className="text-sm">{loan.conditionAtLoan || '-'}</td>
              <td className="text-sm">{loan.conditionAtReturn || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EquipmentMaintenanceTab({ equipment }: { equipment: EquipmentDetail }) {
  const { t } = useTranslation();

  const isOverdue = equipment.nextMaintenanceDate && new Date(equipment.nextMaintenanceDate) < new Date();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="card bg-base-200 p-4">
          <h4 className="text-sm text-base-content/60">{t('equipment.lastMaintenance')}</h4>
          <p className="font-medium">
            {equipment.lastMaintenanceDate ? formatDate(equipment.lastMaintenanceDate) : t('equipment.never')}
          </p>
        </div>
        <div className={`card p-4 ${isOverdue ? 'bg-error/10' : 'bg-base-200'}`}>
          <h4 className="text-sm text-base-content/60">{t('equipment.nextMaintenance')}</h4>
          <p className={`font-medium ${isOverdue ? 'text-error' : ''}`}>
            {equipment.nextMaintenanceDate ? formatDate(equipment.nextMaintenanceDate) : '-'}
            {isOverdue && <span className="ml-2 badge badge-error badge-sm">{t('equipment.overdue')}</span>}
          </p>
        </div>
      </div>
      <div className="card bg-base-200 p-4">
        <h4 className="text-sm text-base-content/60 mb-2">{t('equipment.maintenanceSchedule')}</h4>
        <p className="text-sm">{t('equipment.maintenanceEvery', { months: equipment.maintenanceIntervalMonths })}</p>
      </div>
    </div>
  );
}

function EquipmentDamageTab({ logs }: { logs: EquipmentDetail['damageLogs'] }) {
  const { t } = useTranslation();

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="checkCircle" size={32} className="mx-auto mb-2 opacity-50" />
        <p>{t('equipment.noDamageLogs')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="card bg-base-200 p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm text-base-content/60">{formatDate(log.date)}</span>
                <span className={`badge badge-sm ${DAMAGE_STATUS_COLORS[log.status]}`}>
                  {t(`equipment.damageStatuses.${log.status}`)}
                </span>
              </div>
              <p className="text-sm">{log.description}</p>
            </div>
            {log.repairCost && <span className="font-medium">{formatCurrency(log.repairCost)}</span>}
          </div>
          {log.repairedBy && (
            <div className="text-sm text-base-content/60 mt-2">
              {t('equipment.repairedBy')}: {log.repairedBy}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LoanModal({
  equipmentId,
  onClose,
  onSuccess,
}: {
  equipmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    userId: '',
    loanDate: new Date().toISOString().split('T')[0],
    conditionAtLoan: '',
    notes: '',
  });

  const loanMutation = useMutation({
    mutationFn: () => createEquipmentLoan(equipmentId, formData),
    onSuccess: () => {
      showSuccess(t('equipment.loanCreated'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorLoan')),
  });

  return (
    <Modal onClose={onClose} title={t('equipment.assignLoan')}>
      <div className="space-y-4">
        <div className="form-control">
          <label htmlFor={`${veldId}-borrowerId`} className="label">
            <span className="label-text font-medium">{t('equipment.borrowerId')} *</span>
          </label>
          <input
            id={`${veldId}-borrowerId`}
            type="text"
            className="input input-bordered"
            placeholder={t('equipment.enterUserId')}
            value={formData.userId}
            onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-loanDate`} className="label">
            <span className="label-text font-medium">{t('equipment.loanDate')} *</span>
          </label>
          <input
            id={`${veldId}-loanDate`}
            type="date"
            className="input input-bordered"
            value={formData.loanDate}
            onChange={(e) => setFormData({ ...formData, loanDate: e.target.value })}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-conditionAtLoan`} className="label">
            <span className="label-text font-medium">{t('equipment.conditionAtLoan')}</span>
          </label>
          <input
            id={`${veldId}-conditionAtLoan`}
            type="text"
            className="input input-bordered"
            value={formData.conditionAtLoan}
            onChange={(e) => setFormData({ ...formData, conditionAtLoan: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => loanMutation.mutate()}
            disabled={!formData.userId || loanMutation.isPending}
          >
            {loanMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('equipment.assignLoan')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReturnLoanModal({
  equipmentId,
  loanId,
  onClose,
  onSuccess,
}: {
  equipmentId: string;
  loanId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    returnDate: new Date().toISOString().split('T')[0],
    conditionAtReturn: '',
  });

  const returnMutation = useMutation({
    mutationFn: () => returnEquipmentLoan(equipmentId, loanId, formData),
    onSuccess: () => {
      showSuccess(t('equipment.loanReturned'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorReturn')),
  });

  return (
    <Modal onClose={onClose} title={t('equipment.returnLoan')}>
      <div className="space-y-4">
        <div className="form-control">
          <label htmlFor={`${veldId}-returnDate`} className="label">
            <span className="label-text font-medium">{t('equipment.returnDate')} *</span>
          </label>
          <input
            id={`${veldId}-returnDate`}
            type="date"
            className="input input-bordered"
            value={formData.returnDate}
            onChange={(e) => setFormData({ ...formData, returnDate: e.target.value })}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-conditionAtReturn`} className="label">
            <span className="label-text font-medium">{t('equipment.conditionAtReturn')}</span>
          </label>
          <input
            id={`${veldId}-conditionAtReturn`}
            type="text"
            className="input input-bordered"
            value={formData.conditionAtReturn}
            onChange={(e) => setFormData({ ...formData, conditionAtReturn: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-warning"
            onClick={() => returnMutation.mutate()}
            disabled={returnMutation.isPending}
          >
            {returnMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('equipment.returnLoan')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MaintenanceModal({
  equipmentId,
  onClose,
  onSuccess,
}: {
  equipmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const maintenanceMutation = useMutation({
    mutationFn: () => recordEquipmentMaintenance(equipmentId, formData),
    onSuccess: (data) => {
      showSuccess(t('equipment.maintenanceRecorded', { nextDate: formatDate(data.nextMaintenanceDate) }));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorMaintenance')),
  });

  return (
    <Modal onClose={onClose} title={t('equipment.recordMaintenance')}>
      <div className="space-y-4">
        <div className="form-control">
          <label htmlFor={`${veldId}-maintenanceDate`} className="label">
            <span className="label-text font-medium">{t('equipment.maintenanceDate')}</span>
          </label>
          <input
            id={`${veldId}-maintenanceDate`}
            type="date"
            className="input input-bordered"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-notes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-notes`}
            className="textarea textarea-bordered"
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-info"
            onClick={() => maintenanceMutation.mutate()}
            disabled={maintenanceMutation.isPending}
          >
            {maintenanceMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('equipment.recordMaintenance')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DamageModal({
  equipmentId,
  onClose,
  onSuccess,
}: {
  equipmentId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    repairCost: '',
    status: 'reported',
  });

  const damageMutation = useMutation({
    mutationFn: () =>
      addEquipmentDamageLog(equipmentId, {
        date: formData.date,
        description: formData.description,
        repairCost: formData.repairCost ? parseFloat(formData.repairCost) : undefined,
        status: formData.status,
      }),
    onSuccess: () => {
      showSuccess(t('equipment.damageReported'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorDamage')),
  });

  return (
    <Modal onClose={onClose} title={t('equipment.reportDamage')}>
      <div className="space-y-4">
        <div className="form-control">
          <label htmlFor={`${veldId}-date`} className="label">
            <span className="label-text font-medium">{t('common.date')} *</span>
          </label>
          <input
            id={`${veldId}-date`}
            type="date"
            className="input input-bordered"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-description`} className="label">
            <span className="label-text font-medium">{t('common.description')} *</span>
          </label>
          <textarea
            id={`${veldId}-description`}
            className="textarea textarea-bordered"
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-repairCost`} className="label">
              <span className="label-text font-medium">{t('equipment.repairCost')}</span>
            </label>
            <input
              id={`${veldId}-repairCost`}
              type="number"
              className="input input-bordered"
              step="0.01"
              min="0"
              value={formData.repairCost}
              onChange={(e) => setFormData({ ...formData, repairCost: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-status`} className="label">
              <span className="label-text font-medium">{t('common.status')}</span>
            </label>
            <select
              id={`${veldId}-status`}
              className="select select-bordered"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="reported">{t('equipment.damageStatuses.reported')}</option>
              <option value="in_repair">{t('equipment.damageStatuses.in_repair')}</option>
              <option value="repaired">{t('equipment.damageStatuses.repaired')}</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-warning"
            onClick={() => damageMutation.mutate()}
            disabled={!formData.description || damageMutation.isPending}
          >
            {damageMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('equipment.reportDamage')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
