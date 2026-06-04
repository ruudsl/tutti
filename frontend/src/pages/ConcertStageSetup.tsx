import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useConcert } from '../hooks/useConcerts';
import {
  useStageLayouts,
  useStageLayout,
  useConcertStage,
  useSaveConcertStage,
  usePrintableSeatCards,
} from '../hooks/useStageLayouts';
import { getUsers } from '../api';
import StageCanvas from '../components/StageCanvas';
import SeatCardPrinter from '../components/SeatCardPrinter';
import type { StageAssignment } from '../types';
import { SkeletonTable } from '../components/Skeleton';

export default function ConcertStageSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { concertId } = useParams<{ concertId: string }>();
  useDocumentTitle('pageTitle.concertStageSetup');

  // Queries
  const { data: concert, isLoading: concertLoading } = useConcert(concertId || '');
  const { data: layouts = [] } = useStageLayouts(true);
  const { data: concertStage, isLoading: stageLoading } = useConcertStage(concertId || '');
  const { data: printData, isLoading: printLoading, refetch: refetchPrint } = usePrintableSeatCards(concertId || '');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => getUsers(),
    staleTime: 1000 * 60 * 5,
  });

  // Mutations
  const saveConcertStage = useSaveConcertStage();

  // Local state
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');
  const [assignments, setAssignments] = useState<Record<string, StageAssignment>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'assign' | 'print'>('assign');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Load selected layout
  const { data: selectedLayout } = useStageLayout(selectedLayoutId);

  // Initialize from existing concert stage
  useEffect(() => {
    if (concertStage?.assignment) {
      setSelectedLayoutId(concertStage.assignment.layoutId);
      setAssignments(concertStage.assignment.assignments);
      setHasChanges(false);
    }
  }, [concertStage]);

  // Filter users by search
  const filteredUsers = useMemo(() => {
    if (!searchTerm) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.firstName.toLowerCase().includes(term) ||
        u.lastName.toLowerCase().includes(term) ||
        u.instruments?.some((i) => i.name.toLowerCase().includes(term))
    );
  }, [users, searchTerm]);

  // Get assigned user IDs
  const assignedUserIds = useMemo(() => {
    return new Set(
      Object.values(assignments)
        .filter((a) => a.userId)
        .map((a) => a.userId!)
    );
  }, [assignments]);

  // Handle layout selection
  const handleLayoutSelect = (layoutId: string) => {
    if (hasChanges && !confirm(t('concertStageSetup.discardChanges', 'Wijzigingen negeren?'))) {
      return;
    }
    setSelectedLayoutId(layoutId);
    setAssignments({});
    setHasChanges(true);
  };

  // Handle position click in canvas
  const handleSelectionChange = (ids: string[]) => {
    if (ids.length === 1) {
      setSelectedPositionId(ids[0]);
    } else {
      setSelectedPositionId(null);
    }
  };

  // Assign user to position
  const assignUserToPosition = (userId: string, positionId: string) => {
    // Find user
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    // Get instrument from user if available
    const instrumentId = user.instruments?.[0]?.id;

    setAssignments((prev) => ({
      ...prev,
      [positionId]: {
        userId,
        instrumentId,
        name: `${user.firstName} ${user.lastName}`,
      },
    }));
    setHasChanges(true);
  };

  // Remove assignment
  const removeAssignment = (positionId: string) => {
    setAssignments((prev) => {
      const newAssignments = { ...prev };
      delete newAssignments[positionId];
      return newAssignments;
    });
    setHasChanges(true);
  };

  // Save
  const handleSave = async () => {
    if (!concertId || !selectedLayoutId) return;

    try {
      await saveConcertStage.mutateAsync({
        concertId,
        layoutId: selectedLayoutId,
        assignments,
      });
      setHasChanges(false);
      // Refetch print data
      refetchPrint();
    } catch (error) {
      // Error handled by mutation
    }
  };

  // Get assignment for position
  const getAssignment = (positionId: string): StageAssignment | undefined => {
    return assignments[positionId];
  };

  if (concertLoading || stageLoading) {
    return (
      <div className="page-container">
        <h1>{t('concertStageSetup.title', 'Concert Podiumindeling')}</h1>
        <SkeletonTable rows={5} columns={3} />
      </div>
    );
  }

  if (!concert) {
    return (
      <div className="page-container">
        <h1>{t('concertStageSetup.title', 'Concert Podiumindeling')}</h1>
        <div className="card">
          <div className="card-body">
            <p>{t('concertStageSetup.concertNotFound', 'Concert niet gevonden.')}</p>
            <button className="btn btn-primary" onClick={() => navigate('/concerts')}>
              {t('common.back', 'Terug')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('concertStageSetup.title', 'Concert Podiumindeling')}</h1>
          <p className="subtitle">
            {concert.name} - {new Date(concert.date).toLocaleDateString('nl-NL')}
            {concert.location && ` - ${concert.location}`}
          </p>
        </div>
        <div className="header-actions">
          {hasChanges && (
            <span className="unsaved-indicator" style={{ color: 'var(--warning)', marginRight: '1rem' }}>
              {t('stageDesigner.unsavedChanges', 'Niet-opgeslagen wijzigingen')}
            </span>
          )}
          <button className="btn btn-secondary" onClick={() => navigate('/concerts')}>
            {t('common.back', 'Terug')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saveConcertStage.isPending || !selectedLayoutId || !hasChanges}
          >
            {saveConcertStage.isPending
              ? t('common.saving', 'Opslaan...')
              : t('common.save', 'Opslaan')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button
          className={`tab ${activeTab === 'assign' ? 'active' : ''}`}
          onClick={() => setActiveTab('assign')}
        >
          {t('concertStageSetup.tabs.assign', 'Toewijzen')}
        </button>
        <button
          className={`tab ${activeTab === 'print' ? 'active' : ''}`}
          onClick={() => setActiveTab('print')}
          disabled={!concertStage?.assignment}
        >
          {t('concertStageSetup.tabs.print', 'Afdrukken')}
        </button>
      </div>

      {/* Assignment Tab */}
      {activeTab === 'assign' && (
        <div className="stage-setup-content" style={{ display: 'flex', gap: '1rem', minHeight: '500px' }}>
          {/* Left: Layout selection + Members */}
          <div className="setup-sidebar" style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Layout Selection */}
            <div className="card">
              <div className="card-header">
                <h3>{t('concertStageSetup.selectLayout', 'Selecteer indeling')}</h3>
              </div>
              <div className="card-body">
                <select
                  value={selectedLayoutId}
                  onChange={(e) => handleLayoutSelect(e.target.value)}
                  className="form-control"
                  style={{ width: '100%' }}
                >
                  <option value="">{t('common.select', 'Selecteer...')}</option>
                  {layouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.isDefault ? ` (${t('stageDesigner.default', 'standaard')})` : ''}
                    </option>
                  ))}
                </select>
                {!selectedLayoutId && layouts.length === 0 && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-light)' }}>
                    {t('concertStageSetup.noLayouts', 'Geen indelingen beschikbaar.')}
                    <br />
                    <a href="/stage-designer">{t('concertStageSetup.createLayout', 'Maak een indeling')}</a>
                  </p>
                )}
              </div>
            </div>

            {/* Members list */}
            {selectedLayoutId && (
              <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="card-header">
                  <h3>{t('concertStageSetup.members', 'Leden')}</h3>
                </div>
                <div className="card-body" style={{ padding: '0.5rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <input
                    type="text"
                    placeholder={t('common.search', 'Zoeken...')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-control"
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`member-item ${assignedUserIds.has(user.id) ? 'assigned' : ''}`}
                        draggable={!assignedUserIds.has(user.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('userId', user.id);
                        }}
                        onClick={() => {
                          if (selectedPositionId && !assignedUserIds.has(user.id)) {
                            assignUserToPosition(user.id, selectedPositionId);
                          }
                        }}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '4px',
                          background: assignedUserIds.has(user.id) ? 'var(--border-color)' : 'var(--surface)',
                          borderRadius: '4px',
                          cursor: assignedUserIds.has(user.id) ? 'default' : 'grab',
                          opacity: assignedUserIds.has(user.id) ? 0.5 : 1,
                          border: selectedPositionId && !assignedUserIds.has(user.id)
                            ? '2px dashed var(--primary)'
                            : '1px solid var(--border-color)',
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>
                          {user.firstName} {user.lastName}
                        </div>
                        {user.instruments && user.instruments.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                            {user.instruments.map((i) => i.name).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center: Canvas with assignments */}
          <div className="setup-canvas" style={{ flex: 1, overflow: 'hidden' }}>
            {selectedLayout ? (
              <div style={{ position: 'relative' }}>
                <StageCanvas
                  width={selectedLayout.stageWidth}
                  height={selectedLayout.stageDepth}
                  layoutData={selectedLayout.layoutData || { positions: [], shapes: [], sections: [] }}
                  selectedIds={selectedPositionId ? [selectedPositionId] : []}
                  tool="select"
                  gridSnap={false}
                  zoom={0.8}
                  readOnly
                  onLayoutChange={() => {}}
                  onSelectionChange={handleSelectionChange}
                />
                {/* Overlay assignments on canvas */}
                {selectedLayout.layoutData?.positions.map((pos) => {
                  const assignment = getAssignment(pos.id);
                  if (!assignment) return null;
                  return (
                    <div
                      key={`overlay-${pos.id}`}
                      style={{
                        position: 'absolute',
                        left: pos.x * 0.8 - 30,
                        top: pos.y * 0.8 + 20,
                        background: 'rgba(255,255,255,0.9)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        maxWidth: '80px',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {assignment.name}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>{t('concertStageSetup.selectLayoutFirst', 'Selecteer eerst een podiumindeling')}</p>
              </div>
            )}
          </div>

          {/* Right: Selected position details */}
          {selectedLayoutId && (
            <div className="setup-details" style={{ width: '280px' }}>
              <div className="card">
                <div className="card-header">
                  <h3>
                    {selectedPositionId
                      ? t('concertStageSetup.positionDetails', 'Positie details')
                      : t('concertStageSetup.selectPosition', 'Selecteer positie')}
                  </h3>
                </div>
                <div className="card-body">
                  {selectedPositionId ? (
                    <>
                      {(() => {
                        const pos = selectedLayout?.layoutData?.positions.find(
                          (p) => p.id === selectedPositionId
                        );
                        const assignment = getAssignment(selectedPositionId);
                        const section = selectedLayout?.layoutData?.sections.find(
                          (s) => s.id === pos?.section
                        );

                        return (
                          <div>
                            <p>
                              <strong>{t('stageDesigner.label', 'Label')}:</strong>{' '}
                              {pos?.label || '-'}
                            </p>
                            <p>
                              <strong>{t('stageDesigner.section', 'Sectie')}:</strong>{' '}
                              {section?.name || '-'}
                            </p>
                            <hr style={{ margin: '1rem 0' }} />
                            <p>
                              <strong>{t('concertStageSetup.assignedTo', 'Toegewezen aan')}:</strong>
                            </p>
                            {assignment ? (
                              <div
                                style={{
                                  padding: '0.5rem',
                                  background: 'var(--surface)',
                                  borderRadius: '4px',
                                  marginBottom: '0.5rem',
                                }}
                              >
                                <div style={{ fontWeight: 500 }}>{assignment.name}</div>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => removeAssignment(selectedPositionId)}
                                  style={{ marginTop: '0.5rem' }}
                                >
                                  {t('concertStageSetup.removeAssignment', 'Verwijderen')}
                                </button>
                              </div>
                            ) : (
                              <p style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>
                                {t('concertStageSetup.noAssignment', 'Klik op een lid om toe te wijzen')}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p style={{ color: 'var(--text-light)' }}>
                      {t('concertStageSetup.clickPosition', 'Klik op een positie op het podium om details te zien en een lid toe te wijzen.')}
                    </p>
                  )}
                </div>
              </div>

              {/* Statistics */}
              <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header">
                  <h3>{t('stageDesigner.statistics', 'Statistieken')}</h3>
                </div>
                <div className="card-body">
                  <p>
                    <strong>{t('concertStageSetup.assigned', 'Toegewezen')}:</strong>{' '}
                    {Object.keys(assignments).length} /{' '}
                    {selectedLayout?.layoutData?.positions.filter(
                      (p) => p.type === 'chair' || p.type === 'stand'
                    ).length || 0}{' '}
                    {t('concertStageSetup.positions', 'posities')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Print Tab */}
      {activeTab === 'print' && (
        <div className="stage-print-content">
          {printLoading ? (
            <SkeletonTable rows={4} columns={3} />
          ) : printData ? (
            <SeatCardPrinter
              concertName={printData.concert.name}
              concertDate={printData.concert.date}
              concertLocation={printData.concert.location}
              layoutName={printData.layoutName}
              seatCards={printData.seatCards}
            />
          ) : (
            <div className="empty-state">
              <p>{t('concertStageSetup.noPrintData', 'Geen afdrukgegevens beschikbaar. Sla eerst de podiumindeling op.')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
