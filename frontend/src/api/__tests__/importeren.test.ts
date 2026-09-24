/**
 * De API-laag voor het importeren uit een spreadsheet
 * (backend/src/routes/importeren.ts, op /api/import).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { bekijkImport, voerImportUit } from '../importeren';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

const LEEG = { kolommen: {}, genegeerd: [], regels: [], tellingen: { nieuw: 0, bestaat: 0, fout: 0 } };

describe('importeren', () => {
  it('vraagt het voorbeeld op met het bestand als tekst in de body', async () => {
    antwoordMet(LEEG);
    await bekijkImport('leden', 'Voornaam;Achternaam;E-mail\n');

    expect(laatsteVerzoek()).toMatchObject({
      methode: 'post',
      pad: '/import/leden/voorbeeld',
      body: { csv: 'Voornaam;Achternaam;E-mail\n' },
    });
  });

  it('voert de import van de muziekbibliotheek uit op de eigen route', async () => {
    antwoordMet({ ...LEEG, geimporteerd: 3 });
    const uitkomst = await voerImportUit('muziektitels', 'Titel\nBolero\n');

    expect(laatsteVerzoek()).toMatchObject({ methode: 'post', pad: '/import/muziektitels' });
    expect(uitkomst.geimporteerd).toBe(3);
  });

  it('geeft een weigering van de server door', async () => {
    antwoordMetFout(400, { error: 'Deze kolommen ontbreken in het bestand: email.' });
    await expect(bekijkImport('leden', 'x')).rejects.toMatchObject({ response: { status: 400 } });
  });
});
