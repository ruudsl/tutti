/**
 * Tests voor de AVG-api.
 *
 * Deze aanroepen stonden tot voor kort als kale `fetch` in GdprAdmin.tsx en
 * DataExport.tsx. Twee dingen worden hier vastgelegd.
 *
 * Ten eerste het gewone werk: pad, methode en body. De functies zetten
 * slangenkast van de server om naar kamelenkast voor het scherm en andersom,
 * en een typefout daarin geeft geen foutmelding maar een leeg veld. De paden
 * zijn vergeleken met backend/src/routes/gdpr.ts.
 *
 * Ten tweede het gedrag dat de aanleiding was. Een kale `fetch` gaat langs
 * client.ts heen, en daar zit de afhandeling van een 401: token weggooien en
 * doorsturen naar het inlogscherm. Zolang deze pagina's hun eigen `fetch`
 * deden, bleef een beheerder met een verlopen sessie hangen op "Failed to
 * fetch deletion requests" - een pagina die het nooit meer zou doen, zonder
 * uitleg waarom. De laatste test hieronder legt vast dat die doorverwijzing er
 * nu wel is.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import {
  getDeletionRequests,
  processDeletionRequest,
  getRetentionSettings,
  updateRetentionSettings,
  runCleanup,
  getDataSummary,
  downloadExport,
  requestDeletion,
} from '../gdpr';

beforeEach(() => {
  startNepserver();
});

afterEach(() => {
  stopNepserver();
  vi.restoreAllMocks();
});

describe('verwijderverzoeken', () => {
  it('haalt de verzoeken op en zet ze om naar de vorm van het scherm', async () => {
    antwoordMet({
      requests: [
        {
          id: 'vz-1',
          user_id: 'gb-7',
          email: 'anna@example.org',
          first_name: 'Anna',
          last_name: 'de Groot',
          reason: 'Ik stop met spelen.',
          status: 'pending',
          created_at: '2026-08-01T10:00:00.000Z',
          processed_at: null,
          processed_by_name: null,
        },
      ],
    });

    const verzoeken = await getDeletionRequests();

    expect(laatsteVerzoek().pad).toBe('/gdpr/deletion-requests');
    expect(laatsteVerzoek().methode).toBe('get');
    // Voor- en achternaam komen los binnen en worden hier samengevoegd.
    expect(verzoeken[0].name).toBe('Anna de Groot');
    expect(verzoeken[0].userId).toBe('gb-7');
    expect(verzoeken[0].requestedAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('stuurt een besluit met de reden mee', async () => {
    antwoordMet({});

    await processDeletionRequest('vz-1', 'reject', 'Nog een openstaande contributie.');

    expect(laatsteVerzoek().pad).toBe('/gdpr/deletion-requests/vz-1/process');
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().body).toEqual({
      action: 'reject',
      notes: 'Nog een openstaande contributie.',
    });
  });

  it('dient een verwijderverzoek in', async () => {
    antwoordMet({ message: 'Verzoek ontvangen', requestId: 'vz-9' });

    const antwoord = await requestDeletion('Ik verhuis naar het buitenland.');

    expect(laatsteVerzoek().pad).toBe('/gdpr/delete-request');
    expect(laatsteVerzoek().body).toEqual({ reason: 'Ik verhuis naar het buitenland.' });
    expect(antwoord.requestId).toBe('vz-9');
  });
});

describe('bewaarbeleid', () => {
  it('leest de instellingen en vult een ontbrekende omschrijving aan', async () => {
    antwoordMet({
      settings: [
        { data_type: 'activity_log', retention_days: 365, description: 'Activiteitenlog' },
        { data_type: 'sessions', retention_days: 30 },
      ],
    });

    const { settings } = await getRetentionSettings();

    expect(settings[0]).toEqual({
      dataType: 'activity_log',
      retentionDays: 365,
      description: 'Activiteitenlog',
    });
    // Zonder omschrijving hoort er een lege tekst te staan, geen `undefined`:
    // dat laatste zou in het scherm als "undefined" verschijnen.
    expect(settings[1].description).toBe('');
  });

  it('leidt auto_delete af uit het aantal bewaardagen', async () => {
    antwoordMet({});

    await updateRetentionSettings([
      { dataType: 'activity_log', retentionDays: 365, description: '' },
      { dataType: 'sessions', retentionDays: 0, description: '' },
    ]);

    expect(laatsteVerzoek().methode).toBe('put');
    // Nul dagen betekent "nooit opruimen", dus dan staat auto_delete uit.
    expect(laatsteVerzoek().body).toEqual({
      settings: [
        { data_type: 'activity_log', retention_days: 365, auto_delete: true },
        { data_type: 'sessions', retention_days: 0, auto_delete: false },
      ],
    });
  });

  it('geeft de opruiming terug, ook als de server geen aantallen meldt', async () => {
    antwoordMet({ deletedCounts: { sessions: 12 } });
    expect((await runCleanup()).deleted).toEqual({ sessions: 12 });

    antwoordMet({});
    // Een lege opsomming in plaats van `undefined`: het scherm loopt eroverheen.
    expect((await runCleanup()).deleted).toEqual({});
  });
});

describe('gegevensuitvoer', () => {
  it('haalt de samenvatting op', async () => {
    antwoordMet({ userId: 'gb-7', exportDate: '2026-08-22', categories: [], totalRecords: 0 });

    const samenvatting = await getDataSummary();

    expect(laatsteVerzoek().pad).toBe('/gdpr/data-summary');
    expect(samenvatting.userId).toBe('gb-7');
  });

  it('vraagt de uitvoer als blob op en biedt hem als bestand aan', async () => {
    antwoordMet({});

    const maakUrl = vi.fn().mockReturnValue('blob:nep');
    const ruimUrlOp = vi.fn();
    vi.stubGlobal('URL', { ...window.URL, createObjectURL: maakUrl, revokeObjectURL: ruimUrlOp });
    const klik = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadExport('zip');

    const verzoek = laatsteVerzoek();
    expect(verzoek.pad).toBe('/gdpr/export?format=zip');
    // Zonder responseType 'blob' leest axios het antwoord als JSON, en dan komt
    // er van een zip niets bruikbaars uit het bestand.
    expect(verzoek.responseType).toBe('blob');
    expect(klik).toHaveBeenCalled();
    // De url wordt weer vrijgegeven; anders houdt elke uitvoer geheugen vast.
    expect(ruimUrlOp).toHaveBeenCalledWith('blob:nep');

    vi.unstubAllGlobals();
  });

  it('noemt het bestand naar het gekozen formaat', async () => {
    antwoordMet({});
    vi.stubGlobal('URL', {
      ...window.URL,
      createObjectURL: () => 'blob:nep',
      revokeObjectURL: () => {},
    });

    const namen: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      namen.push(this.download);
    });

    await downloadExport('json');
    await downloadExport('zip');

    expect(namen).toEqual(['gdpr-export.json', 'gdpr-export.zip']);
    vi.unstubAllGlobals();
  });
});

describe('een verlopen sessie', () => {
  it('stuurt de gebruiker naar het inlogscherm in plaats van hem te laten hangen', async () => {
    // Dit was de aanleiding voor deze module. Met een kale `fetch` kwam er
    // alleen een foutmelding op het scherm en bleef de gebruiker zitten op een
    // pagina die het nooit meer zou doen.
    localStorage.setItem('token', 'verlopen');
    localStorage.setItem('user', '{"id":"gb-7"}');
    const plek = { href: '' };
    vi.stubGlobal('location', plek as unknown as Location);

    antwoordMetFout(401, { error: 'Token expired' });

    await expect(getDeletionRequests()).rejects.toThrow();

    expect(plek.href).toBe('/login');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();

    vi.unstubAllGlobals();
  });
});
