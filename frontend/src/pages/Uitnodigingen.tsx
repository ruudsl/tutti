import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { UitnodigingenBeheer } from '../components/UitnodigingenBeheer';

/**
 * Uitnodigingen voor de eigen vereniging. Stond eerder alleen als tabblad op
 * Verenigingen Beheer, en dat ziet alleen een superbeheerder; de server liet
 * het uitnodigen wel al aan beheerder en bestuur.
 */
export default function Uitnodigingen() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.uitnodigingen');

  return (
    <div>
      <h1 className="sr-only">{t('nav.uitnodigingen')}</h1>
      <UitnodigingenBeheer />
    </div>
  );
}
