import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useUniformItems,
  useUniformItem,
  useUniformItemTypes,
  useUniformSets,
  useCreateUniformItem,
  useCreateUniformItemsBulk,
  useUpdateUniformItem,
  useDeleteUniformItem,
  useAssignUniformItem,
  useReturnUniformItem,
  useCreateUniformSet,
  useDeleteUniformSet,
  useUniformAvailabilityBySize,
} from '../hooks/useUniforms';
import { useUsers } from '../hooks/useUsers';
import { Icon } from '../components/Icon';
import { FormField } from '../components/FormField';
import { Modal, FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { UniformItem } from '../types';

export default function Uniforms() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.uniforms');

  // Tab state
  const [activeTab, setActiveTab] = useState<'items' | 'sets' | 'availability'>('items');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<UniformItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<UniformItem | null>(null);
  const [viewingItem, setViewingItem] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [returningItem, setReturningItem] = useState<string | null>(null);
  const [showAddSetModal, setShowAddSetModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    itemType: '',
    sizeStandard: '',
    sizeLength: '',
    sizeWidth: '',
    condition: 'good',
    status: 'available',
    notes: '',
    purchaseDate: '',
    purchasePrice: '',
  });

  const [bulkCount, setBulkCount] = useState(1);

  const [assignFormData, setAssignFormData] = useState({
    userId: '',
    assignedDate: new Date().toISOString().split('T')[0],
    conditionAtAssignment: '',
    notes: '',
  });

  const [returnFormData, setReturnFormData] = useState({
    returnedDate: new Date().toISOString().split('T')[0],
    conditionAtReturn: '',
  });

  const [uniformSetFormData, setUniformSetFormData] = useState({
    name: '',
    description: '',
    requirements: [] as { itemType: string; quantity: number }[],
  });

  // Data fetching
  const { data: itemsData, isLoading } = useUniformItems({
    search: search || undefined,
    status: statusFilter || undefined,
    itemType: typeFilter || undefined,
  });
  const { data: itemTypes = [] } = useUniformItemTypes();
  const { data: sets = [] } = useUniformSets();
  const { data: availability = [] } = useUniformAvailabilityBySize();
  const { data: users = [] } = useUsers();
  const { data: itemDetail } = useUniformItem(viewingItem || '');

  // Mutations
  const createMutation = useCreateUniformItem();
  const createBulkMutation = useCreateUniformItemsBulk();
  const updateMutation = useUpdateUniformItem();
  const deleteMutation = useDeleteUniformItem();
  const assignMutation = useAssignUniformItem();
  const returnMutation = useReturnUniformItem();
  const createSetMutation = useCreateUniformSet();
  const deleteSetMutation = useDeleteUniformSet();

  const items = itemsData?.data || [];

  const resetForm = () => {
    setFormData({
      itemType: '',
      sizeStandard: '',
      sizeLength: '',
      sizeWidth: '',
      condition: 'good',
      status: 'available',
      notes: '',
      purchaseDate: '',
      purchasePrice: '',
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      itemType: formData.itemType,
      sizeStandard: formData.sizeStandard || undefined,
      sizeLength: formData.sizeLength ? parseInt(formData.sizeLength) : undefined,
      sizeWidth: formData.sizeWidth ? parseInt(formData.sizeWidth) : undefined,
      condition: formData.condition,
      status: formData.status,
      notes: formData.notes || undefined,
      purchaseDate: formData.purchaseDate || undefined,
      purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
    });
    setShowAddModal(false);
    resetForm();
  };

  const handleBulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createBulkMutation.mutateAsync({
      itemType: formData.itemType,
      sizeStandard: formData.sizeStandard || undefined,
      sizeLength: formData.sizeLength ? parseInt(formData.sizeLength) : undefined,
      sizeWidth: formData.sizeWidth ? parseInt(formData.sizeWidth) : undefined,
      condition: formData.condition,
      status: formData.status,
      notes: formData.notes || undefined,
      purchaseDate: formData.purchaseDate || undefined,
      purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
      count: bulkCount,
    });
    setShowBulkAddModal(false);
    resetForm();
    setBulkCount(1);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    await updateMutation.mutateAsync({
      id: editingItem.id,
      data: {
        itemType: formData.itemType,
        sizeStandard: formData.sizeStandard || undefined,
        sizeLength: formData.sizeLength ? parseInt(formData.sizeLength) : undefined,
        sizeWidth: formData.sizeWidth ? parseInt(formData.sizeWidth) : undefined,
        condition: formData.condition,
        status: formData.status,
        notes: formData.notes || undefined,
      },
    });
    setEditingItem(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    await deleteMutation.mutateAsync(deletingItem.id);
    setDeletingItem(null);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAssignModal) return;
    await assignMutation.mutateAsync({
      itemId: showAssignModal,
      assignment: {
        userId: assignFormData.userId,
        assignedDate: assignFormData.assignedDate,
        conditionAtAssignment: assignFormData.conditionAtAssignment || undefined,
        notes: assignFormData.notes || undefined,
      },
    });
    setShowAssignModal(null);
    setAssignFormData({
      userId: '',
      assignedDate: new Date().toISOString().split('T')[0],
      conditionAtAssignment: '',
      notes: '',
    });
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningItem) return;
    await returnMutation.mutateAsync({
      itemId: returningItem,
      returnData: {
        returnedDate: returnFormData.returnedDate,
        conditionAtReturn: returnFormData.conditionAtReturn || undefined,
      },
    });
    setReturningItem(null);
    setReturnFormData({ returnedDate: new Date().toISOString().split('T')[0], conditionAtReturn: '' });
  };

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSetMutation.mutateAsync({
      name: uniformSetFormData.name,
      description: uniformSetFormData.description || undefined,
      requirements: uniformSetFormData.requirements.length > 0 ? uniformSetFormData.requirements : undefined,
    });
    setShowAddSetModal(false);
    setUniformSetFormData({ name: '', description: '', requirements: [] });
  };

  const openEditModal = (item: UniformItem) => {
    setEditingItem(item);
    setFormData({
      itemType: item.itemType,
      sizeStandard: item.sizeStandard || '',
      sizeLength: item.sizeLength?.toString() || '',
      sizeWidth: item.sizeWidth?.toString() || '',
      condition: item.condition,
      status: item.status,
      notes: item.notes || '',
      purchaseDate: item.purchaseDate || '',
      purchasePrice: item.purchasePrice?.toString() || '',
    });
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      available: 'badge-success',
      issued: 'badge-primary',
      in_repair: 'badge-warning',
      written_off: 'badge-danger',
    };
    return <span className={`badge ${classes[status] || ''}`}>{t(`uniforms.status.${status}`)}</span>;
  };

  const getConditionBadge = (condition: string) => {
    const classes: Record<string, string> = {
      good: 'badge-success',
      fair: 'badge-warning',
      poor: 'badge-danger',
    };
    return <span className={`badge ${classes[condition] || ''}`}>{t(`uniforms.conditions.${condition}`)}</span>;
  };

  const getItemTypeLabel = (value: string) => {
    const type = itemTypes.find((t) => t.value === value);
    return type?.label || value;
  };

  if (isLoading) {
    return (
      <div>
        <div className="page-header">
          <h1>{t('uniforms.title')}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={8} columns={6} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('uniforms.title')}
          <span className="badge badge-primary ml-2">{items.length}</span>
        </h1>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={() => setShowBulkAddModal(true)}>
            + {t('uniforms.bulkAdd')}
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + {t('uniforms.newItem')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${activeTab === 'items' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('items')}
        >
          {t('uniforms.items')}
        </button>
        <button
          className={`btn ${activeTab === 'sets' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('sets')}
        >
          {t('uniforms.sets')}
        </button>
        <button
          className={`btn ${activeTab === 'availability' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveTab('availability')}
        >
          {t('uniforms.availableBySize')}
        </button>
      </div>

      {activeTab === 'items' && (
        <>
          {/* Filters */}
          <div className="card mb-3">
            <div className="card-body">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('uniforms.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ maxWidth: '250px' }}
                />
                <select
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ maxWidth: '180px' }}
                >
                  <option value="">{t('uniforms.allStatuses')}</option>
                  <option value="available">{t('uniforms.status.available')}</option>
                  <option value="issued">{t('uniforms.status.issued')}</option>
                  <option value="in_repair">{t('uniforms.status.in_repair')}</option>
                  <option value="written_off">{t('uniforms.status.written_off')}</option>
                </select>
                <select
                  className="form-control"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{ maxWidth: '180px' }}
                >
                  <option value="">{t('uniforms.allTypes')}</option>
                  {itemTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('uniforms.itemType')}</th>
                    <th>{t('uniforms.sizeStandard')}</th>
                    <th>{t('uniforms.condition')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('users.title')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{getItemTypeLabel(item.itemType)}</strong>
                      </td>
                      <td>{item.sizeStandard || '-'}</td>
                      <td>{getConditionBadge(item.condition)}</td>
                      <td>{getStatusBadge(item.status)}</td>
                      <td>
                        {item.currentUser ? (
                          <span>
                            {item.currentUser.firstName} {item.currentUser.lastName}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn btn-outline btn-sm" onClick={() => setViewingItem(item.id)}>
                            <Icon name="eye" size={16} />
                          </button>
                          {item.status === 'available' && (
                            <button className="btn btn-primary btn-sm" onClick={() => setShowAssignModal(item.id)}>
                              {t('uniforms.assignItem')}
                            </button>
                          )}
                          {item.status === 'issued' && (
                            <button className="btn btn-outline btn-sm" onClick={() => setReturningItem(item.id)}>
                              {t('uniforms.returnItem')}
                            </button>
                          )}
                          <button className="btn btn-outline btn-sm" onClick={() => openEditModal(item)}>
                            <Icon name="pencil" size={16} />
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeletingItem(item)}>
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        {t('uniforms.noItems')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'sets' && (
        <div className="card">
          <div className="card-body">
            <div className="flex justify-between items-center mb-3">
              <h3 style={{ margin: 0 }}>{t('uniforms.sets')}</h3>
              <button className="btn btn-primary" onClick={() => setShowAddSetModal(true)}>
                + {t('uniforms.newSet')}
              </button>
            </div>
            {sets.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.description')}</th>
                    <th>{t('uniforms.setRequirements')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sets.map((set) => (
                    <tr key={set.id}>
                      <td>
                        <strong>{set.name}</strong>
                      </td>
                      <td>{set.description || '-'}</td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {set.requirements.map((req) => (
                            <span key={req.id} className="badge badge-outline">
                              {getItemTypeLabel(req.itemType)} x{req.quantity}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteSetMutation.mutate(set.id)}>
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>{t('uniforms.noSets')}</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'availability' && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('uniforms.availableBySize')}</h3>
            <p style={{ color: 'var(--text-muted)' }}>{t('uniforms.sizeSearchDescription')}</p>
            {availability.length > 0 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('uniforms.itemType')}</th>
                    <th>{t('uniforms.sizeStandard')}</th>
                    <th>{t('uniforms.quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {availability.map((item, i) => (
                    <tr key={i}>
                      <td>{getItemTypeLabel(item.itemType)}</td>
                      <td>{item.sizeStandard}</td>
                      <td>
                        <span className="badge badge-success">{item.count}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Geen beschikbare onderdelen.</p>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {(showAddModal || editingItem) && (
        <FormModal
          title={editingItem ? t('uniforms.edit') : t('uniforms.newItem')}
          onClose={() => {
            setShowAddModal(false);
            setEditingItem(null);
            resetForm();
          }}
          onSubmit={editingItem ? handleUpdate : handleCreate}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        >
          <FormField label={<>{t('uniforms.itemType')} *</>}>
            <select
              className="form-control"
              value={formData.itemType}
              onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
              required
            >
              <option value="">-- {t('common.select')} --</option>
              {itemTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('uniforms.sizeStandard')}>
            <input
              type="text"
              className="form-control"
              value={formData.sizeStandard}
              onChange={(e) => setFormData({ ...formData, sizeStandard: e.target.value })}
              placeholder="M, L, 52..."
            />
          </FormField>
          <div className="flex gap-2">
            <FormField label={t('uniforms.condition')} style={{ flex: 1 }}>
              <select
                className="form-control"
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
              >
                <option value="good">{t('uniforms.conditions.good')}</option>
                <option value="fair">{t('uniforms.conditions.fair')}</option>
                <option value="poor">{t('uniforms.conditions.poor')}</option>
              </select>
            </FormField>
            <FormField label={t('common.status')} style={{ flex: 1 }}>
              <select
                className="form-control"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="available">{t('uniforms.status.available')}</option>
                <option value="issued">{t('uniforms.status.issued')}</option>
                <option value="in_repair">{t('uniforms.status.in_repair')}</option>
                <option value="written_off">{t('uniforms.status.written_off')}</option>
              </select>
            </FormField>
          </div>
          <FormField label={t('uniforms.notes')}>
            <textarea
              className="form-control"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </FormField>
        </FormModal>
      )}

      {/* Bulk Add Modal */}
      {showBulkAddModal && (
        <FormModal
          title={t('uniforms.bulkAdd')}
          onClose={() => {
            setShowBulkAddModal(false);
            resetForm();
            setBulkCount(1);
          }}
          onSubmit={handleBulkCreate}
          isSubmitting={createBulkMutation.isPending}
        >
          <FormField label={<>{t('uniforms.quantity')} *</>}>
            <input
              type="number"
              className="form-control"
              value={bulkCount}
              onChange={(e) => setBulkCount(parseInt(e.target.value) || 1)}
              min="1"
              max="100"
              required
            />
          </FormField>
          <FormField label={<>{t('uniforms.itemType')} *</>}>
            <select
              className="form-control"
              value={formData.itemType}
              onChange={(e) => setFormData({ ...formData, itemType: e.target.value })}
              required
            >
              <option value="">-- {t('common.select')} --</option>
              {itemTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('uniforms.sizeStandard')}>
            <input
              type="text"
              className="form-control"
              value={formData.sizeStandard}
              onChange={(e) => setFormData({ ...formData, sizeStandard: e.target.value })}
            />
          </FormField>
        </FormModal>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <FormModal
          title={t('uniforms.assignItem')}
          onClose={() => setShowAssignModal(null)}
          onSubmit={handleAssign}
          isSubmitting={assignMutation.isPending}
        >
          <FormField label={<>{t('uniforms.selectUser')} *</>}>
            <select
              className="form-control"
              value={assignFormData.userId}
              onChange={(e) => setAssignFormData({ ...assignFormData, userId: e.target.value })}
              required
            >
              <option value="">-- {t('common.select')} --</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={<>{t('uniforms.assignedDate')} *</>}>
            <input
              type="date"
              className="form-control"
              value={assignFormData.assignedDate}
              onChange={(e) => setAssignFormData({ ...assignFormData, assignedDate: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('uniforms.conditionAtAssignment')}>
            <textarea
              className="form-control"
              value={assignFormData.conditionAtAssignment}
              onChange={(e) => setAssignFormData({ ...assignFormData, conditionAtAssignment: e.target.value })}
              rows={2}
            />
          </FormField>
        </FormModal>
      )}

      {/* Return Modal */}
      {returningItem && (
        <FormModal
          title={t('uniforms.returnItem')}
          onClose={() => setReturningItem(null)}
          onSubmit={handleReturn}
          isSubmitting={returnMutation.isPending}
        >
          <FormField label={<>{t('uniforms.returnedDate')} *</>}>
            <input
              type="date"
              className="form-control"
              value={returnFormData.returnedDate}
              onChange={(e) => setReturnFormData({ ...returnFormData, returnedDate: e.target.value })}
              required
            />
          </FormField>
          <FormField label={t('uniforms.conditionAtReturn')}>
            <select
              className="form-control"
              value={returnFormData.conditionAtReturn}
              onChange={(e) => setReturnFormData({ ...returnFormData, conditionAtReturn: e.target.value })}
            >
              <option value="">--</option>
              <option value="good">{t('uniforms.conditions.good')}</option>
              <option value="fair">{t('uniforms.conditions.fair')}</option>
              <option value="poor">{t('uniforms.conditions.poor')}</option>
            </select>
          </FormField>
        </FormModal>
      )}

      {/* Add Set Modal */}
      {showAddSetModal && (
        <FormModal
          title={t('uniforms.newSet')}
          onClose={() => setShowAddSetModal(false)}
          onSubmit={handleCreateSet}
          isSubmitting={createSetMutation.isPending}
        >
          <FormField label={<>{t('uniforms.setName')} *</>}>
            <input
              type="text"
              className="form-control"
              value={uniformSetFormData.name}
              onChange={(e) => setUniformSetFormData({ ...uniformSetFormData, name: e.target.value })}
              placeholder={t('uniforms.setNamePlaceholder')}
              required
            />
          </FormField>
          <FormField label={t('uniforms.setDescription')}>
            <textarea
              className="form-control"
              value={uniformSetFormData.description}
              onChange={(e) => setUniformSetFormData({ ...uniformSetFormData, description: e.target.value })}
              rows={2}
            />
          </FormField>
        </FormModal>
      )}

      {/* View Detail Modal */}
      {viewingItem && itemDetail && (
        <Modal
          title={`${getItemTypeLabel(itemDetail.itemType)} - ${itemDetail.sizeStandard || ''}`}
          onClose={() => setViewingItem(null)}
        >
          <p>
            <strong>{t('uniforms.condition')}:</strong> {getConditionBadge(itemDetail.condition)}
          </p>
          <p>
            <strong>{t('common.status')}:</strong> {getStatusBadge(itemDetail.status)}
          </p>
          {itemDetail.currentUser && (
            <p>
              <strong>{t('users.title')}:</strong> {itemDetail.currentUser.firstName} {itemDetail.currentUser.lastName}
            </p>
          )}

          <h4>{t('uniforms.assignmentHistory')}</h4>
          {itemDetail.assignmentHistory.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('users.title')}</th>
                  <th>{t('uniforms.assignedDate')}</th>
                  <th>{t('uniforms.returnedDate')}</th>
                </tr>
              </thead>
              <tbody>
                {itemDetail.assignmentHistory.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.user.firstName} {a.user.lastName}
                    </td>
                    <td>{a.assignedDate}</td>
                    <td>{a.returnedDate || <span className="badge badge-primary">Actief</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>Geen uitgifte historie.</p>
          )}
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deletingItem && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('uniforms.deleteConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingItem(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
