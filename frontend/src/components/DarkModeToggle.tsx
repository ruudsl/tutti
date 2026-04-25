import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon } from './Icon';

export function DarkModeToggle() {
  const { t } = useTranslation();
  const { isDark, toggleDarkMode, mode } = useDarkMode();

  const iconName = mode === 'system' ? 'monitor' : isDark ? 'moon' : 'sun';

  return (
    <button
      className="dark-mode-toggle"
      onClick={toggleDarkMode}
      title={t('darkMode.toggle')}
      aria-label={t('darkMode.toggle')}
      aria-pressed={isDark}
    >
      <span className="dark-mode-icon" aria-hidden="true">
        <Icon name={iconName} size={18} />
      </span>
    </button>
  );
}
