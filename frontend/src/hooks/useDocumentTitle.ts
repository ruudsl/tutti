import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Sets the document title based on the provided i18n key.
 * Falls back to "Harmonie" if no key is provided.
 * Updates automatically when language changes.
 */
export function useDocumentTitle(titleKey: string) {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t(titleKey);
  }, [t, titleKey, i18n.language]);
}
