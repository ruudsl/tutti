import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[] = []) {
  const navigate = useNavigate();

  // Default navigation shortcuts
  const defaultShortcuts: Shortcut[] = [
    { key: 'h', alt: true, action: () => navigate('/'), description: 'Ga naar Dashboard' },
    { key: 'm', alt: true, action: () => navigate('/my-music'), description: 'Ga naar Mijn Muziek' },
    { key: 'l', alt: true, action: () => navigate('/lists'), description: 'Ga naar Lijsten' },
    { key: 't', alt: true, action: () => navigate('/titles'), description: 'Ga naar Titels' },
    { key: 'u', alt: true, action: () => navigate('/upload'), description: 'Ga naar Uploaden' },
    { key: 'r', alt: true, action: () => navigate('/rehearsals'), description: 'Ga naar Repetities' },
    { key: 'p', alt: true, action: () => navigate('/profile'), description: 'Ga naar Profiel' },
    { key: 's', alt: true, action: () => navigate('/settings'), description: 'Ga naar Instellingen' },
    { key: '/', ctrl: true, action: () => {
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="zoek"], input[placeholder*="Zoek"]') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }, description: 'Focus zoekveld' },
  ];

  const allShortcuts = [...defaultShortcuts, ...shortcuts];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if user is typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      // Allow Escape to blur inputs
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
      }
      return;
    }

    for (const shortcut of allShortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !e.ctrlKey && !e.metaKey;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;

      if (
        e.key.toLowerCase() === shortcut.key.toLowerCase() &&
        ctrlMatch &&
        shiftMatch &&
        altMatch
      ) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [allShortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return allShortcuts;
}

// Hook to show keyboard shortcuts help
export function useKeyboardShortcutsHelp() {
  const shortcuts = useKeyboardShortcuts();

  const getShortcutLabel = (shortcut: Shortcut): string => {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    parts.push(shortcut.key.toUpperCase());
    return parts.join('+');
  };

  return shortcuts.map((s) => ({
    label: getShortcutLabel(s),
    description: s.description,
  }));
}
