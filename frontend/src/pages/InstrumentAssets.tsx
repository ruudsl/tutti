import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useInstrumentAssets,
  useInstrumentAssetsSummary,
  useMaintenanceDueAssets,
  useAssetCategories,
  useAssetStatuses,
  useAssetConditions,
  useCreateInstrumentAsset,
  useUpdateInstrumentAsset,
  useDeleteInstrumentAsset,
} from '../hooks/useInstrumentAssets';
import { Icon } from '../components/Icon';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../utils/format';
import type { InstrumentAsset, AssetCategory, AssetStatus, AssetCondition } from '../types';

const categoryLabels: Record<AssetCategory, string> = {
  woodwind: 'Houtblazers',
  brass: 'Koperblazers',
  percussion: 'Slagwerk',
  strings: 'Snaren',
  keyboard: 'Klavier',
  accessories: 'Accessoires',
  other: 'Overig',
};

const statusLabels: Record<AssetStatus, string> = {
  available: 'Beschikbaar',
  on_loan: 'Uitgeleend',
  in_repair: 'In reparatie',
  in_storage: 'Opgeslagen',
  written_off: 'Afgeschreven',
  sold: 'Verkocht',
  lost: 'Verloren',
};

const statusColors: Record<AssetStatus, string> = {
  available: 'var(--success)',
  on_loan: 'var(--primary)',
  in_repair: 'var(--warning)',
  in_storage: 'var(--text-light)',
  written_off: 'var(--danger)',
  sold: 'var(--text-light)',
  lost: 'var(--danger)',
};

const conditionLabels: Record<AssetCondition, string> = {
  excellent: 'Uitstekend',
  good: 'Goed',
  fair: 'Redelijk',
  poor: 'Matig',
  damaged: 'Beschadigd',
  needs_repair: 'Reparatie nodig',
};

