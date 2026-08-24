import { useTranslation } from 'react-i18next';
import { availableLanguages, laadTaal, languageNames } from '../i18n';

const languageFlags: Record<string, string> = {
  nl: '🇳🇱',
  en: '🇬🇧',
  de: '🇩🇪',
};

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  // Engels en Duits zitten niet in de hoofdbundel. Eerst het taalbestand
  // ophalen en dan pas omschakelen, anders staat het scherm een tel lang vol
  // met kale sleutels als `nav.members`.
  const handleChange = (lang: string) => {
    void laadTaal(lang).then(() => i18n.changeLanguage(lang));
  };

  if (compact) {
    return (
      <div className="language-switcher-compact" role="group" aria-label={t('accessibility.languageSwitcher')}>
        {availableLanguages.map((lang) => (
          <button
            key={lang}
            className={`lang-btn ${i18n.language === lang ? 'active' : ''}`}
            onClick={() => handleChange(lang)}
            aria-label={languageNames[lang]}
            aria-pressed={i18n.language === lang}
          >
            <span aria-hidden="true">{languageFlags[lang]}</span>
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
      aria-label={t('accessibility.languageSwitcher')}
    >
      {availableLanguages.map((lang) => (
        <option key={lang} value={lang}>
          {languageFlags[lang]} {languageNames[lang]}
        </option>
      ))}
    </select>
  );
}
