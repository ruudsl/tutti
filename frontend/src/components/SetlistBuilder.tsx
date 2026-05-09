import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon } from './Icon';
import { triggerHaptic } from '../hooks/useHapticFeedback';

export interface SetlistPiece {
  id: string;
  title: string;
  composer?: string;
  arranger?: string;
  durationSeconds?: number;
  notes?: string;
}

export interface Setlist {
  id?: string;
  name: string;
  pieces: SetlistPiece[];
  createdAt?: string;
  updatedAt?: string;
}

interface SetlistBuilderProps {
  /** Available pieces to add to setlist */
  availablePieces: SetlistPiece[];
  /** Initial setlist to edit (optional) */
  initialSetlist?: Setlist;
  /** Callback when setlist is saved */
  onSave?: (setlist: Setlist) => void;
  /** Callback when cancelled */
  onCancel?: () => void;
  /** Loading state */
  isLoading?: boolean;
}

interface SortablePieceItemProps {
  piece: SetlistPiece;
  index: number;
  onRemove: (id: string) => void;
  isDark: boolean;
  dragToReorderTitle: string;
  removeFromSetlistTitle: string;
}

function SortablePieceItem({ piece, index, onRemove, isDark, dragToReorderTitle, removeFromSetlistTitle }: SortablePieceItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: piece.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="setlist-piece-item"
      data-dragging={isDragging}
    >
      <div
        className="setlist-drag-handle"
        {...attributes}
        {...listeners}
        title={dragToReorderTitle}
      >
        <span className="drag-handle-icon">⋮⋮</span>
      </div>
      <span className="setlist-piece-number">{index + 1}</span>
      <div className="setlist-piece-info">
        <span className="setlist-piece-title">{piece.title}</span>
        {piece.composer && (
          <span className="setlist-piece-composer">{piece.composer}</span>
        )}
        {piece.arranger && (
          <span className="setlist-piece-arranger">arr. {piece.arranger}</span>
        )}
      </div>
      <span className="setlist-piece-duration">{formatDuration(piece.durationSeconds)}</span>
      <button
        className="setlist-remove-btn"
        onClick={() => onRemove(piece.id)}
        title={removeFromSetlistTitle}
        type="button"
      >
        <Icon name="trash" size={16} />
      </button>

      <style>{`
        .setlist-piece-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 8px;
          margin-bottom: 8px;
          transition: all 0.2s;
        }
        .setlist-piece-item:hover {
          background: var(--surface-hover);
          border-color: var(--border-strong);
        }
        .setlist-piece-item[data-dragging="true"] {
          box-shadow: var(--shadow-lg);
          z-index: 10;
        }
        .setlist-drag-handle {
          cursor: grab;
          color: var(--text-light);
          font-size: 1.25rem;
          line-height: 1;
          user-select: none;
          padding: 4px;
        }
        .setlist-drag-handle:active {
          cursor: grabbing;
        }
        .setlist-piece-number {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${isDark ? 'var(--surface-hover)' : 'var(--surface)'};
          border-radius: 50%;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-light);
          flex-shrink: 0;
        }
        .setlist-piece-info {
          flex: 1;
          min-width: 0;
        }
        .setlist-piece-title {
          display: block;
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .setlist-piece-composer,
        .setlist-piece-arranger {
          font-size: 0.875rem;
          color: var(--text-light);
          margin-right: 8px;
        }
        .setlist-piece-duration {
          font-family: monospace;
          font-size: 0.875rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .setlist-remove-btn {
          background: none;
          border: none;
          padding: 6px;
          cursor: pointer;
          color: var(--text-muted);
          border-radius: 4px;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .setlist-remove-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
      `}</style>
    </div>
  );
}

function PieceOverlay({ piece, isDark }: { piece: SetlistPiece; isDark: boolean }) {
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: isDark ? 'var(--surface)' : '#fff',
        border: '2px solid var(--primary)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-lg)',
        opacity: 0.95,
      }}
    >
      <span style={{ cursor: 'grabbing', color: 'var(--text-light)', fontSize: '1.25rem' }}>⋮⋮</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 500, color: 'var(--text)' }}>{piece.title}</span>
        {piece.composer && (
          <span style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginLeft: '8px' }}>
            {piece.composer}
          </span>
        )}
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
        {formatDuration(piece.durationSeconds)}
      </span>
    </div>
  );
}

