/**
 * Tests voor de privacy-instellingen.
 *
 * (De opdracht noemde dit bestand "holiday-settings.ts". Dat bestand bestaat
 * niet; de regel van 37 procent in de dekkingsmeting was
 * `...cy-settings.ts`, afgekapt weergegeven - privacy-settings.ts dus. De
 * vakanties zitten in holidays.ts en die staat al op vol via
 * src/__tests__/api-uitbreidingen.test.ts.)
 *
 * Hier bepaalt elk lid per veld wie het mag zien, en de vereniging zet daar
 * een ondergrens onder. Een fout in deze laag is niet "het scherm blijft
 * leeg": het is een telefoonnummer dat zichtbaar wordt voor mensen die het
 * niet mogen zien. Daarom wordt hier scherper op de vorm getoetst dan elders.
 *
 * Wat er echt mis kan gaan:
 *
 * De richting van de sleutels. De instellingen komen binnen als een kaart met
 * de veldnaam als sleutel, niet als een lijst. Wie er een lijst van maakt of
 * andersom, verliest juist de velden waar niets over ingesteld is - en die
 * vallen dan stilzwijgend terug op de ruimste stand.
 *
 * Het antwoord op /consent. Dat heeft twee vormen: bij een nieuwe toestemming
 * 201 met een id, en bij een herhaling 200 met alleen een boodschap. Het type
 * beloofde in beide gevallen een id; zie de test daarover hieronder.
 *
 * De paden zijn vergeleken met backend/src/routes/privacy-settings.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startNepserver, stopNepserver, antwoordMet, antwoordMetFout, laatsteVerzoek } from './nepserver';
import { serverroutes, serverBiedtAan } from './serverroutes';
import {
  getMyPrivacySettings,
  updateMyPrivacySettings,
  getUserPrivacySettings,
  getPrivacyDefaults,
  updatePrivacyDefaults,
  deletePrivacyDefault,
  getMyConsents,
  recordConsent,
  checkConsent,
} from '../privacy-settings';

beforeEach(() => startNepserver());
afterEach(() => stopNepserver());

describe('mijn instellingen', () => {
  it('haalt de instellingen op als kaart met de veldnaam als sleutel', async () => {
    antwoordMet({
      phone: {
        fieldName: 'phone',
        visibility: 'section',
        isDefault: false,
        purposeStatement: 'Voor het afstemmen van vervoer.',
        isRequired: false,
        updatedAt: '2026-06-01',
      },
      email: { fieldName: 'email', visibility: 'all_members', isDefault: true, isRequired: false },
    });

    const instellingen = await getMyPrivacySettings();

    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/privacy-settings/my-settings');
    expect(instellingen.phone.visibility).toBe('section');
    // `isDefault` zegt of het lid zelf iets ingesteld heeft of dat de
    // verenigingsstandaard geldt. Valt dat weg, dan lijkt elk veld een eigen
    // keuze en weet niemand meer wat er verandert als de vereniging haar
    // standaard aanpast.
    expect(instellingen.email.isDefault).toBe(true);
  });

  it('verpakt de wijzigingen in een lijst onder de sleutel settings', async () => {
    antwoordMet({ message: 'Privacy-instellingen succesvol bijgewerkt.' });

    await updateMyPrivacySettings([
      { fieldName: 'phone', visibility: 'admin_only' },
      { fieldName: 'custom_dieet', visibility: 'committee', customFieldId: 'v1' },
    ]);

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/privacy-settings/my-settings');
    // De server leest data.settings. Een kale lijst in de body zou zod een 400
    // opleveren, en een andere sleutelnaam ook - maar dan pas bij de eerste
    // gebruiker die iets aanpast.
    expect(laatsteVerzoek().body).toEqual({
      settings: [
        { fieldName: 'phone', visibility: 'admin_only' },
        { fieldName: 'custom_dieet', visibility: 'committee', customFieldId: 'v1' },
      ],
    });
  });

  it('laat de 400 door als een veld te ruim gezet wordt voor de verenigingsregel', async () => {
    // De vereniging kan een veld verplicht stellen met een ondergrens. Zou de
    // api-laag die fout wegslikken, dan dacht het lid dat zijn keuze bewaard
    // was terwijl er niets veranderde.
    antwoordMetFout(400, { error: 'Veld "email" moet minimaal committee zichtbaarheid hebben.' });

    await expect(updateMyPrivacySettings([{ fieldName: 'email', visibility: 'public' }])).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it('haalt op welke velden van een ander lid zichtbaar zijn', async () => {
    antwoordMet({ visibleFields: ['email', 'first_name', 'last_name'] });

    const { visibleFields } = await getUserPrivacySettings('g7');

    expect(laatsteVerzoek().pad).toBe('/privacy-settings/user/g7');
    // Dit is een toelaatlijst, geen weigerlijst: alles wat er niet in staat,
    // hoort niet getoond te worden. Zou de api-laag hier bij twijfel iets
    // aanvullen, dan lekt er precies datgene wat afgeschermd was.
    expect(visibleFields).toEqual(['email', 'first_name', 'last_name']);
  });
});

describe('standaarden van de vereniging', () => {
  it('haalt de standaarden op', async () => {
    antwoordMet([
      {
        id: 's1',
        fieldName: 'phone',
        defaultVisibility: 'orchestra',
        purposeStatement: 'Voor het afstemmen van vervoer.',
        isRequired: true,
      },
    ]);

    const standaarden = await getPrivacyDefaults();

    expect(laatsteVerzoek().pad).toBe('/privacy-settings/defaults');
    // `isRequired` bepaalt of een lid nog onder deze grens mag gaan zitten.
    // Komt het als 1 of 0 binnen in plaats van als boolean, dan werkt een
    // `=== true` in het scherm niet meer.
    expect(standaarden[0].isRequired).toBe(true);
  });

  it('verpakt de standaarden in een lijst onder de sleutel defaults', async () => {
    antwoordMet({ message: 'Standaard privacy-instellingen succesvol bijgewerkt.' });

    await updatePrivacyDefaults([
      { fieldName: 'phone', defaultVisibility: 'orchestra', purposeStatement: 'Vervoer.', isRequired: true },
    ]);

    expect(laatsteVerzoek().methode).toBe('put');
    expect(laatsteVerzoek().pad).toBe('/privacy-settings/defaults');
    expect(laatsteVerzoek().body).toEqual({
      defaults: [
        { fieldName: 'phone', defaultVisibility: 'orchestra', purposeStatement: 'Vervoer.', isRequired: true },
      ],
    });
  });

  it('verwijdert een standaard met de veldnaam in het pad', async () => {
    antwoordMet({});

    await deletePrivacyDefault('phone');

    expect(laatsteVerzoek().methode).toBe('delete');
    expect(laatsteVerzoek().pad).toBe('/privacy-settings/defaults/phone');
  });

  it('laat een 403 door als de rol geen beheerder is', async () => {
    antwoordMetFout(403, { error: 'Geen toegang.' });

    await expect(getPrivacyDefaults()).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('toestemming', () => {
  it('haalt de eerder gegeven toestemmingen op', async () => {
    antwoordMet([{ id: 't1', consentVersion: '1.1', consentedAt: '2026-05-01T09:00:00.000Z', ipAddress: '192.0.2.7' }]);

    const toestemmingen = await getMyConsents();

    expect(laatsteVerzoek().pad).toBe('/privacy-settings/consent');
    expect(toestemmingen[0].consentVersion).toBe('1.1');
  });

  it('legt een nieuwe toestemming vast met de versie in de body', async () => {
    antwoordMet({ id: 't9', consentVersion: '1.2', message: 'Consent succesvol geregistreerd.' }, { status: 201 });

    const antwoord = await recordConsent('1.2');

    expect(laatsteVerzoek().methode).toBe('post');
    expect(laatsteVerzoek().pad).toBe('/privacy-settings/consent');
    expect(laatsteVerzoek().body).toEqual({ consentVersion: '1.2' });
    expect(antwoord.id).toBe('t9');
  });

  it('geeft bij een herhaalde toestemming géén id terug, en het type belooft er ook geen', async () => {
    // Dit is de tweede vorm van hetzelfde antwoord: 200 met alleen een
    // boodschap en alreadyConsented, zonder id.
    antwoordMet({ message: 'Consent al geregistreerd.', alreadyConsented: true });

    const antwoord = await recordConsent('1.2');

    expect(antwoord.alreadyConsented).toBe(true);
    expect(antwoord.id).toBeUndefined();

    // @ts-expect-error - `id` mag niet als zeker aanwezig gelden: bij een
    // herhaalde toestemming stuurt de server hem niet mee. Deze regel is de
    // reparatie zelf; zolang het type `id: string` beloofde, was dit geldige
    // code en faalde `tsc` hier op een ongebruikte @ts-expect-error.
    const zeker: string = antwoord.id;
    expect(zeker).toBeUndefined();
  });

  it('zet de versie in het pad bij het controleren van de toestemming', async () => {
    antwoordMet({ hasConsented: true, consentedAt: '2026-05-01T09:00:00.000Z' });

    const uitkomst = await checkConsent('1.2');

    // Let op het verschil: vastleggen gaat via de body, controleren via het
    // pad. Wie dat verwisselt raakt de route niet en krijgt een 404 die als
    // "nog niet akkoord" oogt - en dan blijft het toestemmingsvenster staan.
    expect(laatsteVerzoek().methode).toBe('get');
    expect(laatsteVerzoek().pad).toBe('/privacy-settings/consent/check/1.2');
    expect(uitkomst.hasConsented).toBe(true);
  });

  it('meldt netjes dat er nog geen toestemming is in plaats van te falen', async () => {
    antwoordMet({ hasConsented: false, consentedAt: null });

    await expect(checkConsent('2.0')).resolves.toMatchObject({ hasConsented: false });
  });
});

describe('de paden komen overeen met wat de server aanbiedt', () => {
  const routes = serverroutes('privacy-settings.ts');

  const aanroepen: [string, () => Promise<unknown>][] = [
    ['getMyPrivacySettings', () => getMyPrivacySettings()],
    ['updateMyPrivacySettings', () => updateMyPrivacySettings([])],
    ['getUserPrivacySettings', () => getUserPrivacySettings('g1')],
    ['getPrivacyDefaults', () => getPrivacyDefaults()],
    ['updatePrivacyDefaults', () => updatePrivacyDefaults([])],
    ['deletePrivacyDefault', () => deletePrivacyDefault('phone')],
    ['getMyConsents', () => getMyConsents()],
    ['recordConsent', () => recordConsent('1.0')],
    ['checkConsent', () => checkConsent('1.0')],
  ];

  it.each(aanroepen)(
    '%s raakt een bestaande route in backend/src/routes/privacy-settings.ts',
    async (_naam, aanroep) => {
      antwoordMet({});
      await aanroep().catch(() => undefined);
      const { methode, pad } = laatsteVerzoek();

      expect(serverBiedtAan(routes, '/privacy-settings', methode, pad)).toBe(true);
    },
  );

  it('let op de valstrik dat /consent/check/:version niet als /consent gelezen wordt', () => {
    // Ze staan als aparte routes geregistreerd en verschillen in aantal
    // segmenten, dus Express houdt ze uit elkaar. Zou de controle ooit als
    // /consent?version=... geschreven worden, dan kwam hij bij de lijst met
    // toestemmingen uit en was `hasConsented` altijd undefined - en dan
    // verschijnt het toestemmingsvenster bij elke aanmelding opnieuw.
    const opGet = routes.filter((r) => r.methode === 'get').map((r) => r.patroon);

    expect(opGet).toContain('/consent');
    expect(opGet).toContain('/consent/check/:version');
  });
});
