import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import nl from './locales/nl.json';
import en from './locales/en.json';
import de from './locales/de.json';

const resources = {
  nl: { translation: nl },
  en: { translation: en },
  de: { translation: de },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['nl', 'en', 'de'],

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'language',
    },
  });

export default i18n;

// Helper to get language display name
export const languageNames: Record<string, string> = {
  nl: 'Nederlands',
  en: 'English',
  de: 'Deutsch',
};

// Helper to get available languages
export const availableLanguages = Object.keys(resources);