export function SetlistBuilder({
  availablePieces,
  initialSetlist,
  onSave,
  onCancel,
  isLoading = false,
}: SetlistBuilderProps) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();

  const [setlistName, setSetlistName] = useState(initialSetlist?.name || '');
  const [pieces, setPieces] = useState<SetlistPiece[]>(initialSetlist?.pieces || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [showAvailable, setShowAvailable] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter available pieces (exclude already added)
  const filteredAvailablePieces = useMemo(() => {
    const addedIds = new Set(pieces.map(p => p.id));
    return availablePieces
      .filter(p => !addedIds.has(p.id))
      .filter(p => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(query) ||
          p.composer?.toLowerCase().includes(query) ||
          p.arranger?.toLowerCase().includes(query)
        );
      });
  }, [availablePieces, pieces, searchQuery]);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    const totalSeconds = pieces.reduce((sum, p) => sum + (p.durationSeconds || 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [pieces]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    triggerHaptic('light');
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (over && active.id !== over.id) {
      setPieces((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        triggerHaptic('selection');
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  const handleAddPiece = useCallback((piece: SetlistPiece) => {
    setPieces((prev) => [...prev, piece]);
    triggerHaptic('light');
  }, []);

  const handleRemovePiece = useCallback((id: string) => {
    setPieces((prev) => prev.filter(p => p.id !== id));
    triggerHaptic('light');
  }, []);

  const handleSave = useCallback(() => {
    if (!setlistName.trim()) {
      return;
    }
    const setlist: Setlist = {
      id: initialSetlist?.id,
      name: setlistName.trim(),
      pieces,
      createdAt: initialSetlist?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave?.(setlist);
  }, [setlistName, pieces, initialSetlist, onSave]);

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activePiece = activeDragId ? pieces.find(p => p.id === activeDragId) : null;

  return (
    <div className="setlist-builder">
      {/* Header */}
      <div className="setlist-header">
        <div className="setlist-name-input-wrapper">
          <label htmlFor="setlist-name" className="sr-only">
            {t('setlistBuilder.setlistName')}
          </label>
          <input
            id="setlist-name"
            type="text"
            className="setlist-name-input"
            placeholder={t('setlistBuilder.setlistNamePlaceholder')}
            value={setlistName}
            onChange={(e) => setSetlistName(e.target.value)}
          />
        </div>
        <div className="setlist-actions">
          {onCancel && (
            <button
              className="btn btn-outline"
              onClick={onCancel}
              type="button"
            >
              {t('common.cancel')}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isLoading || !setlistName.trim() || pieces.length === 0}
            type="button"
          >
            {isLoading ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="setlist-stats">
        <div className="setlist-stat">
          <Icon name="listMusic" size={18} />
          <span>{t('setlistBuilder.piecesCount', { count: pieces.length })}</span>
        </div>
        <div className="setlist-stat">
          <Icon name="clock" size={18} />
          <span>{t('setlistBuilder.totalDuration')}: {totalDuration}</span>
        </div>
      </div>

      <div className="setlist-content">
        {/* Setlist pieces */}
        <div className="setlist-pieces-section">
          <h3 className="setlist-section-title">{t('setlistBuilder.program')}</h3>

          {pieces.length === 0 ? (
            <div className="setlist-empty">
              <Icon name="listMusic" size={48} />
              <p>{t('setlistBuilder.addPiecesToSetlist')}</p>
              <p className="text-sm text-muted">{t('setlistBuilder.dragOrClickToAdd')}</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={pieces.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="setlist-pieces-list">
                  {pieces.map((piece, index) => (
                    <SortablePieceItem
                      key={piece.id}
                      piece={piece}
                      index={index}
                      onRemove={handleRemovePiece}
                      isDark={isDark}
                      dragToReorderTitle={t('setlistBuilder.dragToReorder')}
                      removeFromSetlistTitle={t('setlistBuilder.removeFromSetlist')}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activePiece ? (
                  <PieceOverlay piece={activePiece} isDark={isDark} />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Available pieces */}
        <div className="setlist-available-section">
          <div className="setlist-available-header">
            <h3 className="setlist-section-title">
              {t('setlistBuilder.availablePieces')}
              <button
                className="setlist-toggle-btn"
                onClick={() => setShowAvailable(!showAvailable)}
                type="button"
                aria-expanded={showAvailable}
              >
                <Icon name={showAvailable ? 'chevronUp' : 'chevronDown'} size={18} />
              </button>
            </h3>
            {showAvailable && (
              <div className="setlist-search">
                <Icon name="search" size={16} />
                <input
                  type="text"
                  placeholder={t('setlistBuilder.searchPiecesPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}
          </div>

          {showAvailable && (
            <div className="setlist-available-list">
              {filteredAvailablePieces.length === 0 ? (
                <p className="text-muted text-center py-4">
                  {searchQuery ? t('setlistBuilder.noPiecesFound') : t('setlistBuilder.allPiecesAdded')}
                </p>
              ) : (
                filteredAvailablePieces.map((piece) => (
                  <div key={piece.id} className="setlist-available-item">
                    <div className="setlist-available-info">
                      <span className="setlist-available-title">{piece.title}</span>
                      {piece.composer && (
                        <span className="setlist-available-composer">{piece.composer}</span>
                      )}
                    </div>
                    <span className="setlist-available-duration">
                      {formatDuration(piece.durationSeconds)}
                    </span>
                    <button
                      className="setlist-add-btn"
                      onClick={() => handleAddPiece(piece)}
                      title={t('setlistBuilder.addToSetlist')}
                      type="button"
                    >
                      <Icon name="plus" size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .setlist-builder {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--background);
          font-family: var(--font-family);
        }

        .setlist-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
        }

        .setlist-name-input-wrapper {
          flex: 1;
          min-width: 200px;
        }

        .setlist-name-input {
          width: 100%;
          padding: 10px 14px;
          font-size: 1.125rem;
          font-weight: 600;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          color: var(--text);
          outline: none;
          transition: border-color 0.2s;
        }

        .setlist-name-input:focus {
          border-color: var(--primary);
        }

        .setlist-name-input::placeholder {
          color: var(--text-muted);
          font-weight: normal;
        }

        .setlist-actions {
          display: flex;
          gap: 8px;
        }

        .setlist-stats {
          display: flex;
          gap: 24px;
          padding: 12px 20px;
          background: ${isDark ? 'var(--surface)' : 'var(--surface)'};
          border-bottom: 1px solid var(--border);
        }

        .setlist-stat {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          color: var(--text-light);
        }

        .setlist-content {
          flex: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          padding: 20px;
          overflow: hidden;
        }

        @media (max-width: 768px) {
          .setlist-content {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr auto;
          }
        }

        .setlist-pieces-section,
        .setlist-available-section {
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .setlist-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text);
          margin: 0 0 12px 0;
        }

        .setlist-toggle-btn {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          color: var(--text-light);
          border-radius: 4px;
        }

        .setlist-toggle-btn:hover {
          background: var(--surface-hover);
        }

        .setlist-pieces-list {
          flex: 1;
          overflow-y: auto;
          padding-right: 8px;
        }

        .setlist-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          color: var(--text-muted);
          text-align: center;
          border: 2px dashed var(--border);
          border-radius: 12px;
          background: ${isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'};
        }

        .setlist-empty p {
          margin: 8px 0 0;
        }

        .setlist-available-header {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 12px;
        }

        .setlist-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .setlist-search input {
          flex: 1;
          border: none;
          background: transparent;
          color: var(--text);
          font-size: 0.875rem;
          outline: none;
        }

        .setlist-search input::placeholder {
          color: var(--text-muted);
        }

        .setlist-available-list {
          flex: 1;
          overflow-y: auto;
          padding-right: 8px;
        }

        .setlist-available-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: ${isDark ? 'var(--surface)' : '#fff'};
          border: 1px solid var(--border);
          border-radius: 6px;
          margin-bottom: 6px;
          transition: all 0.2s;
        }

        .setlist-available-item:hover {
          border-color: var(--primary);
        }

        .setlist-available-info {
          flex: 1;
          min-width: 0;
        }

        .setlist-available-title {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .setlist-available-composer {
          font-size: 0.75rem;
          color: var(--text-light);
        }

        .setlist-available-duration {
          font-family: monospace;
          font-size: 0.75rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .setlist-add-btn {
          background: var(--primary);
          border: none;
          padding: 6px;
          cursor: pointer;
          color: white;
          border-radius: 4px;
          transition: all 0.2s;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .setlist-add-btn:hover {
          filter: brightness(1.1);
        }

        .btn {
          padding: 10px 20px;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn-primary {
          background: var(--primary);
          color: white;
          border: none;
        }

        .btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-outline {
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border);
        }

        .btn-outline:hover {
          background: var(--surface-hover);
          border-color: var(--border-strong);
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .text-sm {
          font-size: 0.875rem;
        }

        .text-muted {
          color: var(--text-muted);
        }

        .text-center {
          text-align: center;
        }

        .py-4 {
          padding-top: 1rem;
          padding-bottom: 1rem;
        }
      `}</style>
    </div>
  );
}

export default SetlistBuilder;
