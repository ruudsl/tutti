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
        let keyMatch = false;
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

// Hook to get formatted shortcut labels
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

// Hook to listen for specific shortcut events
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
