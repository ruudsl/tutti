import { useState, useEffect, useCallback } from 'react';

type DarkModePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'harmonie-dark-mode';

export function useDarkMode() {
  const [mode, setMode] = useState<DarkModePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Calculate if dark mode is active
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark);

  // Apply dark mode class to document
  useEffect(() => {
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark-mode');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark-mode');
      root.setAttribute('data-theme', 'light');
    }
  }, [isDark]);

  // Persist preference
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleDarkMode = useCallback(() => {
    setMode((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  }, []);

  const setDarkMode = useCallback((newMode: DarkModePreference) => {
    setMode(newMode);
  }, []);

  return {
    isDark,
    mode,
    toggleDarkMode,
    setDarkMode,
  };
}
