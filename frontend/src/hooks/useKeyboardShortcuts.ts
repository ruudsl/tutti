import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description: string;
  category?: 'navigation' | 'actions' | 'general';
  sequence?: string; // For multi-key sequences like 'G H'
}

interface KeyboardShortcutsState {
  isHelpOpen: boolean;
  pendingSequence: string | null;
}

// Event emitter for keyboard shortcuts
type ShortcutEventListener = (event: string, data?: unknown) => void;
const shortcutListeners: ShortcutEventListener[] = [];

export function addShortcutListener(listener: ShortcutEventListener) {
  shortcutListeners.push(listener);
  return () => {
    const index = shortcutListeners.indexOf(listener);
    if (index > -1) {
      shortcutListeners.splice(index, 1);
    }
  };
}

function emitShortcutEvent(event: string, data?: unknown) {
  shortcutListeners.forEach((listener) => listener(event, data));
}

// Global state for keyboard shortcuts
let globalState: KeyboardShortcutsState = {
  isHelpOpen: false,
  pendingSequence: null,
};

const stateListeners: Set<() => void> = new Set();

function setGlobalState(update: Partial<KeyboardShortcutsState>) {
  let changed = false;
  for (const key in update) {
    const k = key as keyof KeyboardShortcutsState;
    if (globalState[k] !== update[k]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  globalState = { ...globalState, ...update };
  stateListeners.forEach((listener) => listener());
}

/**
 * @description Hook for accessing global keyboard shortcuts state.
 * Provides state and controls for the shortcuts help dialog and pending sequences.
 *
 * @returns {Object} Shortcuts state and controls
 * @returns {boolean} returns.isHelpOpen - Whether help dialog is open
 * @returns {string | null} returns.pendingSequence - Current pending key sequence (e.g., 'G')
 * @returns {Function} returns.openHelp - Open the help dialog
 * @returns {Function} returns.closeHelp - Close the help dialog
 * @returns {Function} returns.toggleHelp - Toggle the help dialog
 *
 * @example
 * ```tsx
 * function ShortcutsHelpDialog() {
 *   const { isHelpOpen, closeHelp, pendingSequence } = useKeyboardShortcutsState();
 *
 *   return (
 *     <>
 *       {pendingSequence && <PendingKeyIndicator sequence={pendingSequence} />}
 *       {isHelpOpen && <HelpModal onClose={closeHelp} />}
 *     </>
 *   );
 * }
 * ```
 */
export function useKeyboardShortcutsState() {
  const [state, setState] = useState(globalState);

  useEffect(() => {
    const listener = () => setState({ ...globalState });
    stateListeners.add(listener);
    return () => {
      stateListeners.delete(listener);
    };
  }, []);

  return {
    ...state,
    openHelp: () => setGlobalState({ isHelpOpen: true }),
    closeHelp: () => setGlobalState({ isHelpOpen: false }),
    toggleHelp: () => setGlobalState({ isHelpOpen: !globalState.isHelpOpen }),
  };
}

const EMPTY_SHORTCUTS: Shortcut[] = [];

/**
 * @description Hook for registering keyboard shortcuts with support for modifier keys and sequences.
 * Provides default navigation shortcuts and allows custom shortcut registration.
 * Supports key sequences like 'G H' for go-to navigation.
 *
 * @param {Shortcut[]} additionalShortcuts - Additional shortcuts to register
 *
 * @returns {Shortcut[]} All registered shortcuts (default + additional)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const shortcuts = useKeyboardShortcuts([
 *     {
 *       key: 'n',
 *       ctrl: true,
 *       action: () => openNewItemDialog(),
 *       description: 'shortcuts.newItem',
 *       category: 'actions'
 *     },
 *     {
 *       key: 'd',
 *       sequence: 'g',
 *       action: () => navigate('/dashboard'),
 *       description: 'shortcuts.goDashboard',
 *       category: 'navigation'
 *     }
 *   ]);
 *
 *   return <div>Press ? for shortcuts help</div>;
 * }
 * ```
 */
export function useKeyboardShortcuts(additionalShortcuts: Shortcut[] = EMPTY_SHORTCUTS) {
  const navigate = useNavigate();
  const sequenceTimeoutRef = useRef<number | null>(null);
  const pendingKeyRef = useRef<string | null>(null);

  // Clear sequence timeout
  const clearSequence = useCallback(() => {
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
      sequenceTimeoutRef.current = null;
    }
    pendingKeyRef.current = null;
    setGlobalState({ pendingSequence: null });
  }, []);

  // Default navigation shortcuts (memoized so identity is stable across renders)
  const defaultShortcuts = useMemo<Shortcut[]>(() => [
    // General
    {
      key: '?',
      action: () => setGlobalState({ isHelpOpen: true }),
      description: 'shortcuts.showHelp',
      category: 'general',
    },
    {
      key: 'Escape',
      action: () => {
        if (globalState.isHelpOpen) {
          setGlobalState({ isHelpOpen: false });
        }
        emitShortcutEvent('close');
      },
      description: 'shortcuts.closeModal',
      category: 'general',
    },

    // Ctrl/Cmd shortcuts
    {
      key: 'k',
      ctrl: true,
      action: () => emitShortcutEvent('openSearch'),
      description: 'shortcuts.openSearch',
      category: 'actions',
    },
    {
      key: 'n',
      ctrl: true,
      action: () => emitShortcutEvent('newItem'),
      description: 'shortcuts.newItem',
      category: 'actions',
    },
    {
      key: 's',
      ctrl: true,
      action: () => emitShortcutEvent('save'),
      description: 'shortcuts.save',
      category: 'actions',
    },

    // Go-to navigation (G + key sequences)
    { key: 'h', sequence: 'g', action: () => navigate('/'), description: 'shortcuts.goHome', category: 'navigation' },
    { key: 'm', sequence: 'g', action: () => navigate('/my-music'), description: 'shortcuts.goMyMusic', category: 'navigation' },
    { key: 's', sequence: 'g', action: () => navigate('/settings'), description: 'shortcuts.goSettings', category: 'navigation' },
    { key: 'l', sequence: 'g', action: () => navigate('/lists'), description: 'shortcuts.goLists', category: 'navigation' },
    { key: 'r', sequence: 'g', action: () => navigate('/rehearsals'), description: 'shortcuts.goRehearsals', category: 'navigation' },
    { key: 'p', sequence: 'g', action: () => navigate('/profile'), description: 'shortcuts.goProfile', category: 'navigation' },
    { key: 't', sequence: 'g', action: () => navigate('/titles'), description: 'shortcuts.goTitles', category: 'navigation' },
    { key: 'c', sequence: 'g', action: () => navigate('/concerts'), description: 'shortcuts.goConcerts', category: 'navigation' },
    { key: 'u', sequence: 'g', action: () => navigate('/upload'), description: 'shortcuts.goUpload', category: 'navigation' },

    // Alt + key navigation (legacy support)
    { key: 'h', alt: true, action: () => navigate('/'), description: 'shortcuts.goHome', category: 'navigation' },
    { key: 'm', alt: true, action: () => navigate('/my-music'), description: 'shortcuts.goMyMusic', category: 'navigation' },
    { key: 'l', alt: true, action: () => navigate('/lists'), description: 'shortcuts.goLists', category: 'navigation' },
    { key: 't', alt: true, action: () => navigate('/titles'), description: 'shortcuts.goTitles', category: 'navigation' },
    { key: 'u', alt: true, action: () => navigate('/upload'), description: 'shortcuts.goUpload', category: 'navigation' },
    { key: 'r', alt: true, action: () => navigate('/rehearsals'), description: 'shortcuts.goRehearsals', category: 'navigation' },
    { key: 'p', alt: true, action: () => navigate('/profile'), description: 'shortcuts.goProfile', category: 'navigation' },
    { key: 's', alt: true, action: () => navigate('/settings'), description: 'shortcuts.goSettings', category: 'navigation' },
    {
      key: '/',
      ctrl: true,
      action: () => {
        const searchInput = document.querySelector(
          'input[type="search"], input[placeholder*="zoek"], input[placeholder*="Zoek"], input[placeholder*="search"], input[placeholder*="Search"]'
        ) as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      },
      description: 'shortcuts.focusSearch',
      category: 'actions',
    },
  ], [navigate]);

  const allShortcuts = useMemo(
    () => [...defaultShortcuts, ...additionalShortcuts],
    [defaultShortcuts, additionalShortcuts]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input (except for Escape and Ctrl shortcuts)
      const isInInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      if (isInInput) {
        // Allow Escape to blur inputs
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
          clearSequence();
          return;
        }
        // Allow Ctrl/Cmd shortcuts in inputs
        if (!e.ctrlKey && !e.metaKey) {
          return;
        }
      }

      // Check for sequence shortcuts (like G H)
      if (pendingKeyRef.current) {
        const pendingKey = pendingKeyRef.current.toLowerCase();
        const sequenceShortcut = allShortcuts.find(
          (s) =>
            s.sequence?.toLowerCase() === pendingKey &&
            s.key.toLowerCase() === e.key.toLowerCase() &&
            !s.ctrl &&
            !s.alt &&
            !s.shift &&
            !s.meta
        );

        clearSequence();

        if (sequenceShortcut) {
          e.preventDefault();
          sequenceShortcut.action();
          return;
        }
      }

      // Check if this could be the start of a sequence
      const couldBeSequence = allShortcuts.some(
        (s) => s.sequence?.toLowerCase() === e.key.toLowerCase()
      );

      if (couldBeSequence && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        pendingKeyRef.current = e.key;
        setGlobalState({ pendingSequence: e.key.toUpperCase() });
        // Clear sequence after 1 second
        sequenceTimeoutRef.current = window.setTimeout(() => {
          clearSequence();
        }, 1000);
        return;
      }

      // Check for regular shortcuts
      for (const shortcut of allShortcuts) {
        // Skip sequence shortcuts
        if (shortcut.sequence) continue;

        const ctrlMatch = shortcut.ctrl
          ? e.ctrlKey || e.metaKey
          : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;

        // Handle special keys
        let keyMatch: boolean;
        if (shortcut.key === '?') {
          keyMatch = e.key === '?' || (e.shiftKey && e.key === '/');
        } else {
          keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        }

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [allShortcuts, clearSequence]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearSequence();
    };
  }, [handleKeyDown, clearSequence]);

  return allShortcuts;
}

