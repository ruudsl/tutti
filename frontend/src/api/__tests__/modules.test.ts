/**
 * Tests voor de modules-api.
 *
 * Deze drie functies bepalen wat een vereniging überhaupt te zien krijgt: de
 * sleutels die hier terugkomen bepalen welke navigatie-items en routes blijven
 * bestaan. Twee dingen kunnen daar echt misgaan.
 *
 * Ten eerste de vorm. `getEnabledModules` pelt `enabled` uit het antwoord. Als
 * de server iets anders stuurt - een proxy of inlogportaal dat met status 200
 * een HTML-pagina teruggeeft is het klassieke geval - dan is de uitkomst
 * `undefined` terwijl het type `string[]` belooft. De aanroeper die daar
 * `.includes` op doet klapt eruit, en het type heeft niets gezegd. Deze tests
 * leggen vast dat dat gebeurt, en waar het opgevangen wordt.
 *
 * Ten tweede het aanzetten zelf: de sleutel hoort in het pad en de stand in de
 * body. Draai je die om, dan antwoordt de server met 404 op een module die wel
 * bestaat.
 *
 * De paden zijn vergeleken met backend/src/routes/modules.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import { getEnabledModules, getModuleSettings, setModuleEnabled } from '../modules';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('getEnabledModules', () => {
  it('pelt de sleutels uit het omhulsel dat de server eromheen zet', async () => {
    antwoordMet({ enabled: ['projects', 'wiki', 'tickets'] });

    const sleutels = await getEnabledModules();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/modules');
    // De server antwoordt met { enabled: [...] }, niet met een kale lijst.
    // Wie hier `response.data` teruggeeft, geeft het object door en dan is
    // elke `.includes` op de uitkomst onwaar: alles staat plotseling uit.
    expect(sleutels).toEqual(['projects', 'wiki', 'tickets']);
  });

  it('geeft undefined terug als het omhulsel ontbreekt - dat is geen fout maar wel een val', async () => {
    // Dit is geen wens, het is een meting. Het type belooft string[], en dit
    // is wat er in de praktijk uit komt als een proxy met status 200 iets
    // anders teruggeeft. Er komt geen foutmelding: de aanroeper krijgt
    // `undefined` en klapt pas een regel later op `.includes` of `.map`.
    antwoordMet({ modules: ['projects'] });

    await expect(getEnabledModules()).resolves.toBeUndefined();
  });

  it('wordt door ModulesContext opgevangen, dus de val slaat niet door naar het scherm', async () => {
    // De reden dat de vorige uitkomst hier niet gerepareerd wordt: de enige
    // aanroeper, context/ModulesContext.tsx, dwingt de vorm zelf af met
    // alleenSleutels(). Zou die opvang ooit verdwijnen, dan moet de
    // normalisatie hierheen. Deze test bewaakt dat de opvang er nog is.
    const bron = await import('../../context/ModulesContext');
    expect(typeof bron.ModulesProvider).toBe('function');

    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tekst = readFileSync(join(process.cwd(), 'src', 'context', 'ModulesContext.tsx'), 'utf8');
    expect(tekst).toContain('alleenSleutels(await getEnabledModules())');
  });

  it('laat een netwerkfout door, zodat de vorige stand kan blijven staan', async () => {
    // Alles uitzetten bij een storing zou erger zijn dan een module te veel
    // tonen; daarom mag deze functie niet stilletjes een lege lijst maken.
    antwoordMetFout(500, { error: 'Server error' });

    await expect(getEnabledModules()).rejects.toMatchObject({ response: { status: 500 } });
  });
});

describe('getModuleSettings', () => {
  it('geeft de beheerlijst door met kopje, omschrijving en de navigatiepaden', async () => {
    antwoordMet([
      {
        key: 'projects',
        category: 'planning',
        title: 'Projecten',
        description: 'Bundelt concerten en repetities.',
        enabled: true,
        navPaths: ['/projects', '/tours'],
      },
    ]);

    const modules = await getModuleSettings();

    expect(laatsteVerzoek().pad).toBe('/modules/settings');
    // navPaths bepaalt welke schermen verdwijnen als de module uitgaat. Komt
    // die lijst leeg binnen, dan blijft de navigatie staan terwijl de routes
    // 404 geven - een menu-item dat nergens heen leidt.
    expect(modules[0].navPaths).toEqual(['/projects', '/tours']);
    expect(modules[0].enabled).toBe(true);
  });

  it('haalt de beheerlijst op /modules/settings, niet op /modules?settings', async () => {
    antwoordMet([]);

    await getModuleSettings();

    expect(laatsteVerzoek().pad).toBe('/modules/settings');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });
});

describe('setModuleEnabled', () => {
  it('zet de sleutel in het pad en de stand in de body', async () => {
    antwoordMet({});

    await setModuleEnabled('wiki', false);

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/modules/wiki');
    expect(laatsteVerzoek().body).toEqual({ enabled: false });
  });

  it('stuurt false ook echt mee, en laat het veld niet weg', async () => {
    // De server doet een expliciete controle op de body. Zou `false` hier
    // wegvallen (bijvoorbeeld door een `enabled || undefined`), dan bleef de
    // module aan staan terwijl het scherm zegt dat hij uit is.
    antwoordMet({});

    await setModuleEnabled('tickets', false);

    expect(laatsteVerzoek().body).toHaveProperty('enabled', false);
  });

  it('geeft niets terug, ook niet als de server een boodschap meestuurt', async () => {
    antwoordMet({ message: 'Module bijgewerkt', enabled: false });

    await expect(setModuleEnabled('tickets', false)).resolves.toBeUndefined();
  });

  it('laat een 404 op een onbekende sleutel door', async () => {
    antwoordMetFout(404, { error: 'Module niet gevonden.' });

    await expect(setModuleEnabled('bestaat-niet', true)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('modules.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getEnabledModules', () => getEnabledModules()],
    ['getModuleSettings', () => getModuleSettings()],
    ['setModuleEnabled', () => setModuleEnabled('wiki', true)],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/modules.ts', async (_naam, aanroep) => {
    antwoordMet({ enabled: [] });
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/modules', methode, pad)).toBe(true);
  });

  it('let op de valstrik dat /modules/settings niet als /modules/:key gelezen wordt', () => {
    // GET /settings en PUT /:key zijn verschillende werkwoorden, dus ze bijten
    // elkaar niet. Zou er ooit een GET /:key bijkomen bovenaan, dan zou de
    // beheerlijst stilzwijgend de stand van een module genaamd "settings"
    // teruggeven.
    const opGet = routes.filter((r) => r.methode === 'get').map((r) => r.patroon);

    expect(opGet).toEqual(['/', '/settings']);
  });
});
