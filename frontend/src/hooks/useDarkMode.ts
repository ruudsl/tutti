import { useState, useEffect, useCallback } from 'react';

type DarkModePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'harmonie-dark-mode';

// Inline color overrides for dark mode. These have to be applied as inline
// styles on <html> to beat the inline styles set by useTheme (which has higher
// specificity than any class or attribute selector).
const DARK_VARS: Record<string, string> = {
  '--background': '#0f172a',
  '--surface': '#1e293b',
  '--surface-hover': '#334155',
  '--text': '#f1f5f9',
  '--text-light': '#94a3b8',
  '--text-muted': '#64748b',
  '--border': '#334155',
  '--border-strong': '#475569',
  '--shadow': '0 1px 3px rgba(0, 0, 0, 0.3)',
  '--shadow-md': '0 4px 6px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)',
  '--shadow-lg': '0 4px 6px rgba(0, 0, 0, 0.4)',
  '--shadow-xl': '0 10px 25px rgba(0, 0, 0, 0.35)',
};

function applyDarkInlineVars(root: HTMLElement) {
  for (const [key, value] of Object.entries(DARK_VARS)) {
    root.style.setProperty(key, value);
  }
}

function clearDarkInlineVars(root: HTMLElement) {
  for (const key of Object.keys(DARK_VARS)) {
    root.style.removeProperty(key);
  }
}

/**
 * @description Hook for managing dark mode preferences with system preference detection.
 * Supports three modes: 'light', 'dark', and 'system' (follows OS preference).
 * Persists the user's preference to localStorage and applies CSS custom properties
 * for dark mode styling.
 *
 * @returns {Object} Dark mode state and controls
 * @returns {boolean} returns.isDark - Whether dark mode is currently active
 * @returns {boolean} returns.isDarkMode - Alias for isDark
 * @returns {DarkModePreference} returns.mode - Current mode setting ('light' | 'dark' | 'system')
 * @returns {Function} returns.toggleDarkMode - Cycles through modes: light -> dark -> system -> light
 * @returns {Function} returns.setDarkMode - Sets a specific mode
 *
 * @example
 * ```tsx
 * function ThemeToggle() {
 *   const { isDark, mode, toggleDarkMode, setDarkMode } = useDarkMode();
 *
 *   return (
 *     <div>
 *       <p>Current: {mode} (dark: {isDark ? 'yes' : 'no'})</p>
 *       <button onClick={toggleDarkMode}>Toggle</button>
 *       <button onClick={() => setDarkMode('system')}>Use System</button>
 *     </div>
 *   );
 * }
 * ```
 */
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

  // Apply dark mode class + inline variable overrides to document.
  // Inline styles are necessary because useTheme also writes inline styles,
  // and inline styles trump class/attribute selectors. A MutationObserver
  // re-applies dark vars whenever something else (e.g. useTheme's async load)
  // mutates the html element's inline style.
  useEffect(() => {
    const root = document.documentElement;

    if (!isDark) {
      root.classList.remove('dark-mode');
      root.setAttribute('data-theme', 'light');
      clearDarkInlineVars(root);
      return;
    }

    root.classList.add('dark-mode');
    root.setAttribute('data-theme', 'dark');
    applyDarkInlineVars(root);

    let reapplyScheduled = false;
    const observer = new MutationObserver(() => {
      // Bail if any of our dark vars have been clobbered, then reapply once
      // per microtask to avoid feedback loops.
      const stillDark = root.style.getPropertyValue('--background') === DARK_VARS['--background'];
      if (stillDark || reapplyScheduled) return;
      reapplyScheduled = true;
      queueMicrotask(() => {
        reapplyScheduled = false;
        applyDarkInlineVars(root);
      });
    });
    observer.observe(root, { attributes: true, attributeFilter: ['style'] });

    return () => observer.disconnect();
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
    isDarkMode: isDark, // Alias for convenience
    mode,
    toggleDarkMode,
    setDarkMode,
  };
}

export default useDarkMode;
