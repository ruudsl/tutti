import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SortableItem({ id, children, disabled }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? 'default' : 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

interface SortableListProps<T extends { id: string }> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  disabled?: boolean;
  keyExtractor?: (item: T) => string;
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled,
  keyExtractor = (item) => item.id,
}: SortableListProps<T>) {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => keyExtractor(item) === active.id);
      const newIndex = items.findIndex((item) => keyExtractor(item) === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      onReorder(newItems);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map(keyExtractor)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        {items.map((item, index) => (
          <SortableItem key={keyExtractor(item)} id={keyExtractor(item)} disabled={disabled}>
            {renderItem(item, index)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}

// Simple draggable list item component with handle
interface DraggableListItemProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function DraggableListItem({ children, className, style }: DraggableListItemProps) {
  const { t } = useTranslation();
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem',
        background: 'var(--surface)',
        borderRadius: '0.25rem',
        marginBottom: '0.25rem',
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      <span
        style={{
          cursor: 'grab',
          color: 'var(--text-light)',
          fontSize: '1.25rem',
          lineHeight: 1,
          userSelect: 'none',
        }}
        title={t('common.dragToReorder')}
      >
        ⋮⋮
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
