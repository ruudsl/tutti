import { useTranslation } from 'react-i18next';
import { availableLanguages, languageNames } from '../i18n';

const languageFlags: Record<string, string> = {
  nl: '🇳🇱',
  en: '🇬🇧',
  de: '🇩🇪',
};

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  if (compact) {
    return (
      <div className="language-switcher-compact">
        {availableLanguages.map((lang) => (
          <button
            key={lang}
            className={`lang-btn ${i18n.language === lang ? 'active' : ''}`}
            onClick={() => handleChange(lang)}
            title={languageNames[lang]}
          >
            {languageFlags[lang]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      className="language-switcher"
      value={i18n.language}
      onChange={(e) => handleChange(e.target.value)}
    >
      {availableLanguages.map((lang) => (
        <option key={lang} value={lang}>
          {languageFlags[lang]} {languageNames[lang]}
        </option>
      ))}
    </select>
  );
}
