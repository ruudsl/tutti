import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import {
  getOrchestras,
  getSeatingSections,
  getSeatingAssignments,
  createDefaultSeatingLayout,
  deleteAllSeatingSections,
  createSeatingAssignment,
  deleteSeatingAssignment,
  bulkUpdateSeatingAssignments,
  getSeatingChart,
  getUsers,
  getInstruments,
  createSeatingSection,
  updateSeatingSection,
  deleteSeatingSection,
} from '../api';
import type { Orchestra, SeatingSection, SeatingAssignment, SeatingChart, User, Instrument } from '../types';
import { ROLES } from '../utils/constants';
import { SkeletonTable } from '../components/Skeleton';
import SeatingChartVisualization from '../components/SeatingChartVisualization';
import SeatingEditor from '../components/SeatingEditor';
import SeatingNotificationSettings from '../components/SeatingNotificationSettings';

const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

export default function Seating() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.seating');

  const isManager = user && MANAGER_ROLES.includes(user.role);

  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string>('');
  const [sections, setSections] = useState<SeatingSection[]>([]);
  const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
  const [chart, setChart] = useState<SeatingChart | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [activeTab, setActiveTab] = useState<'chart' | 'editor' | 'config' | 'assignments' | 'notifications'>('chart');
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState({ name: '', rowNumber: 1, instrumentIds: [] as string[] });

  const [showAssignmentForm, setShowAssignmentForm] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ userId: '', sectionId: '', positionInSection: 0, seatLabel: '', notes: '' });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedOrchestraId) {
      loadOrchestraData();
    }
  }, [selectedOrchestraId]);

  const loadInitialData = async () => {
    try {
      const [orch, allUsers, instr] = await Promise.all([
        getOrchestras(),
        isManager ? getUsers() : Promise.resolve([]),
        isManager ? getInstruments() : Promise.resolve([]),
      ]);
      setOrchestras(orch);
      setUsers(allUsers);
      setInstruments(instr);
      if (orch.length > 0) {
        setSelectedOrchestraId(orch[0].id);
      }
    } catch (e) {
      console.error(e);
      showError(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrchestraData = async () => {
    if (!selectedOrchestraId) return;
    try {
      const [sect, assign, chartData] = await Promise.all([
        getSeatingSections(selectedOrchestraId),
        getSeatingAssignments(selectedOrchestraId),
        getSeatingChart(selectedOrchestraId),
      ]);
      setSections(sect);
      setAssignments(assign);
      setChart(chartData);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateDefaultLayout = async () => {
    if (!selectedOrchestraId) return;
    try {
      await createDefaultSeatingLayout(selectedOrchestraId);
      showSuccess(t('seating.defaultLayoutCreated'));
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleDeleteAllSections = async () => {
    if (!selectedOrchestraId) return;
    if (!confirm(t('seating.confirmDeleteAllSections'))) return;
    try {
      await deleteAllSeatingSections(selectedOrchestraId);
      showSuccess(t('seating.allSectionsDeleted'));
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestraId) return;
    try {
      if (editingSectionId) {
        await updateSeatingSection(editingSectionId, {
          name: sectionForm.name,
          rowNumber: sectionForm.rowNumber,
          instrumentIds: sectionForm.instrumentIds,
        });
        showSuccess(t('seating.sectionUpdated'));
      } else {
        await createSeatingSection({
          orchestraId: selectedOrchestraId,
          name: sectionForm.name,
          rowNumber: sectionForm.rowNumber,
          instrumentIds: sectionForm.instrumentIds,
        });
        showSuccess(t('seating.sectionCreated'));
      }
      setShowSectionForm(false);
      setEditingSectionId(null);
      setSectionForm({ name: '', rowNumber: 1, instrumentIds: [] });
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleEditSection = (section: SeatingSection) => {
    setSectionForm({
      name: section.name,
      rowNumber: section.rowNumber,
      instrumentIds: section.instruments.map(i => i.id),
    });
    setEditingSectionId(section.id);
    setShowSectionForm(true);
  };

  const handleDeleteSection = async (id: string) => {
    if (!confirm(t('seating.confirmDeleteSection'))) return;
    try {
      await deleteSeatingSection(id);
      showSuccess(t('seating.sectionDeleted'));
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestraId) return;
    try {
      await createSeatingAssignment({
        orchestraId: selectedOrchestraId,
        userId: assignmentForm.userId,
        sectionId: assignmentForm.sectionId,
        positionInSection: assignmentForm.positionInSection,
        seatLabel: assignmentForm.seatLabel || undefined,
        notes: assignmentForm.notes || undefined,
      });
      showSuccess(t('seating.assignmentCreated'));
      setShowAssignmentForm(false);
      setAssignmentForm({ userId: '', sectionId: '', positionInSection: 0, seatLabel: '', notes: '' });
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm(t('seating.confirmDeleteAssignment'))) return;
    try {
      await deleteSeatingAssignment(id);
      showSuccess(t('seating.assignmentDeleted'));
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleBulkSaveAssignments = async (newAssignments: { userId: string; sectionId: string; positionInSection: number }[]) => {
    if (!selectedOrchestraId) return;
    try {
      await bulkUpdateSeatingAssignments(selectedOrchestraId, newAssignments);
      showSuccess(t('seating.assignmentsSaved'));
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  // Get users not yet assigned
  const unassignedUsers = useMemo(() => {
    const assignedUserIds = new Set(assignments.map(a => a.userId));
    // Filter users who are in the selected orchestra
    return users.filter(u =>
      !assignedUserIds.has(u.id) &&
      u.orchestras?.some(o => o.id === selectedOrchestraId)
    );
  }, [users, assignments, selectedOrchestraId]);

  if (isLoading) {
    return (
      <div className="page-container">
        <h1>{t('seating.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('seating.title')}</h1>
      </div>

      {/* Orchestra Selection */}
      <div className="form-row" style={{ marginBottom: '1.5rem' }}>
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
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={`tab ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          {t('seating.tabs.chart')}
        </button>
        {isManager && (
          <>
            <button
              className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              {t('seating.tabs.editor')}
            </button>
            <button
              className={`tab ${activeTab === 'config' ? 'active' : ''}`}
              onClick={() => setActiveTab('config')}
            >
              {t('seating.tabs.config')}
            </button>
            <button
              className={`tab ${activeTab === 'assignments' ? 'active' : ''}`}
              onClick={() => setActiveTab('assignments')}
            >
              {t('seating.tabs.assignments')}
            </button>
            <button
              className={`tab ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              {t('seating.tabs.notifications')}
            </button>
          </>
        )}
      </div>

      {/* Chart Tab */}
      {activeTab === 'chart' && (
        <div className="card">
          <div className="card-header">
            <h2>{t('seating.chartTitle')}</h2>
          </div>
          <div className="card-body">
            {chart && chart.seats.length > 0 ? (
              <SeatingChartVisualization chart={chart} />
            ) : sections.length === 0 ? (
              <div className="empty-state">
                <p>{t('seating.noSections')}</p>
                {isManager && (
                  <button className="btn btn-primary" onClick={handleCreateDefaultLayout}>
                    {t('seating.createDefaultLayout')}
                  </button>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <p>{t('seating.noAssignments')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Editor Tab */}
      {activeTab === 'editor' && isManager && (
        <div className="card">
          <div className="card-header">
            <h2>{t('seating.editorTitle')}</h2>
          </div>
          <div className="card-body">
            {sections.length === 0 ? (
              <div className="empty-state">
                <p>{t('seating.noSections')}</p>
                <button className="btn btn-primary" onClick={handleCreateDefaultLayout}>
                  {t('seating.createDefaultLayout')}
                </button>
              </div>
            ) : (
              <SeatingEditor
                sections={sections}
                assignments={assignments}
                users={users}
                orchestraId={selectedOrchestraId}
                onSave={handleBulkSaveAssignments}
              />
            )}
          </div>
        </div>
      )}

      {/* Config Tab */}
      {activeTab === 'config' && isManager && (
        <div className="card">
          <div className="card-header">
            <h2>{t('seating.sectionsTitle')}</h2>
            <div className="card-actions">
              {sections.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={handleDeleteAllSections}>
                  {t('seating.deleteAllSections')}
                </button>
              )}
              {sections.length === 0 && (
                <button className="btn btn-secondary btn-sm" onClick={handleCreateDefaultLayout}>
                  {t('seating.createDefaultLayout')}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => {
                setSectionForm({ name: '', rowNumber: sections.length + 1, instrumentIds: [] });
                setEditingSectionId(null);
                setShowSectionForm(true);
              }}>
                {t('seating.addSection')}
              </button>
            </div>
          </div>
          <div className="card-body">
            {sections.length === 0 ? (
              <div className="empty-state">
                <p>{t('seating.noSections')}</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('seating.rowNumber')}</th>
                    <th>{t('seating.sectionName')}</th>
                    <th>{t('seating.instruments')}</th>
                    <th style={{ width: '120px' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(section => (
                    <tr key={section.id}>
                      <td>{section.rowNumber}</td>
                      <td>{section.name}</td>
                      <td>
                        {section.instruments.map(i => i.name).join(', ') || '-'}
                      </td>
                      <td>
                        <div className="btn-group">
                          <button className="btn btn-secondary btn-sm" onClick={() => handleEditSection(section)}>
                            {t('common.edit')}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSection(section.id)}>
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section Form Modal */}
          {showSectionForm && (
            <div className="modal-overlay" onClick={() => setShowSectionForm(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{editingSectionId ? t('seating.editSection') : t('seating.addSection')}</h3>
                  <button className="modal-close" onClick={() => setShowSectionForm(false)}>&times;</button>
                </div>
                <form onSubmit={handleSaveSection}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label htmlFor="sectionName">{t('seating.sectionName')}</label>
                      <input
                        type="text"
                        id="sectionName"
                        value={sectionForm.name}
                        onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="rowNumber">{t('seating.rowNumber')}</label>
                      <input
                        type="number"
                        id="rowNumber"
                        min="1"
                        value={sectionForm.rowNumber}
                        onChange={(e) => setSectionForm({ ...sectionForm, rowNumber: parseInt(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>{t('seating.instruments')}</label>
                      <div className="checkbox-list" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {instruments.map(instr => (
                          <label key={instr.id} className="checkbox-item">
                            <input
                              type="checkbox"
                              checked={sectionForm.instrumentIds.includes(instr.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSectionForm({ ...sectionForm, instrumentIds: [...sectionForm.instrumentIds, instr.id] });
                                } else {
                                  setSectionForm({ ...sectionForm, instrumentIds: sectionForm.instrumentIds.filter(id => id !== instr.id) });
                                }
                              }}
                            />
                            <span>{instr.name}{instr.tuning ? ` (${instr.tuning})` : ''}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowSectionForm(false)}>
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
      )}

      {/* Assignments Tab */}
      {activeTab === 'assignments' && isManager && (
        <div className="card">
          <div className="card-header">
            <h2>{t('seating.assignmentsTitle')}</h2>
            <div className="card-actions">
              <button className="btn btn-primary btn-sm" onClick={() => {
                setAssignmentForm({ userId: '', sectionId: '', positionInSection: 0, seatLabel: '', notes: '' });
                setShowAssignmentForm(true);
              }} disabled={sections.length === 0 || unassignedUsers.length === 0}>
                {t('seating.addAssignment')}
              </button>
            </div>
          </div>
          <div className="card-body">
            {sections.length === 0 ? (
              <div className="empty-state">
                <p>{t('seating.noSectionsForAssignment')}</p>
              </div>
            ) : assignments.length === 0 ? (
              <div className="empty-state">
                <p>{t('seating.noAssignments')}</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('seating.member')}</th>
                    <th>{t('seating.section')}</th>
                    <th>{t('seating.position')}</th>
                    <th>{t('seating.instruments')}</th>
                    <th>{t('seating.seatLabel')}</th>
                    <th style={{ width: '80px' }}>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(assignment => (
                    <tr key={assignment.id}>
                      <td>{assignment.userName}</td>
                      <td>{assignment.sectionName}</td>
                      <td>{assignment.positionInSection + 1}</td>
                      <td>{assignment.instruments || '-'}</td>
                      <td>{assignment.seatLabel || '-'}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAssignment(assignment.id)}>
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Assignment Form Modal */}
          {showAssignmentForm && (
            <div className="modal-overlay" onClick={() => setShowAssignmentForm(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{t('seating.addAssignment')}</h3>
                  <button className="modal-close" onClick={() => setShowAssignmentForm(false)}>&times;</button>
                </div>
                <form onSubmit={handleSaveAssignment}>
                  <div className="modal-body">
                    <div className="form-group">
                      <label htmlFor="userId">{t('seating.member')}</label>
                      <select
                        id="userId"
                        value={assignmentForm.userId}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, userId: e.target.value })}
                        required
                      >
                        <option value="">{t('common.select')}</option>
                        {unassignedUsers.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName} {u.instruments?.length ? `(${u.instruments.map(i => i.name).join(', ')})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="sectionId">{t('seating.section')}</label>
                      <select
                        id="sectionId"
                        value={assignmentForm.sectionId}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, sectionId: e.target.value })}
                        required
                      >
                        <option value="">{t('common.select')}</option>
                        {sections.map(s => (
                          <option key={s.id} value={s.id}>
                            {t('seating.row')} {s.rowNumber}: {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="positionInSection">{t('seating.position')}</label>
                      <input
                        type="number"
                        id="positionInSection"
                        min="0"
                        value={assignmentForm.positionInSection}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, positionInSection: parseInt(e.target.value) })}
                        required
                      />
                      <small className="form-hint">{t('seating.positionHint')}</small>
                    </div>
                    <div className="form-group">
                      <label htmlFor="seatLabel">{t('seating.seatLabel')}</label>
                      <input
                        type="text"
                        id="seatLabel"
                        value={assignmentForm.seatLabel}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, seatLabel: e.target.value })}
                        placeholder={t('seating.seatLabelPlaceholder')}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="notes">{t('seating.notes')}</label>
                      <textarea
                        id="notes"
                        value={assignmentForm.notes}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAssignmentForm(false)}>
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
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && isManager && (
        <div className="card">
          <div className="card-header">
            <h2>{t('seating.notifications.title')}</h2>
          </div>
          <div className="card-body">
            <SeatingNotificationSettings
              orchestraId={selectedOrchestraId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
