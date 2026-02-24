import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeatingSection, SeatingAssignment, User } from '../types';

interface Props {
  sections: SeatingSection[];
  assignments: SeatingAssignment[];
  users: User[];
  orchestraId: string;
  onSave: (assignments: { userId: string; sectionId: string; positionInSection: number }[]) => Promise<void>;
}

interface DragItem {
  userId: string;
  userName: string;
  instrumentName: string | null;
  fromSectionId: string | null;
  fromPosition: number;
}

// Color palette for different instrument groups (same as visualization)
const INSTRUMENT_COLORS: Record<string, string> = {
  'Flute': '#4A90D9',
  'Piccolo': '#4A90D9',
  'Oboe': '#5C9EE8',
  'Clarinet': '#6BB3F7',
  'Bass Clarinet': '#6BB3F7',
  'Alto Saxophone': '#E8A435',
  'Tenor Saxophone': '#E8A435',
  'Baritone Saxophone': '#E8A435',
  'French Horn': '#9B59B6',
  'Trumpet': '#E74C3C',
  'Cornet': '#E74C3C',
  'Flugelhorn': '#E74C3C',
  'Euphonium': '#27AE60',
  'Tuba': '#27AE60',
  'Trombone': '#2ECC71',
  'Percussion': '#F39C12',
  'Piano': '#95A5A6',
  'Guitar': '#8E44AD',
};

const DEFAULT_COLOR = '#7F8C8D';

