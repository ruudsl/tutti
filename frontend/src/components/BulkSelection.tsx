/**
 * Bulk Selection Component
 *
 * Provides multi-select functionality with checkboxes, floating action bar,
 * and keyboard support including Shift+click for range selection.
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  createContext,
  useContext,
  ReactNode,
  CSSProperties,
  memo,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon, IconName } from './Icon';

// ============================================
// Types
// ============================================

export interface BulkAction {
  /** Unique identifier for the action */
  id: string;
  /** Display label (Dutch) */
  label: string;
  /** Icon to display */
  icon: IconName;
  /** Action handler - receives selected item IDs */
  onAction: (selectedIds: string[]) => void | Promise<void>;
  /** Whether this is a destructive action (shows in red) */
  destructive?: boolean;
  /** Whether this action is disabled */
  disabled?: boolean;
  /** Tooltip text */
  tooltip?: string;
}

interface BulkSelectionContextValue {
  /** Set of currently selected item IDs */
  selectedIds: Set<string>;
  /** All available item IDs */
  allIds: string[];
  /** Whether all items are selected */
  isAllSelected: boolean;
  /** Whether some but not all items are selected */
  isIndeterminate: boolean;
  /** Toggle selection for a single item */
  toggleItem: (id: string, event?: React.MouseEvent) => void;
  /** Select a single item */
  selectItem: (id: string) => void;
  /** Deselect a single item */
  deselectItem: (id: string) => void;
  /** Toggle all items */
  toggleAll: () => void;
  /** Select all items */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Check if an item is selected */
  isSelected: (id: string) => boolean;
  /** Number of selected items */
  selectedCount: number;
  /** Whether selection mode is active */
  isSelectionActive: boolean;
}

// ============================================
// Context
// ============================================

const BulkSelectionContext = createContext<BulkSelectionContextValue | null>(null);

export function useBulkSelection(): BulkSelectionContextValue {
  const context = useContext(BulkSelectionContext);
  if (!context) {
    throw new Error('useBulkSelection must be used within a BulkSelectionProvider');
  }
  return context;
}

// ============================================
// Provider Component
// ============================================

interface BulkSelectionProviderProps {
  /** All available item IDs */
  itemIds: string[];
  /** Children to render */
  children: ReactNode;
  /** Initial selected IDs */
  initialSelection?: string[];
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function BulkSelectionProvider({
  itemIds,
  children,
  initialSelection = [],
  onSelectionChange,
}: BulkSelectionProviderProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelection)
  );
  const lastSelectedRef = useRef<string | null>(null);
  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  // Clean up selections when items are removed
  useEffect(() => {
    const idsSet = new Set(itemIds);
    setSelectedIds((prev) => {
      const cleaned = new Set<string>();
      prev.forEach((id) => {
        if (idsSet.has(id)) {
          cleaned.add(id);
        }
      });
      if (cleaned.size !== prev.size) {
        return cleaned;
      }
      return prev;
    });
  }, [itemIds]);

  const toggleItem = useCallback((id: string, event?: React.MouseEvent) => {
    // Shift+click for range selection
    if (event?.shiftKey && lastSelectedRef.current) {
      const allIds = itemIdsRef.current;
      const lastIndex = allIds.indexOf(lastSelectedRef.current);
      const currentIndex = allIds.indexOf(id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = allIds.slice(start, end + 1);

        setSelectedIds((prev) => {
          const next = new Set(prev);
          const shouldSelect = !prev.has(id);
          rangeIds.forEach((rangeId) => {
            if (shouldSelect) {
              next.add(rangeId);
            } else {
              next.delete(rangeId);
            }
          });
          return next;
        });
        return;
      }
    }

    // Normal toggle
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastSelectedRef.current = id;
  }, []);

  const selectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    lastSelectedRef.current = id;
  }, []);

  const deselectItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === itemIdsRef.current.length) {
        return new Set();
      }
      return new Set(itemIdsRef.current);
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(itemIdsRef.current));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedRef.current = null;
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const isAllSelected = selectedIds.size === itemIds.length && itemIds.length > 0;
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < itemIds.length;
  const selectedCount = selectedIds.size;
  const isSelectionActive = selectedIds.size > 0;

  const value: BulkSelectionContextValue = {
    selectedIds,
    allIds: itemIds,
    isAllSelected,
    isIndeterminate,
    toggleItem,
    selectItem,
    deselectItem,
    toggleAll,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount,
    isSelectionActive,
  };

  return (
    <BulkSelectionContext.Provider value={value}>
      {children}
    </BulkSelectionContext.Provider>
  );
}

