import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Van het Nederlands komt alleen de kern mee in de hoofdbundel; Engels, Duits
// en de rest van het Nederlands niet.
//
// Alle drie de vertaalbestanden stonden hier als gewone import, en dat is
// samen 610 KB aan JSON die Rollup in de hoofdbundel legt. Die bundel was
// daardoor 904 KB, waarvan iemand er hooguit een derde van gebruikt: wie de
// applicatie in het Nederlands opent, haalt de Engelse en de Duitse teksten
// ook binnen en doet er niets mee. Dat kostte zowel downloadtijd als
// parseertijd voordat er ook maar iets op het scherm stond - de eerste
// weergave stond in de meting op 3,6 seconden.
//
// Daarna bleef nl.json zelf over: 243 KB, tweederde van de hoofdbundel,
// terwijl het inlogscherm er zo'n 9 KB van gebruikt. Nu komt alleen die kern
// mee (tekstenKernPlugin.ts), en wordt de rest na de eerste weergave
// opgehaald. Een lui geladen pagina wacht daarop via tekstenGereed(), zodat
// daar nooit een kale sleutel op het scherm staat.
//
// Nederlands blijft de terugvaltaal. Engels en Duits worden opgehaald op het
// moment dat iemand ze kiest, of bij het opstarten als de taaldetectie ze al
// had onthouden.
import kern from 'virtual:teksten-kern';

/**
 * De talen die niet meekomen in de hoofdbundel, met hun lader.
 *
 * Rollup maakt van elke `import()` hieronder een eigen chunk. Ze staan
 * expliciet in een object en niet achter een variabele pad, omdat Rollup dan
 * niet kan zien welke bestanden het betreft en er niets meer te splitsen valt.
 */
const laders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  nl: () => import('./locales/nl.json'),
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

/** Per taal het ophalen dat loopt of gelukt is, zodat elke taal één keer gaat. */
const bezig = new Map<string, Promise<void>>();

/**
 * Zorg dat de teksten van `taal` beschikbaar zijn.
 *
 * Doet niets voor een taal die al is opgehaald of onderweg is. Voor
 * Nederlands staat de kern al klaar; dit haalt de rest erbij. Een mislukte
 * download is geen reden om de applicatie te laten hangen: dan valt i18next
 * terug op wat er wel is, en dat is beter dan een leeg scherm. Een volgende
 * aanroep probeert het dan opnieuw.
 */
export function laadTaal(taal: string): Promise<void> {
  const basis = (taal || '').split('-')[0];
  const lader = laders[basis];
  if (!lader) return Promise.resolve();

  const lopend = bezig.get(basis);
  if (lopend) return lopend;

  const ophalen = lader().then(
    (bundel) => {
      // Diep samenvoegen: voor Nederlands staat de kern er al, en die mag
      // blijven staan tot de volledige teksten er zijn.
      i18n.addResourceBundle(basis, 'translation', bundel.default, true, true);
    },
    (fout) => {
      bezig.delete(basis);
      console.warn(`Taalbestand ${basis} kon niet worden geladen; terugval op wat er is.`, fout);
    },
  );
  bezig.set(basis, ophalen);
  return ophalen;
}

/**
 * Klaar als de volledige Nederlandse teksten er zijn - de terugvaltaal voor
 * elke sleutel die in een andere taal ontbreekt.
 *
 * Voor alles buiten de kern: App.tsx laat elke lui geladen pagina hierop
 * wachten. Die pagina is dan toch nog aan het laden, dus dit kost meestal
 * geen extra tijd; het vertaalbestand komt tegelijk met de code binnen.
 */
export function tekstenGereed(): Promise<void> {
  return laadTaal('nl');
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { nl: { translation: kern } },
    // Zonder deze vlag beschouwt i18next een taal waarvan hij een deel in
    // `resources` heeft als volledig geladen, en haalt hij de rest nooit op.
    // Hier staat alleen de Nederlandse kern vooraf klaar; de rest komt er via
    // addResourceBundle bij, en dat moet i18next accepteren.
    partialBundledLanguages: true,
    fallbackLng: 'nl',
    supportedLngs: ['nl', 'en', 'de'],

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    // Teken opnieuw zodra er teksten bijkomen. Een onderdeel uit de
    // hoofdbundel dat toch een sleutel buiten de kern gebruikt, toont dan
    // even die sleutel en daarna de tekst, in plaats van de sleutel te
    // laten staan tot iemand iets aanklikt.
    react: {
      bindI18nStore: 'added',
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
//
// Nederlands niet: i18next vuurt dit ook bij het opstarten af, en dan zou de
// rest van nl.json alsnog vóór de eerste weergave worden opgehaald. Die komt
// via tekstenGereed(), zodra een pagina buiten het inlogscherm hem nodig heeft
// of zodra de eerste weergave staat (main.tsx).
i18n.on('languageChanged', (taal) => {
  if (taal.split('-')[0] === 'nl') return;
  void laadTaal(taal);
});

/**
 * Haalt de teksten van de gedetecteerde taal op voordat de applicatie tekent.
 *
 * Voor Nederlands wacht dit nergens op: de kern staat klaar, en de rest
 * ophalen vóór de eerste weergave is precies wat de kern moet voorkomen. Voor
 * Engels en Duits wacht de eerste weergave op één verzoek - liever dat dan een
 * scherm dat eerst in het Nederlands verschijnt en daarna omklapt.
 */
export function taalGereed(): Promise<void> {
  const basis = (i18n.language || 'nl').split('-')[0];
  return basis === 'nl' ? Promise.resolve() : laadTaal(basis);
}

export default i18n;