export default function InstrumentAssets() {
  const { t } = useTranslation();
  useDocumentTitle('Instrumentenbeheer');

  // Tab state
  const [activeTab, setActiveTab] = useState<'assets' | 'maintenance' | 'insurance'>('assets');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<InstrumentAsset | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<InstrumentAsset | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    instrumentType: '',
    category: 'other' as AssetCategory,
    brand: '',
    model: '',
    serialNumber: '',
    barcode: '',
    yearManufactured: '',
    countryOfOrigin: '',
    color: '',
    material: '',
    purchaseDate: '',
    purchasePrice: '',
    purchaseVendor: '',
    currentValue: '',
    replacementValue: '',
    status: 'available' as AssetStatus,
    condition: 'good' as AssetCondition,
    location: '',
    storageLocation: '',
    maintenanceIntervalMonths: '12',
    notes: '',
  });

  // Data fetching
  const { data: assetsData, isLoading } = useInstrumentAssets({
    search: search || undefined,
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    condition: conditionFilter || undefined,
  });
  const { data: summary } = useInstrumentAssetsSummary();
  const { data: maintenanceDue = [] } = useMaintenanceDueAssets(30);
  const { data: categories = [] } = useAssetCategories();
  const { data: statuses = [] } = useAssetStatuses();
  const { data: conditions = [] } = useAssetConditions();

  // Mutations
  const createMutation = useCreateInstrumentAsset();
  const updateMutation = useUpdateInstrumentAsset();
  const deleteMutation = useDeleteInstrumentAsset();

  const assets = assetsData?.data || [];

  const resetForm = () => {
    setFormData({
      name: '',
      instrumentType: '',
      category: 'other',
      brand: '',
      model: '',
      serialNumber: '',
      barcode: '',
      yearManufactured: '',
      countryOfOrigin: '',
      color: '',
      material: '',
      purchaseDate: '',
      purchasePrice: '',
      purchaseVendor: '',
      currentValue: '',
      replacementValue: '',
      status: 'available',
      condition: 'good',
      location: '',
      storageLocation: '',
      maintenanceIntervalMonths: '12',
      notes: '',
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      name: formData.name,
      instrumentType: formData.instrumentType,
      category: formData.category,
      brand: formData.brand || undefined,
      model: formData.model || undefined,
      serialNumber: formData.serialNumber || undefined,
      barcode: formData.barcode || undefined,
      yearManufactured: formData.yearManufactured ? parseInt(formData.yearManufactured) : undefined,
      countryOfOrigin: formData.countryOfOrigin || undefined,
      color: formData.color || undefined,
      material: formData.material || undefined,
      purchaseDate: formData.purchaseDate || undefined,
      purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
      purchaseVendor: formData.purchaseVendor || undefined,
      currentValue: formData.currentValue ? parseFloat(formData.currentValue) : undefined,
      replacementValue: formData.replacementValue ? parseFloat(formData.replacementValue) : undefined,
      status: formData.status,
      condition: formData.condition,
      location: formData.location || undefined,
      storageLocation: formData.storageLocation || undefined,
      maintenanceIntervalMonths: parseInt(formData.maintenanceIntervalMonths) || 12,
      notes: formData.notes || undefined,
    });
    setShowAddModal(false);
    resetForm();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAsset) return;
    await updateMutation.mutateAsync({
      id: editingAsset.id,
      data: {
        name: formData.name,
        instrumentType: formData.instrumentType,
        category: formData.category,
        brand: formData.brand || undefined,
        model: formData.model || undefined,
        serialNumber: formData.serialNumber || undefined,
        barcode: formData.barcode || undefined,
        yearManufactured: formData.yearManufactured ? parseInt(formData.yearManufactured) : undefined,
        purchaseDate: formData.purchaseDate || undefined,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
        currentValue: formData.currentValue ? parseFloat(formData.currentValue) : undefined,
        replacementValue: formData.replacementValue ? parseFloat(formData.replacementValue) : undefined,
        status: formData.status,
        condition: formData.condition,
        location: formData.location || undefined,
        storageLocation: formData.storageLocation || undefined,
        maintenanceIntervalMonths: parseInt(formData.maintenanceIntervalMonths) || 12,
        notes: formData.notes || undefined,
      },
    });
    setEditingAsset(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingAsset) return;
    await deleteMutation.mutateAsync(deletingAsset.id);
    setDeletingAsset(null);
  };

  const openEditModal = (asset: InstrumentAsset) => {
    setFormData({
      name: asset.name,
      instrumentType: asset.instrumentType,
      category: asset.category,
      brand: asset.brand || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      barcode: asset.barcode || '',
      yearManufactured: asset.yearManufactured?.toString() || '',
      countryOfOrigin: asset.countryOfOrigin || '',
      color: asset.color || '',
      material: asset.material || '',
      purchaseDate: asset.purchaseDate || '',
      purchasePrice: asset.purchasePrice?.toString() || '',
      purchaseVendor: asset.purchaseVendor || '',
      currentValue: asset.currentValue?.toString() || '',
      replacementValue: asset.replacementValue?.toString() || '',
      status: asset.status,
      condition: asset.condition,
      location: asset.location || '',
      storageLocation: asset.storageLocation || '',
      maintenanceIntervalMonths: asset.maintenanceIntervalMonths?.toString() || '12',
      notes: asset.notes || '',
    });
    setEditingAsset(asset);
  };

  const renderSummaryCards = () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>Totaal instrumenten</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 600 }}>{summary?.total || 0}</div>
      </div>
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>Beschikbaar</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--success)' }}>{summary?.available || 0}</div>
      </div>
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>Uitgeleend</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--primary)' }}>{summary?.onLoan || 0}</div>
      </div>
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>In reparatie</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--warning)' }}>{summary?.inRepair || 0}</div>
      </div>
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>Totale waarde</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{formatCurrency(summary?.totalValue || 0)}</div>
      </div>
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>Onderhoud gepland</div>
        <div
          style={{
            fontSize: '1.75rem',
            fontWeight: 600,
            color: maintenanceDue.length > 0 ? 'var(--warning)' : 'var(--text)',
          }}
        >
          {summary?.maintenanceDueCount || 0}
        </div>
      </div>
    </div>
  );

  const renderFilters = () => (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      <input
        type="search"
        placeholder="Zoeken..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
          minWidth: '200px',
        }}
      />
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
        }}
      >
        <option value="">Alle statussen</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {statusLabels[status as AssetStatus] || status}
          </option>
        ))}
      </select>
      <select
        value={categoryFilter}
        onChange={(e) => setCategoryFilter(e.target.value)}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
        }}
      >
        <option value="">Alle categorieën</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {categoryLabels[cat as AssetCategory] || cat}
          </option>
        ))}
      </select>
      <select
        value={conditionFilter}
        onChange={(e) => setConditionFilter(e.target.value)}
        style={{
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--surface)',
        }}
      >
        <option value="">Alle condities</option>
        {conditions.map((cond) => (
          <option key={cond} value={cond}>
            {conditionLabels[cond as AssetCondition] || cond}
          </option>
        ))}
      </select>
    </div>
  );

  const renderAssetsTable = () => {
    if (isLoading) {
      return <SkeletonTable rows={5} columns={6} />;
    }

    if (assets.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-light)' }}>
          <Icon name="music" size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
          <p>{t('instruments.noInstruments')}</p>
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Naam</th>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Merk/Model</th>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
              <th style={{ padding: '0.75rem', textAlign: 'left' }}>Conditie</th>
              <th style={{ padding: '0.75rem', textAlign: 'right' }}>Waarde</th>
              <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acties</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem' }}>
                  <div style={{ fontWeight: 500 }}>{asset.name}</div>
                  {asset.serialNumber && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-light)' }}>
                      S/N: {asset.serialNumber}
                    </div>
                  )}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <div>{asset.instrumentType}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-light)' }}>
                    {categoryLabels[asset.category] || asset.category}
                  </div>
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {asset.brand && asset.model ? `${asset.brand} ${asset.model}` : asset.brand || asset.model || '-'}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: `${statusColors[asset.status]}20`,
                      color: statusColors[asset.status],
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    {statusLabels[asset.status] || asset.status}
                  </span>
                  {asset.assignedUser && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                      {asset.assignedUser.firstName} {asset.assignedUser.lastName}
                    </div>
                  )}
                </td>
                <td style={{ padding: '0.75rem' }}>{conditionLabels[asset.condition] || asset.condition}</td>
                <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                  {asset.currentValue ? formatCurrency(asset.currentValue) : '-'}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => openEditModal(asset)}
                      title="Bewerken"
                      style={{
                        padding: '0.25rem',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'var(--text)',
                      }}
                    >
                      <Icon name="pencil" size={18} />
                    </button>
                    <button
                      onClick={() => setDeletingAsset(asset)}
                      title="Verwijderen"
                      style={{
                        padding: '0.25rem',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderMaintenanceTab = () => (
    <div>
      <h3 style={{ marginBottom: '1rem' }}>Onderhoud binnen 30 dagen</h3>
      {maintenanceDue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>
          <Icon name="check" size={32} style={{ color: 'var(--success)', marginBottom: '0.5rem' }} />
          <p>{t('instruments.noMaintenanceDue')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {maintenanceDue.map((asset) => (
            <div
              key={asset.id}
              style={{
                padding: '1rem',
                backgroundColor: asset.isOverdue ? 'rgba(var(--danger-rgb), 0.1)' : 'var(--surface)',
                borderRadius: 'var(--radius)',
                border: `1px solid ${asset.isOverdue ? 'var(--danger)' : 'var(--border)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{asset.name}</div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>
                  {asset.instrumentType}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: asset.isOverdue ? 'var(--danger)' : 'var(--warning)', fontWeight: 500 }}>
                  {asset.isOverdue ? 'Achterstallig' : 'Gepland'}
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-light)' }}>
                  {asset.nextMaintenanceDue}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFormFields = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Naam *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Instrumenttype *</label>
          <input
            type="text"
            value={formData.instrumentType}
            onChange={(e) => setFormData({ ...formData, instrumentType: e.target.value })}
            required
            placeholder="bijv. Altsaxofoon, Trompet"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Categorie *</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as AssetCategory })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as AssetStatus })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Merk</label>
          <input
            type="text"
            value={formData.brand}
            onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Model</label>
          <input
            type="text"
            value={formData.model}
            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Serienummer</label>
          <input
            type="text"
            value={formData.serialNumber}
            onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Bouwjaar</label>
          <input
            type="number"
            value={formData.yearManufactured}
            onChange={(e) => setFormData({ ...formData, yearManufactured: e.target.value })}
            min="1800"
            max={new Date().getFullYear()}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Conditie</label>
          <select
            value={formData.condition}
            onChange={(e) => setFormData({ ...formData, condition: e.target.value as AssetCondition })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            {Object.entries(conditionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
            Onderhoudsinterval (maanden)
          </label>
          <input
            type="number"
            value={formData.maintenanceIntervalMonths}
            onChange={(e) => setFormData({ ...formData, maintenanceIntervalMonths: e.target.value })}
            min="1"
            max="60"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Aankoopprijs</label>
          <input
            type="number"
            value={formData.purchasePrice}
            onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
            min="0"
            step="0.01"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Huidige waarde</label>
          <input
            type="number"
            value={formData.currentValue}
            onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
            min="0"
            step="0.01"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Vervangingswaarde</label>
          <input
            type="number"
            value={formData.replacementValue}
            onChange={(e) => setFormData({ ...formData, replacementValue: e.target.value })}
            min="0"
            step="0.01"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Locatie</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="bijv. Repetitielokaal"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Opslaglocatie</label>
          <input
            type="text"
            value={formData.storageLocation}
            onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
            placeholder="bijv. Kast A, plank 3"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Notities</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            resize: 'vertical',
          }}
        />
      </div>
    </>
  );

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Instrumentenbeheer</h1>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={18} />
          Instrument toevoegen
        </button>
      </div>

      {renderSummaryCards()}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          onClick={() => setActiveTab('assets')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: activeTab === 'assets' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'assets' ? 'white' : 'var(--text)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
          }}
        >
          <Icon name="music" size={16} style={{ marginRight: '0.5rem' }} />
          Instrumenten
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: activeTab === 'maintenance' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'maintenance' ? 'white' : 'var(--text)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
          }}
        >
          <Icon name="wrench" size={16} style={{ marginRight: '0.5rem' }} />
          Onderhoud
          {summary?.maintenanceDueCount ? (
            <span
              style={{
                marginLeft: '0.5rem',
                padding: '0.125rem 0.375rem',
                backgroundColor: 'var(--warning)',
                color: 'white',
                borderRadius: '9999px',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {summary.maintenanceDueCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'assets' && (
        <>
          {renderFilters()}
          {renderAssetsTable()}
        </>
      )}
      {activeTab === 'maintenance' && renderMaintenanceTab()}

      {/* Add Modal */}
      {showAddModal && (
        <FormModal
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
          title="Instrument toevoegen"
          onSubmit={handleCreate}
          submitLabel="Toevoegen"
          isSubmitting={createMutation.isPending}
        >
          {renderFormFields()}
        </FormModal>
      )}

      {/* Edit Modal */}
      {editingAsset && (
        <FormModal
          onClose={() => {
            setEditingAsset(null);
            resetForm();
          }}
          title="Instrument bewerken"
          onSubmit={handleUpdate}
          submitLabel="Opslaan"
          isSubmitting={updateMutation.isPending}
        >
          {renderFormFields()}
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingAsset && (
        <ConfirmDialog
          onCancel={() => setDeletingAsset(null)}
          onConfirm={handleDelete}
          title="Instrument verwijderen"
          message={`Weet je zeker dat je "${deletingAsset.name}" wilt verwijderen?`}
          confirmLabel="Verwijderen"
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