// ============================================
// Checkbox Component
// ============================================

interface SelectionCheckboxProps {
  /** Item ID this checkbox controls */
  itemId: string;
  /** Additional CSS class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Size of the checkbox */
  size?: 'sm' | 'md' | 'lg';
  /** Label for accessibility */
  label?: string;
}

export const SelectionCheckbox = memo(function SelectionCheckbox({
  itemId,
  className = '',
  style,
  size = 'md',
  label,
}: SelectionCheckboxProps) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const { isSelected, toggleItem } = useBulkSelection();
  const checked = isSelected(itemId);

  const sizes = {
    sm: { box: 16, check: 10 },
    md: { box: 20, check: 12 },
    lg: { box: 24, check: 14 },
  };

  const { box, check } = sizes[size];

  const checkboxStyles: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: box,
    height: box,
    minWidth: box,
    borderRadius: 'var(--radius-sm)',
    border: `2px solid ${checked ? 'var(--primary)' : (isDark ? 'var(--border-strong)' : '#d1d5db')}`,
    backgroundColor: checked ? 'var(--primary)' : 'transparent',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    ...style,
  };

  return (
    <label
      className={`selection-checkbox ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => toggleItem(itemId, e.nativeEvent as unknown as React.MouseEvent)}
        onClick={(e) => toggleItem(itemId, e)}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
        }}
        aria-label={label ?? t('common.selectItem', { id: itemId })}
      />
      <span style={checkboxStyles}>
        {checked && (
          <Icon name="check" size={check} style={{ color: 'white' }} aria-hidden={true} />
        )}
      </span>
      {label && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: isDark ? 'var(--text)' : '#374151' }}>
          {label}
        </span>
      )}
    </label>
  );
});

// ============================================
// Select All Checkbox Component
// ============================================

interface SelectAllCheckboxProps {
  /** Additional CSS class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Size of the checkbox */
  size?: 'sm' | 'md' | 'lg';
  /** Show label text */
  showLabel?: boolean;
  /** Custom label */
  label?: string;
}

export const SelectAllCheckbox = memo(function SelectAllCheckbox({
  className = '',
  style,
  size = 'md',
  showLabel = true,
  label = 'Alles selecteren',
}: SelectAllCheckboxProps) {
  const { isDark } = useDarkMode();
  const { isAllSelected, isIndeterminate, toggleAll, selectedCount, allIds } = useBulkSelection();

  const sizes = {
    sm: { box: 16, icon: 10 },
    md: { box: 20, icon: 12 },
    lg: { box: 24, icon: 14 },
  };

  const { box, icon } = sizes[size];

  const checkboxStyles: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: box,
    height: box,
    minWidth: box,
    borderRadius: 'var(--radius-sm)',
    border: `2px solid ${(isAllSelected || isIndeterminate) ? 'var(--primary)' : (isDark ? 'var(--border-strong)' : '#d1d5db')}`,
    backgroundColor: (isAllSelected || isIndeterminate) ? 'var(--primary)' : 'transparent',
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    ...style,
  };

  return (
    <label
      className={`select-all-checkbox ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={isAllSelected}
        ref={(el) => {
          if (el) el.indeterminate = isIndeterminate;
        }}
        onChange={toggleAll}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
        }}
        aria-label={`${label} (${selectedCount} van ${allIds.length} geselecteerd)`}
      />
      <span style={checkboxStyles}>
        {isAllSelected && (
          <Icon name="check" size={icon} style={{ color: 'white' }} aria-hidden={true} />
        )}
        {isIndeterminate && (
          <Icon name="line" size={icon} style={{ color: 'white' }} aria-hidden={true} />
        )}
      </span>
      {showLabel && (
        <span style={{ fontSize: 'var(--font-size-sm)', color: isDark ? 'var(--text)' : '#374151' }}>
          {label}
        </span>
      )}
    </label>
  );
});

// ============================================
// Floating Action Bar Component
// ============================================

