import { useTranslation } from 'react-i18next';
import type { Season } from '../../api';

/**
 * Het gekleurde label bij de status van een seizoen.
 *
 * Was `getStatusBadge`, een functie binnen de hoofdcomponent die opmaak
 * teruggaf. De detailweergave en het seizoenentabblad gebruiken hem allebei;
 * als component haalt elk van beide hem zelf op in plaats van hem als prop
 * doorgereikt te krijgen.
 */
export function SeizoenStatus({ status }: { status: Season['status'] }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    draft: 'secondary',
    active: 'success',
    completed: 'primary',
  };
  return <span className={`badge badge-${colors[status]}`}>{t(`seasonPlanner.status.${status}`)}</span>;
}