/**
 * @description Hook for getting formatted keyboard shortcut labels grouped by category.
 * Useful for displaying a shortcuts help dialog.
 *
 * @returns {Record<string, Array<{label: string, description: string}>>} Shortcuts grouped by category
 *
 * @example
 * ```tsx
 * function ShortcutsHelp() {
 *   const groupedShortcuts = useKeyboardShortcutsHelp();
 *
 *   return (
 *     <div>
 *       {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
 *         <section key={category}>
 *           <h3>{category}</h3>
 *           {shortcuts.map(({ label, description }) => (
 *             <div key={label}>
 *               <kbd>{label}</kbd> <span>{t(description)}</span>
 *             </div>
 *           ))}
 *         </section>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useKeyboardShortcutsHelp() {
  const shortcuts = useKeyboardShortcuts();

  const getShortcutLabel = (shortcut: Shortcut): string => {
    const isMac =
      typeof navigator !== 'undefined' &&
      navigator.platform.toLowerCase().includes('mac');
    const parts: string[] = [];

    if (shortcut.sequence) {
      parts.push(shortcut.sequence.toUpperCase());
      parts.push(shortcut.key.toUpperCase());
      return parts.join(' ');
    }

    if (shortcut.ctrl) parts.push(isMac ? 'Cmd' : 'Ctrl');
    if (shortcut.alt) parts.push(isMac ? 'Option' : 'Alt');
    if (shortcut.shift) parts.push('Shift');

    // Handle special keys
    let keyLabel = shortcut.key.toUpperCase();
    if (shortcut.key === 'Escape') keyLabel = 'Esc';
    if (shortcut.key === '/') keyLabel = '/';
    if (shortcut.key === '?') keyLabel = '?';

    parts.push(keyLabel);
    return parts.join('+');
  };

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      const category = shortcut.category || 'general';
      if (!acc[category]) acc[category] = [];

      // Filter out duplicates (alt shortcuts that duplicate sequence shortcuts)
      const existing = acc[category].find(
        (s) => s.description === shortcut.description
      );
      if (!existing) {
        acc[category].push({
          label: getShortcutLabel(shortcut),
          description: shortcut.description,
        });
      }

      return acc;
    },
    {} as Record<string, { label: string; description: string }[]>
  );

  return groupedShortcuts;
}

/**
 * @description Hook for listening to specific shortcut events emitted by the keyboard system.
 * Useful for components that need to respond to shortcuts without registering them.
 *
 * @param {string} event - The event name to listen for (e.g., 'openSearch', 'save', 'close')
 * @param {Function} callback - Function to call when event is triggered
 * @param {React.DependencyList} deps - Dependencies for the callback
 *
 * @example
 * ```tsx
 * function SearchDialog() {
 *   const [isOpen, setIsOpen] = useState(false);
 *
 *   useShortcutEvent('openSearch', () => setIsOpen(true), []);
 *   useShortcutEvent('close', () => setIsOpen(false), []);
 *
 *   return isOpen ? <SearchModal onClose={() => setIsOpen(false)} /> : null;
 * }
 * ```
 */
export function useShortcutEvent(
  event: string,
  callback: () => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const listener: ShortcutEventListener = (e) => {
      if (e === event) {
        callback();
      }
    };
    return addShortcutListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
