import { useTranslation } from 'react-i18next';
import { useDarkMode } from '../hooks/useDarkMode';
import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

export function DarkModeToggle() {
  const { t } = useTranslation();
  const { isDark, toggleDarkMode, mode } = useDarkMode();

  const iconName = mode === 'system' ? 'monitor' : isDark ? 'moon' : 'sun';

  // Get tooltip text based on current mode
  const getTooltipText = () => {
    if (mode === 'system') {
      return 'Automatisch (systeem)';
    }
    return isDark ? 'Donkere modus' : 'Lichte modus';
  };

  return (
    <Tooltip content={getTooltipText()} position="bottom">
      <button
        className="dark-mode-toggle"
        onClick={toggleDarkMode}
        aria-label={t('darkMode.toggle')}
        aria-pressed={isDark}
      >
        <span className="dark-mode-icon" aria-hidden="true">
          <Icon name={iconName} size={18} />
        </span>
      </button>
    </Tooltip>
  );
}
