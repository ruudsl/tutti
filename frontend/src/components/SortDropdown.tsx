/**
 * Sort Dropdown Component
 *
 * A reusable dropdown for sorting lists by different criteria.
 * Persists sort preference in localStorage.
 */

import { useState, useRef, useEffect, useCallback, memo, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon, IconName } from './Icon';

export type SortDirection = 'asc' | 'desc';

export interface SortOption<T extends string = string> {
  /** Unique identifier for the sort option */
  id: T;
  /** Display label: an i18n key (translated in the component) or a literal string */
  label: string;
  /** Optional icon */
  icon?: IconName;
  /** Default direction when first selected */
  defaultDirection?: SortDirection;
  /** Whether direction toggle is disabled for this option */
  disableDirectionToggle?: boolean;
}

export interface SortState<T extends string = string> {
  /** Currently selected sort option ID */
  sortBy: T;
  /** Current sort direction */
  direction: SortDirection;
}

interface SortDropdownProps<T extends string = string> {
  /** Available sort options */
  options: SortOption<T>[];
  /** Current sort state */
  value: SortState<T>;
  /** Callback when sort changes */
  onChange: (state: SortState<T>) => void;
  /** localStorage key for persisting preference (optional) */
  storageKey?: string;
  /** Additional CSS class name */
  className?: string;
  /** Custom styles */
  style?: CSSProperties;
  /** Disabled state */
  disabled?: boolean;
  /** Compact mode (smaller button) */
  compact?: boolean;
  /** Placeholder text when no option selected */
  placeholder?: string;
}

// Predefined common sort options (labels are i18n keys, translated inside the component)
export const COMMON_SORT_OPTIONS = {
  NAME_ASC: {
    id: 'name-asc',
    label: 'common.sort.nameAsc',
    icon: 'type' as IconName,
    defaultDirection: 'asc' as SortDirection,
  },
  NAME_DESC: {
    id: 'name-desc',
    label: 'common.sort.nameDesc',
    icon: 'type' as IconName,
    defaultDirection: 'desc' as SortDirection,
  },
  DATE_NEWEST: {
    id: 'date-newest',
    label: 'common.sort.dateNewest',
    icon: 'calendar' as IconName,
    defaultDirection: 'desc' as SortDirection,
  },
  DATE_OLDEST: {
    id: 'date-oldest',
    label: 'common.sort.dateOldest',
    icon: 'calendar' as IconName,
    defaultDirection: 'asc' as SortDirection,
  },
  COMPOSER: {
    id: 'composer',
    label: 'common.sort.composer',
    icon: 'music' as IconName,
    defaultDirection: 'asc' as SortDirection,
  },
  LAST_VIEWED: {
    id: 'last-viewed',
    label: 'common.sort.lastViewed',
    icon: 'clock' as IconName,
    defaultDirection: 'desc' as SortDirection,
  },
};

// Default options for music-related lists
export const DEFAULT_MUSIC_SORT_OPTIONS: SortOption[] = [
  COMMON_SORT_OPTIONS.NAME_ASC,
  COMMON_SORT_OPTIONS.NAME_DESC,
  COMMON_SORT_OPTIONS.DATE_NEWEST,
  COMMON_SORT_OPTIONS.DATE_OLDEST,
  COMMON_SORT_OPTIONS.COMPOSER,
  COMMON_SORT_OPTIONS.LAST_VIEWED,
];

