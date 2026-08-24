import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Nederlands komt mee in de hoofdbundel, Engels en Duits niet.
//
// Alle drie de vertaalbestanden stonden hier als gewone import, en dat is
// samen 610 KB aan JSON die Rollup in de hoofdbundel legt. Die bundel was
// daardoor 904 KB, waarvan iemand er hooguit een derde van gebruikt: wie de
// applicatie in het Nederlands opent, haalt de Engelse en de Duitse teksten
// ook binnen en doet er niets mee. Dat kostte zowel downloadtijd als
// parseertijd voordat er ook maar iets op het scherm stond - de eerste
// weergave stond in de meting op 3,6 seconden.
//
// Nederlands blijft er statisch in staan, om twee redenen. Het is de taal van
// verreweg de meeste gebruikers, en het is de terugvaltaal: die moet er zijn
// op het moment dat een sleutel in een andere taal ontbreekt. Voor die
// meerderheid is er dus geen extra verzoek en geen extra wachttijd.
//
// De andere twee worden opgehaald op het moment dat iemand ze kiest, of bij
// het opstarten als de taaldetectie ze al had onthouden. Dat is één extra
// rondgang, eenmalig, voor wie de applicatie niet in het Nederlands gebruikt.
import nl from './locales/nl.json';

/**
 * De talen die niet meekomen in de hoofdbundel, met hun lader.
 *
 * Rollup maakt van elke `import()` hieronder een eigen chunk. Ze staan
 * expliciet in een object en niet achter een variabele pad, omdat Rollup dan
 * niet kan zien welke bestanden het betreft en er niets meer te splitsen valt.
 */
const laders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./locales/en.json'),
  de: () => import('./locales/de.json'),
};

export const availableLanguages = ['nl', 'en', 'de'];

// Helper to get language display name
export const languageNames: Record<string, string> = {
  nl: 'Nederlands',
  en: 'English',
  de: 'Deutsch',
};

/**
 * Zorg dat de teksten van `taal` beschikbaar zijn.
 *
 * Doet niets voor Nederlands (die zit al in de bundel) en niets voor een taal
 * die al eerder is opgehaald. Een mislukte download is geen reden om de
 * applicatie te laten hangen: dan valt i18next terug op het Nederlands, en dat
 * is beter dan een leeg scherm.
 */
export async function laadTaal(taal: string): Promise<void> {
  const basis = (taal || '').split('-')[0];
  const lader = laders[basis];
  if (!lader) return;
  if (i18n.hasResourceBundle(basis, 'translation')) return;

  try {
    const bundel = await lader();
    i18n.addResourceBundle(basis, 'translation', bundel.default, true, true);
  } catch (fout) {
    console.warn(`Taalbestand ${basis} kon niet worden geladen; terugval op het Nederlands.`, fout);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { nl: { translation: nl } },
    // Zonder deze vlag beschouwt i18next een taal waarvan hij een deel in
    // `resources` heeft als volledig geladen, en haalt hij de rest nooit op.
    // Hier staat alleen Nederlands vooraf klaar; de andere twee komen er via
    // addResourceBundle bij, en dat moet i18next accepteren.
    partialBundledLanguages: true,
    fallbackLng: 'nl',
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

// Wisselt iemand van taal, dan moet het bijbehorende bestand er zijn voordat
// de nieuwe taal actief wordt. Anders staat het scherm even vol met kale
// sleutels als `nav.members`.
i18n.on('languageChanged', (taal) => {
  void laadTaal(taal);
});

/**
 * Haalt de teksten van de gedetecteerde taal op voordat de applicatie tekent.
 *
 * Voor Nederlands is dat een al vervulde belofte en verandert er niets aan de
 * volgorde van gebeurtenissen. Voor Engels en Duits wacht de eerste weergave
 * op één verzoek - liever dat dan een scherm dat eerst in het Nederlands
 * verschijnt en daarna omklapt.
 */
export function taalGereed(): Promise<void> {
  return laadTaal(i18n.language || 'nl');
}

export default i18n;
