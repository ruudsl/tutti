import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';

export function DarkModeToggle() {
  const { t } = useTranslation();
  const { isDark, toggleDarkMode, mode } = useDarkMode();

  return (
    <button
      className="dark-mode-toggle"
      onClick={toggleDarkMode}
      title={t('darkMode.toggle')}
      aria-label={t('darkMode.toggle')}
      aria-pressed={isDark}
    >
      <span className="dark-mode-icon" aria-hidden="true">
        {mode === 'system' ? '🖥️' : isDark ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
