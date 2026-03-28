import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import {
  getOrchestras,
  getSeatingNeighbors,
  createSeatingNeighbor,
  deleteSeatingNeighbor,
  getUsers,
} from '../api';
import { ROLES } from '../utils/constants';
import { SkeletonTable } from '../components/Skeleton';

const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

export default function NeighborPreferences() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.neighborPreferences');
  const queryClient = useQueryClient();

  const isManager = user && MANAGER_ROLES.includes(user.role);

  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string>('');

  // React Query for orchestras
  const { data: orchestras = [], isLoading } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
    staleTime: 5 * 60 * 1000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: !!isManager,
    staleTime: 5 * 60 * 1000,
  });

  const { data: neighbors = [] } = useQuery({
    queryKey: ['seatingNeighbors', selectedOrchestraId],
    queryFn: () => getSeatingNeighbors(selectedOrchestraId),
    enabled: !!selectedOrchestraId,
    staleTime: 5 * 60 * 1000,
  });

  // Set initial orchestra
  useEffect(() => {
    if (!selectedOrchestraId && orchestras.length > 0) {
      setSelectedOrchestraId(orchestras[0].id);
    }
  }, [orchestras, selectedOrchestraId]);

  // Helper to refresh neighbors
  const refreshNeighbors = () => {
    queryClient.invalidateQueries({ queryKey: ['seatingNeighbors', selectedOrchestraId] });
  };

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    neighborUserId: '',
    preference: 'preferred' as 'preferred' | 'avoid',
  });

  // Filter
  const [filterType, setFilterType] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestraId) return;

    if (formData.userId === formData.neighborUserId) {
      showError(t('neighborPreferences.cannotSelectSelf'));
      return;
    }

    try {
      await createSeatingNeighbor({
        orchestraId: selectedOrchestraId,
        userId: formData.userId,
        neighborUserId: formData.neighborUserId,
        preference: formData.preference,
      });
      showSuccess(t('neighborPreferences.saved'));
      setShowForm(false);
      setFormData({ userId: '', neighborUserId: '', preference: 'preferred' });
      refreshNeighbors();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('neighborPreferences.confirmDelete'))) return;

    try {
      await deleteSeatingNeighbor(id);
      showSuccess(t('neighborPreferences.deleted'));
      refreshNeighbors();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  // Get users in this orchestra
  const orchestraUsers = useMemo(() => {
    return users.filter(u =>
      u.orchestras?.some(o => o.id === selectedOrchestraId)
    ).sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [users, selectedOrchestraId]);

  // Filter neighbors
  const filteredNeighbors = useMemo(() => {
    if (!filterType) return neighbors;
    return neighbors.filter(n => n.preference === filterType);
  }, [neighbors, filterType]);

  // Group by preference type
  const preferredNeighbors = neighbors.filter(n => n.preference === 'preferred');
  const avoidNeighbors = neighbors.filter(n => n.preference === 'avoid');

  if (isLoading) {
    return (
      <div className="page-container">
        <h1>{t('neighborPreferences.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('neighborPreferences.title')}</h1>
        {isManager && (
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
            disabled={orchestraUsers.length < 2}
          >
            {t('neighborPreferences.add')}
          </button>
        )}
      </div>

      <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
        {t('neighborPreferences.description')}
      </p>

      {/* Filters */}
      <div className="form-row" style={{ marginBottom: '1.5rem', gap: '1rem' }}>
        <div className="form-group" style={{ maxWidth: '300px' }}>
          <label htmlFor="orchestra">{t('seating.selectOrchestra')}</label>
          <select
            id="orchestra"
            value={selectedOrchestraId}
            onChange={(e) => setSelectedOrchestraId(e.target.value)}
          >
            {orchestras.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ maxWidth: '200px' }}>
          <label htmlFor="filter">{t('common.filter')}</label>
          <select
            id="filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            <option value="preferred">{t('neighborPreferences.preferred')}</option>
            <option value="avoid">{t('neighborPreferences.avoid')}</option>
          </select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success)' }}>{preferredNeighbors.length}</div>
          <div className="stat-label">{t('neighborPreferences.preferredCount')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{avoidNeighbors.length}</div>
          <div className="stat-label">{t('neighborPreferences.avoidCount')}</div>
        </div>
      </div>

      {/* Preferences List */}
      <div className="card">
        <div className="card-header">
          <h2>{t('neighborPreferences.list')}</h2>
        </div>
        <div className="card-body">
          {filteredNeighbors.length === 0 ? (
            <div className="empty-state">
              <p>{t('neighborPreferences.noPreferences')}</p>
              {isManager && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowForm(true)}
                  disabled={orchestraUsers.length < 2}
                >
                  {t('neighborPreferences.add')}
                </button>
              )}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('neighborPreferences.member')}</th>
                  <th>{t('neighborPreferences.preference')}</th>
                  <th>{t('neighborPreferences.neighbor')}</th>
                  {isManager && <th style={{ width: '80px' }}>{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {filteredNeighbors.map(neighbor => (
                  <tr key={neighbor.id}>
                    <td>{neighbor.userName}</td>
                    <td>
                      <span
                        className={`badge ${neighbor.preference === 'preferred' ? 'badge-success' : 'badge-danger'}`}
                      >
                        {neighbor.preference === 'preferred'
                          ? t('neighborPreferences.wantsToSitWith')
                          : t('neighborPreferences.prefersNotToSitWith')
                        }
                      </span>
                    </td>
                    <td>{neighbor.neighborUserName}</td>
                    {isManager && (
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(neighbor.id)}
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('neighborPreferences.add')}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="userId">{t('neighborPreferences.member')}</label>
                  <select
                    id="userId"
                    value={formData.userId}
                    onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.select')}</option>
                    {orchestraUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="preference">{t('neighborPreferences.preferenceType')}</label>
                  <select
                    id="preference"
                    value={formData.preference}
                    onChange={(e) => setFormData({ ...formData, preference: e.target.value as 'preferred' | 'avoid' })}
                    required
                  >
                    <option value="preferred">{t('neighborPreferences.wantsToSitWith')}</option>
                    <option value="avoid">{t('neighborPreferences.prefersNotToSitWith')}</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="neighborUserId">{t('neighborPreferences.neighbor')}</label>
                  <select
                    id="neighborUserId"
                    value={formData.neighborUserId}
                    onChange={(e) => setFormData({ ...formData, neighborUserId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.select')}</option>
                    {orchestraUsers
                      .filter(u => u.id !== formData.userId)
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
