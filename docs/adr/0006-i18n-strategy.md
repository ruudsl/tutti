# 6. Internationalization Strategy

Date: 2024-01-15

## Status
Accepted

## Context
Tutti is designed for music associations in the Netherlands, Germany, and Belgium. These regions have users who speak:
- Dutch (Netherlands, Belgium)
- German (Germany, Austria, Switzerland)
- English (international members, fallback)

We needed an internationalization (i18n) strategy that supports:
- Multiple languages with easy switching
- Date and number formatting per locale
- Translation management (adding new strings, updating translations)
- Developer experience (autocompletion, type safety)

Options considered:
- **i18next**: Popular, flexible, extensive ecosystem
- **react-intl (FormatJS)**: ICU message format, good for complex pluralization
- **LinguiJS**: Compile-time extraction, smaller bundle
- **Custom solution**: Simple object lookup

## Decision
We chose i18next with react-i18next for internationalization.

Supported languages:
- **nl** (Dutch) - Primary language
- **de** (German)
- **en** (English) - Fallback language

Architecture:
- JSON translation files per language (`locales/nl.json`, `locales/en.json`, `locales/de.json`)
- Browser language detection with manual override
- User preference stored in localStorage
- Namespace-based organization for large translation files

Reasons for this decision:
1. **Mature ecosystem**: Large community, extensive documentation, many plugins
2. **React integration**: `react-i18next` provides hooks (`useTranslation`) and components
3. **Browser detection**: `i18next-browser-languagedetector` handles automatic language selection
4. **Interpolation**: Easy variable substitution in translations
5. **Pluralization**: Built-in plural rules for all supported languages
6. **Lazy loading**: Can load translations on demand (not currently used, files are small)

## Consequences

### Positive
- Consistent approach to all user-facing text
- Easy to add new languages in the future
- Users can switch languages without page reload
- Dates and numbers formatted according to locale
- Fallback to English if translation is missing

### Negative
- All translation keys must be maintained in sync across languages
- Large JSON files can be unwieldy (200KB+ per language)
- No compile-time checking for missing translations
- Developers must remember to use translation functions

### Implementation Details
- Translation files: `frontend/src/locales/{nl,en,de}.json`
- Language detection order: localStorage > browser > default (nl)
- Date formatting: `date-fns` with locale-aware formatting
- LanguageSwitcher component in header for manual selection
- Translation keys use dot notation: `music.title`, `rehearsals.attendance`

### Translation Workflow
1. Developer adds new UI text with `t('namespace.key')` 
2. Add English translation to `en.json`
3. Request translations for Dutch and German
4. Update `nl.json` and `de.json`
5. Missing keys fall back to English
