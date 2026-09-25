/**
 * Waarden in de html-versie van een e-mail ontsnappen.
 *
 * De sjablonen plakken namen, titels en adressen rechtstreeks in hun html.
 * Een naam als `<a href=…>` werd daardoor opmaak in de mail van iemand anders.
 * In plaats van elk van de sjablonen per regel aan te passen, rendert
 * `renderVeilig` een sjabloon twee keer: de onderwerpregel en de platte tekst
 * met de gegevens zoals ze zijn (daar is html geen gevaar en zou `&amp;`
 * alleen storen), de html met elke tekst ontsnapt.
 */

import { EmailContent } from './types';

const VERVANGINGEN: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function ontsnapHtml(tekst: string): string {
  return tekst.replace(/[&<>"']/g, (teken) => VERVANGINGEN[teken]);
}

/** Een kopie waarin elke tekst (ook in een lijst) ontsnapt is. */
export function ontsnapGegevens<T>(gegevens: T): T {
  const kopie: Record<string, unknown> = {};
  for (const [sleutel, waarde] of Object.entries(gegevens as Record<string, unknown>)) {
    if (typeof waarde === 'string') {
      kopie[sleutel] = ontsnapHtml(waarde);
    } else if (Array.isArray(waarde)) {
      kopie[sleutel] = waarde.map((element) => (typeof element === 'string' ? ontsnapHtml(element) : element));
    } else {
      kopie[sleutel] = waarde;
    }
  }
  return kopie as T;
}

export function renderVeilig<TData>(sjabloon: (gegevens: TData) => EmailContent, gegevens: TData): EmailContent {
  const { subject, text } = sjabloon(gegevens);
  const { html } = sjabloon(ontsnapGegevens(gegevens));
  return { subject, text, html };
}