interface FloatingActionBarProps {
  /** Available bulk actions */
  actions: BulkAction[];
  /** Position of the action bar */
  position?: 'bottom' | 'top';
  /** Additional CSS class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
}

export const FloatingActionBar = memo(function FloatingActionBar({
  actions,
  position = 'bottom',
  className = '',
  style,
}: FloatingActionBarProps) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const { selectedIds, selectedCount, clearSelection, isSelectionActive } = useBulkSelection();
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  const handleAction = async (action: BulkAction) => {
    if (action.disabled || loadingActionId) return;

    try {
      setLoadingActionId(action.id);
      await action.onAction(Array.from(selectedIds));
    } finally {
      setLoadingActionId(null);
    }
  };

  // Don't render if nothing is selected
  if (!isSelectionActive) {
    return null;
  }

  const barStyles: CSSProperties = {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    [position === 'bottom' ? 'bottom' : 'top']: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    backgroundColor: isDark ? 'var(--surface)' : '#ffffff',
    border: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-xl)',
    zIndex: 'var(--z-sticky)',
    maxWidth: 'calc(100vw - 2rem)',
    animation: 'bulk-action-bar-enter 0.2s ease-out',
    ...style,
  };

  const buttonStyles = (isDestructive: boolean, isDisabled: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-medium)',
    color: isDisabled
      ? 'var(--text-muted)'
      : isDestructive
        ? 'var(--danger)'
        : (isDark ? 'var(--text)' : '#374151'),
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    transition: 'background-color var(--transition-fast)',
  });

  return createPortal(
    <>
      <style>
        {`
          @keyframes bulk-action-bar-enter {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(${position === 'bottom' ? '1rem' : '-1rem'});
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          }
        `}
      </style>
      <div
        className={`floating-action-bar ${className}`}
        style={barStyles}
        role="toolbar"
        aria-label={`${selectedCount} items geselecteerd`}
      >
        {/* Selection count */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--primary)',
            paddingRight: '0.75rem',
            borderRight: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
          }}
        >
          <Icon name="check" size={16} />
          {t('common.selected', { count: selectedCount })}
        </span>

        {/* Action buttons */}
        {actions.map((action) => {
          const isLoading = loadingActionId === action.id;
          const isDisabled = action.disabled || !!loadingActionId;

          return (
            <button
              key={action.id}
              type="button"
              style={buttonStyles(!!action.destructive, isDisabled)}
              onClick={() => handleAction(action)}
              disabled={isDisabled}
              title={action.tooltip}
              aria-label={action.label}
            >
              {isLoading ? (
                <span
                  className="loading-spinner"
                  style={{
                    width: 16,
                    height: 16,
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              ) : (
                <Icon name={action.icon} size={16} />
              )}
              <span className="action-label" style={{ display: 'inline-block' }}>
                {action.label}
              </span>
            </button>
          );
        })}

        {/* Clear selection button */}
        <button
          type="button"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            padding: 0,
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            marginLeft: '0.25rem',
          }}
          onClick={clearSelection}
          aria-label={t('common.clearSelection')}
          title={t('common.clearSelection')}
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </>,
    document.body
  );
});

// ============================================
// Default Bulk Actions
// ============================================

export function createDefaultBulkActions(
  handlers: {
    onDelete?: (ids: string[]) => void | Promise<void>;
    onArchive?: (ids: string[]) => void | Promise<void>;
    onMove?: (ids: string[]) => void | Promise<void>;
    onExport?: (ids: string[]) => void | Promise<void>;
  },
  t: (key: string) => string
): BulkAction[] {
  const actions: BulkAction[] = [];

  if (handlers.onExport) {
    actions.push({
      id: 'export',
      label: t('common.export'),
      icon: 'download',
      onAction: handlers.onExport,
    });
  }

  if (handlers.onMove) {
    actions.push({
      id: 'move',
      label: t('common.move'),
      icon: 'folder',
      onAction: handlers.onMove,
    });
  }

  if (handlers.onArchive) {
    actions.push({
      id: 'archive',
      label: t('common.archive'),
      icon: 'archive',
      onAction: handlers.onArchive,
    });
  }

  if (handlers.onDelete) {
    actions.push({
      id: 'delete',
      label: t('common.delete'),
      icon: 'trash',
      onAction: handlers.onDelete,
      destructive: true,
    });
  }

  return actions;
}

// ============================================
// Exports
// ============================================

export default {
  BulkSelectionProvider,
  SelectionCheckbox,
  SelectAllCheckbox,
  FloatingActionBar,
  useBulkSelection,
  createDefaultBulkActions,
};
