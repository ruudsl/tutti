import { formatCurrency } from '../utils/format';
import { useId, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import {
  getEquipment,
  getEquipmentItem,
  getEquipmentCategories,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  createEquipmentLoan,
  returnEquipmentLoan,
  recordEquipmentMaintenance,
  getEquipmentDamageLogs,
  addEquipmentDamageLog,
  updateEquipmentDamageLog,
  deleteEquipmentDamageLog,
  type EquipmentInput,
  type EquipmentWijziging,
} from '../api/equipment';
import { getMemberDirectory } from '../api/member-directory';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../utils/dateFormat';
import { EquipmentStats } from '../components/EquipmentStats';
import type {
  Equipment as EquipmentItem,
  EquipmentCategory,
  EquipmentCondition,
  EquipmentDamageLog,
  EquipmentDamageSeverity,
  EquipmentDetail,
  EquipmentMaintenance,
  EquipmentMaintenanceType,
  EquipmentStatus,
  EquipmentType,
} from '../types';

// De waarden hieronder zijn de enums uit backend/src/routes/equipment.ts. Een
// waarde die daar niet staat geeft bij opslaan een 400, en een filter erop
// levert altijd een lege lijst op.
const SOORTEN: EquipmentType[] = ['instrument', 'accessory', 'audio', 'lighting', 'furniture', 'transport', 'misc'];
const STATUSSEN: EquipmentStatus[] = ['available', 'in_use', 'maintenance', 'repair', 'retired', 'lost', 'sold'];
const STATEN: EquipmentCondition[] = ['new', 'excellent', 'good', 'fair', 'poor', 'broken'];
const ONDERHOUDSSOORTEN: EquipmentMaintenanceType[] = [
  'inspection',
  'cleaning',
  'repair',
  'service',
  'calibration',
  'replacement',
];
const ERNSTGRADEN: EquipmentDamageSeverity[] = ['minor', 'moderate', 'severe', 'unusable'];

const STATUS_COLORS: Record<EquipmentStatus, string> = {
  available: 'badge-success',
  in_use: 'badge-warning',
  maintenance: 'badge-info',
  repair: 'badge-info',
  retired: 'badge-ghost',
  lost: 'badge-error',
  sold: 'badge-ghost',
};

const ERNST_COLORS: Record<EquipmentDamageSeverity, string> = {
  minor: 'badge-ghost',
  moderate: 'badge-warning',
  severe: 'badge-error',
  unusable: 'badge-error',
};

/** De datum van vandaag als JJJJ-MM-DD, voor datumvelden en vergelijkingen. */
function vandaag(): string {
  return new Date().toISOString().split('T')[0];
}

/** Lege invoer wordt `undefined`, zodat hij niet als lege tekst meegaat. */
function tekstOfNiets(waarde: string): string | undefined {
  const bijgesneden = waarde.trim();
  return bijgesneden ? bijgesneden : undefined;
}

/** Een getalveld; leeg is `undefined`, niet 0. */
function getalOfNiets(waarde: string): number | undefined {
  return waarde.trim() === '' ? undefined : Number(waarde);
}

/** Merk en model staan in de backend los; samen lezen ze als één regel. */
function merkEnModel(item: { brand: string | null; model: string | null }): string {
  return [item.brand, item.model].filter(Boolean).join(' ');
}

/** Is het geplande onderhoud verstreken? `nextMaintenance` is JJJJ-MM-DD. */
function onderhoudVerlopen(nextMaintenance: string | null): boolean {
  return !!nextMaintenance && nextMaintenance.slice(0, 10) < vandaag();
}

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
  // Een schademelding verwijderen mag alleen admin (requireRole('admin')).
  const magSchadeVerwijderen = user?.role === 'admin';

  // Filters live in the URL so filtered views can be linked/bookmarked;
  // default values are omitted from the URL to keep it clean.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const typeFilter = searchParams.get('type') ?? '';
  const categoryFilter = searchParams.get('category') ?? '';

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

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<EquipmentItem | null>(null);

  const {
    data: equipmentData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['equipment', statusFilter, typeFilter, categoryFilter],
    queryFn: () =>
      getEquipment({
        status: (statusFilter || undefined) as EquipmentStatus | undefined,
        type: (typeFilter || undefined) as EquipmentType | undefined,
        categoryId: categoryFilter || undefined,
      }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['equipment-categories'],
    queryFn: getEquipmentCategories,
  });

  // GET /equipment geeft een kale array. Hier stond `equipmentData?.data`,
  // alsof er een pagineringsobject terugkwam: dat veld bestaat niet, dus de
  // lijst was altijd leeg, hoeveel apparatuur er ook in de database stond.
  // Zoeken op tekst kent de backend niet; dat gebeurt hier.
  const zoekterm = search.trim().toLowerCase();
  const equipment = (equipmentData ?? []).filter(
    (item) =>
      !zoekterm ||
      [item.name, item.brand, item.model, item.serialNumber, item.inventoryNumber, item.location].some((veld) =>
        veld?.toLowerCase().includes(zoekterm),
      ),
  );

  const verversOverzicht = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['equipment-stats'] });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteEquipment,
    onSuccess: () => {
      showSuccess(t('equipment.deleted'));
      verversOverzicht();
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
          aria-label={t('common.search')}
          value={search}
          onChange={(e) => setFilterParam('search', e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
          aria-label={t('common.status')}
          value={statusFilter}
          onChange={(e) => setFilterParam('status', e.target.value)}
        >
          <option value="">{t('equipment.allStatuses')}</option>
          {STATUSSEN.map((status) => (
            <option key={status} value={status}>
              {t(`equipment.statuses.${status}`)}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm"
          aria-label={t('equipment.equipmentType')}
          value={typeFilter}
          onChange={(e) => setFilterParam('type', e.target.value)}
        >
          <option value="">{t('equipment.allTypes')}</option>
          {SOORTEN.map((soort) => (
            <option key={soort} value={soort}>
              {t(`equipment.types.${soort}`)}
            </option>
          ))}
        </select>
        {categories.length > 0 && (
          <select
            className="select select-bordered select-sm"
            aria-label={t('equipment.category')}
            value={categoryFilter}
            onChange={(e) => setFilterParam('category', e.target.value)}
          >
            <option value="">{t('equipment.allCategories')}</option>
            {categories.map((categorie) => (
              <option key={categorie.id} value={categorie.id}>
                {categorie.name}
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
                <div className="flex justify-between items-start gap-2">
                  <h3 className="card-title text-lg">{item.name}</h3>
                  <span className={`badge ${STATUS_COLORS[item.status] || 'badge-ghost'}`}>
                    {t(`equipment.statuses.${item.status}`)}
                  </span>
                </div>

                <p className="text-sm text-base-content/70">
                  {t(`equipment.types.${item.equipmentType}`)}
                  {merkEnModel(item) && <> · {merkEnModel(item)}</>}
                </p>

                <div className="flex flex-wrap gap-2 text-sm text-base-content/60">
                  {item.inventoryNumber && (
                    <span className="flex items-center gap-1">
                      <Icon name="bookmark" size={14} />
                      {item.inventoryNumber}
                    </span>
                  )}
                  {item.serialNumber && (
                    <span className="flex items-center gap-1">
                      <Icon name="fileText" size={14} />
                      {item.serialNumber}
                    </span>
                  )}
                  {item.location && (
                    <span className="flex items-center gap-1">
                      <Icon name="mapPin" size={14} />
                      {item.location}
                    </span>
                  )}
                  {item.categoryName && <span className="badge badge-outline badge-sm">{item.categoryName}</span>}
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  <span>
                    {t('equipment.condition')}: {t(`equipment.conditions.${item.condition}`)}
                  </span>
                  {item.activeLoans > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <Icon name="user" size={14} />
                      {t('equipment.onLoan')}
                    </span>
                  )}
                </div>

                {item.currentValue != null && (
                  <div className="text-sm font-medium">
                    {t('equipment.value')}: {formatCurrency(item.currentValue)}
                  </div>
                )}

                {magBeheren && (
                  <div className="card-actions justify-end mt-2" onClick={(e) => e.stopPropagation()}>
                    <div className="dropdown dropdown-end">
                      <label tabIndex={0} className="btn btn-ghost btn-sm" aria-label={t('common.actions')}>
                        <Icon name="menu" size={16} />
                      </label>
                      <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-10">
                        <li>
                          <button onClick={() => setEditingItem(item)}>{t('common.edit')}</button>
                        </li>
                        <li className="text-error">
                          <button onClick={() => setDeletingItem(item)}>{t('common.delete')}</button>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreateModal || editingItem) && (
        <EquipmentModal
          bestaand={editingItem}
          categories={categories}
          onClose={() => {
            setShowCreateModal(false);
            setEditingItem(null);
          }}
          onSuccess={(id) => {
            verversOverzicht();
            if (id) queryClient.invalidateQueries({ queryKey: ['equipment-detail', id] });
            setShowCreateModal(false);
            setEditingItem(null);
          }}
        />
      )}

      {selectedEquipmentId && (
        <EquipmentDetailModal
          equipmentId={selectedEquipmentId}
          magBeheren={magBeheren}
          magSchadeVerwijderen={magSchadeVerwijderen}
          onClose={() => setSelectedEquipmentId(null)}
          onRefresh={verversOverzicht}
        />
      )}

      {deletingItem && (
        <ConfirmDialog
          title={t('equipment.deleteTitle')}
          message={t('equipment.confirmDelete', { name: deletingItem.name })}
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

/**
 * Aanmaken en bewerken.
 *
 * Bewerken toont alleen naam, omschrijving, status, staat en locatie: dat zijn
 * de enige velden die PATCH /equipment/:id werkelijk wegschrijft. De andere
 * velden accepteert de backend wel, maar hij negeert ze - een formulier dat ze
 * aanbiedt meldt "bijgewerkt" terwijl er niets verandert.
 */
function EquipmentModal({
  bestaand,
  categories,
  onClose,
  onSuccess,
}: {
  bestaand: EquipmentItem | null;
  categories: EquipmentCategory[];
  onClose: () => void;
  onSuccess: (id?: string) => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    name: bestaand?.name ?? '',
    equipmentType: (bestaand?.equipmentType ?? 'instrument') as EquipmentType,
    description: bestaand?.description ?? '',
    categoryId: bestaand?.categoryId ?? '',
    inventoryNumber: '',
    brand: '',
    model: '',
    serialNumber: '',
    status: (bestaand?.status ?? 'available') as EquipmentStatus,
    condition: (bestaand?.condition ?? 'good') as EquipmentCondition,
    location: bestaand?.location ?? '',
    purchaseDate: '',
    purchasePrice: '',
    currentValue: '',
    maintenanceIntervalMonths: '',
    isLoanable: true,
    notes: '',
  });
  const zet = <K extends keyof typeof formData>(sleutel: K, waarde: (typeof formData)[K]) =>
    setFormData((vorig) => ({ ...vorig, [sleutel]: waarde }));

  const createMutation = useMutation({
    mutationFn: createEquipment,
    onSuccess: () => {
      showSuccess(t('equipment.created'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorCreate')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, wijziging }: { id: string; wijziging: EquipmentWijziging }) => updateEquipment(id, wijziging),
    onSuccess: (_, { id }) => {
      showSuccess(t('equipment.updated'));
      onSuccess(id);
    },
    onError: () => showError(t('equipment.errorUpdate')),
  });

  /** Alleen wat echt veranderd is; een leeg tekstveld wist de waarde. */
  const wijziging = (): EquipmentWijziging => {
    if (!bestaand) return {};
    const uit: EquipmentWijziging = {};
    if (formData.name.trim() !== bestaand.name) uit.name = formData.name.trim();
    if (formData.description.trim() !== (bestaand.description ?? '')) uit.description = formData.description.trim();
    if (formData.status !== bestaand.status) uit.status = formData.status;
    if (formData.condition !== bestaand.condition) uit.condition = formData.condition;
    if (formData.location.trim() !== (bestaand.location ?? '')) uit.location = formData.location.trim();
    return uit;
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const naamIngevuld = formData.name.trim().length > 0;
  const canSubmit = naamIngevuld && (!bestaand || Object.keys(wijziging()).length > 0);

  const handleSubmit = () => {
    if (bestaand) {
      updateMutation.mutate({ id: bestaand.id, wijziging: wijziging() });
      return;
    }
    const nieuw: EquipmentInput = {
      name: formData.name.trim(),
      equipmentType: formData.equipmentType,
      description: tekstOfNiets(formData.description),
      categoryId: formData.categoryId || undefined,
      inventoryNumber: tekstOfNiets(formData.inventoryNumber),
      brand: tekstOfNiets(formData.brand),
      model: tekstOfNiets(formData.model),
      serialNumber: tekstOfNiets(formData.serialNumber),
      status: formData.status,
      condition: formData.condition,
      location: tekstOfNiets(formData.location),
      purchaseDate: formData.purchaseDate || undefined,
      purchasePrice: getalOfNiets(formData.purchasePrice),
      currentValue: getalOfNiets(formData.currentValue),
      maintenanceIntervalMonths: formData.maintenanceIntervalMonths.trim()
        ? parseInt(formData.maintenanceIntervalMonths, 10)
        : undefined,
      isLoanable: formData.isLoanable,
      notes: tekstOfNiets(formData.notes),
    };
    createMutation.mutate(nieuw);
  };

  const tekstveld = (sleutel: 'brand' | 'model' | 'serialNumber' | 'inventoryNumber', label: string) => (
    <div className="form-control">
      <label htmlFor={`${veldId}-${sleutel}`} className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <input
        id={`${veldId}-${sleutel}`}
        type="text"
        className="input input-bordered"
        value={formData[sleutel]}
        onChange={(e) => zet(sleutel, e.target.value)}
      />
    </div>
  );

  const bedragveld = (sleutel: 'purchasePrice' | 'currentValue', label: string) => (
    <div className="form-control">
      <label htmlFor={`${veldId}-${sleutel}`} className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <input
        id={`${veldId}-${sleutel}`}
        type="number"
        className="input input-bordered"
        step="0.01"
        min="0"
        value={formData[sleutel]}
        onChange={(e) => zet(sleutel, e.target.value)}
      />
    </div>
  );

  return (
    <Modal onClose={onClose} title={bestaand ? t('equipment.edit') : t('equipment.new')} className="max-w-2xl">
      <div className="space-y-4">
        {bestaand && <p className="text-sm text-base-content/70">{t('equipment.editLimited')}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-name`} className="label">
              <span className="label-text font-medium">{t('common.name')} *</span>
            </label>
            <input
              id={`${veldId}-name`}
              type="text"
              className="input input-bordered"
              value={formData.name}
              onChange={(e) => zet('name', e.target.value)}
            />
          </div>
          {!bestaand && (
            <div className="form-control">
              <label htmlFor={`${veldId}-equipmentType`} className="label">
                <span className="label-text font-medium">{t('equipment.equipmentType')} *</span>
              </label>
              <select
                id={`${veldId}-equipmentType`}
                className="select select-bordered"
                value={formData.equipmentType}
                onChange={(e) => zet('equipmentType', e.target.value as EquipmentType)}
              >
                {SOORTEN.map((soort) => (
                  <option key={soort} value={soort}>
                    {t(`equipment.types.${soort}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!bestaand && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tekstveld('brand', t('equipment.brand'))}
              {tekstveld('model', t('equipment.model'))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tekstveld('serialNumber', t('equipment.serialNumber'))}
              <div className="form-control">
                <label htmlFor={`${veldId}-inventoryNumber`} className="label">
                  <span className="label-text font-medium">{t('equipment.inventoryNumber')}</span>
                </label>
                <input
                  id={`${veldId}-inventoryNumber`}
                  type="text"
                  className="input input-bordered"
                  placeholder={t('equipment.inventoryNumberAuto')}
                  value={formData.inventoryNumber}
                  onChange={(e) => zet('inventoryNumber', e.target.value)}
                />
              </div>
            </div>
            {categories.length > 0 && (
              <div className="form-control">
                <label htmlFor={`${veldId}-categoryId`} className="label">
                  <span className="label-text font-medium">{t('equipment.category')}</span>
                </label>
                <select
                  id={`${veldId}-categoryId`}
                  className="select select-bordered"
                  value={formData.categoryId}
                  onChange={(e) => zet('categoryId', e.target.value)}
                >
                  <option value="">{t('common.selectOptional')}</option>
                  {categories.map((categorie) => (
                    <option key={categorie.id} value={categorie.id}>
                      {categorie.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-status`} className="label">
              <span className="label-text font-medium">{t('common.status')}</span>
            </label>
            <select
              id={`${veldId}-status`}
              className="select select-bordered"
              value={formData.status}
              onChange={(e) => zet('status', e.target.value as EquipmentStatus)}
            >
              {STATUSSEN.map((status) => (
                <option key={status} value={status}>
                  {t(`equipment.statuses.${status}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-condition`} className="label">
              <span className="label-text font-medium">{t('equipment.condition')}</span>
            </label>
            <select
              id={`${veldId}-condition`}
              className="select select-bordered"
              value={formData.condition}
              onChange={(e) => zet('condition', e.target.value as EquipmentCondition)}
            >
              {STATEN.map((staat) => (
                <option key={staat} value={staat}>
                  {t(`equipment.conditions.${staat}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label htmlFor={`${veldId}-location`} className="label">
            <span className="label-text font-medium">{t('common.location')}</span>
          </label>
          <input
            id={`${veldId}-location`}
            type="text"
            className="input input-bordered"
            value={formData.location}
            onChange={(e) => zet('location', e.target.value)}
          />
        </div>

        {!bestaand && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="form-control">
                <label htmlFor={`${veldId}-purchaseDate`} className="label">
                  <span className="label-text font-medium">{t('equipment.purchaseDate')}</span>
                </label>
                <input
                  id={`${veldId}-purchaseDate`}
                  type="date"
                  className="input input-bordered"
                  value={formData.purchaseDate}
                  onChange={(e) => zet('purchaseDate', e.target.value)}
                />
              </div>
              {bedragveld('purchasePrice', t('equipment.purchasePrice'))}
              {bedragveld('currentValue', t('equipment.currentValue'))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="form-control">
                <label htmlFor={`${veldId}-maintenanceIntervalMonths`} className="label">
                  <span className="label-text font-medium">
                    {t('equipment.maintenanceInterval')} ({t('equipment.months')})
                  </span>
                </label>
                <input
                  id={`${veldId}-maintenanceIntervalMonths`}
                  type="number"
                  className="input input-bordered"
                  min="1"
                  step="1"
                  value={formData.maintenanceIntervalMonths}
                  onChange={(e) => zet('maintenanceIntervalMonths', e.target.value)}
                />
              </div>
              <label htmlFor={`${veldId}-isLoanable`} className="label cursor-pointer justify-start gap-3">
                <input
                  id={`${veldId}-isLoanable`}
                  type="checkbox"
                  className="checkbox"
                  checked={formData.isLoanable}
                  onChange={(e) => zet('isLoanable', e.target.checked)}
                />
                <span className="label-text font-medium">{t('equipment.isLoanable')}</span>
              </label>
            </div>
          </>
        )}

        <div className="form-control">
          <label htmlFor={`${veldId}-description`} className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            id={`${veldId}-description`}
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => zet('description', e.target.value)}
            rows={2}
          />
        </div>

        {!bestaand && (
          <div className="form-control">
            <label htmlFor={`${veldId}-notes`} className="label">
              <span className="label-text font-medium">{t('common.notes')}</span>
            </label>
            <textarea
              id={`${veldId}-notes`}
              className="textarea textarea-bordered"
              value={formData.notes}
              onChange={(e) => zet('notes', e.target.value)}
              rows={3}
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {bestaand ? t('common.save') : t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EquipmentDetailModal({
  equipmentId,
  magBeheren,
  magSchadeVerwijderen,
  onClose,
  onRefresh,
}: {
  equipmentId: string;
  magBeheren: boolean;
  magSchadeVerwijderen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'info' | 'loans' | 'maintenance' | 'damage'>('info');
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [returnLoanId, setReturnLoanId] = useState<string | null>(null);

  const { data: equipment, isLoading } = useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: () => getEquipmentItem(equipmentId),
  });

  // GET /equipment/:id stuurt uitleningen en onderhoud mee, maar geen schade.
  const { data: damageLogs = [] } = useQuery({
    queryKey: ['equipment-damage', equipmentId],
    queryFn: () => getEquipmentDamageLogs(equipmentId),
  });

  /** Na een wijziging: dit venster en het overzicht erachter opnieuw ophalen. */
  const ververs = (ook: { schade?: boolean } = {}) => {
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    if (ook.schade) queryClient.invalidateQueries({ queryKey: ['equipment-damage', equipmentId] });
    onRefresh();
  };

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

  const activeLoan = equipment.loans.find((l) => l.status === 'active');
  // Dezelfde voorwaarden als POST /equipment/loans: uitleenbaar en geen
  // lopende uitlening. Een item in reparatie of afgeschreven leen je niet uit.
  const kanUitlenen = equipment.isLoanable && !activeLoan && equipment.status === 'available';
  const onderhoudTeLaat = onderhoudVerlopen(equipment.nextMaintenance);

  return (
    <Modal onClose={onClose} title={equipment.name} className="max-w-3xl">
      <div className="space-y-6">
        {/* Header Info */}
        <div className="flex flex-wrap items-center gap-4">
          <span className={`badge ${STATUS_COLORS[equipment.status] || 'badge-ghost'} badge-lg`}>
            {t(`equipment.statuses.${equipment.status}`)}
          </span>
          <span className="badge badge-outline">
            {t('equipment.condition')}: {t(`equipment.conditions.${equipment.condition}`)}
          </span>
          {merkEnModel(equipment) && <span className="text-base-content/70">{merkEnModel(equipment)}</span>}
          {equipment.serialNumber && (
            <span className="font-mono text-sm text-base-content/60">S/N: {equipment.serialNumber}</span>
          )}
        </div>

        {/* Quick Actions */}
        {magBeheren && (
          <div className="flex flex-wrap gap-2">
            {kanUitlenen && (
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

        {/* Current borrower */}
        {activeLoan && (
          <div className="alert alert-info">
            <Icon name="user" size={16} />
            <span>
              {t('equipment.currentlyWith')}: <strong>{activeLoan.userName}</strong>
              {activeLoan.expectedReturnDate && (
                <>
                  {' '}
                  · {t('equipment.expectedReturnDate')}: {formatDate(activeLoan.expectedReturnDate)}
                </>
              )}
            </span>
          </div>
        )}

        {onderhoudTeLaat && equipment.nextMaintenance && (
          <div className="alert alert-warning">
            <Icon name="wrench" size={16} />
            <span>{t('equipment.maintenanceOverdue', { date: formatDate(equipment.nextMaintenance) })}</span>
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
            {t('equipment.loanHistory')} ({equipment.loans.length})
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
            {t('equipment.damageLogs')} ({damageLogs.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[250px]">
          {activeTab === 'info' && <EquipmentInfoTab equipment={equipment} />}
          {activeTab === 'loans' && <EquipmentLoansTab loans={equipment.loans} />}
          {activeTab === 'maintenance' && <EquipmentMaintenanceTab equipment={equipment} />}
          {activeTab === 'damage' && (
            <EquipmentDamageTab
              equipmentId={equipmentId}
              logs={damageLogs}
              magBeheren={magBeheren}
              magVerwijderen={magSchadeVerwijderen}
              onChanged={() => ververs({ schade: true })}
            />
          )}
        </div>
      </div>

      {showLoanModal && (
        <LoanModal
          equipmentId={equipmentId}
          onClose={() => setShowLoanModal(false)}
          onSuccess={() => {
            ververs();
            setShowLoanModal(false);
          }}
        />
      )}

      {returnLoanId && (
        <ReturnLoanModal
          loanId={returnLoanId}
          onClose={() => setReturnLoanId(null)}
          onSuccess={() => {
            ververs();
            setReturnLoanId(null);
          }}
        />
      )}

      {showMaintenanceModal && (
        <MaintenanceModal
          equipmentId={equipmentId}
          onClose={() => setShowMaintenanceModal(false)}
          onSuccess={() => {
            ververs();
            setShowMaintenanceModal(false);
          }}
        />
      )}

      {showDamageModal && (
        <DamageModal
          equipmentId={equipmentId}
          onClose={() => setShowDamageModal(false)}
          onSuccess={() => {
            // De backend verlaagt bij een melding de staat van het item, en
            // zet het bij 'onbruikbaar' op reparatie: alles moet mee.
            ververs({ schade: true });
            setShowDamageModal(false);
          }}
        />
      )}
    </Modal>
  );
}

function Kenmerk({ label, children, breed = false }: { label: string; children: ReactNode; breed?: boolean }) {
  return (
    <div className={`card bg-base-200 p-4 ${breed ? 'col-span-2' : ''}`}>
      <h4 className="text-sm text-base-content/60">{label}</h4>
      <div className="font-medium whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function EquipmentInfoTab({ equipment }: { equipment: EquipmentDetail }) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-4">
      <Kenmerk label={t('equipment.equipmentType')}>{t(`equipment.types.${equipment.equipmentType}`)}</Kenmerk>
      <Kenmerk label={t('equipment.category')}>{equipment.categoryName || '-'}</Kenmerk>
      <Kenmerk label={t('equipment.inventoryNumber')}>{equipment.inventoryNumber || '-'}</Kenmerk>
      <Kenmerk label={t('common.location')}>
        {[equipment.location, equipment.storageLocation].filter(Boolean).join(' · ') || '-'}
      </Kenmerk>
      <Kenmerk label={t('equipment.purchaseDate')}>
        {equipment.purchaseDate ? formatDate(equipment.purchaseDate) : '-'}
      </Kenmerk>
      <Kenmerk label={t('equipment.purchasePrice')}>{formatCurrency(equipment.purchasePrice)}</Kenmerk>
      <Kenmerk label={t('equipment.currentValue')}>{formatCurrency(equipment.currentValue)}</Kenmerk>
      <Kenmerk label={t('equipment.warrantyExpiry')}>
        {equipment.warrantyExpiry ? formatDate(equipment.warrantyExpiry) : '-'}
      </Kenmerk>
      <Kenmerk label={t('equipment.isLoanable')}>{equipment.isLoanable ? t('common.yes') : t('common.no')}</Kenmerk>
      {equipment.description && (
        <Kenmerk label={t('common.description')} breed>
          {equipment.description}
        </Kenmerk>
      )}
      {equipment.notes && (
        <Kenmerk label={t('common.notes')} breed>
          {equipment.notes}
        </Kenmerk>
      )}
    </div>
  );
}

function EquipmentLoansTab({ loans }: { loans: EquipmentDetail['loans'] }) {
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
            <th>{t('equipment.expectedReturnDate')}</th>
            <th>{t('equipment.returnDate')}</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((loan) => (
            <tr key={loan.id}>
              <td className="font-medium">{loan.userName}</td>
              <td>{formatDate(loan.checkoutDate)}</td>
              <td>{loan.expectedReturnDate ? formatDate(loan.expectedReturnDate) : '-'}</td>
              <td>
                {loan.actualReturnDate ? (
                  formatDate(loan.actualReturnDate)
                ) : loan.status === 'active' ? (
                  <span className="badge badge-warning badge-sm">{t('equipment.active')}</span>
                ) : (
                  '-'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EquipmentMaintenanceTab({ equipment }: { equipment: EquipmentDetail }) {
  const { t } = useTranslation();

  const isOverdue = onderhoudVerlopen(equipment.nextMaintenance);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="card bg-base-200 p-4">
          <h4 className="text-sm text-base-content/60">{t('equipment.lastMaintenance')}</h4>
          <p className="font-medium">
            {equipment.lastMaintenance ? formatDate(equipment.lastMaintenance) : t('equipment.never')}
          </p>
        </div>
        <div className={`card p-4 ${isOverdue ? 'bg-error/10' : 'bg-base-200'}`}>
          <h4 className="text-sm text-base-content/60">{t('equipment.nextMaintenance')}</h4>
          <p className={`font-medium ${isOverdue ? 'text-error' : ''}`}>
            {equipment.nextMaintenance ? formatDate(equipment.nextMaintenance) : '-'}
            {isOverdue && <span className="ml-2 badge badge-error badge-sm">{t('equipment.overdue')}</span>}
          </p>
        </div>
      </div>

      {equipment.maintenance.length === 0 ? (
        <p className="text-center py-4 text-base-content/60">{t('equipment.noMaintenance')}</p>
      ) : (
        <ul className="space-y-2">
          {equipment.maintenance.map((regel: EquipmentMaintenance) => (
            <li key={regel.id} className="card bg-base-200 p-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm text-base-content/60">
                    <span>{formatDate(regel.performedDate)}</span>
                    <span className="badge badge-sm">{t(`equipment.maintenanceTypes.${regel.maintenanceType}`)}</span>
                  </div>
                  <p className="text-sm mt-1">{regel.description}</p>
                  {regel.performedByName && (
                    <p className="text-xs text-base-content/60 mt-1">
                      {t('equipment.performedBy')}: {regel.performedByName}
                    </p>
                  )}
                </div>
                {regel.cost != null && <span className="font-medium">{formatCurrency(regel.cost)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EquipmentDamageTab({
  equipmentId,
  logs,
  magBeheren,
  magVerwijderen,
  onChanged,
}: {
  equipmentId: string;
  logs: EquipmentDamageLog[];
  magBeheren: boolean;
  magVerwijderen: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [bewerkt, setBewerkt] = useState<EquipmentDamageLog | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<EquipmentDamageLog | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (logId: string) => deleteEquipmentDamageLog(equipmentId, logId),
    onSuccess: () => {
      showSuccess(t('equipment.damageDeleted'));
      setTeVerwijderen(null);
      onChanged();
    },
    onError: () => showError(t('equipment.errorDamageDelete')),
  });

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
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm text-base-content/60">{formatDate(log.createdAt)}</span>
                <span className={`badge badge-sm ${ERNST_COLORS[log.severity] || 'badge-ghost'}`}>
                  {t(`equipment.severities.${log.severity}`)}
                </span>
                <span className={`badge badge-sm ${log.repairedAt ? 'badge-success' : 'badge-warning'}`}>
                  {log.repairedAt ? t('equipment.repaired') : t('equipment.damageOpen')}
                </span>
              </div>
              <p className="text-sm">{log.description}</p>
            </div>
            {log.repairCost != null && <span className="font-medium">{formatCurrency(log.repairCost)}</span>}
          </div>
          <div className="text-sm text-base-content/60 mt-2 space-y-1">
            {log.reportedByName && (
              <div>
                {t('equipment.reportedBy')}: {log.reportedByName}
              </div>
            )}
            {log.repairedAt && (
              <div>
                {t('equipment.repairedBy')}: {log.repairedByName || '-'} · {formatDate(log.repairedAt)}
              </div>
            )}
            {log.notes && <div className="whitespace-pre-wrap">{log.notes}</div>}
          </div>
          {(magBeheren || magVerwijderen) && (
            <div className="flex justify-end gap-2 mt-2">
              {magBeheren && (
                <button className="btn btn-ghost btn-xs" onClick={() => setBewerkt(log)}>
                  <Icon name="pencil" size={12} />
                  {t('equipment.updateDamage')}
                </button>
              )}
              {magVerwijderen && (
                <button className="btn btn-ghost btn-xs text-error" onClick={() => setTeVerwijderen(log)}>
                  <Icon name="trash" size={12} />
                  {t('equipment.deleteDamage')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {bewerkt && (
        <DamageUpdateModal
          equipmentId={equipmentId}
          log={bewerkt}
          onClose={() => setBewerkt(null)}
          onSuccess={() => {
            setBewerkt(null);
            onChanged();
          }}
        />
      )}

      {teVerwijderen && (
        <ConfirmDialog
          title={t('equipment.deleteDamage')}
          message={t('equipment.confirmDeleteDamage')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(teVerwijderen.id)}
          onCancel={() => setTeVerwijderen(null)}
        />
      )}
    </div>
  );
}

/** Een keuzelijst met de staten uit de backend, met een lege keuze vooraan. */
function StaatKeuze({
  id,
  label,
  waarde,
  onChange,
}: {
  id: string;
  label: string;
  waarde: string;
  onChange: (waarde: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="form-control">
      <label htmlFor={id} className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <select id={id} className="select select-bordered" value={waarde} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('common.selectOptional')}</option>
        {STATEN.map((staat) => (
          <option key={staat} value={staat}>
            {t(`equipment.conditions.${staat}`)}
          </option>
        ))}
      </select>
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
    expectedReturnDate: '',
    conditionAtCheckout: '',
    checkoutNotes: '',
  });

  // De lener is een lid van deze vereniging. GET /users is alleen voor admin;
  // de ledenlijst (/users/directory) mag ook de materiaalcommissie opvragen.
  const { data: leden = [], isLoading: ledenLaden } = useQuery({
    queryKey: ['equipment-leners'],
    queryFn: () => getMemberDirectory(),
  });

  const loanMutation = useMutation({
    mutationFn: () =>
      createEquipmentLoan(equipmentId, {
        userId: formData.userId,
        expectedReturnDate: formData.expectedReturnDate || undefined,
        conditionAtCheckout: formData.conditionAtCheckout || undefined,
        checkoutNotes: tekstOfNiets(formData.checkoutNotes),
      }),
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
          <label htmlFor={`${veldId}-borrower`} className="label">
            <span className="label-text font-medium">{t('equipment.borrower')} *</span>
          </label>
          <select
            id={`${veldId}-borrower`}
            className="select select-bordered"
            value={formData.userId}
            disabled={ledenLaden}
            onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
          >
            <option value="">{t('equipment.selectMember')}</option>
            {leden.map((lid) => (
              <option key={lid.id} value={lid.id}>
                {lid.firstName} {lid.lastName}
              </option>
            ))}
          </select>
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-expectedReturnDate`} className="label">
            <span className="label-text font-medium">{t('equipment.expectedReturnDate')}</span>
          </label>
          <input
            id={`${veldId}-expectedReturnDate`}
            type="date"
            className="input input-bordered"
            min={vandaag()}
            value={formData.expectedReturnDate}
            onChange={(e) => setFormData({ ...formData, expectedReturnDate: e.target.value })}
          />
        </div>
        <StaatKeuze
          id={`${veldId}-conditionAtCheckout`}
          label={t('equipment.conditionAtLoan')}
          waarde={formData.conditionAtCheckout}
          onChange={(waarde) => setFormData({ ...formData, conditionAtCheckout: waarde })}
        />
        <div className="form-control">
          <label htmlFor={`${veldId}-checkoutNotes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-checkoutNotes`}
            className="textarea textarea-bordered"
            rows={2}
            value={formData.checkoutNotes}
            onChange={(e) => setFormData({ ...formData, checkoutNotes: e.target.value })}
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
  loanId,
  onClose,
  onSuccess,
}: {
  loanId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    conditionAtReturn: '',
    returnNotes: '',
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      returnEquipmentLoan(loanId, {
        conditionAtReturn: formData.conditionAtReturn || undefined,
        returnNotes: tekstOfNiets(formData.returnNotes),
      }),
    onSuccess: () => {
      showSuccess(t('equipment.loanReturned'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorReturn')),
  });

  return (
    <Modal onClose={onClose} title={t('equipment.returnLoan')}>
      <div className="space-y-4">
        <StaatKeuze
          id={`${veldId}-conditionAtReturn`}
          label={t('equipment.conditionAtReturn')}
          waarde={formData.conditionAtReturn}
          onChange={(waarde) => setFormData({ ...formData, conditionAtReturn: waarde })}
        />
        <div className="form-control">
          <label htmlFor={`${veldId}-returnNotes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-returnNotes`}
            className="textarea textarea-bordered"
            rows={2}
            value={formData.returnNotes}
            onChange={(e) => setFormData({ ...formData, returnNotes: e.target.value })}
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
    maintenanceType: 'inspection' as EquipmentMaintenanceType,
    performedDate: vandaag(),
    description: '',
    externalProvider: '',
    cost: '',
    nextMaintenanceDate: '',
    notes: '',
  });

  const maintenanceMutation = useMutation({
    mutationFn: () =>
      recordEquipmentMaintenance(equipmentId, {
        maintenanceType: formData.maintenanceType,
        performedDate: formData.performedDate,
        description: formData.description.trim(),
        externalProvider: tekstOfNiets(formData.externalProvider),
        cost: getalOfNiets(formData.cost),
        nextMaintenanceDate: formData.nextMaintenanceDate || undefined,
        notes: tekstOfNiets(formData.notes),
      }),
    onSuccess: () => {
      showSuccess(t('equipment.maintenanceRecorded'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorMaintenance')),
  });

  const canSubmit = formData.description.trim().length > 0 && formData.performedDate.length > 0;

  return (
    <Modal onClose={onClose} title={t('equipment.recordMaintenance')}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-maintenanceType`} className="label">
              <span className="label-text font-medium">{t('equipment.maintenanceType')} *</span>
            </label>
            <select
              id={`${veldId}-maintenanceType`}
              className="select select-bordered"
              value={formData.maintenanceType}
              onChange={(e) =>
                setFormData({ ...formData, maintenanceType: e.target.value as EquipmentMaintenanceType })
              }
            >
              {ONDERHOUDSSOORTEN.map((soort) => (
                <option key={soort} value={soort}>
                  {t(`equipment.maintenanceTypes.${soort}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-performedDate`} className="label">
              <span className="label-text font-medium">{t('equipment.maintenanceDate')} *</span>
            </label>
            <input
              id={`${veldId}-performedDate`}
              type="date"
              className="input input-bordered"
              value={formData.performedDate}
              onChange={(e) => setFormData({ ...formData, performedDate: e.target.value })}
            />
          </div>
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-description`} className="label">
            <span className="label-text font-medium">{t('common.description')} *</span>
          </label>
          <textarea
            id={`${veldId}-description`}
            className="textarea textarea-bordered"
            rows={2}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-externalProvider`} className="label">
              <span className="label-text font-medium">{t('equipment.externalProvider')}</span>
            </label>
            <input
              id={`${veldId}-externalProvider`}
              type="text"
              className="input input-bordered"
              value={formData.externalProvider}
              onChange={(e) => setFormData({ ...formData, externalProvider: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label htmlFor={`${veldId}-cost`} className="label">
              <span className="label-text font-medium">{t('equipment.cost')}</span>
            </label>
            <input
              id={`${veldId}-cost`}
              type="number"
              className="input input-bordered"
              step="0.01"
              min="0"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
            />
          </div>
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-nextMaintenanceDate`} className="label">
            <span className="label-text font-medium">{t('equipment.nextMaintenance')}</span>
          </label>
          <input
            id={`${veldId}-nextMaintenanceDate`}
            type="date"
            className="input input-bordered"
            value={formData.nextMaintenanceDate}
            onChange={(e) => setFormData({ ...formData, nextMaintenanceDate: e.target.value })}
          />
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-notes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-notes`}
            className="textarea textarea-bordered"
            rows={2}
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
            disabled={!canSubmit || maintenanceMutation.isPending}
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
    description: '',
    severity: 'minor' as EquipmentDamageSeverity,
    repairCost: '',
    notes: '',
  });

  const damageMutation = useMutation({
    mutationFn: () =>
      addEquipmentDamageLog(equipmentId, {
        description: formData.description.trim(),
        severity: formData.severity,
        repairCost: getalOfNiets(formData.repairCost),
        notes: tekstOfNiets(formData.notes),
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-control">
            <label htmlFor={`${veldId}-severity`} className="label">
              <span className="label-text font-medium">{t('equipment.severity')} *</span>
            </label>
            <select
              id={`${veldId}-severity`}
              className="select select-bordered"
              value={formData.severity}
              onChange={(e) => setFormData({ ...formData, severity: e.target.value as EquipmentDamageSeverity })}
            >
              {ERNSTGRADEN.map((ernst) => (
                <option key={ernst} value={ernst}>
                  {t(`equipment.severities.${ernst}`)}
                </option>
              ))}
            </select>
          </div>
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
        </div>
        <div className="form-control">
          <label htmlFor={`${veldId}-notes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-notes`}
            className="textarea textarea-bordered"
            rows={2}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-warning"
            onClick={() => damageMutation.mutate()}
            disabled={!formData.description.trim() || damageMutation.isPending}
          >
            {damageMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('equipment.reportDamage')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Een schademelding bijwerken: reparatiekosten, notities en - zolang dat nog
 * niet gebeurd is - markeren als gerepareerd. Meer kent
 * PATCH /equipment/:id/damage/:reportId niet.
 */
function DamageUpdateModal({
  equipmentId,
  log,
  onClose,
  onSuccess,
}: {
  equipmentId: string;
  log: EquipmentDamageLog;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const veldId = useId();
  const [formData, setFormData] = useState({
    gerepareerd: false,
    repairedAt: vandaag(),
    repairCost: log.repairCost != null ? String(log.repairCost) : '',
    notes: log.notes ?? '',
  });

  const wijziging = () => {
    const uit: { repairedAt?: string; repairCost?: number; notes?: string } = {};
    if (!log.repairedAt && formData.gerepareerd && formData.repairedAt) uit.repairedAt = formData.repairedAt;
    const kosten = getalOfNiets(formData.repairCost);
    if (kosten !== undefined && kosten !== log.repairCost) uit.repairCost = kosten;
    if (formData.notes !== (log.notes ?? '')) uit.notes = formData.notes;
    return uit;
  };

  const updateMutation = useMutation({
    mutationFn: () => updateEquipmentDamageLog(equipmentId, log.id, wijziging()),
    onSuccess: () => {
      showSuccess(t('equipment.damageUpdated'));
      onSuccess();
    },
    onError: () => showError(t('equipment.errorDamageUpdate')),
  });

  return (
    <Modal onClose={onClose} title={t('equipment.updateDamage')}>
      <div className="space-y-4">
        <p className="text-sm">{log.description}</p>
        {!log.repairedAt && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <label htmlFor={`${veldId}-gerepareerd`} className="label cursor-pointer justify-start gap-3">
              <input
                id={`${veldId}-gerepareerd`}
                type="checkbox"
                className="checkbox"
                checked={formData.gerepareerd}
                onChange={(e) => setFormData({ ...formData, gerepareerd: e.target.checked })}
              />
              <span className="label-text font-medium">{t('equipment.markRepaired')}</span>
            </label>
            {formData.gerepareerd && (
              <div className="form-control">
                <label htmlFor={`${veldId}-repairedAt`} className="label">
                  <span className="label-text font-medium">{t('equipment.repairedAt')}</span>
                </label>
                <input
                  id={`${veldId}-repairedAt`}
                  type="date"
                  className="input input-bordered"
                  value={formData.repairedAt}
                  onChange={(e) => setFormData({ ...formData, repairedAt: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
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
          <label htmlFor={`${veldId}-notes`} className="label">
            <span className="label-text font-medium">{t('common.notes')}</span>
          </label>
          <textarea
            id={`${veldId}-notes`}
            className="textarea textarea-bordered"
            rows={2}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => updateMutation.mutate()}
            disabled={Object.keys(wijziging()).length === 0 || updateMutation.isPending}
          >
            {updateMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
