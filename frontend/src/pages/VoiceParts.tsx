import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import {
  getOrchestras,
  getSeatingSections,
  getSeatingAssignments,
  updateSeatingAssignment,
  getUsers,
} from '../api';
import type { Orchestra, SeatingSection, SeatingAssignment, User } from '../types';
import { ROLES } from '../utils/constants';
import { SkeletonTable } from '../components/Skeleton';

const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

export default function VoiceParts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.voiceParts');

  const isManager = user && MANAGER_ROLES.includes(user.role);

  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string>('');
  const [sections, setSections] = useState<SeatingSection[]>([]);
  const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
  const [, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filterSection, setFilterSection] = useState<string>('');

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
      const [orch, allUsers] = await Promise.all([
        getOrchestras(),
        isManager ? getUsers() : Promise.resolve([]),
      ]);
      setOrchestras(orch);
      setUsers(allUsers);
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
      const [sect, assign] = await Promise.all([
        getSeatingSections(selectedOrchestraId),
        getSeatingAssignments(selectedOrchestraId),
      ]);
      setSections(sect);
      setAssignments(assign);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartEdit = (assignment: SeatingAssignment) => {
    setEditingId(assignment.id);
    setEditValue(assignment.seatLabel || '');
  };

  const handleSaveEdit = async (assignmentId: string) => {
    try {
      await updateSeatingAssignment(assignmentId, { seatLabel: editValue });
      showSuccess(t('voiceParts.saved'));
      setEditingId(null);
      loadOrchestraData();
    } catch (e: any) {
      showError(e.response?.data?.error || t('common.error'));
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  // Group assignments by section
  const assignmentsBySection = useMemo(() => {
    const grouped = new Map<string, SeatingAssignment[]>();

    for (const section of sections) {
      grouped.set(section.id, []);
    }

    for (const assignment of assignments) {
      const sectionAssignments = grouped.get(assignment.sectionId);
      if (sectionAssignments) {
        sectionAssignments.push(assignment);
      }
    }

    // Sort by position within each section
    for (const [, sectionAssignments] of grouped) {
      sectionAssignments.sort((a, b) => a.positionInSection - b.positionInSection);
    }

    return grouped;
  }, [sections, assignments]);

  // Filter sections
  const filteredSections = useMemo(() => {
    if (!filterSection) return sections;
    return sections.filter(s => s.id === filterSection);
  }, [sections, filterSection]);

  // Common voice labels
  const voiceLabels = ['1e stem', '2e stem', '3e stem', '4e stem', 'Solo', 'Tutti'];

  if (isLoading) {
    return (
      <div className="page-container">
        <h1>{t('voiceParts.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>{t('voiceParts.title')}</h1>
      </div>

      <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
        {t('voiceParts.description')}
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
        <div className="form-group" style={{ maxWidth: '300px' }}>
          <label htmlFor="section">{t('voiceParts.filterBySection')}</label>
          <select
            id="section"
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
          >
            <option value="">{t('common.all')}</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Voice Parts by Section */}
      {filteredSections.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <p>{t('voiceParts.noSections')}</p>
            </div>
          </div>
        </div>
      ) : (
        filteredSections.map(section => {
          const sectionAssignments = assignmentsBySection.get(section.id) || [];

          return (
            <div key={section.id} className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header">
                <h3>{section.name}</h3>
                <span className="badge badge-secondary">
                  {sectionAssignments.length} {t('voiceParts.members')}
                </span>
              </div>
              <div className="card-body">
                {sectionAssignments.length === 0 ? (
                  <p className="text-muted">{t('voiceParts.noMembers')}</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('voiceParts.position')}</th>
                        <th>{t('voiceParts.member')}</th>
                        <th>{t('voiceParts.instrument')}</th>
                        <th>{t('voiceParts.voicePart')}</th>
                        {isManager && <th style={{ width: '120px' }}>{t('common.actions')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sectionAssignments.map((assignment, index) => (
                        <tr key={assignment.id}>
                          <td>{index + 1}</td>
                          <td>{assignment.userName}</td>
                          <td>{assignment.instruments || '-'}</td>
                          <td>
                            {editingId === assignment.id ? (
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  placeholder={t('voiceParts.enterVoice')}
                                  list="voice-labels"
                                  style={{ maxWidth: '150px' }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(assignment.id);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }}
                                />
                                <datalist id="voice-labels">
                                  {voiceLabels.map(label => (
                                    <option key={label} value={label} />
                                  ))}
                                </datalist>
                              </div>
                            ) : (
                              <span
                                className={assignment.seatLabel ? '' : 'text-muted'}
                                style={{ cursor: isManager ? 'pointer' : 'default' }}
                                onClick={() => isManager && handleStartEdit(assignment)}
                              >
                                {assignment.seatLabel || (isManager ? t('voiceParts.clickToAssign') : '-')}
                              </span>
                            )}
                          </td>
                          {isManager && (
                            <td>
                              {editingId === assignment.id ? (
                                <div className="btn-group">
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleSaveEdit(assignment.id)}
                                  >
                                    {t('common.save')}
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleCancelEdit}
                                  >
                                    {t('common.cancel')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleStartEdit(assignment)}
                                >
                                  {t('common.edit')}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
