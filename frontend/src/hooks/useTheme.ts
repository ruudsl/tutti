import { useEffect, useState } from 'react';
import type { ThemeSettings } from '../types';

const FONT_FAMILIES: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
};

/**
 * @description Hook for managing application theme settings.
 * Maps theme settings to CSS custom properties and applies them to the document root.
 * Automatically fetches theme on mount and listens for 'theme-updated' events.
 *
 * @returns {Object} Theme state and controls
 * @returns {ThemeSettings | null} returns.theme - Current theme settings
 * @returns {Function} returns.applyTheme - Manually apply theme settings
 *
 * @example
 * ```tsx
 * function ThemeProvider({ children }: { children: React.ReactNode }) {
 *   const { theme, applyTheme } = useTheme();
 *
 *   // Theme is automatically applied, but can be customized:
 *   const handleReset = () => applyTheme(null);
 *
 *   return (
 *     <ThemeContext.Provider value={{ theme, reset: handleReset }}>
 *       {children}
 *     </ThemeContext.Provider>
 *   );
 * }
 * ```
 */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings | null>(null);

  const applyTheme = (t: ThemeSettings | null) => {
    const root = document.documentElement;

    if (!t) {
      // Remove all custom theme properties, revert to CSS defaults
      const props = [
        '--primary',
        '--primary-dark',
        '--secondary',
        '--success',
        '--danger',
        '--warning',
        '--background',
        '--surface',
        '--text',
        '--text-light',
        '--border',
        '--font-family',
        '--font-size-base',
        '--radius',
        '--radius-sm',
        '--radius-lg',
      ];
      props.forEach((p) => root.style.removeProperty(p));
      return;
    }

    // Colors
    if (t.primaryColor) root.style.setProperty('--primary', t.primaryColor);
    if (t.primaryDarkColor) root.style.setProperty('--primary-dark', t.primaryDarkColor);
    if (t.secondaryColor) root.style.setProperty('--secondary', t.secondaryColor);
    if (t.successColor) root.style.setProperty('--success', t.successColor);
    if (t.dangerColor) root.style.setProperty('--danger', t.dangerColor);
    if (t.warningColor) root.style.setProperty('--warning', t.warningColor);
    if (t.backgroundColor) root.style.setProperty('--background', t.backgroundColor);
    if (t.surfaceColor) root.style.setProperty('--surface', t.surfaceColor);
    if (t.textColor) root.style.setProperty('--text', t.textColor);
    if (t.textLightColor) root.style.setProperty('--text-light', t.textLightColor);
    if (t.borderColor) root.style.setProperty('--border', t.borderColor);

    // Update focus ring based on primary color
    if (t.primaryColor) {
      const r = parseInt(t.primaryColor.slice(1, 3), 16);
      const g = parseInt(t.primaryColor.slice(3, 5), 16);
      const b = parseInt(t.primaryColor.slice(5, 7), 16);
      root.style.setProperty('--focus-ring', `0 0 0 3px rgba(${r}, ${g}, ${b}, 0.4)`);
    }

    // Font family
    if (t.fontFamily && FONT_FAMILIES[t.fontFamily]) {
      root.style.setProperty('--font-family', FONT_FAMILIES[t.fontFamily]);
    }

    // Font size
    if (t.fontSizeBase) {
      root.style.setProperty('--font-size-base', `${t.fontSizeBase}px`);
    }

    // Border radius
    if (t.borderRadius !== undefined) {
      const r = Number(t.borderRadius);
      root.style.setProperty('--radius', `${r}rem`);
      root.style.setProperty('--radius-sm', `${Math.max(0, r * 0.5)}rem`);
      root.style.setProperty('--radius-lg', `${r * 1.5}rem`);
    }
  };

  const loadTheme = async () => {
    try {
      const res = await fetch('/api/settings/theme');
      if (res.ok) {
        const data = await res.json();
        setTheme(data.theme);
        applyTheme(data.theme);
      }
    } catch (error) {
      console.warn('Failed to load theme settings, using defaults:', error);
    }
  };

  useEffect(() => {
    loadTheme();

    const handler = () => loadTheme();
    window.addEventListener('theme-updated', handler);
    return () => window.removeEventListener('theme-updated', handler);
  }, []);

  return { theme, applyTheme };
}
