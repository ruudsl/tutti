import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showSuccess, showError } from '../utils/toast';
import { getOrchestras, getSeatingSections, getSeatingAssignments, updateSeatingAssignment } from '../api';
import type { SeatingAssignment } from '../types';
import { ROLES } from '../utils/constants';
import { SkeletonTable } from '../components/Skeleton';

const MANAGER_ROLES: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE, ROLES.CONDUCTOR];

export default function VoiceParts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.voiceParts');
  const queryClient = useQueryClient();

  const isManager = user && MANAGER_ROLES.includes(user.role);

  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filterSection, setFilterSection] = useState<string>('');

  // React Query for orchestras
  const { data: orchestras = [], isLoading } = useQuery({
    queryKey: ['orchestras'],
    queryFn: getOrchestras,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for sections
  const { data: sections = [] } = useQuery({
    queryKey: ['seatingSections', selectedOrchestraId],
    queryFn: () => getSeatingSections(selectedOrchestraId),
    enabled: !!selectedOrchestraId,
    staleTime: 5 * 60 * 1000,
  });

  // React Query for assignments
  const { data: assignments = [] } = useQuery({
    queryKey: ['seatingAssignments', selectedOrchestraId],
    queryFn: () => getSeatingAssignments(selectedOrchestraId),
    enabled: !!selectedOrchestraId,
    staleTime: 5 * 60 * 1000,
  });

  // Set initial orchestra
  useEffect(() => {
    if (!selectedOrchestraId && orchestras.length > 0) {
      setSelectedOrchestraId(orchestras[0].id);
    }
  }, [orchestras, selectedOrchestraId]);

  // Helper to refresh data
  const refreshAssignments = () => {
    queryClient.invalidateQueries({ queryKey: ['seatingAssignments', selectedOrchestraId] });
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
      refreshAssignments();
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
    return sections.filter((s) => s.id === filterSection);
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
          <select id="orchestra" value={selectedOrchestraId} onChange={(e) => setSelectedOrchestraId(e.target.value)}>
            {orchestras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ maxWidth: '300px' }}>
          <label htmlFor="section">{t('voiceParts.filterBySection')}</label>
          <select id="section" value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
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
        filteredSections.map((section) => {
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
                                  {voiceLabels.map((label) => (
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
                                  <button className="btn btn-secondary btn-sm" onClick={handleCancelEdit}>
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
