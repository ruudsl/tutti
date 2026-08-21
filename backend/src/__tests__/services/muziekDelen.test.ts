/**
 * Wie mag welke muziek van een andere vereniging zien.
 *
 * routes/music-sharing.test.ts loopt de endpoints langs. Hier zit de laag
 * eronder: de functies die per vraag beslissen of iemand iets mag. Die
 * beslissingen zijn de verenigingsgrens van dit onderdeel, en een grens die
 * alleen via een route wordt beproefd blijft afhankelijk van de route die er
 * toevallig omheen staat. Wat hier staat gaat daarom over de randen die je
 * via een endpoint niet of nauwelijks bereikt: een partnerschap dat is
 * opgezegd terwijl de deling blijft staan, een titel met dezelfde naam bij
 * twee verenigingen, een arrangeur die NULL is aan beide kanten, en een
 * vervaltijd die vandaag al verstreken is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import {
  CODE_GELDIG_UREN,
  gekoppeldeVerenigingen,
  isGekoppeld,
  isUitgesloten,
  magBestandOphalen,
  magTitelZien,
  maakKoppelcode,
  partijenVanTitel,
  titelVanPartij,
  wisselKoppelcodeIn,
} from '../../services/muziekDelen';
import {
  createTestAssociation,
  createTestInstrument,
  createTestMusicPiece,
  createTestUser,
  TestAssociation,
  TestUser,
} from '../testUtils';

describe('muziek delen tussen verenigingen (dienstlaag)', () => {
  let ons: TestAssociation;
  let onsLid: TestUser;
  let hun: TestAssociation;
  let hunLid: TestUser;
  let derde: TestAssociation;
  let derdeLid: TestUser;

  beforeEach(() => {
    ons = createTestAssociation({ name: `Ons-${uuidv4()}` });
    onsLid = createTestUser(ons.id, { email: `ons-${uuidv4()}@test.nl` });
    hun = createTestAssociation({ name: `Hun-${uuidv4()}` });
    hunLid = createTestUser(hun.id, { email: `hun-${uuidv4()}@test.nl` });
    derde = createTestAssociation({ name: `Derde-${uuidv4()}` });
    derdeLid = createTestUser(derde.id, { email: `derde-${uuidv4()}@test.nl` });
  });

  function maakPartnerschap(a: string, b: string, opties: { status?: string; music?: boolean } = {}): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO association_partnerships
         (id, association_a_id, association_b_id, partnership_type, share_music, status, requested_by)
       VALUES (?, ?, ?, 'sharing', ?, ?, ?)`,
    ).run(id, a, b, opties.music === false ? 0 : 1, opties.status ?? 'active', onsLid.id);
    return id;
  }

  function maakTitel(
    associationId: string,
    titel: string,
    opties: { arranger?: string | null; deletedAt?: string | null } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, arranger, association_id, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, titel, opties.arranger ?? null, associationId, opties.deletedAt ?? null);
    return id;
  }

  function deel(titelId: string, partnerId: string, doorLid: string): void {
    db.prepare(
      `INSERT INTO music_title_shares (id, music_title_id, partner_association_id, shared_by)
       VALUES (?, ?, ?, ?)`,
    ).run(uuidv4(), titelId, partnerId, doorLid);
  }

  function sluitUit(partijId: string, doorLid: string): void {
    db.prepare('INSERT INTO music_share_exclusions (id, music_piece_id, excluded_by) VALUES (?, ?, ?)').run(
      uuidv4(),
      partijId,
      doorLid,
    );
  }

  function maakVerzoek(
    partijId: string,
    eigenaar: string,
    vrager: string,
    vragerLid: string,
    opties: { status?: string; vervalt?: string | null } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_file_requests
         (id, music_piece_id, owner_association_id, requesting_association_id, requested_by, status, access_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, partijId, eigenaar, vrager, vragerLid, opties.status ?? 'approved', opties.vervalt ?? null);
    return id;
  }

  /** Een moment dat zeker in de toekomst ligt, gerekend vanaf nu. */
  const overEenUur = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
  /** Een moment dat zeker voorbij is, gerekend vanaf nu. */
  const eenUurGeleden = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  describe('een koppelcode aanmaken', () => {
    it('geeft een code van twee blokken van vier tekens', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    });

    it('laat de tekens weg die je bij het voorlezen verwart', () => {
      // O/0 en I/1/L staan bewust niet in de alfabet-reeks: deze code wordt
      // overgetypt van een briefje of door de telefoon doorgegeven.
      for (let i = 0; i < 40; i++) {
        const { code } = maakKoppelcode(ons.id, onsLid.id);
        expect(code).not.toMatch(/[OI0L1]/);
      }
    });

    it('legt de vervaldatum op 72 uur vooruit', () => {
      const voor = Date.now();
      const { expiresAt } = maakKoppelcode(ons.id, onsLid.id);
      const verwacht = voor + CODE_GELDIG_UREN * 60 * 60 * 1000;

      // Een marge van een paar seconden, want tussen het meten en het
      // wegschrijven zit de tijd die de test zelf kost.
      expect(new Date(expiresAt).getTime()).toBeGreaterThanOrEqual(verwacht - 5000);
      expect(new Date(expiresAt).getTime()).toBeLessThanOrEqual(verwacht + 5000);
    });

    it('trekt een eerdere openstaande code van dezelfde vereniging in', () => {
      // Anders stapelen codes zich op en blijft een code die je ooit hebt
      // rondgestuurd werken terwijl je denkt dat de nieuwe hem vervangt.
      const eerste = maakKoppelcode(ons.id, onsLid.id);
      const tweede = maakKoppelcode(ons.id, onsLid.id);

      expect(wisselKoppelcodeIn(eerste.code, hun.id, hunLid.id).fout).toBe('onbekend');
      expect(wisselKoppelcodeIn(tweede.code, hun.id, hunLid.id).fout).toBeUndefined();
    });

    it('laat een al gebruikte code van dezelfde vereniging staan', () => {
      // De ingewisselde code is het bewijs wie er wanneer gekoppeld is; die
      // mag een nieuwe code niet wegvegen.
      const eerste = maakKoppelcode(ons.id, onsLid.id);
      wisselKoppelcodeIn(eerste.code, hun.id, hunLid.id);
      maakKoppelcode(ons.id, onsLid.id);

      const rij = db
        .prepare('SELECT used_by_association_id AS door FROM association_link_codes WHERE code = ?')
        .get(eerste.code) as { door: string } | undefined;
      expect(rij?.door).toBe(hun.id);
    });

    it('raakt de openstaande code van een andere vereniging niet aan', () => {
      const vanHun = maakKoppelcode(hun.id, hunLid.id);
      maakKoppelcode(ons.id, onsLid.id);

      expect(wisselKoppelcodeIn(vanHun.code, ons.id, onsLid.id).fout).toBeUndefined();
    });
  });

  describe('een koppelcode inwisselen', () => {
    it('koppelt twee verenigingen en noemt de partner bij naam', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      const resultaat = wisselKoppelcodeIn(code, hun.id, hunLid.id);

      expect(resultaat.fout).toBeUndefined();
      expect(resultaat.partnerId).toBe(ons.id);
      expect(resultaat.partnerNaam).toBe(ons.name);
      expect(isGekoppeld(hun.id, ons.id)).toBe(true);
    });

    it('leest een code met kleine letters en spaties eromheen ook', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      expect(wisselKoppelcodeIn(`  ${code.toLowerCase()} `, hun.id, hunLid.id).fout).toBeUndefined();
    });

    it('kent een code die niet bestaat niet', () => {
      expect(wisselKoppelcodeIn('ZZZZ-ZZZZ', hun.id, hunLid.id).fout).toBe('onbekend');
    });

    it('wisselt dezelfde code geen tweede keer in', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      wisselKoppelcodeIn(code, hun.id, hunLid.id);

      expect(wisselKoppelcodeIn(code, derde.id, derdeLid.id).fout).toBe('gebruikt');
      expect(isGekoppeld(ons.id, derde.id)).toBe(false);
    });

    it('weigert een code waarvan de termijn voorbij is', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      db.prepare('UPDATE association_link_codes SET expires_at = ? WHERE code = ?').run(eenUurGeleden(), code);

      expect(wisselKoppelcodeIn(code, hun.id, hunLid.id).fout).toBe('verlopen');
    });

    it('laat een code niet op de eigen vereniging inwisselen', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      expect(wisselKoppelcodeIn(code, ons.id, onsLid.id).fout).toBe('eigen-vereniging');
    });

    it('meldt dat er al een actieve koppeling ligt', () => {
      maakPartnerschap(ons.id, hun.id);
      const { code } = maakKoppelcode(ons.id, onsLid.id);

      expect(wisselKoppelcodeIn(code, hun.id, hunLid.id).fout).toBe('al-gekoppeld');
    });

    it('laat de code staan als het inwisselen op een fout stukliep', () => {
      // Een code die afketst op de eigen vereniging is niet verbruikt; anders
      // is hij weg door een vergissing van degene die hem invoert.
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      wisselKoppelcodeIn(code, ons.id, onsLid.id);

      expect(wisselKoppelcodeIn(code, hun.id, hunLid.id).fout).toBeUndefined();
    });

    it('brengt een opgezegde koppeling weer tot leven', () => {
      // Opzeggen zet de rij op 'ended'. Een nieuwe code moet daar overheen
      // kunnen, anders kun je na een opzegging nooit meer koppelen: de rij
      // staat er nog en UNIQUE(a, b) laat geen tweede toe.
      maakPartnerschap(ons.id, hun.id, { status: 'ended', music: false });
      const { code } = maakKoppelcode(ons.id, onsLid.id);

      expect(wisselKoppelcodeIn(code, hun.id, hunLid.id).fout).toBeUndefined();
      expect(isGekoppeld(ons.id, hun.id)).toBe(true);
    });

    it('herkent de bestaande koppeling ook als de partij andersom staat', () => {
      // De code komt van ons, maar de rij staat met hun vereniging als a.
      maakPartnerschap(hun.id, ons.id);
      const { code } = maakKoppelcode(ons.id, onsLid.id);

      expect(wisselKoppelcodeIn(code, hun.id, hunLid.id).fout).toBe('al-gekoppeld');
    });

    it('zet share_music aan bij een koppeling die muziek nog niet deelde', () => {
      maakPartnerschap(ons.id, hun.id, { status: 'pending', music: false });
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      wisselKoppelcodeIn(code, hun.id, hunLid.id);

      const rij = db
        .prepare('SELECT share_music AS m, status FROM association_partnerships WHERE association_a_id = ?')
        .get(ons.id) as { m: number; status: string };
      expect(rij.m).toBe(1);
      expect(rij.status).toBe('active');
    });

    it('tekent op wie de code gebruikt heeft', () => {
      const { code } = maakKoppelcode(ons.id, onsLid.id);
      wisselKoppelcodeIn(code, hun.id, hunLid.id);

      const rij = db
        .prepare('SELECT used_at AS wanneer, used_by_association_id AS door FROM association_link_codes WHERE code = ?')
        .get(code) as { wanneer: string | null; door: string | null };
      expect(rij.wanneer).not.toBeNull();
      expect(rij.door).toBe(hun.id);
    });
  });

  describe('welke verenigingen gekoppeld zijn', () => {
    it('vindt de partner ongeacht aan welke kant hij staat', () => {
      maakPartnerschap(ons.id, hun.id);
      maakPartnerschap(derde.id, ons.id);

      const namen = gekoppeldeVerenigingen(ons.id).map((v) => v.id);
      expect(namen).toContain(hun.id);
      expect(namen).toContain(derde.id);
    });

    it('noemt de eigen vereniging niet', () => {
      maakPartnerschap(ons.id, hun.id);
      expect(gekoppeldeVerenigingen(ons.id).map((v) => v.id)).not.toContain(ons.id);
    });

    it('telt een koppeling die nog niet actief is niet mee', () => {
      maakPartnerschap(ons.id, hun.id, { status: 'pending' });
      expect(gekoppeldeVerenigingen(ons.id)).toHaveLength(0);
    });

    it('telt een opgezegde koppeling niet mee', () => {
      maakPartnerschap(ons.id, hun.id, { status: 'ended' });
      expect(gekoppeldeVerenigingen(ons.id)).toHaveLength(0);
    });

    it('telt een koppeling zonder muziek delen niet mee', () => {
      // Een partnerschap kan ook alleen over concerten of leden gaan.
      maakPartnerschap(ons.id, hun.id, { music: false });
      expect(gekoppeldeVerenigingen(ons.id)).toHaveLength(0);
    });

    it('laat een stilgezette vereniging weg', () => {
      maakPartnerschap(ons.id, hun.id);
      db.prepare('UPDATE associations SET is_active = 0 WHERE id = ?').run(hun.id);

      expect(gekoppeldeVerenigingen(ons.id)).toHaveLength(0);
    });

    it('rekent een vereniging zonder ingevulde stand als actief', () => {
      // is_active is bij een oudere rij NULL; dat betekent niet stilgezet.
      maakPartnerschap(ons.id, hun.id);
      db.prepare('UPDATE associations SET is_active = NULL WHERE id = ?').run(hun.id);

      expect(gekoppeldeVerenigingen(ons.id).map((v) => v.id)).toEqual([hun.id]);
    });

    it('zet de partners op naam op volgorde', () => {
      const a = createTestAssociation({ name: 'Aaa-orkest' });
      const z = createTestAssociation({ name: 'Zzz-orkest' });
      maakPartnerschap(ons.id, z.id);
      maakPartnerschap(ons.id, a.id);

      expect(gekoppeldeVerenigingen(ons.id).map((v) => v.name)).toEqual(['Aaa-orkest', 'Zzz-orkest']);
    });

    it('geeft de weergavenaam mee als die er is', () => {
      db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run('Harmonie Sint Cecilia', hun.id);
      maakPartnerschap(ons.id, hun.id);

      expect(gekoppeldeVerenigingen(ons.id)[0].displayName).toBe('Harmonie Sint Cecilia');
    });

    it('kijkt bij isGekoppeld naar beide richtingen', () => {
      maakPartnerschap(ons.id, hun.id);

      expect(isGekoppeld(ons.id, hun.id)).toBe(true);
      expect(isGekoppeld(hun.id, ons.id)).toBe(true);
      expect(isGekoppeld(ons.id, derde.id)).toBe(false);
    });

    it('zegt nee tegen een partner die nooit gekoppeld is geweest', () => {
      expect(isGekoppeld(ons.id, derde.id)).toBe(false);
      expect(gekoppeldeVerenigingen(ons.id)).toHaveLength(0);
    });
  });

  describe('de partijen bij een titel', () => {
    it('koppelt partij aan titel via titel en arrangeur binnen de vereniging', () => {
      const titelId = maakTitel(ons.id, 'Mars der Medici');
      createTestMusicPiece(ons.id, { title: 'Mars der Medici', originalFilename: 'trompet.pdf' });

      expect(partijenVanTitel(titelId).map((p) => p.originalFilename)).toEqual(['trompet.pdf']);
    });

    it('houdt een gelijknamig stuk met een andere arrangeur erbuiten', () => {
      const titelId = maakTitel(ons.id, 'Mars der Medici', { arranger: 'Van der Roost' });
      createTestMusicPiece(ons.id, { title: 'Mars der Medici', arranger: 'Van der Roost', originalFilename: 'ja.pdf' });
      createTestMusicPiece(ons.id, {
        title: 'Mars der Medici',
        arranger: 'Iemand anders',
        originalFilename: 'nee.pdf',
      });

      expect(partijenVanTitel(titelId).map((p) => p.originalFilename)).toEqual(['ja.pdf']);
    });

    it('koppelt ook als de arrangeur aan beide kanten leeg is', () => {
      // NULL = NULL is in SQL niet waar; de query gebruikt daarom IS. Zonder
      // dat zou geen enkel stuk zonder arrangeur ooit partijen tonen, en dat
      // is verreweg het meest voorkomende geval.
      const titelId = maakTitel(ons.id, 'Zonder arrangeur', { arranger: null });
      createTestMusicPiece(ons.id, { title: 'Zonder arrangeur', arranger: null, originalFilename: 'bugel.pdf' });

      expect(partijenVanTitel(titelId)).toHaveLength(1);
    });

    it('houdt de partij van een gelijknamig stuk bij een andere vereniging erbuiten', () => {
      // music_titles heeft UNIQUE(title, arranger, association_id): hetzelfde
      // stuk bestaat bij elke vereniging opnieuw. Zonder de grens op
      // association_id zouden partijen van vreemde verenigingen meekomen.
      const titelId = maakTitel(ons.id, 'Gedeelde Titel');
      createTestMusicPiece(ons.id, { title: 'Gedeelde Titel', originalFilename: 'onze.pdf' });
      createTestMusicPiece(hun.id, { title: 'Gedeelde Titel', originalFilename: 'hunne.pdf' });

      expect(partijenVanTitel(titelId).map((p) => p.originalFilename)).toEqual(['onze.pdf']);
    });

    it('laat een verwijderde partij weg', () => {
      const titelId = maakTitel(ons.id, 'Met een gewiste partij');
      createTestMusicPiece(ons.id, { title: 'Met een gewiste partij', originalFilename: 'blijft.pdf' });
      createTestMusicPiece(ons.id, {
        title: 'Met een gewiste partij',
        originalFilename: 'weg.pdf',
        deletedAt: new Date().toISOString(),
      });

      expect(partijenVanTitel(titelId).map((p) => p.originalFilename)).toEqual(['blijft.pdf']);
    });

    it('markeert een uitgesloten partij zonder hem te verbergen', () => {
      // De eigenaar moet in zijn eigen overzicht zien wat hij heeft
      // uitgesloten; het filteren gebeurt pas bij de partner.
      const titelId = maakTitel(ons.id, 'Met partituur');
      const partituur = createTestMusicPiece(ons.id, { title: 'Met partituur', originalFilename: 'partituur.pdf' });
      sluitUit(partituur.id, onsLid.id);

      const partijen = partijenVanTitel(titelId);
      expect(partijen).toHaveLength(1);
      expect(partijen[0].uitgesloten).toBe(true);
    });

    it('geeft instrument en stemming mee', () => {
      const instrument = createTestInstrument({ name: 'Trompet' });
      const titelId = maakTitel(ons.id, 'Met instrument');
      createTestMusicPiece(ons.id, {
        title: 'Met instrument',
        instrumentId: instrument.id,
        tuning: 'Bb',
        groupNumber: '1',
      });

      const partij = partijenVanTitel(titelId)[0];
      expect(partij.instrumentName).toBe('Trompet');
      expect(partij.tuning).toBe('Bb');
      expect(partij.groupNumber).toBe('1');
    });

    it('geeft een lege lijst voor een titel die niet bestaat', () => {
      expect(partijenVanTitel(uuidv4())).toEqual([]);
    });
  });

  describe('een titel mogen zien', () => {
    let titelId: string;

    beforeEach(() => {
      titelId = maakTitel(ons.id, 'Ons Stuk');
    });

    it('laat een gekoppelde partner de gedeelde titel zien', () => {
      maakPartnerschap(ons.id, hun.id);
      deel(titelId, hun.id, onsLid.id);

      expect(magTitelZien(hun.id, titelId)).toBe(true);
    });

    it('toont niets zonder deling, ook al is er een koppeling', () => {
      maakPartnerschap(ons.id, hun.id);
      expect(magTitelZien(hun.id, titelId)).toBe(false);
    });

    it('toont niets aan een vereniging waarmee niet gedeeld is', () => {
      maakPartnerschap(ons.id, hun.id);
      maakPartnerschap(ons.id, derde.id);
      deel(titelId, hun.id, onsLid.id);

      expect(magTitelZien(derde.id, titelId)).toBe(false);
    });

    it('laat een blijven staande deling niets doen na het opzeggen', () => {
      // Dit is de reden dat de koppeling bij elke vraag opnieuw wordt
      // getoetst en niet alleen bij het aanmaken van de deling.
      const id = maakPartnerschap(ons.id, hun.id);
      deel(titelId, hun.id, onsLid.id);
      db.prepare("UPDATE association_partnerships SET status = 'ended' WHERE id = ?").run(id);

      expect(magTitelZien(hun.id, titelId)).toBe(false);
    });

    it('laat een deling niets doen zodra muziek delen uitgaat', () => {
      const id = maakPartnerschap(ons.id, hun.id);
      deel(titelId, hun.id, onsLid.id);
      db.prepare('UPDATE association_partnerships SET share_music = 0 WHERE id = ?').run(id);

      expect(magTitelZien(hun.id, titelId)).toBe(false);
    });

    it('toont een verwijderde titel niet meer', () => {
      maakPartnerschap(ons.id, hun.id);
      deel(titelId, hun.id, onsLid.id);
      db.prepare('UPDATE music_titles SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), titelId);

      expect(magTitelZien(hun.id, titelId)).toBe(false);
    });

    it('kent een titel die niet bestaat niet', () => {
      expect(magTitelZien(hun.id, uuidv4())).toBe(false);
    });
  });

  describe('een titel bij een partij zoeken', () => {
    it('vindt de titel bij de partij', () => {
      const titelId = maakTitel(ons.id, 'Ons Stuk');
      const partij = createTestMusicPiece(ons.id, { title: 'Ons Stuk' });

      expect(titelVanPartij(partij.id)).toEqual({ id: titelId, associationId: ons.id });
    });

    it('kiest de titel van de eigen vereniging bij een gelijknamig stuk elders', () => {
      maakTitel(hun.id, 'Ons Stuk');
      const onzeTitel = maakTitel(ons.id, 'Ons Stuk');
      const partij = createTestMusicPiece(ons.id, { title: 'Ons Stuk' });

      expect(titelVanPartij(partij.id)?.id).toBe(onzeTitel);
    });

    it('vindt niets bij een verwijderde partij', () => {
      maakTitel(ons.id, 'Ons Stuk');
      const partij = createTestMusicPiece(ons.id, { title: 'Ons Stuk', deletedAt: new Date().toISOString() });

      expect(titelVanPartij(partij.id)).toBeUndefined();
    });

    it('vindt niets bij een verwijderde titel', () => {
      maakTitel(ons.id, 'Ons Stuk', { deletedAt: new Date().toISOString() });
      const partij = createTestMusicPiece(ons.id, { title: 'Ons Stuk' });

      expect(titelVanPartij(partij.id)).toBeUndefined();
    });

    it('vindt niets bij een partij zonder titelrij', () => {
      const partij = createTestMusicPiece(ons.id, { title: 'Nooit als titel vastgelegd' });
      expect(titelVanPartij(partij.id)).toBeUndefined();
    });
  });

  describe('uitsluitingen', () => {
    it('herkent een uitgesloten partij', () => {
      const partij = createTestMusicPiece(ons.id, { title: 'Iets' });
      expect(isUitgesloten(partij.id)).toBe(false);

      sluitUit(partij.id, onsLid.id);
      expect(isUitgesloten(partij.id)).toBe(true);
    });

    it('geldt voor alle partners tegelijk', () => {
      // Een uitsluiting hoort bij de partij, niet bij de relatie: de
      // dirigentenpartituur deel je met niemand.
      const titelId = maakTitel(ons.id, 'Met partituur');
      const partituur = createTestMusicPiece(ons.id, { title: 'Met partituur' });
      sluitUit(partituur.id, onsLid.id);
      maakPartnerschap(ons.id, hun.id);
      maakPartnerschap(ons.id, derde.id);
      deel(titelId, hun.id, onsLid.id);
      deel(titelId, derde.id, onsLid.id);
      maakVerzoek(partituur.id, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      maakVerzoek(partituur.id, ons.id, derde.id, derdeLid.id, { vervalt: overEenUur() });

      expect(magBestandOphalen(hun.id, partituur.id)).toBe(false);
      expect(magBestandOphalen(derde.id, partituur.id)).toBe(false);
    });
  });

  describe('een vrijgegeven bestand ophalen', () => {
    let titelId: string;
    let partijId: string;

    beforeEach(() => {
      titelId = maakTitel(ons.id, 'Ons Stuk');
      partijId = createTestMusicPiece(ons.id, { title: 'Ons Stuk' }).id;
      maakPartnerschap(ons.id, hun.id);
      deel(titelId, hun.id, onsLid.id);
    });

    it('laat een goedgekeurd verzoek binnen de termijn door', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      expect(magBestandOphalen(hun.id, partijId)).toBe(true);
    });

    it('laat toegang zonder einddatum staan', () => {
      // access_expires_at mag NULL zijn; dat betekent onbeperkt, niet verlopen.
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: null });
      expect(magBestandOphalen(hun.id, partijId)).toBe(true);
    });

    it('houdt een openstaand verzoek tegen', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { status: 'pending', vervalt: overEenUur() });
      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('houdt een afgewezen verzoek tegen', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { status: 'rejected', vervalt: overEenUur() });
      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('houdt een ingetrokken verzoek tegen', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { status: 'withdrawn', vervalt: overEenUur() });
      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('houdt tegen zonder enig verzoek', () => {
      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('houdt een verzoek van een andere vereniging tegen', () => {
      maakPartnerschap(ons.id, derde.id);
      deel(titelId, derde.id, onsLid.id);
      maakVerzoek(partijId, ons.id, derde.id, derdeLid.id, { vervalt: overEenUur() });

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('weigert zodra de termijn voorbij is', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: eenUurGeleden() });
      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    /**
     * De vervaldatum staat als ISO-tekst in de kolom en werd met
     * CURRENT_TIMESTAMP vergeleken. CURRENT_TIMESTAMP levert
     * '2026-09-20 12:00:00', de kolom '2026-09-20T12:00:00.000Z'. Tot en met
     * de datum lopen die gelijk op; op positie elf staat een 'T' (0x54)
     * tegenover een spatie (0x20). SQLite vergelijkt hier tekst, dus de
     * ISO-vorm won altijd bij een gelijke datum: elke vervaltijd van vandaag
     * gold als toekomst en de toegang liep pas om middernacht af.
     */
    it('weigert ook als de termijn eerder vandaag al verstreken is', () => {
      const vandaagBegin = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: vandaagBegin });

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('laat zien dat SQLite die twee vormen als tekst vergelijkt', () => {
      // De reden achter de test hierboven, los van onze code: zonder deze
      // eigenschap van SQLite was er niets aan de hand.
      const rij = db
        .prepare(
          `SELECT ('2026-09-20T00:00:00.000Z' > '2026-09-20 23:59:59') AS isoWint,
                  ('T' > ' ') AS tGrootsteTeken`,
        )
        .get() as { isoWint: number; tGrootsteTeken: number };

      expect(rij.isoWint).toBe(1);
      expect(rij.tGrootsteTeken).toBe(1);
    });

    it('weigert zodra de deling wordt ingetrokken', () => {
      // Een eerdere goedkeuring is geen blijvend recht: bij elke download
      // wordt opnieuw gekeken of de titel nog gedeeld is.
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      db.prepare('DELETE FROM music_title_shares WHERE music_title_id = ?').run(titelId);

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('weigert zodra de koppeling wordt opgezegd', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      db.prepare("UPDATE association_partnerships SET status = 'ended' WHERE association_a_id = ?").run(ons.id);

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('weigert zodra de partij alsnog wordt uitgesloten', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      sluitUit(partijId, onsLid.id);

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('weigert zodra de partij verwijderd is', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      db.prepare('UPDATE music_pieces SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), partijId);

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('weigert zodra de titel verwijderd is', () => {
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: overEenUur() });
      db.prepare('UPDATE music_titles SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), titelId);

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
    });

    it('geeft een vervallen verzoek geen toegang naast een geldig verzoek van een ander', () => {
      maakPartnerschap(ons.id, derde.id);
      deel(titelId, derde.id, onsLid.id);
      maakVerzoek(partijId, ons.id, hun.id, hunLid.id, { vervalt: eenUurGeleden() });
      maakVerzoek(partijId, ons.id, derde.id, derdeLid.id, { vervalt: overEenUur() });

      expect(magBestandOphalen(hun.id, partijId)).toBe(false);
      expect(magBestandOphalen(derde.id, partijId)).toBe(true);
    });
  });
});
