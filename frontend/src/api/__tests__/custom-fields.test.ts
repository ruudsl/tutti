/**
 * Tests voor de eigen velden (custom fields).
 *
 * Een vereniging kan hier eigen velden aan leden, instrumenten of concerten
 * hangen. Dat maakt dit een van de weinige plekken waar de vorm van de
 * gegevens niet vastligt, en waar de zichtbaarheid per veld apart geregeld is.
 *
 * Wat hier echt mis kan gaan:
 *
 * De zichtbaarheid. Elk veld heeft een `visibility`, en de server filtert
 * daarop voordat hij antwoordt - een gewoon lid krijgt de admin_only-velden
 * niet eens te zien. Deze api-laag mag dus nooit zelf een lijst aanvullen of
 * gaten opvullen: wat er niet in zit, hoort er niet in te zitten.
 *
 * Het onderscheid tussen de twee leeswegen. `getFieldDefinitions` gaat naar
 * /definitions met een queryreeks, `getFieldDefinitionsForEntity` naar
 * /definitions/<soort>. Die tweede route valideert de soort en geeft 400 bij
 * een onbekende; de eerste negeert een onbekende soort stilzwijgend en geeft
 * alles terug. Wie de twee door elkaar haalt, krijgt dus meer velden dan
 * bedoeld zonder dat er iets misgaat.
 *
 * Het wijzigen. De server haalt `entityType` en `fieldKey` uit de
 * wijzigingsbody weg voordat hij hem gebruikt (zod's `.omit`), en zod gooit
 * onbekende sleutels weg zonder klacht. Meesturen leverde dus een 200 op
 * terwijl er niets gebeurde. Zie de test daarover hieronder: het type sluit
 * dat nu uit.
 *
 * De paden zijn vergeleken met backend/src/routes/custom-fields.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getFieldDefinitions,
  getFieldDefinitionsForEntity,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  reorderFieldDefinitions,
  getFieldValues,
  setFieldValues,
  deleteFieldValue,
} from '../custom-fields';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('velddefinities lezen', () => {
  it('filtert via de queryreeks als er een soort meegegeven is', async () => {
    antwoordMet([]);

    await getFieldDefinitions('instrument');

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/definitions');
    expect(laatsteVerzoek().query.get('entityType')).toBe('instrument');
  });

  it('stuurt geen lege entityType mee als er geen soort gekozen is', async () => {
    // `entityType=` zou aan de serverkant waar zijn en op een lege
    // entity_type-kolom filteren: nul velden, geen foutmelding.
    antwoordMet([]);

    await getFieldDefinitions();

    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('zet de soort in het pad bij de route per entiteit', async () => {
    antwoordMet([]);

    await getFieldDefinitionsForEntity('user');

    // Deze route valideert de soort en geeft 400 bij een onbekende; de route
    // met de queryreeks doet dat niet. Ze zijn dus niet uitwisselbaar.
    expect(laatsteVerzoek().pad).toBe('/custom-fields/definitions/user');
    expect(laatsteVerzoek().queryreeks).toBe('');
  });

  it('geeft de keuzelijst van een select-veld door als lijst', async () => {
    antwoordMet([
      {
        id: 'v1',
        entityType: 'user',
        fieldKey: 'dieet',
        fieldLabel: 'Dieetwens',
        fieldType: 'select',
        fieldOptions: ['Geen', 'Vegetarisch', 'Veganistisch'],
        isRequired: false,
        isUnique: false,
        visibility: 'committee_plus',
        selfEditable: true,
        sortOrder: 0,
      },
    ]);

    const velden = await getFieldDefinitions('user');

    // fieldOptions staat als JSON-tekst in de database en wordt aan de
    // serverkant uitgepakt. Kwam het als tekst binnen, dan toonde het
    // keuzemenu één optie met alle keuzes erin.
    expect(velden[0].fieldOptions).toEqual(['Geen', 'Vegetarisch', 'Veganistisch']);
    expect(velden[0].visibility).toBe('committee_plus');
  });

  it('geeft door wat de server stuurt en vult geen weggefilterde velden aan', async () => {
    // De server laat velden met een zichtbaarheid die deze rol niet mag zien
    // helemaal weg. Zou de api-laag hier bijvoorbeeld op sortOrder aanvullen,
    // dan lekten de labels van interne velden alsnog naar het scherm.
    antwoordMet([]);

    await expect(getFieldDefinitions('user')).resolves.toEqual([]);
  });

  it('laat de 400 door bij een soort die de server niet kent', async () => {
    antwoordMetFout(400, { error: 'Ongeldig entiteit type.' });

    await expect(getFieldDefinitionsForEntity('concert')).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});

describe('velddefinities beheren', () => {
  it('maakt een veld aan met soort en sleutel in de body', async () => {
    antwoordMet({ id: 'v9', message: 'Veld aangemaakt.' });

    await createFieldDefinition({
      entityType: 'user',
      fieldKey: 'rijbewijs',
      fieldLabel: 'Rijbewijs',
      fieldType: 'boolean',
      visibility: 'admin_only',
    });

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/definitions');
    expect(laatsteVerzoek().body).toEqual({
      entityType: 'user',
      fieldKey: 'rijbewijs',
      fieldLabel: 'Rijbewijs',
      fieldType: 'boolean',
      visibility: 'admin_only',
    });
  });

  it('wijzigt met PATCH op het id van het veld', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateFieldDefinition('v1', { fieldLabel: 'Dieet of allergie', isRequired: true });

    expect(laatsteVerzoek().methode).toBe('patch');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/definitions/v1');
    expect(laatsteVerzoek().body).toEqual({ fieldLabel: 'Dieet of allergie', isRequired: true });
  });

  it('staat niet toe de veldsleutel mee te wijzigen, want de server gooit die weg', async () => {
    antwoordMet({ message: 'Bijgewerkt.' });

    await updateFieldDefinition('v1', {
      fieldLabel: 'Nieuw label',
      // @ts-expect-error - `fieldKey` hoort niet in een wijziging: het
      // zod-schema aan de serverkant laat het veld expliciet weg en verwijdert
      // het zonder klacht, dus de aanroeper kreeg een 200 terwijl er niets
      // veranderde. Deze regel is de reparatie zelf; zolang het type
      // Partial<CreateFieldDefinitionData> was, was dit geldige code en faalde
      // `tsc` hier op een ongebruikte @ts-expect-error.
      fieldKey: 'andere_sleutel',
    });

    // Wat er over de lijn gaat blijft ongewijzigd: de api-laag stuurt door wat
    // hij krijgt. De bescherming zit in het type, niet in een stille filter -
    // stil wegfilteren zou dezelfde val zijn, één laag lager.
    expect((laatsteVerzoek().body as Record<string, unknown>).fieldLabel).toBe('Nieuw label');
  });

  it('verwijdert een velddefinitie op zijn id', async () => {
    antwoordMet({});

    await deleteFieldDefinition('v1');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/definitions/v1');
  });

  it('herordent met POST naar /definitions/reorder, met de soort erbij', async () => {
    antwoordMet({ message: 'Volgorde succesvol bijgewerkt.' });

    await reorderFieldDefinitions('user', ['v3', 'v1', 'v2']);

    // POST, geen PUT: op dit pad bestaat alleen POST. En de soort moet mee,
    // anders weet de server niet welke groep velden herordend wordt.
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/definitions/reorder');
    expect(laatsteVerzoek().body).toEqual({ entityType: 'user', fieldIds: ['v3', 'v1', 'v2'] });
  });
});

describe('waarden lezen en schrijven', () => {
  it('zet soort en entiteit in het pad bij het lezen', async () => {
    antwoordMet({ values: {}, meta: {} });

    await getFieldValues('instrument', 'inst-3');

    expect(laatsteVerzoek().pad).toBe('/custom-fields/values/instrument/inst-3');
  });

  it('geeft waarden en beschrijvingen als twee aparte kaarten terug', async () => {
    antwoordMet({
      values: { dieet: 'Vegetarisch', rijbewijs: null },
      meta: {
        dieet: {
          id: 'v1',
          label: 'Dieetwens',
          type: 'select',
          options: ['Geen', 'Vegetarisch'],
          required: false,
          editable: true,
        },
        rijbewijs: { id: 'v2', label: 'Rijbewijs', type: 'boolean', options: null, required: false, editable: false },
      },
    });

    const { values, meta } = await getFieldValues('user', 'g1');

    // `editable` bepaalt of het scherm het veld als invoer of als tekst toont.
    // Valt die kaart weg, dan zou een lid velden kunnen bewerken die alleen de
    // beheerder mag aanpassen - de server weigert dat wel, maar pas na een
    // formulier dat er bewerkbaar uitzag.
    expect(values.dieet).toBe('Vegetarisch');
    expect(meta.rijbewijs.editable).toBe(false);
    // Een leeg veld komt als null binnen, niet als ontbrekende sleutel: het
    // verschil tussen "niets ingevuld" en "dit veld bestaat niet".
    expect(Object.prototype.hasOwnProperty.call(values, 'rijbewijs')).toBe(true);
    expect(values.rijbewijs).toBeNull();
  });

  it('schrijft waarden naar één vast pad, met soort en entiteit in de body', async () => {
    antwoordMet({});

    await setFieldValues('user', 'g1', { dieet: 'Veganistisch', rijbewijs: true });

    // Let op het verschil met het lezen: schrijven gaat naar /values zonder
    // ids in het pad. Wie hier /values/user/g1 gebruikt raakt geen route.
    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/values');
    expect(laatsteVerzoek().body).toEqual({
      entityType: 'user',
      entityId: 'g1',
      values: { dieet: 'Veganistisch', rijbewijs: true },
    });
  });

  it('stuurt een lege waarde als lege tekst mee en laat hem niet weg', async () => {
    // Een veld leegmaken is een handeling. Zou de lege waarde uit de body
    // vallen, dan bleef de oude waarde staan terwijl het scherm leeg toont.
    antwoordMet({});

    await setFieldValues('user', 'g1', { dieet: '' });

    expect(laatsteVerzoek().body).toEqual({ entityType: 'user', entityId: 'g1', values: { dieet: '' } });
  });

  it('verwijdert één waarde op soort, entiteit en veldsleutel', async () => {
    antwoordMet({});

    await deleteFieldValue('user', 'g1', 'dieet');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/custom-fields/values/user/g1/dieet');
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('custom-fields.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getFieldDefinitions', () => getFieldDefinitions()],
    ['getFieldDefinitionsForEntity', () => getFieldDefinitionsForEntity('user')],
    [
      'createFieldDefinition',
      () => createFieldDefinition({ entityType: 'user', fieldKey: 'x', fieldLabel: 'X', fieldType: 'text' }),
    ],
    ['updateFieldDefinition', () => updateFieldDefinition('v1', {})],
    ['deleteFieldDefinition', () => deleteFieldDefinition('v1')],
    ['reorderFieldDefinitions', () => reorderFieldDefinitions('user', ['v1'])],
    ['getFieldValues', () => getFieldValues('user', 'g1')],
    ['setFieldValues', () => setFieldValues('user', 'g1', {})],
    ['deleteFieldValue', () => deleteFieldValue('user', 'g1', 'dieet')],
  ];

  it.each(aanroepen)('%s raakt een bestaande route in backend/src/routes/custom-fields.ts', async (_naam, aanroep) => {
    antwoordMet({ values: {}, meta: {} });
    await aanroep().catch(() => undefined);
    const { methode, pad } = laatsteVerzoek();

    expect(serverBiedtAan(routes, '/custom-fields', methode, pad)).toBe(true);
  });

  it('let op de valstrik dat /definitions/reorder niet als /definitions/:entityType gelezen wordt', () => {
    // Ze verschillen in werkwoord - GET /:entityType tegenover POST /reorder -
    // dus ze bijten elkaar niet. Zou er ooit een GET /definitions/reorder
    // nodig zijn, dan botst die wel, en dan geeft de server 400 op een
    // "entiteitsoort" genaamd reorder.
    const opDefinitions = routes.filter((r) => r.patroon.startsWith('/definitions'));

    expect(opDefinitions).toContainEqual({ methode: 'post', patroon: '/definitions/reorder' });
    expect(opDefinitions).toContainEqual({ methode: 'get', patroon: '/definitions/:entityType' });
  });
});
