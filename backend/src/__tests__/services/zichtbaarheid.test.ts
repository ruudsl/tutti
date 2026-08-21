/**
 * Wie mag welk veld van wie zien.
 *
 * routes/privacy-settings.test.ts loopt de endpoints langs en dekt de gewone
 * gevallen. Hier gaat het om de laag eronder en om de randen: een onbekende
 * stand, een lid zonder orkest of sectie, een lid dat twee instrumenten
 * bespeelt, en - het zwaarste - de vraag of de opstelling van een vreemde
 * vereniging kan bepalen wat er binnen de onze zichtbaar is.
 *
 * De verenigingsgrens zelf wordt door de aanroeper bewaakt: deze module gaat
 * ervan uit dat kijker en eigenaar bij dezelfde vereniging horen. Wat die
 * aanname niet dekt is dat de gegevens waarop hij beslist over verenigingen
 * heen kunnen lopen, en juist dat wordt hier vastgelegd.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import {
  geldendeZichtbaarheid,
  haalKijker,
  instellingenPerLid,
  magVeldZien,
  orkestenPerLid,
  sectiesPerLid,
  verenigingsstandaarden,
  ZICHTBAARHEDEN,
  Kijker,
} from '../../services/zichtbaarheid';
import {
  addInstrumentToUser,
  addUserToOrchestra,
  createTestAssociation,
  createTestInstrument,
  createTestOrchestra,
  createTestUser,
  TestAssociation,
  TestUser,
} from '../testUtils';

describe('zichtbaarheid van ledengegevens', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;
  let ander: TestUser;

  beforeEach(() => {
    vereniging = createTestAssociation({ name: `Vereniging-${uuidv4()}` });
    lid = createTestUser(vereniging.id, { email: `lid-${uuidv4()}@test.nl` });
    ander = createTestUser(vereniging.id, { email: `ander-${uuidv4()}@test.nl` });
  });

  function maakSectie(orchestraId: string, naam: string, rij: number, instrumentIds: string[]): string {
    const sectieId = uuidv4();
    db.prepare('INSERT INTO seating_sections (id, orchestra_id, name, row_number) VALUES (?, ?, ?, ?)').run(
      sectieId,
      orchestraId,
      naam,
      rij,
    );
    for (const instrumentId of instrumentIds) {
      db.prepare('INSERT INTO seating_section_instruments (id, section_id, instrument_id) VALUES (?, ?, ?)').run(
        uuidv4(),
        sectieId,
        instrumentId,
      );
    }
    return sectieId;
  }

  function zetInstelling(userId: string, veld: string, zichtbaarheid: string): void {
    db.prepare('INSERT INTO user_privacy_settings (id, user_id, field_name, visibility) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      userId,
      veld,
      zichtbaarheid,
    );
  }

  function zetStandaard(associationId: string, veld: string, zichtbaarheid: string): void {
    db.prepare(
      'INSERT INTO association_privacy_defaults (id, association_id, field_name, default_visibility) VALUES (?, ?, ?, ?)',
    ).run(uuidv4(), associationId, veld, zichtbaarheid);
  }

  /** Een kijker zonder orkest of sectie, tenzij anders gevraagd. */
  function kijker(overrides: Partial<Kijker> = {}): Kijker {
    return {
      id: overrides.id ?? lid.id,
      role: overrides.role ?? 'member',
      orkesten: overrides.orkesten ?? new Set<string>(),
      secties: overrides.secties ?? new Set<string>(),
    };
  }

  const leegEigenaar = { orkesten: new Set<string>(), secties: new Set<string>() };

  describe('de orkesten van een lid', () => {
    it('geeft een lege kaart terug zonder leden', () => {
      // Zonder deze afslag zou de query eindigen op "IN ()", wat geen geldige
      // SQL is.
      expect(orkestenPerLid([]).size).toBe(0);
    });

    it('vindt elk orkest waarin een lid speelt', () => {
      const eerste = createTestOrchestra(vereniging.id, { name: `A-${uuidv4()}` });
      const tweede = createTestOrchestra(vereniging.id, { name: `B-${uuidv4()}` });
      addUserToOrchestra(lid.id, eerste.id);
      addUserToOrchestra(lid.id, tweede.id);

      expect(orkestenPerLid([lid.id]).get(lid.id)).toEqual(new Set([eerste.id, tweede.id]));
    });

    it('houdt de leden uit elkaar', () => {
      const eerste = createTestOrchestra(vereniging.id, { name: `A-${uuidv4()}` });
      const tweede = createTestOrchestra(vereniging.id, { name: `B-${uuidv4()}` });
      addUserToOrchestra(lid.id, eerste.id);
      addUserToOrchestra(ander.id, tweede.id);

      const perLid = orkestenPerLid([lid.id, ander.id]);
      expect(perLid.get(lid.id)).toEqual(new Set([eerste.id]));
      expect(perLid.get(ander.id)).toEqual(new Set([tweede.id]));
    });

    it('noemt een lid zonder orkest helemaal niet', () => {
      // De aanroeper vult zelf een lege verzameling aan; een lege rij in de
      // kaart zou hetzelfde betekenen maar meer geheugen kosten.
      expect(orkestenPerLid([lid.id]).has(lid.id)).toBe(false);
    });
  });

  describe('de secties van een lid', () => {
    it('geeft een lege kaart terug zonder leden', () => {
      expect(sectiesPerLid([]).size).toBe(0);
    });

    it('zet een lid in de sectie waar zijn instrument thuishoort', () => {
      const orkest = createTestOrchestra(vereniging.id, { name: `Orkest-${uuidv4()}` });
      const trompet = createTestInstrument({ name: `Trompet-${uuidv4()}` });
      const sectie = maakSectie(orkest.id, 'Koper hoog', 1, [trompet.id]);
      addInstrumentToUser(lid.id, trompet.id);

      expect(sectiesPerLid([lid.id]).get(lid.id)).toEqual(new Set([sectie]));
    });

    it('telt elke sectie mee van wie meer dan een instrument speelt', () => {
      const orkest = createTestOrchestra(vereniging.id, { name: `Orkest-${uuidv4()}` });
      const trompet = createTestInstrument({ name: `Trompet-${uuidv4()}` });
      const bugel = createTestInstrument({ name: `Bugel-${uuidv4()}` });
      const hoog = maakSectie(orkest.id, 'Koper hoog', 1, [trompet.id]);
      const laag = maakSectie(orkest.id, 'Koper laag', 2, [bugel.id]);
      addInstrumentToUser(lid.id, trompet.id);
      addInstrumentToUser(lid.id, bugel.id);

      expect(sectiesPerLid([lid.id]).get(lid.id)).toEqual(new Set([hoog, laag]));
    });

    it('noemt een lid met een instrument dat in geen enkele sectie staat niet', () => {
      const solo = createTestInstrument({ name: `Theremin-${uuidv4()}` });
      addInstrumentToUser(lid.id, solo.id);

      expect(sectiesPerLid([lid.id]).has(lid.id)).toBe(false);
    });

    /**
     * De opstelling van een andere vereniging mag hier niet in meetellen.
     *
     * instruments is een platte, verenigingsoverstijgende lijst: "Trompet" is
     * er een, voor iedereen. seating_section_instruments hangt zo'n instrument
     * aan een sectie, en die sectie hoort bij een orkest van een bepaalde
     * vereniging. Zonder grens op de eigen vereniging krijgt een trompettist
     * dus ook de sectie-id's van elke andere vereniging waar trompet in een
     * rij staat.
     *
     * Dat is meer dan ruis. Twee leden van onze vereniging die hier in
     * verschillende rijen staan, delen alsnog een sectie zodra een willekeurige
     * andere vereniging hun instrumenten in een rij zet. Een veld op `section`
     * gaat daarmee open door een opstelling waar wij niets over te zeggen
     * hebben en die we niet eens kunnen zien.
     */
    it('laat de opstelling van een andere vereniging onze secties niet bepalen', () => {
      const onsOrkest = createTestOrchestra(vereniging.id, { name: `Ons-${uuidv4()}` });
      const trompet = createTestInstrument({ name: `Trompet-${uuidv4()}` });
      const bugel = createTestInstrument({ name: `Bugel-${uuidv4()}` });
      maakSectie(onsOrkest.id, 'Koper hoog', 1, [trompet.id]);
      maakSectie(onsOrkest.id, 'Koper laag', 2, [bugel.id]);

      // Een vreemde vereniging zet beide instrumenten in een enkele rij.
      const vreemd = createTestAssociation({ name: `Vreemd-${uuidv4()}` });
      const vreemdOrkest = createTestOrchestra(vreemd.id, { name: `Vreemd-${uuidv4()}` });
      maakSectie(vreemdOrkest.id, 'Al het koper', 1, [trompet.id, bugel.id]);

      addInstrumentToUser(lid.id, trompet.id);
      addInstrumentToUser(ander.id, bugel.id);

      const perLid = sectiesPerLid([lid.id, ander.id]);
      const gedeeld = [...(perLid.get(lid.id) ?? [])].filter((s) => perLid.get(ander.id)?.has(s));
      expect(gedeeld).toEqual([]);

      // En daarmee ook het besluit dat erop rust: bij ons staan ze in
      // verschillende rijen, dus een veld op `section` blijft dicht.
      const trompettist = haalKijker(lid.id, 'member');
      expect(
        magVeldZien(trompettist, ander.id, 'section', {
          orkesten: new Set<string>(),
          secties: perLid.get(ander.id) ?? new Set<string>(),
        }),
      ).toBe(false);
    });

    it('houdt twee leden in dezelfde rij wel bij elkaar', () => {
      // De keerzijde van de test hierboven: binnen de eigen vereniging moet
      // het gewoon blijven werken.
      const orkest = createTestOrchestra(vereniging.id, { name: `Orkest-${uuidv4()}` });
      const trompet = createTestInstrument({ name: `Trompet-${uuidv4()}` });
      const bugel = createTestInstrument({ name: `Bugel-${uuidv4()}` });
      const sectie = maakSectie(orkest.id, 'Koper hoog', 1, [trompet.id, bugel.id]);
      addInstrumentToUser(lid.id, trompet.id);
      addInstrumentToUser(ander.id, bugel.id);

      const perLid = sectiesPerLid([lid.id, ander.id]);
      expect(perLid.get(lid.id)).toEqual(new Set([sectie]));
      expect(perLid.get(ander.id)).toEqual(new Set([sectie]));
    });
  });

  describe('de kijker samenstellen', () => {
    it('vult orkesten en secties van het lid', () => {
      const orkest = createTestOrchestra(vereniging.id, { name: `Orkest-${uuidv4()}` });
      const trompet = createTestInstrument({ name: `Trompet-${uuidv4()}` });
      const sectie = maakSectie(orkest.id, 'Koper hoog', 1, [trompet.id]);
      addUserToOrchestra(lid.id, orkest.id);
      addInstrumentToUser(lid.id, trompet.id);

      const k = haalKijker(lid.id, 'member');
      expect(k.id).toBe(lid.id);
      expect(k.role).toBe('member');
      expect(k.orkesten).toEqual(new Set([orkest.id]));
      expect(k.secties).toEqual(new Set([sectie]));
    });

    it('geeft lege verzamelingen voor een lid dat nergens in zit', () => {
      const k = haalKijker(lid.id, 'member');
      expect(k.orkesten.size).toBe(0);
      expect(k.secties.size).toBe(0);
    });

    it('geeft lege verzamelingen voor een lid dat niet bestaat', () => {
      const k = haalKijker(uuidv4(), 'member');
      expect(k.orkesten.size).toBe(0);
      expect(k.secties.size).toBe(0);
    });
  });

  describe('mag deze kijker dit veld zien', () => {
    it('laat een lid altijd zijn eigen gegevens zien', () => {
      // Ook als hij het veld zelf op admin_only heeft gezet: die keuze gaat
      // over anderen, niet over hemzelf.
      expect(magVeldZien(kijker(), lid.id, 'admin_only', leegEigenaar)).toBe(true);
    });

    it('laat een beheerder alles zien', () => {
      expect(magVeldZien(kijker({ role: 'admin' }), ander.id, 'admin_only', leegEigenaar)).toBe(true);
    });

    it('toont public en all_members aan elk lid', () => {
      expect(magVeldZien(kijker(), ander.id, 'public', leegEigenaar)).toBe(true);
      expect(magVeldZien(kijker(), ander.id, 'all_members', leegEigenaar)).toBe(true);
    });

    it('houdt admin_only dicht voor een gewoon lid', () => {
      expect(magVeldZien(kijker(), ander.id, 'admin_only', leegEigenaar)).toBe(false);
    });

    it('houdt admin_only ook dicht voor een commissielid', () => {
      // De trap loopt van admin_only naar public: wie de commissietrede haalt
      // is daarmee nog geen beheerder.
      expect(magVeldZien(kijker({ role: 'music_committee' }), ander.id, 'admin_only', leegEigenaar)).toBe(false);
    });

    it.each(['music_committee', 'equipment_committee', 'uniforms_committee', 'conductor'])(
      'rekent %s tot de commissie',
      (rol) => {
        expect(magVeldZien(kijker({ role: rol }), ander.id, 'committee', leegEigenaar)).toBe(true);
      },
    );

    it('rekent een gewoon lid niet tot de commissie', () => {
      expect(magVeldZien(kijker(), ander.id, 'committee', leegEigenaar)).toBe(false);
    });

    it('toont een orkestveld aan wie in hetzelfde orkest speelt', () => {
      const orkest = uuidv4();
      expect(
        magVeldZien(kijker({ orkesten: new Set([orkest]) }), ander.id, 'orchestra', {
          orkesten: new Set([orkest]),
          secties: new Set(),
        }),
      ).toBe(true);
    });

    it('verbergt een orkestveld voor wie in een ander orkest speelt', () => {
      expect(
        magVeldZien(kijker({ orkesten: new Set([uuidv4()]) }), ander.id, 'orchestra', {
          orkesten: new Set([uuidv4()]),
          secties: new Set(),
        }),
      ).toBe(false);
    });

    it('verbergt een orkestveld voor wie in geen enkel orkest speelt', () => {
      expect(magVeldZien(kijker(), ander.id, 'orchestra', { orkesten: new Set([uuidv4()]), secties: new Set() })).toBe(
        false,
      );
    });

    it('verbergt een orkestveld ook als de eigenaar nergens in speelt', () => {
      // Twee lege verzamelingen hebben niets gemeen; "allebei nergens" mag
      // geen overeenkomst worden.
      expect(magVeldZien(kijker(), ander.id, 'orchestra', leegEigenaar)).toBe(false);
    });

    it('toont een sectieveld aan wie een rij deelt', () => {
      const sectie = uuidv4();
      expect(
        magVeldZien(kijker({ secties: new Set([sectie]) }), ander.id, 'section', {
          orkesten: new Set(),
          secties: new Set([sectie]),
        }),
      ).toBe(true);
    });

    it('genoeg is een enkele gedeelde rij bij wie meer instrumenten speelt', () => {
      const gedeeld = uuidv4();
      expect(
        magVeldZien(kijker({ secties: new Set([uuidv4(), gedeeld]) }), ander.id, 'section', {
          orkesten: new Set(),
          secties: new Set([gedeeld, uuidv4()]),
        }),
      ).toBe(true);
    });

    it('verbergt een sectieveld voor wie in een andere rij staat', () => {
      expect(
        magVeldZien(kijker({ secties: new Set([uuidv4()]) }), ander.id, 'section', {
          orkesten: new Set(),
          secties: new Set([uuidv4()]),
        }),
      ).toBe(false);
    });

    it('houdt orkest en sectie uit elkaar', () => {
      // Een gedeeld orkest zegt niets over de rij op het podium, en andersom.
      const gedeeld = uuidv4();
      const kijkerMetOrkest = kijker({ orkesten: new Set([gedeeld]) });
      const eigenaar = { orkesten: new Set([gedeeld]), secties: new Set<string>() };

      expect(magVeldZien(kijkerMetOrkest, ander.id, 'orchestra', eigenaar)).toBe(true);
      expect(magVeldZien(kijkerMetOrkest, ander.id, 'section', eigenaar)).toBe(false);
    });

    it('houdt een onbekende stand dicht', () => {
      // Een waarde die hier niet thuishoort - uit een oudere rij of een typfout
      // in een migratie - is geen reden om het veld open te zetten.
      expect(magVeldZien(kijker(), ander.id, 'iets_anders', leegEigenaar)).toBe(false);
      expect(magVeldZien(kijker(), ander.id, '', leegEigenaar)).toBe(false);
      expect(magVeldZien(kijker(), ander.id, 'PUBLIC', leegEigenaar)).toBe(false);
    });

    it('kent elke stand uit de lijst een besluit toe', () => {
      // Elke waarde die het schema toestaat moet hier langskomen; anders zou
      // een nieuwe stand stilletjes in de default belanden.
      for (const stand of ZICHTBAARHEDEN) {
        expect(typeof magVeldZien(kijker(), ander.id, stand, leegEigenaar)).toBe('boolean');
      }
    });
  });

  describe('welke zichtbaarheid geldt', () => {
    it('laat de eigen keuze voorgaan op die van de vereniging', () => {
      expect(geldendeZichtbaarheid('admin_only', 'public')).toBe('admin_only');
    });

    it('valt terug op de standaard van de vereniging', () => {
      expect(geldendeZichtbaarheid(undefined, 'committee')).toBe('committee');
    });

    it('valt terug op all_members als niemand iets koos', () => {
      expect(geldendeZichtbaarheid(undefined, undefined)).toBe('all_members');
    });

    it('behandelt een lege tekst als niets gekozen', () => {
      expect(geldendeZichtbaarheid('', 'committee')).toBe('committee');
      expect(geldendeZichtbaarheid('', '')).toBe('all_members');
    });
  });

  describe('de instellingen van leden ophalen', () => {
    it('geeft een lege kaart terug zonder leden', () => {
      expect(instellingenPerLid([]).size).toBe(0);
    });

    it('geeft per lid per veld terug wat er gekozen is', () => {
      zetInstelling(lid.id, 'phone', 'admin_only');
      zetInstelling(lid.id, 'email', 'committee');
      zetInstelling(ander.id, 'phone', 'public');

      const perLid = instellingenPerLid([lid.id, ander.id]);
      expect(perLid.get(lid.id)?.get('phone')).toBe('admin_only');
      expect(perLid.get(lid.id)?.get('email')).toBe('committee');
      expect(perLid.get(ander.id)?.get('phone')).toBe('public');
    });

    it('noemt een lid dat niets heeft ingesteld niet', () => {
      expect(instellingenPerLid([lid.id]).has(lid.id)).toBe(false);
    });

    it('geeft niets terug over een lid waar niet naar gevraagd is', () => {
      zetInstelling(ander.id, 'phone', 'public');
      expect(instellingenPerLid([lid.id]).has(ander.id)).toBe(false);
    });
  });

  describe('de standaarden van een vereniging', () => {
    it('geeft een lege kaart zonder vereniging', () => {
      // req.user!.associationId kan leeg zijn; dat mag geen query worden die
      // de standaarden van iedereen ophaalt.
      expect(verenigingsstandaarden(null).size).toBe(0);
      expect(verenigingsstandaarden(undefined).size).toBe(0);
      expect(verenigingsstandaarden('').size).toBe(0);
    });

    it('geeft per veld de standaard terug', () => {
      zetStandaard(vereniging.id, 'phone', 'committee');
      zetStandaard(vereniging.id, 'address', 'admin_only');

      const standaarden = verenigingsstandaarden(vereniging.id);
      expect(standaarden.get('phone')).toBe('committee');
      expect(standaarden.get('address')).toBe('admin_only');
    });

    it('laat de standaarden van een andere vereniging erbuiten', () => {
      const andereVereniging = createTestAssociation({ name: `Andere-${uuidv4()}` });
      zetStandaard(andereVereniging.id, 'phone', 'public');
      zetStandaard(vereniging.id, 'phone', 'admin_only');

      expect(verenigingsstandaarden(vereniging.id).get('phone')).toBe('admin_only');
    });

    it('geeft een lege kaart voor een vereniging die niets vastlegde', () => {
      expect(verenigingsstandaarden(vereniging.id).size).toBe(0);
    });
  });
});