function getInstrumentColor(instrumentName: string | null): string {
  if (!instrumentName) return DEFAULT_COLOR;
  for (const [key, color] of Object.entries(INSTRUMENT_COLORS)) {
    if (instrumentName.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }
  return DEFAULT_COLOR;
}

export default function SeatingEditor({ sections, assignments, users, orchestraId, onSave }: Props) {
  const { t } = useTranslation();
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [localAssignments, setLocalAssignments] = useState<Map<string, { sectionId: string; position: number }>>(
    () => {
      const map = new Map();
      assignments.forEach(a => {
        map.set(a.userId, { sectionId: a.sectionId, position: a.positionInSection });
      });
      return map;
    }
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get all orchestra members with their info
  const orchestraMembers = useMemo(() => {
    return users.filter(u => u.orchestras?.some(o => o.id === orchestraId)).map(u => ({
      userId: u.id,
      userName: `${u.firstName} ${u.lastName}`,
      instrumentName: u.instruments?.map(i => i.name).join(', ') || null,
    }));
  }, [users, orchestraId]);

  // Group members by section
  const membersBySection = useMemo(() => {
    const result = new Map<string | null, { userId: string; userName: string; instrumentName: string | null; position: number }[]>();

    // Initialize sections
    sections.forEach(s => result.set(s.id, []));
    result.set(null, []); // Unassigned

    orchestraMembers.forEach(member => {
      const assignment = localAssignments.get(member.userId);
      if (assignment) {
        const sectionMembers = result.get(assignment.sectionId) || [];
        sectionMembers.push({ ...member, position: assignment.position });
        result.set(assignment.sectionId, sectionMembers);
      } else {
        const unassigned = result.get(null) || [];
        unassigned.push({ ...member, position: 999 });
        result.set(null, unassigned);
      }
    });

    // Sort by position within each section
    result.forEach((members, key) => {
      members.sort((a, b) => a.position - b.position);
      result.set(key, members);
    });

    return result;
  }, [orchestraMembers, localAssignments, sections]);

  const handleDragStart = useCallback((item: DragItem) => {
    setDraggedItem(item);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
  }, []);

  const handleDrop = useCallback((targetSectionId: string | null, targetPosition: number) => {
    if (!draggedItem) return;

    setLocalAssignments(prev => {
      const newMap = new Map(prev);

      if (targetSectionId === null) {
        // Dropping to unassigned area - remove assignment
        newMap.delete(draggedItem.userId);
      } else {
        // Assign to section at position
        newMap.set(draggedItem.userId, { sectionId: targetSectionId, position: targetPosition });

        // Shift other members in the target section
        const sectionMembers = Array.from(newMap.entries())
          .filter(([uid, a]) => a.sectionId === targetSectionId && uid !== draggedItem.userId);

        sectionMembers.sort((a, b) => a[1].position - b[1].position);

        let pos = 0;
        sectionMembers.forEach(([uid, a]) => {
          if (pos === targetPosition) pos++;
          newMap.set(uid, { sectionId: a.sectionId, position: pos });
          pos++;
        });
      }

      return newMap;
    });

    setHasChanges(true);
    setDraggedItem(null);
  }, [draggedItem]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const assignmentsList = Array.from(localAssignments.entries()).map(([userId, { sectionId, position }]) => ({
        userId,
        sectionId,
        positionInSection: position,
      }));
      await onSave(assignmentsList);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-assign members based on their instruments
  const handleAutoAssign = useCallback(() => {
    const newMap = new Map<string, { sectionId: string; position: number }>();
    const positionCounters = new Map<string, number>();
    sections.forEach(s => positionCounters.set(s.id, 0));

    orchestraMembers.forEach(member => {
      if (!member.instrumentName) return;

      // Find matching section based on instruments
      for (const section of sections) {
        const sectionInstruments = section.instruments.map(i => i.name.toLowerCase());
        const memberInstruments = member.instrumentName.toLowerCase().split(',').map(s => s.trim());

        const hasMatch = memberInstruments.some(mi =>
          sectionInstruments.some(si => mi.includes(si) || si.includes(mi))
        );

        if (hasMatch) {
          const position = positionCounters.get(section.id) || 0;
          newMap.set(member.userId, { sectionId: section.id, position });
          positionCounters.set(section.id, position + 1);
          break;
        }
      }
    });

    setLocalAssignments(newMap);
    setHasChanges(true);
  }, [orchestraMembers, sections]);

  const sortedSections = useMemo(() =>
    [...sections].sort((a, b) => a.rowNumber - b.rowNumber),
    [sections]
  );

  return (
    <div className="seating-editor">
      {/* Toolbar */}
      <div className="seating-editor-toolbar" style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <button
          className="btn btn-secondary"
          onClick={handleAutoAssign}
          disabled={isSaving}
        >
          {t('seating.autoAssign')}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </button>
        {hasChanges && (
          <span style={{ color: 'var(--warning-color)', fontSize: '0.9rem' }}>
            {t('seating.unsavedChanges')}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-light-color)' }}>
          {t('seating.dragDropHint')}
        </span>
      </div>

      {/* Main editor area */}
      <div className="seating-editor-canvas" style={{
        background: 'var(--bg-color)',
        borderRadius: '8px',
        padding: '1.5rem',
        border: '1px solid var(--border-color)',
      }}>
        {/* Conductor position indicator */}
        <div style={{
          textAlign: 'center',
          marginBottom: '1.5rem',
          padding: '0.75rem',
          background: '#1a1a2e',
          borderRadius: '8px',
          color: 'white',
          fontWeight: 500,
        }}>
          {t('seating.conductor')}
        </div>

        {/* Sections (rows) */}
        {sortedSections.map(section => {
          const members = membersBySection.get(section.id) || [];

          return (
            <div key={section.id} style={{ marginBottom: '1.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '0.5rem',
                gap: '0.5rem'
              }}>
                <span style={{
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  color: 'var(--text-color)',
                  minWidth: '24px',
                }}>
                  {section.rowNumber}
                </span>
                <span style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-light-color)'
                }}>
                  {section.name}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  minHeight: '60px',
                  padding: '12px',
                  background: draggedItem && draggedItem.fromSectionId !== section.id
                    ? 'var(--primary-color-light, #e3f2fd)'
                    : 'var(--surface-color)',
                  borderRadius: '8px',
                  border: '2px dashed var(--border-color)',
                  transition: 'background-color 0.2s',
                }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={(e) => { e.preventDefault(); handleDrop(section.id, members.length); }}
              >
                {members.map((member, index) => (
                  <div
                    key={member.userId}
                    draggable
                    onDragStart={() => handleDragStart({
                      userId: member.userId,
                      userName: member.userName,
                      instrumentName: member.instrumentName,
                      fromSectionId: section.id,
                      fromPosition: index,
                    })}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDrop(section.id, index); }}
                    style={{
                      padding: '8px 12px',
                      background: getInstrumentColor(member.instrumentName),
                      color: 'white',
                      borderRadius: '6px',
                      cursor: 'grab',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      opacity: draggedItem?.userId === member.userId ? 0.5 : 1,
                      transition: 'transform 0.1s, box-shadow 0.1s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                    }}
                    title={member.instrumentName || undefined}
                  >
                    {member.userName}
                  </div>
                ))}
                {members.length === 0 && (
                  <span style={{ color: 'var(--text-light-color)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    {t('seating.dropHere')}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Unassigned members */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid var(--border-color)' }}>
          <div style={{
            fontWeight: 600,
            marginBottom: '0.75rem',
            color: 'var(--text-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            {t('seating.unassignedMembers')}
            <span style={{
              fontSize: '0.8rem',
              color: 'var(--text-light-color)',
              fontWeight: 'normal'
            }}>
              ({(membersBySection.get(null) || []).length})
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              minHeight: '60px',
              padding: '12px',
              background: draggedItem ? 'var(--danger-color-light, #ffebee)' : 'var(--surface-color)',
              borderRadius: '8px',
              border: '2px dashed var(--border-color)',
              transition: 'background-color 0.2s',
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => { e.preventDefault(); handleDrop(null, 0); }}
          >
            {(membersBySection.get(null) || []).map((member) => (
              <div
                key={member.userId}
                draggable
                onDragStart={() => handleDragStart({
                  userId: member.userId,
                  userName: member.userName,
                  instrumentName: member.instrumentName,
                  fromSectionId: null,
                  fromPosition: 0,
                })}
                onDragEnd={handleDragEnd}
                style={{
                  padding: '8px 12px',
                  background: getInstrumentColor(member.instrumentName),
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'grab',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  opacity: draggedItem?.userId === member.userId ? 0.5 : 1,
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
                title={member.instrumentName || undefined}
              >
                {member.userName}
              </div>
            ))}
            {(membersBySection.get(null) || []).length === 0 && (
              <span style={{ color: 'var(--text-light-color)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                {t('seating.allMembersAssigned')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'var(--surface-color)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
      }}>
        <div style={{
          fontWeight: 600,
          marginBottom: '0.75rem',
          fontSize: '0.9rem',
          color: 'var(--text-color)'
        }}>
          {t('seating.legend')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {Object.entries(INSTRUMENT_COLORS).slice(0, 10).map(([name, color]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '16px',
                height: '16px',
                borderRadius: '4px',
                backgroundColor: color,
              }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-color)' }}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
