import { currentLocale } from '../../utils/locale';

/**
 * Bedragen opmaken in euro's, in de taal van de gebruiker.
 *
 * Stond als hulpfunctie binnen de hoofdcomponent. Nu de tabbladen eigen
 * bestanden worden, zou hij anders als prop aan elk van hen doorgegeven moeten
 * worden - zeven keer dezelfde pure functie doorgeven omdat hij toevallig in
 * een component stond.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'EUR' }).format(amount);
}
