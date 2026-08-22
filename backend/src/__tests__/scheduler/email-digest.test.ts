/**
 * De wekelijkse samenvatting.
 *
 * Deze mail gaat ongezien naar alle leden van alle verenigingen tegelijk. Er
 * kijkt niemand mee op het moment dat hij verstuurd wordt, dus alles wat er
 * per ongeluk in belandt - een verwijderd concert, muziek van een andere
 * vereniging, een lid dat allang weg is - staat bij de ontvanger in de bus
 * voordat iemand het doorheeft. Vandaar dat hier net zoveel wordt vastgelegd
 * over wat er NIET in mag als over wat er wel in hoort.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestUser, TestAssociation, TestUser } from '../testUtils';
import { sendWeeklyDigest } from '../../scheduler/email-digest';
import { sendEmail } from '../../utils/email';
import { clearModuleCache } from '../../modules/service';

const verstuur = sendEmail as unknown as Mock;

/** Datum over n dagen als YYYY-MM-DD (n mag negatief zijn). */
function datumOverDagen(dagen: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dagen);
  return d.toISOString().split('T')[0];
}

/**
 * Een tijdstempel in de vorm die SQLite zelf schrijft (CURRENT_TIMESTAMP):
 * 'YYYY-MM-DD HH:MM:SS', met een spatie tussen datum en tijd.
 */
function sqliteTijdstempel(datum: Date): string {
  return datum.toISOString().replace('T', ' ').substring(0, 19);
}

function maakOrkest(associationId: string, naam = 'Harmonie'): string {
  const id = uuidv4();
  testDb.prepare('INSERT INTO orchestras (id, name, association_id) VALUES (?, ?, ?)').run(id, naam, associationId);
  return id;
}

function maakRepetitie(
  associationId: string,
  orchestraId: string | null,
  opties: { datum?: string; start?: string; eind?: string; locatie?: string } = {},
): string {
  const id = uuidv4();
  testDb
    .prepare(
      `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'regular')`,
    )
    .run(
      id,
      associationId,
      orchestraId,
      opties.datum ?? datumOverDagen(2),
      opties.start ?? '19:30',
      opties.eind ?? '21:30',
      opties.locatie ?? 'De Kruisboog',
    );
  return id;
}

function maakConcert(
  associationId: string,
  opties: { naam?: string; datum?: string; verwijderdOp?: string | null } = {},
): string {
  const id = uuidv4();
  testDb
    .prepare('INSERT INTO concerts (id, association_id, name, date, location, deleted_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(
      id,
      associationId,
      opties.naam ?? 'Nieuwjaarsconcert',
      opties.datum ?? datumOverDagen(10),
      'De Schouwburg',
      opties.verwijderdOp ?? null,
    );
  return id;
}

function maakTitel(associationId: string, titel: string, arrangeur: string | null): string {
  const id = uuidv4();
  testDb
    .prepare('INSERT INTO music_titles (id, title, arranger, association_id) VALUES (?, ?, ?, ?)')
    .run(id, titel, arrangeur, associationId);
  return id;
}

/** Een bladmuziekbestand; created_at bepaalt of het "nieuw deze week" is. */
function maakStuk(
  associationId: string,
  titel: string,
  opties: { aangemaaktOp?: string; verwijderdOp?: string | null } = {},
): string {
  const id = uuidv4();
  testDb
    .prepare(
      `INSERT INTO music_pieces (id, title, file_path, original_filename, association_id, created_at, deleted_at)
       VALUES (?, ?, ?, 'partij.pdf', ?, ?, ?)`,
    )
    .run(
      id,
      titel,
      `${id}.pdf`,
      associationId,
      opties.aangemaaktOp ?? sqliteTijdstempel(new Date()),
      opties.verwijderdOp ?? null,
    );
  return id;
}

/** De HTML van de mail die naar dit adres ging (of undefined als er niets ging). */
function mailNaar(email: string): { subject: string; html: string } | undefined {
  const aanroep = verstuur.mock.calls.find((c) => c[0]?.to === email);
  return aanroep?.[0];
}

