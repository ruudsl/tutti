import { currentLocale } from '../../utils/locale';

/**
 * Een datum opmaken in de taal van de gebruiker.
 *
 * Stond als hulpfunctie binnen de hoofdcomponent, maar hangt nergens van af.
 * Nu de weergaven eigen bestanden zijn, zou hij anders aan de detailweergave,
 * twee wizardstappen én het seizoenentabblad doorgegeven moeten worden - vier
 * keer dezelfde pure functie doorgeven omdat hij toevallig in een component
 * stond.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(currentLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