function SortDropdownComponent<T extends string = string>({
  options,
  value,
  onChange,
  storageKey,
  className = '',
  style,
  disabled = false,
  compact = false,
  placeholder,
}: SortDropdownProps<T>) {
  const { t } = useTranslation();
  const { isDark } = useDarkMode();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 200,
  });

  const currentOption = options.find((opt) => opt.id === value.sortBy);
  // Labels may be i18n keys (e.g. COMMON_SORT_OPTIONS) or literal strings; fall back to the literal
  const optionLabel = useCallback((label: string) => t(label, label), [t]);
  const placeholderText = placeholder ?? t('common.sort.placeholder');

  // Load from localStorage on mount
  useEffect(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as SortState<T>;
          // Validate that the stored option exists
          if (options.some((opt) => opt.id === parsed.sortBy)) {
            onChange(parsed);
          }
        }
      } catch {
        // Ignore invalid stored data
      }
    }
  }, [storageKey, options]); // Intentionally not including onChange to prevent loops

  // Save to localStorage when value changes
  useEffect(() => {
    if (storageKey && value.sortBy) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // localStorage might be full or disabled
      }
    }
  }, [storageKey, value]);

  // Update dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
      });
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (option: SortOption<T>) => {
      const isSameOption = option.id === value.sortBy;
      const newDirection: SortDirection =
        isSameOption && !option.disableDirectionToggle
          ? value.direction === 'asc'
            ? 'desc'
            : 'asc'
          : (option.defaultDirection ?? 'asc');

      onChange({
        sortBy: option.id,
        direction: newDirection,
      });
      setIsOpen(false);
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown' && isOpen) {
        event.preventDefault();
        const items = dropdownRef.current?.querySelectorAll('[role="option"]');
        (items?.[0] as HTMLElement)?.focus();
      }
    },
    [isOpen],
  );

  const handleItemKeyDown = useCallback(
    (event: React.KeyboardEvent, option: SortOption<T>, index: number) => {
      const items = dropdownRef.current?.querySelectorAll('[role="option"]');
      if (!items) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = items[index + 1] as HTMLElement;
        if (next) next.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (index === 0) {
          buttonRef.current?.focus();
        } else {
          (items[index - 1] as HTMLElement)?.focus();
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect(option);
      }
    },
    [handleSelect],
  );

  const buttonStyles: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: compact ? '0.375rem 0.75rem' : '0.5rem 1rem',
    backgroundColor: isDark ? 'var(--surface)' : '#ffffff',
    border: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    borderRadius: 'var(--radius-sm)',
    fontSize: compact ? 'var(--font-size-sm)' : 'var(--font-size-md)',
    fontWeight: 'var(--font-weight-medium)',
    color: isDark ? 'var(--text)' : '#1f2937',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all var(--transition-fast)',
    minWidth: compact ? 'auto' : '150px',
    ...style,
  };

  const dropdownStyles: CSSProperties = {
    position: 'fixed',
    top: dropdownPosition.top,
    left: dropdownPosition.left,
    minWidth: dropdownPosition.width,
    maxWidth: '300px',
    zIndex: 'var(--z-dropdown)',
    backgroundColor: isDark ? 'var(--surface)' : '#ffffff',
    border: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  };

  // Background color (including :hover) is handled via the
  // .sort-dropdown-option CSS classes in index.css to avoid per-item state.
  const itemStyles = (isSelected: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.625rem 1rem',
    color: isSelected ? 'var(--primary)' : isDark ? 'var(--text)' : '#1f2937',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    fontSize: 'var(--font-size-sm)',
    fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
    transition: 'background-color var(--transition-fast)',
  });

  const DirectionIndicator = ({ isAsc }: { isAsc: boolean }) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-muted)',
        marginLeft: 'auto',
      }}
      aria-hidden={true}
    >
      {isAsc ? <Icon name="chevronUp" size={14} /> : <Icon name="chevronDown" size={14} />}
    </span>
  );

  return (
    <div className={`sort-dropdown ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        style={buttonStyles}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${t('common.sort.sortBy')}: ${currentOption ? optionLabel(currentOption.label) : placeholderText}`}
      >
        {currentOption?.icon && <Icon name={currentOption.icon} size={16} aria-hidden={true} />}
        <span style={{ flex: 1, textAlign: 'left' }}>
          {currentOption ? optionLabel(currentOption.label) : placeholderText}
        </span>
        {currentOption && !currentOption.disableDirectionToggle && (
          <DirectionIndicator isAsc={value.direction === 'asc'} />
        )}
        <Icon
          name={isOpen ? 'chevronUp' : 'chevronDown'}
          size={16}
          aria-hidden={true}
          style={{ marginLeft: '0.25rem' }}
        />
      </button>

      {isOpen &&
        createPortal(
          <div ref={dropdownRef} style={dropdownStyles}>
            <ul
              style={{ listStyle: 'none', margin: 0, padding: '0.25rem 0' }}
              role="listbox"
              aria-label={t('common.sort.options')}
            >
              {options.map((option, index) => {
                const isSelected = option.id === value.sortBy;

                return (
                  <li key={option.id} role="none">
                    <button
                      type="button"
                      role="option"
                      className={`sort-dropdown-option${isSelected ? ' sort-dropdown-option--selected' : ''}`}
                      style={itemStyles(isSelected)}
                      onClick={() => handleSelect(option)}
                      onKeyDown={(e) => handleItemKeyDown(e, option, index)}
                      aria-selected={isSelected}
                    >
                      {option.icon && <Icon name={option.icon} size={16} aria-hidden={true} />}
                      <span>{optionLabel(option.label)}</span>
                      {isSelected && (
                        <>
                          {!option.disableDirectionToggle && <DirectionIndicator isAsc={value.direction === 'asc'} />}
                          <Icon name="check" size={16} style={{ color: 'var(--primary)' }} aria-hidden={true} />
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Footer with clear option */}
            <div
              style={{
                borderTop: `1px solid ${isDark ? 'var(--border)' : '#e5e7eb'}`,
                padding: '0.5rem 1rem',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                }}
                onClick={() => setIsOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Memoize the component
export const SortDropdown = memo(SortDropdownComponent) as typeof SortDropdownComponent;

/**
 * Hook for managing sort state with localStorage persistence
 */
export function useSortState<T extends string = string>(
  defaultSortBy: T,
  defaultDirection: SortDirection = 'asc',
  storageKey?: string,
): [SortState<T>, (state: SortState<T>) => void] {
  const [sortState, setSortState] = useState<SortState<T>>(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.sortBy && parsed.direction) {
            return parsed as SortState<T>;
          }
        }
      } catch {
        // Ignore
      }
    }
    return { sortBy: defaultSortBy, direction: defaultDirection };
  });

  const updateSortState = useCallback(
    (newState: SortState<T>) => {
      setSortState(newState);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(newState));
        } catch {
          // Ignore
        }
      }
    },
    [storageKey],
  );

  return [sortState, updateSortState];
}

export default SortDropdown;
