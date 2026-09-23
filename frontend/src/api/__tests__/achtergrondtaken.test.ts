/**
 * De API-laag voor het beheerscherm van achtergrondtaken
 * (backend/src/routes/achtergrondtaken.ts, op /api/achtergrondtaken).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { getAchtergrondtaken, probeerAchtergrondtaakOpnieuw } from '../achtergrondtaken';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

const LEEG = {
  data: [],
  pagination: { page: 1, limit: 25, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
  tellingen: { wachtend: 0, bezig: 0, gelukt: 0, mislukt: 0 },
};

describe('achtergrondtaken', () => {
  it('vraagt de lijst op met status, pagina en aantal in de queryreeks', async () => {
    antwoordMet(LEEG);
    const resultaat = await getAchtergrondtaken({ status: 'mislukt', page: 2, limit: 25 });

    const verzoek = laatsteVerzoek();
    expect(verzoek.methode).toBe('get');
    expect(verzoek.pad).toBe('/achtergrondtaken');
    expect(verzoek.query.get('status')).toBe('mislukt');
    expect(verzoek.query.get('page')).toBe('2');
    expect(verzoek.query.get('limit')).toBe('25');
    expect(resultaat.tellingen.mislukt).toBe(0);
  });

  it('zonder filter geen status in de queryreeks', async () => {
    antwoordMet(LEEG);
    await getAchtergrondtaken();
    expect(laatsteVerzoek().query.has('status')).toBe(false);
  });

  it('zet een taak opnieuw in de wachtrij met een POST op zijn id', async () => {
    antwoordMet({ id: 'taak-1', status: 'wachtend' });
    const resultaat = await probeerAchtergrondtaakOpnieuw('taak-1');

    expect(laatsteVerzoek()).toMatchObject({ methode: 'post', pad: '/achtergrondtaken/taak-1/opnieuw' });
    expect(resultaat.status).toBe('wachtend');
  });

  it('geeft de weigering van de server door', async () => {
    antwoordMetFout(409, { error: 'Alleen een mislukte taak kan opnieuw worden geprobeerd.' });
    await expect(probeerAchtergrondtaakOpnieuw('taak-1')).rejects.toMatchObject({ response: { status: 409 } });
  });
});
