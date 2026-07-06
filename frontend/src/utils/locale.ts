/**
 * Locale Utilities
 *
 * Central helper for resolving the active Intl locale from the current
 * i18next language. Use this instead of hardcoding 'nl-NL' at call sites.
 *
 * @module utils/locale
 */

import i18n from '../i18n';

/** Maps i18next language codes to full Intl locale identifiers */
const LOCALE_MAP: Record<string, string> = {
  nl: 'nl-NL',
  en: 'en-GB',
  de: 'de-DE',
};

const DEFAULT_LOCALE = 'nl-NL';

/**
 * Returns the Intl locale for the currently active i18next language.
 *
 * @returns {string} Locale identifier (e.g., "nl-NL", "en-GB", "de-DE")
 * @example
 * new Intl.DateTimeFormat(currentLocale(), { day: 'numeric' }).format(date);
 */
export function currentLocale(): string {
  const lang = (i18n.language || 'nl').split('-')[0];
  return LOCALE_MAP[lang] ?? DEFAULT_LOCALE;
}
