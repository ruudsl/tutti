/**
 * Heen en weer tussen een ISO-tijdstip van de server en de waarde van een
 * `datetime-local`-invoerveld.
 *
 * Een `datetime-local`-veld kent geen tijdzone: de waarde "2026-07-01T20:00"
 * betekent acht uur 's avonds bij de gebruiker thuis. De server werkt in UTC.
 * De vertaling tussen die twee moet dus over de lokale tijdzone lopen en niet
 * over `toISOString()`, want dat is UTC - in de Nederlandse zomer twee uur
 * ernaast.
 *
 * Dat ging hier eerder mis: het veld werd gevuld met de UTC-tekst, en bij het
 * opslaan werd diezelfde tekst weer als lokale tijd gelezen. Elke keer dat
 * iemand het formulier van een kaartsoort opende en opsloeg schoof de
 * verkoopstart dus twee uur op, keer op keer.
 */

/** Twee (of vier) cijfers, zodat "2026-07-01T09:05" eruit komt en niet "2026-7-1T9:5". */
function cijfers(waarde: number, lengte = 2): string {
  return String(waarde).padStart(lengte, '0');
}

/**
 * ISO-tijdstip van de server -> waarde voor een `datetime-local`-veld,
 * uitgedrukt in de lokale tijd van de gebruiker.
 *
 * Lege of onleesbare invoer geeft een lege tekst, zodat het veld leeg blijft
 * in plaats van "Invalid Date" te tonen.
 */
export function naarDatumTijdVeld(isoDatum: string | null): string {
  if (!isoDatum) return '';
  const datum = new Date(isoDatum);
  if (isNaN(datum.getTime())) return '';
  return (
    `${cijfers(datum.getFullYear(), 4)}-${cijfers(datum.getMonth() + 1)}-${cijfers(datum.getDate())}` +
    `T${cijfers(datum.getHours())}:${cijfers(datum.getMinutes())}`
  );
}

/**
 * Waarde van een `datetime-local`-veld -> volledig ISO-tijdstip voor de server.
 *
 * `new Date('2026-07-01T20:00')` leest de tekst als lokale tijd; dat is precies
 * wat het veld bedoelt, dus deze kant klopte al. Hij staat hier naast zijn
 * tegenhanger zodat de heen-en-weerreis in één test te controleren is.
 */
export function naarIsoDatumTijd(lokaleDatumTijd: string): string | undefined {
  if (!lokaleDatumTijd) return undefined;
  const datum = new Date(lokaleDatumTijd);
  if (isNaN(datum.getTime())) return undefined;
  return datum.toISOString();
}
