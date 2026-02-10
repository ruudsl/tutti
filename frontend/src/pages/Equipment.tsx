import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useEquipment,
  useEquipmentItem,
  useEquipmentTypes,
  useMaintenanceAlerts,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  useAddEquipmentDamageLog,
  useCreateEquipmentLoan,
  useReturnEquipmentLoan,
  useRecordEquipmentMaintenance,
} from '../hooks/useEquipment';
import { useUsers } from '../hooks/useUsers';
import { Modal, FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Equipment as EquipmentType } from '../types';

export default function Equipment() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.equipment');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<EquipmentType | null>(null);
  const [deletingEquipment, setDeletingEquipment] = useState<EquipmentType | null>(null);
  const [viewingEquipment, setViewingEquipment] = useState<string | null>(null);
  const [showLoanModal, setShowLoanModal] = useState<string | null>(null);
  const [showDamageModal, setShowDamageModal] = useState<string | null>(null);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState<string | null>(null);
  const [returningLoan, setReturningLoan] = useState<{ equipmentId: string; loanId: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    instrumentType: '',
    brandModel: '',
    serialNumber: '',
    yearOfManufacture: '',
    status: 'available',
    notes: '',
    maintenanceIntervalMonths: '12',
    lastMaintenanceDate: '',
    purchasePrice: '',
    currentValue: '',
  });

  const [loanFormData, setLoanFormData] = useState({
    userId: '',
    loanDate: new Date().toISOString().split('T')[0],
    conditionAtLoan: '',
    notes: '',
  });

  const [damageFormData, setDamageFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    repairCost: '',
    repairedBy: '',
    status: 'reported',
  });

  const [maintenanceFormData, setMaintenanceFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [returnFormData, setReturnFormData] = useState({
    returnDate: new Date().toISOString().split('T')[0],
    conditionAtReturn: '',
  });

  // Data fetching
  const { data: equipmentData, isLoading } = useEquipment({
    search: search || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
  });
  const { data: equipmentTypes = [] } = useEquipmentTypes();
  const { data: maintenanceAlerts = [] } = useMaintenanceAlerts();
  const { data: users = [] } = useUsers();
  const { data: equipmentDetail } = useEquipmentItem(viewingEquipment || '');

  // Mutations
  const createMutation = useCreateEquipment();
  const updateMutation = useUpdateEquipment();
  const deleteMutation = useDeleteEquipment();
  const addDamageMutation = useAddEquipmentDamageLog();
  const createLoanMutation = useCreateEquipmentLoan();
  const returnLoanMutation = useReturnEquipmentLoan();
  const recordMaintenanceMutation = useRecordEquipmentMaintenance();

  const equipment = equipmentData?.data || [];

  const resetForm = () => {
    setFormData({
      instrumentType: '',
      brandModel: '',
      serialNumber: '',
      yearOfManufacture: '',
      status: 'available',
      notes: '',
      maintenanceIntervalMonths: '12',
      lastMaintenanceDate: '',
      purchasePrice: '',
      currentValue: '',
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      instrumentType: formData.instrumentType,
      brandModel: formData.brandModel || undefined,
      serialNumber: formData.serialNumber || undefined,
      yearOfManufacture: formData.yearOfManufacture ? parseInt(formData.yearOfManufacture) : undefined,
      status: formData.status,
      notes: formData.notes || undefined,
      maintenanceIntervalMonths: parseInt(formData.maintenanceIntervalMonths) || 12,
      lastMaintenanceDate: formData.lastMaintenanceDate || undefined,
      purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
      currentValue: formData.currentValue ? parseFloat(formData.currentValue) : undefined,
    });
    setShowAddModal(false);
    resetForm();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEquipment) return;
    await updateMutation.mutateAsync({
      id: editingEquipment.id,
      data: {
        instrumentType: formData.instrumentType,
        brandModel: formData.brandModel || undefined,
        serialNumber: formData.serialNumber || undefined,
        yearOfManufacture: formData.yearOfManufacture ? parseInt(formData.yearOfManufacture) : undefined,
        status: formData.status,
        notes: formData.notes || undefined,
        maintenanceIntervalMonths: parseInt(formData.maintenanceIntervalMonths) || 12,
        lastMaintenanceDate: formData.lastMaintenanceDate || undefined,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : undefined,
        currentValue: formData.currentValue ? parseFloat(formData.currentValue) : undefined,
      },
    });
    setEditingEquipment(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingEquipment) return;
    await deleteMutation.mutateAsync(deletingEquipment.id);
    setDeletingEquipment(null);
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showLoanModal) return;
    await createLoanMutation.mutateAsync({
      equipmentId: showLoanModal,
      loan: {
        userId: loanFormData.userId,
        loanDate: loanFormData.loanDate,
        conditionAtLoan: loanFormData.conditionAtLoan || undefined,
        notes: loanFormData.notes || undefined,
      },
    });
    setShowLoanModal(null);
    setLoanFormData({ userId: '', loanDate: new Date().toISOString().split('T')[0], conditionAtLoan: '', notes: '' });
  };

  const handleReturnLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningLoan) return;
    await returnLoanMutation.mutateAsync({
      equipmentId: returningLoan.equipmentId,
      loanId: returningLoan.loanId,
      returnData: {
        returnDate: returnFormData.returnDate,
        conditionAtReturn: returnFormData.conditionAtReturn || undefined,
      },
    });
    setReturningLoan(null);
    setReturnFormData({ returnDate: new Date().toISOString().split('T')[0], conditionAtReturn: '' });
  };

  const handleAddDamage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDamageModal) return;
    await addDamageMutation.mutateAsync({
      equipmentId: showDamageModal,
      log: {
        date: damageFormData.date,
        description: damageFormData.description,
        repairCost: damageFormData.repairCost ? parseFloat(damageFormData.repairCost) : undefined,
        repairedBy: damageFormData.repairedBy || undefined,
        status: damageFormData.status,
      },
    });
    setShowDamageModal(null);
    setDamageFormData({ date: new Date().toISOString().split('T')[0], description: '', repairCost: '', repairedBy: '', status: 'reported' });
  };

  const handleRecordMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showMaintenanceModal) return;
    await recordMaintenanceMutation.mutateAsync({
      equipmentId: showMaintenanceModal,
      maintenance: {
        date: maintenanceFormData.date || undefined,
        notes: maintenanceFormData.notes || undefined,
      },
    });
    setShowMaintenanceModal(null);
    setMaintenanceFormData({ date: new Date().toISOString().split('T')[0], notes: '' });
  };

  const openEditModal = (item: EquipmentType) => {
    setEditingEquipment(item);
    setFormData({
      instrumentType: item.instrumentType,
      brandModel: item.brandModel || '',
      serialNumber: item.serialNumber || '',
      yearOfManufacture: item.yearOfManufacture?.toString() || '',
      status: item.status,
      notes: item.notes || '',
      maintenanceIntervalMonths: item.maintenanceIntervalMonths?.toString() || '12',
      lastMaintenanceDate: item.lastMaintenanceDate || '',
      purchasePrice: item.purchasePrice?.toString() || '',
      currentValue: item.currentValue?.toString() || '',
    });
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      available: 'badge-success',
      on_loan: 'badge-primary',
      in_repair: 'badge-warning',
      written_off: 'badge-danger',
      personal: 'badge-secondary',
    };
    return <span className={`badge ${classes[status] || ''}`}>{t(`equipment.status.${status}`)}</span>;
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('equipment.title')}</h1>
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
          {t('equipment.title')}
          <span className="badge badge-primary ml-2">{equipment.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + {t('equipment.newEquipment')}
        </button>
      </div>

      {/* Maintenance Alerts */}
      {maintenanceAlerts.length > 0 && (
        <div className="card mb-3" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>{t('equipment.maintenanceAlerts')}</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>{t('equipment.maintenanceAlertsDescription')}</p>
            <div className="flex gap-2 flex-wrap">
              {maintenanceAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="badge badge-warning" style={{ padding: '0.5rem 1rem' }}>
                  {alert.instrumentType} {alert.brandModel ? `(${alert.brandModel})` : ''} - {alert.isOverdue ? t('equipment.overdue') : alert.nextMaintenanceDate}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              className="form-control"
              placeholder={t('equipment.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="">{t('equipment.allStatuses')}</option>
              <option value="available">{t('equipment.status.available')}</option>
              <option value="on_loan">{t('equipment.status.on_loan')}</option>
              <option value="in_repair">{t('equipment.status.in_repair')}</option>
              <option value="written_off">{t('equipment.status.written_off')}</option>
              <option value="personal">{t('equipment.status.personal')}</option>
            </select>
            <select
              className="form-control"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="">{t('equipment.allTypes')}</option>
              {equipmentTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Equipment Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table mb-0">
            <thead>
              <tr>
                <th>{t('equipment.instrumentType')}</th>
                <th>{t('equipment.brandModel')}</th>
                <th>{t('equipment.serialNumber')}</th>
                <th>{t('common.status')}</th>
                <th>{t('equipment.loanHistory')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.instrumentType}</strong></td>
                  <td>{item.brandModel || '-'}</td>
                  <td>{item.serialNumber || '-'}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    {item.currentUser ? (
                      <span>{item.currentUser.firstName} {item.currentUser.lastName}</span>
                    ) : '-'}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setViewingEquipment(item.id)}
                        title={t('common.edit')}
                      >
                        👁
                      </button>
                      {item.status === 'available' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setShowLoanModal(item.id)}
                        >
                          {t('equipment.createLoan')}
                        </button>
                      )}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(item)}
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeletingEquipment(item)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {equipment.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#666' }}>
                    {t('equipment.noEquipment')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingEquipment) && (
        <FormModal
          title={editingEquipment ? t('equipment.edit') : t('equipment.newEquipment')}
          onClose={() => {
            setShowAddModal(false);
            setEditingEquipment(null);
            resetForm();
          }}
          onSubmit={editingEquipment ? handleUpdate : handleCreate}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('equipment.instrumentType')} *</label>
            <select
              className="form-control"
              value={formData.instrumentType}
              onChange={(e) => setFormData({ ...formData, instrumentType: e.target.value })}
              required
            >
              <option value="">-- {t('common.select')} --</option>
              {equipmentTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.brandModel')}</label>
            <input
              type="text"
              className="form-control"
              value={formData.brandModel}
              onChange={(e) => setFormData({ ...formData, brandModel: e.target.value })}
              placeholder={t('equipment.brandModelPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.serialNumber')}</label>
            <input
              type="text"
              className="form-control"
              value={formData.serialNumber}
              onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              placeholder={t('equipment.serialNumberPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('equipment.yearOfManufacture')}</label>
              <input
                type="number"
                className="form-control"
                value={formData.yearOfManufacture}
                onChange={(e) => setFormData({ ...formData, yearOfManufacture: e.target.value })}
                min="1800"
                max={new Date().getFullYear()}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('common.status')}</label>
              <select
                className="form-control"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="available">{t('equipment.status.available')}</option>
                <option value="on_loan">{t('equipment.status.on_loan')}</option>
                <option value="in_repair">{t('equipment.status.in_repair')}</option>
                <option value="written_off">{t('equipment.status.written_off')}</option>
                <option value="personal">{t('equipment.status.personal')}</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('equipment.maintenanceInterval')}</label>
              <input
                type="number"
                className="form-control"
                value={formData.maintenanceIntervalMonths}
                onChange={(e) => setFormData({ ...formData, maintenanceIntervalMonths: e.target.value })}
                min="1"
                max="60"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('equipment.lastMaintenance')}</label>
              <input
                type="date"
                className="form-control"
                value={formData.lastMaintenanceDate}
                onChange={(e) => setFormData({ ...formData, lastMaintenanceDate: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.notes')}</label>
            <textarea
              className="form-control"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>
        </FormModal>
      )}

      {/* View Detail Modal */}
      {viewingEquipment && equipmentDetail && (
        <Modal
          title={`${equipmentDetail.instrumentType} ${equipmentDetail.brandModel || ''}`}
          onClose={() => setViewingEquipment(null)}
          size="large"
        >
          <div className="mb-3">
            <p><strong>{t('equipment.serialNumber')}:</strong> {equipmentDetail.serialNumber || '-'}</p>
            <p><strong>{t('common.status')}:</strong> {getStatusBadge(equipmentDetail.status)}</p>
            {equipmentDetail.currentUser && (
              <p><strong>{t('equipment.loanHistory')}:</strong> {equipmentDetail.currentUser.firstName} {equipmentDetail.currentUser.lastName}</p>
            )}
            <p><strong>{t('equipment.nextMaintenance')}:</strong> {equipmentDetail.nextMaintenanceDate || '-'}</p>
          </div>

          <div className="flex gap-2 mb-3">
            <button className="btn btn-outline" onClick={() => { setShowDamageModal(viewingEquipment); }}>
              + {t('equipment.addDamageLog')}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowMaintenanceModal(viewingEquipment); }}>
              {t('equipment.recordMaintenance')}
            </button>
            {equipmentDetail.status === 'available' && (
              <button className="btn btn-primary" onClick={() => { setShowLoanModal(viewingEquipment); }}>
                {t('equipment.createLoan')}
              </button>
            )}
          </div>

          {/* Damage Logs */}
          <h4>{t('equipment.damageLogs')}</h4>
          {equipmentDetail.damageLogs.length > 0 ? (
            <table className="table mb-3">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('common.description')}</th>
                  <th>{t('equipment.repairCost')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {equipmentDetail.damageLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.date}</td>
                    <td>{log.description}</td>
                    <td>{log.repairCost ? `€${log.repairCost.toFixed(2)}` : '-'}</td>
                    <td>{t(`equipment.damageStatus.${log.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666' }}>Geen schademeldingen.</p>
          )}

          {/* Loan History */}
          <h4>{t('equipment.loanHistory')}</h4>
          {equipmentDetail.loanHistory.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('users.title')}</th>
                  <th>{t('equipment.loanDate')}</th>
                  <th>{t('equipment.returnDate')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {equipmentDetail.loanHistory.map((loan) => (
                  <tr key={loan.id}>
                    <td>{loan.user.firstName} {loan.user.lastName}</td>
                    <td>{loan.loanDate}</td>
                    <td>{loan.returnDate || <span className="badge badge-primary">Actief</span>}</td>
                    <td>
                      {!loan.returnDate && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setReturningLoan({ equipmentId: viewingEquipment, loanId: loan.id })}
                        >
                          {t('equipment.returnEquipment')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#666' }}>Geen uitleenhistorie.</p>
          )}
        </Modal>
      )}

      {/* Create Loan Modal */}
      {showLoanModal && (
        <FormModal
          title={t('equipment.createLoan')}
          onClose={() => setShowLoanModal(null)}
          onSubmit={handleCreateLoan}
          isSubmitting={createLoanMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('equipment.selectUser')} *</label>
            <select
              className="form-control"
              value={loanFormData.userId}
              onChange={(e) => setLoanFormData({ ...loanFormData, userId: e.target.value })}
              required
            >
              <option value="">-- {t('common.select')} --</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.loanDate')} *</label>
            <input
              type="date"
              className="form-control"
              value={loanFormData.loanDate}
              onChange={(e) => setLoanFormData({ ...loanFormData, loanDate: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.conditionAtLoan')}</label>
            <textarea
              className="form-control"
              value={loanFormData.conditionAtLoan}
              onChange={(e) => setLoanFormData({ ...loanFormData, conditionAtLoan: e.target.value })}
              rows={2}
            />
          </div>
        </FormModal>
      )}

      {/* Return Loan Modal */}
      {returningLoan && (
        <FormModal
          title={t('equipment.returnEquipment')}
          onClose={() => setReturningLoan(null)}
          onSubmit={handleReturnLoan}
          isSubmitting={returnLoanMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('equipment.returnDate')} *</label>
            <input
              type="date"
              className="form-control"
              value={returnFormData.returnDate}
              onChange={(e) => setReturnFormData({ ...returnFormData, returnDate: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.conditionAtReturn')}</label>
            <textarea
              className="form-control"
              value={returnFormData.conditionAtReturn}
              onChange={(e) => setReturnFormData({ ...returnFormData, conditionAtReturn: e.target.value })}
              rows={2}
            />
          </div>
        </FormModal>
      )}

      {/* Add Damage Modal */}
      {showDamageModal && (
        <FormModal
          title={t('equipment.addDamageLog')}
          onClose={() => setShowDamageModal(null)}
          onSubmit={handleAddDamage}
          isSubmitting={addDamageMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('common.date')} *</label>
            <input
              type="date"
              className="form-control"
              value={damageFormData.date}
              onChange={(e) => setDamageFormData({ ...damageFormData, date: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.damageDescription')} *</label>
            <textarea
              className="form-control"
              value={damageFormData.description}
              onChange={(e) => setDamageFormData({ ...damageFormData, description: e.target.value })}
              rows={3}
              required
            />
          </div>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('equipment.repairCost')}</label>
              <input
                type="number"
                className="form-control"
                value={damageFormData.repairCost}
                onChange={(e) => setDamageFormData({ ...damageFormData, repairCost: e.target.value })}
                step="0.01"
                min="0"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">{t('common.status')}</label>
              <select
                className="form-control"
                value={damageFormData.status}
                onChange={(e) => setDamageFormData({ ...damageFormData, status: e.target.value })}
              >
                <option value="reported">{t('equipment.damageStatus.reported')}</option>
                <option value="in_repair">{t('equipment.damageStatus.in_repair')}</option>
                <option value="repaired">{t('equipment.damageStatus.repaired')}</option>
              </select>
            </div>
          </div>
        </FormModal>
      )}

      {/* Record Maintenance Modal */}
      {showMaintenanceModal && (
        <FormModal
          title={t('equipment.recordMaintenance')}
          onClose={() => setShowMaintenanceModal(null)}
          onSubmit={handleRecordMaintenance}
          isSubmitting={recordMaintenanceMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('common.date')}</label>
            <input
              type="date"
              className="form-control"
              value={maintenanceFormData.date}
              onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, date: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('equipment.notes')}</label>
            <textarea
              className="form-control"
              value={maintenanceFormData.notes}
              onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, notes: e.target.value })}
              rows={2}
            />
          </div>
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingEquipment && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('equipment.deleteConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingEquipment(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