describe('Wekelijkse samenvatting', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;

  beforeEach(() => {
    verstuur.mockReset();
    verstuur.mockResolvedValue(true);
    clearModuleCache();
    vereniging = createTestAssociation({ name: 'Harmonie Sint Cecilia' });
    lid = createTestUser(vereniging.id, { email: `lid-${uuidv4()}@test.nl`, firstName: 'Anna' });
  });

  describe('wie de mail krijgt', () => {
    it('stuurt een samenvatting naar een actief lid', async () => {
      await sendWeeklyDigest();

      const mail = mailNaar(lid.email);
      expect(mail).toBeDefined();
      expect(mail?.subject).toContain('Harmonie Sint Cecilia');
      expect(mail?.html).toContain('Anna');
    });

    it('slaat een lid over dat op inactief staat', async () => {
      testDb.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(lid.id);

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)).toBeUndefined();
    });

    it('slaat een zacht verwijderd lid over', async () => {
      // Een uitgeschreven lid hoort geen post meer te krijgen, ook al staat de
      // rij er nog tot de opschoning hem echt verwijdert.
      testDb.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), lid.id);

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)).toBeUndefined();
    });

    it('slaat een lid over dat e-mail heeft uitgezet', async () => {
      testDb
        .prepare('INSERT INTO notification_preferences (id, user_id, email_enabled) VALUES (?, ?, 0)')
        .run(uuidv4(), lid.id);

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)).toBeUndefined();
    });

    it('gaat door met de volgende ontvanger als één mail stukloopt', async () => {
      const tweedeLid = createTestUser(vereniging.id, { email: `tweede-${uuidv4()}@test.nl` });
      verstuur.mockImplementation(async (bericht: { to: string }) => {
        if (bericht.to === lid.email) throw new Error('SMTP weigert');
        return true;
      });

      await sendWeeklyDigest();

      expect(mailNaar(tweedeLid.email)).toBeDefined();
    });

    it('gaat door met de volgende vereniging als de gegevens van één vereniging stuklopen', async () => {
      const andereVereniging = createTestAssociation({ name: 'Fanfare Concordia' });
      const anderLid = createTestUser(andereVereniging.id, { email: `ander-${uuidv4()}@test.nl` });
      let eerste = true;
      verstuur.mockImplementation(async () => {
        if (eerste) {
          eerste = false;
          throw new Error('mailserver onbereikbaar');
        }
        return true;
      });

      await sendWeeklyDigest();

      // Beide leden zijn geprobeerd; de fout bij de een heeft de ander niet
      // overgeslagen.
      expect(verstuur.mock.calls.map((c) => c[0].to).sort()).toEqual([lid.email, anderLid.email].sort());
    });
  });

  describe('wat er in de mail staat', () => {
    it('noemt tijd, locatie en orkest van een komende repetitie', async () => {
      const orkest = maakOrkest(vereniging.id, 'Groot Orkest');
      maakRepetitie(vereniging.id, orkest, { datum: datumOverDagen(3), start: '19:45', eind: '21:45' });

      await sendWeeklyDigest();

      const html = mailNaar(lid.email)?.html ?? '';
      expect(html).toContain(datumOverDagen(3));
      expect(html).toContain('19:45');
      expect(html).toContain('21:45');
      expect(html).toContain('Groot Orkest');
      // Een ontbrekende alias in de query levert letterlijk "undefined" op in
      // de mail; dat is bij de oefenstatistieken al eens gebeurd.
      expect(html).not.toContain('undefined');
    });

    it('laat een repetitie buiten de komende week weg', async () => {
      const orkest = maakOrkest(vereniging.id);
      maakRepetitie(vereniging.id, orkest, { datum: datumOverDagen(30), locatie: 'Ver Weg' });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('Ver Weg');
    });

    it('noemt een concert binnen de komende maand', async () => {
      maakConcert(vereniging.id, { naam: 'Voorjaarsconcert', datum: datumOverDagen(14) });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).toContain('Voorjaarsconcert');
    });

    it('laat een zacht verwijderd concert weg', async () => {
      // Een afgelast concert wordt zacht verwijderd. Het staat nog in de tabel,
      // maar niemand hoort er nog een aankondiging over te krijgen.
      maakConcert(vereniging.id, {
        naam: 'Afgelast Concert',
        datum: datumOverDagen(14),
        verwijderdOp: new Date().toISOString(),
      });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('Afgelast Concert');
    });

    it('noemt muziek die deze week is toegevoegd', async () => {
      maakTitel(vereniging.id, 'Also sprach Zarathustra', 'De Haan');
      maakStuk(vereniging.id, 'Also sprach Zarathustra');

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).toContain('Also sprach Zarathustra');
    });

    it('laat een zacht verwijderd muziekstuk weg', async () => {
      maakTitel(vereniging.id, 'Teruggetrokken Mars', 'De Haan');
      maakStuk(vereniging.id, 'Teruggetrokken Mars', { verwijderdOp: new Date().toISOString() });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('Teruggetrokken Mars');
    });

    it('telt muziek mee die precies op de grens van de week is toegevoegd', async () => {
      // De grens ligt zeven dagen terug en wordt als ISO-tekst ('...T...')
      // vergeleken met wat SQLite zelf schrijft ('... ...'). Een spatie is
      // kleiner dan een T, dus een stuk dat exact op de grens is toegevoegd
      // valt bij een kale tekstvergelijking buiten de boot.
      const grens = new Date();
      grens.setDate(grens.getDate() - 7);
      maakTitel(vereniging.id, 'Grensgeval', null);
      maakStuk(vereniging.id, 'Grensgeval', { aangemaaktOp: sqliteTijdstempel(grens) });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).toContain('Grensgeval');
    });

    it('laat muziek van vorige maand weg', async () => {
      const langGeleden = new Date();
      langGeleden.setDate(langGeleden.getDate() - 30);
      maakTitel(vereniging.id, 'Oude Mars', null);
      maakStuk(vereniging.id, 'Oude Mars', { aangemaaktOp: sqliteTijdstempel(langGeleden) });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('Oude Mars');
    });
  });

  describe('oefenstatistieken', () => {
    function maakOefenlogboek(userId: string, titelId: string, minuten: number): void {
      testDb
        .prepare(
          `INSERT INTO practice_logs (id, user_id, music_title_id, duration_minutes, practiced_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(uuidv4(), userId, titelId, minuten, sqliteTijdstempel(new Date()));
    }

    /** De module Thuis oefenen staat standaard uit; hier zetten we hem aan. */
    function zetOefenmoduleAan(): void {
      testDb
        .prepare('INSERT INTO association_modules (id, association_id, module_key, enabled) VALUES (?, ?, ?, 1)')
        .run(uuidv4(), vereniging.id, 'practice');
      clearModuleCache();
    }

    it('vermeldt hoeveel er deze week geoefend is', async () => {
      const titel = maakTitel(vereniging.id, 'Etude', null);
      maakOefenlogboek(lid.id, titel, 45);
      zetOefenmoduleAan();

      await sendWeeklyDigest();

      const html = mailNaar(lid.email)?.html ?? '';
      expect(html).toContain('oefenstatistieken');
      expect(html).toContain('45 minuten');
    });

    it('laat het oefenblok weg als de module Thuis oefenen uitstaat', async () => {
      const titel = maakTitel(vereniging.id, 'Etude', null);
      maakOefenlogboek(lid.id, titel, 45);
      testDb
        .prepare('INSERT INTO association_modules (id, association_id, module_key, enabled) VALUES (?, ?, ?, 0)')
        .run(uuidv4(), vereniging.id, 'practice');
      clearModuleCache();

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('oefenstatistieken');
    });

    it('telt de oefensessies van een ander lid niet mee', async () => {
      const titel = maakTitel(vereniging.id, 'Etude', null);
      const tweedeLid = createTestUser(vereniging.id, { email: `tweede-${uuidv4()}@test.nl` });
      maakOefenlogboek(tweedeLid.id, titel, 90);
      zetOefenmoduleAan();

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('oefenstatistieken');
    });
  });

  describe('de verenigingsgrens', () => {
    let andereVereniging: TestAssociation;

    beforeEach(() => {
      andereVereniging = createTestAssociation({ name: 'Fanfare Concordia' });
    });

    it('noemt de repetitie van een andere vereniging niet', async () => {
      const anderOrkest = maakOrkest(andereVereniging.id, 'Fanfare Orkest');
      maakRepetitie(andereVereniging.id, anderOrkest, { locatie: 'Ander Dorpshuis' });

      await sendWeeklyDigest();

      const html = mailNaar(lid.email)?.html ?? '';
      expect(html).not.toContain('Ander Dorpshuis');
      expect(html).not.toContain('Fanfare Orkest');
    });

    it('noemt het concert van een andere vereniging niet', async () => {
      maakConcert(andereVereniging.id, { naam: 'Concert van de buren' });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).not.toContain('Concert van de buren');
    });

    it('neemt de arrangeur van een gelijknamige titel bij de buren niet over', async () => {
      // Twee verenigingen kunnen dezelfde titel in de kast hebben. De koppeling
      // van bladmuziek aan titel gaat op de titeltekst, dus zonder grens komt
      // de arrangeur van de buren in de mail te staan - en daarmee een gegeven
      // uit een andere vereniging.
      maakTitel(vereniging.id, 'Mars der Medici', 'Eigen Arrangeur');
      maakTitel(andereVereniging.id, 'Mars der Medici', 'Arrangeur Van De Buren');
      maakStuk(vereniging.id, 'Mars der Medici');

      await sendWeeklyDigest();

      const html = mailNaar(lid.email)?.html ?? '';
      expect(html).toContain('Eigen Arrangeur');
      expect(html).not.toContain('Arrangeur Van De Buren');
    });

    it('geeft elke vereniging haar eigen samenvatting', async () => {
      const anderLid = createTestUser(andereVereniging.id, { email: `ander-${uuidv4()}@test.nl` });
      maakConcert(vereniging.id, { naam: 'Eigen Concert' });
      maakConcert(andereVereniging.id, { naam: 'Burenconcert' });

      await sendWeeklyDigest();

      expect(mailNaar(lid.email)?.html).toContain('Eigen Concert');
      expect(mailNaar(lid.email)?.html).not.toContain('Burenconcert');
      expect(mailNaar(anderLid.email)?.html).toContain('Burenconcert');
      expect(mailNaar(anderLid.email)?.html).not.toContain('Eigen Concert');
    });
  });
});
