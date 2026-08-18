import { useState, useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Icon } from './Icon';
import { reorderProjectSetlist, ProjectDetail } from '../api/projects';
import { showSuccess, showError } from '../utils/toast';
import { triggerHaptic } from '../hooks/useHapticFeedback';

interface ProjectSetlistSectionProps {
  project: ProjectDetail;
  onUpdate?: () => void;
}

interface SetlistItem {
  id: string;
  musicTitleId?: string;
  musicTitleName?: string;
  customTitle?: string;
  sortOrder: number;
  durationMinutes?: number;
  notes?: string;
}

interface SortableSetlistItemProps {
  item: SetlistItem;
  index: number;
}

function SortableSetlistItem({ item, index }: SortableSetlistItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 p-3 bg-base-200 rounded-lg ${
        isDragging ? 'shadow-lg z-10' : ''
      }`}
    >
      <div
        className="cursor-grab active:cursor-grabbing text-base-content/50 hover:text-base-content p-1"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        role="button"
        tabIndex={0}
      >
        <span className="text-lg select-none" aria-hidden={true}>&#8942;&#8942;</span>
      </div>
      <span className="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center font-medium flex-shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {item.musicTitleName || item.customTitle}
        </div>
        {item.notes && (
          <div className="text-sm text-base-content/60 truncate">{item.notes}</div>
        )}
      </div>
      {item.durationMinutes && (
        <span className="text-sm text-base-content/70 flex-shrink-0">
          {item.durationMinutes} min
        </span>
      )}
    </div>
  );
}

function SetlistItemOverlay({ item, index }: { item: SetlistItem; index: number }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-base-100 rounded-lg shadow-xl border-2 border-primary">
      <div className="cursor-grabbing text-base-content/50 p-1" aria-hidden={true}>
        <span className="text-lg select-none">&#8942;&#8942;</span>
      </div>
      <span className="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center font-medium flex-shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {item.musicTitleName || item.customTitle}
        </div>
      </div>
      {item.durationMinutes && (
        <span className="text-sm text-base-content/70 flex-shrink-0">
          {item.durationMinutes} min
        </span>
      )}
    </div>
  );
}

export function ProjectSetlistSection({ project, onUpdate }: ProjectSetlistSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Local state for optimistic updates during drag
  const [items, setItems] = useState<SetlistItem[]>(
    [...project.setlist].sort((a, b) => a.sortOrder - b.sortOrder)
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when project changes.
  // This must be an effect, not useMemo: calling setState during render can loop.
  useEffect(() => {
    setItems([...project.setlist].sort((a, b) => a.sortOrder - b.sortOrder));
    setHasChanges(false);
  }, [project.setlist]);

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

  const reorderMutation = useMutation({
    mutationFn: (itemIds: string[]) => reorderProjectSetlist(project.id, itemIds),
    onSuccess: () => {
      showSuccess(t('projects.setlistReorder.saved'));
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      setHasChanges(false);
      onUpdate?.();
    },
    onError: () => {
      showError(t('projects.setlistReorder.error'));
      // Revert to original order on error
      setItems([...project.setlist].sort((a, b) => a.sortOrder - b.sortOrder));
      setHasChanges(false);
    },
  });

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    triggerHaptic('light');
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (over && active.id !== over.id) {
      setItems((currentItems) => {
        const oldIndex = currentItems.findIndex((item) => item.id === active.id);
        const newIndex = currentItems.findIndex((item) => item.id === over.id);
        triggerHaptic('selection');
        const newItems = arrayMove(currentItems, oldIndex, newIndex);
        setHasChanges(true);
        return newItems;
      });
    }
  }, []);

  const handleSaveOrder = useCallback(() => {
    const itemIds = items.map((item) => item.id);
    reorderMutation.mutate(itemIds);
  }, [items, reorderMutation]);

  const handleCancelChanges = useCallback(() => {
    setItems([...project.setlist].sort((a, b) => a.sortOrder - b.sortOrder));
    setHasChanges(false);
  }, [project.setlist]);

  const activeItem = activeDragId ? items.find((item) => item.id === activeDragId) : null;
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1;

  const totalDuration = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-base-content/60">
        <Icon name="listMusic" size={32} className="mx-auto mb-2 opacity-50" aria-hidden={true} />
        <p>{t('projects.noSetlist')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats and actions bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-base-content/70">
          {totalDuration > 0 && (
            <>
              {t('projects.totalDuration')}: {Math.floor(totalDuration / 60)}:
              {String(totalDuration % 60).padStart(2, '0')}
            </>
          )}
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleCancelChanges}
              disabled={reorderMutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-sm btn-primary gap-1"
              onClick={handleSaveOrder}
              disabled={reorderMutation.isPending}
            >
              {reorderMutation.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Icon name="check" size={14} aria-hidden={true} />
              )}
              {t('common.save')}
            </button>
          </div>
        )}
      </div>

      {/* Draggable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {items.map((item, index) => (
              <SortableSetlistItem key={item.id} item={item} index={index} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem ? (
            <SetlistItemOverlay item={activeItem} index={activeIndex} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Help text */}
      <p className="text-xs text-base-content/50 text-center">
        <Icon name="move" size={12} className="inline mr-1" aria-hidden={true} />
        {t('common.dragToReorder', 'Drag items to reorder')}
      </p>
    </div>
  );
}

export default ProjectSetlistSection;
