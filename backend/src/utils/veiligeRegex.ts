/**
 * Een patroon dat een beheerder zelf opgeeft, veilig toetsen aan invoer van
 * een lid.
 *
 * Waarom een tijdsbudget en niet alleen een controle bij het opslaan: een
 * reguliere expressie kan bij sommige invoer exponentieel lang terugzoeken, en
 * zolang dat duurt staat het hele proces stil - voor elke vereniging. Een lijst
 * met "verboden" vormen (geneste kwantoren en dergelijke) is nooit volledig;
 * er zijn altijd varianten die erdoorheen glippen. Een maximale invoerlengte
 * helpt evenmin: de gevaarlijke patronen lopen al vast op enkele tientallen
 * tekens. Wat wel een harde grens geeft zonder nieuwe afhankelijkheid is
 * `vm` uit Node zelf: V8 kan een lopende reguliere expressie onderbreken, en
 * `timeout` doet dat na het opgegeven aantal milliseconden. Bij het opslaan
 * controleren we daarnaast alleen of het patroon geldig en niet absurd lang is,
 * zodat een beheerder een fout meteen ziet in plaats van pas bij het eerste lid.
 */

import vm from 'vm';

/** Langer dan dit is geen invoercontrole meer maar een programma. */
export const MAX_PATROON_LENGTE = 200;

/** Ruim genoeg voor elk normaal patroon, kort genoeg om niet te merken. */
export const REGEX_TIJDSBUDGET_MS = 50;

export type RegexUitkomst = 'past' | 'past-niet' | 'onbeslist';

// Eén gedeelde context: een nieuwe per aanroep kost ruim een milliseconde.
// Het toetsen is synchroon, dus twee aanroepen kunnen elkaars waarden niet
// overschrijven.
const context = vm.createContext(Object.create(null));
const toets = new vm.Script('new RegExp(patroon).test(invoer)');

/** Is dit een patroon dat we willen bewaren? Geeft een foutmelding of null. */
export function controleerPatroon(patroon: string): string | null {
  if (patroon.length > MAX_PATROON_LENGTE) {
    return `Het patroon mag hooguit ${MAX_PATROON_LENGTE} tekens lang zijn.`;
  }
  try {
    new RegExp(patroon);
  } catch {
    return 'Het patroon is geen geldige reguliere expressie.';
  }
  return null;
}

/**
 * Toets `invoer` aan `patroon` binnen het tijdsbudget. 'onbeslist' betekent:
 * het patroon is ongeldig of het toetsen duurde te lang.
 */
export function toetsPatroon(patroon: string, invoer: string, budgetMs = REGEX_TIJDSBUDGET_MS): RegexUitkomst {
  context.patroon = patroon;
  context.invoer = invoer;
  try {
    return toets.runInContext(context, { timeout: budgetMs }) === true ? 'past' : 'past-niet';
  } catch {
    return 'onbeslist';
  } finally {
    context.patroon = undefined;
    context.invoer = undefined;
  }
}
