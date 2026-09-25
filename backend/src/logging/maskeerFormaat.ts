import winston from 'winston';
import { isGeheimeSleutel, maskeerEmail, maskeerVoorLog, WEGGELATEN } from '../utils/maskeren';

/**
 * Winston-formaat dat elke logregel nakijkt voordat hij een transport bereikt:
 * geheimen weg (op sleutelnaam, ook genest), e-mailadressen afgekort, in de
 * melding zelf en in alle meegegeven velden.
 *
 * Het staat op de logger en niet op een transport, zodat console, bestanden
 * en wat er later nog bijkomt allemaal dezelfde, al nagekeken regel krijgen.
 *
 * Het object wordt ter plekke aangepast en niet vervangen: winston hangt er
 * eigenschappen met een Symbol als sleutel aan (niveau, splat) die de
 * transports nog nodig hebben.
 */
export const maskeerFormaat = winston.format((info) => {
  const regel = info as Record<string, unknown>;
  for (const sleutel of Object.keys(regel)) {
    if (sleutel === 'level') continue;
    const waarde = regel[sleutel];
    if (sleutel === 'message') {
      regel.message = typeof waarde === 'string' ? maskeerEmail(waarde) : maskeerVoorLog(waarde);
    } else if (isGeheimeSleutel(sleutel)) {
      regel[sleutel] = WEGGELATEN;
    } else {
      regel[sleutel] = maskeerVoorLog(waarde);
    }
  }
  return info;
});
