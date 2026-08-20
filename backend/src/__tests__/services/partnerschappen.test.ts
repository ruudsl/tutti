/**
 * Wat een partnerschap oplevert.
 *
 * association_partnerships bestond met share_music, share_events en
 * share_members erop, maar werd buiten het beheer van het partnerschap zelf
 * nergens gelezen. Een goedgekeurd partnerschap veranderde dus niets en de
 * drie vlaggen betekenden niets.
 *
 * Deze tests leggen de regels vast die hierbij horen, en dat is hier de kern
 * van de zaak: dit is de enige plek in de applicatie waar met opzet gegevens
 * van een andere vereniging zichtbaar worden. Wat er niet in staat mag er ook
 * niet uit komen.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { haalPartners, haalGedeeldeMuziek, haalGedeeldeConcerten, deeltMet } from '../../services/partnerschappen';
import { createTestAssociation, createTestUser, TestAssociation } from '../testUtils';

describe('partnerschappen', () => {
  let eigen: TestAssociation;
  let partner: TestAssociation;
  let derde: TestAssociation;
  let aanvrager: string;

  beforeEach(() => {
    eigen = createTestAssociation({ name: `Eigen-${uuidv4()}` });
    partner = createTestAssociation({ name: `Partner-${uuidv4()}` });
    derde = createTestAssociation({ name: `Derde-${uuidv4()}` });
    aanvrager = createTestUser(eigen.id, { email: `aanvrager-${uuidv4()}@test.nl` }).id;
  });

  function maakPartnerschap(
    a: string,
    b: string,
    opties: { status?: string; music?: boolean; events?: boolean; members?: boolean } = {},
  ): string {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO association_partnerships
         (id, association_a_id, association_b_id, share_music, share_events, share_members, status, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      a,
      b,
      opties.music ? 1 : 0,
      opties.events ? 1 : 0,
      opties.members ? 1 : 0,
      opties.status ?? 'active',
      aanvrager,
    );
    return id;
  }

  function maakTitel(associationId: string, titel: string, gedeeld: boolean, overrides: Record<string, unknown> = {}) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO music_titles (id, title, composer, arranger, is_shared, internal_notes, association_id, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      titel,
      (overrides.composer as string) ?? null,
      (overrides.arranger as string) ?? null,
      gedeeld ? 1 : 0,
      (overrides.internalNotes as string) ?? null,
      associationId,
      (overrides.deletedAt as string) ?? null,
    );
    return id;
  }

  function maakConcert(associationId: string, naam: string, datum: string, overrides: Record<string, unknown> = {}) {
    const id = uuidv4();
    db.prepare(
      `INSERT INTO concerts (id, association_id, name, date, location, notes, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      associationId,
      naam,
      datum,
      (overrides.location as string) ?? null,
      (overrides.notes as string) ?? null,
      (overrides.deletedAt as string) ?? null,
    );
    return id;
  }

  const overDagen = (aantal: number) => {
    const datum = new Date();
    datum.setDate(datum.getDate() + aantal);
    return datum.toISOString().slice(0, 10);
  };

  describe('wie telt als partner', () => {
    it('telt een actief partnerschap', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      expect(haalPartners(eigen.id, 'share_music').map((p) => p.id)).toEqual([partner.id]);
    });

    it('werkt beide kanten op, ongeacht wie de aanvraag deed', () => {
      maakPartnerschap(partner.id, eigen.id, { music: true });
      expect(haalPartners(eigen.id, 'share_music').map((p) => p.id)).toEqual([partner.id]);
      expect(haalPartners(partner.id, 'share_music').map((p) => p.id)).toEqual([eigen.id]);
    });

    it('telt een aanvraag die nog openstaat niet', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true, status: 'pending' });
      expect(haalPartners(eigen.id, 'share_music')).toEqual([]);
    });

    it('telt een afgewezen aanvraag niet', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true, status: 'rejected' });
      expect(haalPartners(eigen.id, 'share_music')).toEqual([]);
    });

    it('houdt de drie soorten uit elkaar', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true, events: false });
      expect(haalPartners(eigen.id, 'share_music').map((p) => p.id)).toEqual([partner.id]);
      expect(haalPartners(eigen.id, 'share_events')).toEqual([]);
    });

    it('telt een vereniging op non-actief niet', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      db.prepare('UPDATE associations SET is_active = 0 WHERE id = ?').run(partner.id);
      expect(haalPartners(eigen.id, 'share_music')).toEqual([]);
    });

    it('telt een vereniging waarmee geen partnerschap bestaat niet', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      expect(deeltMet(eigen.id, derde.id, 'share_music')).toBe(false);
      expect(deeltMet(eigen.id, partner.id, 'share_music')).toBe(true);
    });
  });

  describe('gedeelde muziek', () => {
    it('geeft niets terug zonder partnerschap', () => {
      maakTitel(partner.id, 'Gedeelde Mars', true);
      expect(haalGedeeldeMuziek(eigen.id)).toEqual([]);
    });

    it('geeft een titel die de partner heeft opengesteld', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      maakTitel(partner.id, 'Gedeelde Mars', true);

      const gedeeld = haalGedeeldeMuziek(eigen.id);
      expect(gedeeld.map((t) => t.title)).toEqual(['Gedeelde Mars']);
      expect(gedeeld[0].associationId).toBe(partner.id);
    });

    it('geeft een titel die niet is opengesteld niet', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      maakTitel(partner.id, 'Eigen Mars', false);
      expect(haalGedeeldeMuziek(eigen.id)).toEqual([]);
    });

    it('geeft een verwijderde titel niet', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      maakTitel(partner.id, 'Weggegooide Mars', true, { deletedAt: '2026-01-01 12:00:00' });
      expect(haalGedeeldeMuziek(eigen.id)).toEqual([]);
    });

    it('geeft niets als het partnerschap muziek niet deelt', () => {
      maakPartnerschap(eigen.id, partner.id, { music: false, events: true });
      maakTitel(partner.id, 'Gedeelde Mars', true);
      expect(haalGedeeldeMuziek(eigen.id)).toEqual([]);
    });

    it('geeft niets van een vereniging waarmee geen partnerschap bestaat', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      maakTitel(derde.id, 'Mars van een vreemde', true);
      expect(haalGedeeldeMuziek(eigen.id)).toEqual([]);
    });

    it('geeft de interne notities niet mee', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      maakTitel(partner.id, 'Gedeelde Mars', true, { internalNotes: 'Alt saxen spelen te hard' });

      const gedeeld = haalGedeeldeMuziek(eigen.id);
      expect(JSON.stringify(gedeeld)).not.toContain('te hard');
      expect(gedeeld[0]).not.toHaveProperty('internalNotes');
    });

    it('noemt bij elke titel van welke vereniging hij is', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      db.prepare('UPDATE associations SET display_name = ? WHERE id = ?').run('Fanfare Elders', partner.id);
      maakTitel(partner.id, 'Gedeelde Mars', true);

      expect(haalGedeeldeMuziek(eigen.id)[0].associationName).toBe('Fanfare Elders');
    });

    it('geeft de eigen titels niet terug', () => {
      maakPartnerschap(eigen.id, partner.id, { music: true });
      maakTitel(eigen.id, 'Eigen Mars', true);
      expect(haalGedeeldeMuziek(eigen.id)).toEqual([]);
    });
  });

  describe('gedeelde concerten', () => {
    it('geeft een aankomend concert van de partner', () => {
      maakPartnerschap(eigen.id, partner.id, { events: true });
      maakConcert(partner.id, 'Kerstconcert', overDagen(30), { location: 'Dorpskerk' });

      const gedeeld = haalGedeeldeConcerten(eigen.id);
      expect(gedeeld.map((c) => c.name)).toEqual(['Kerstconcert']);
      expect(gedeeld[0].location).toBe('Dorpskerk');
    });

    it('geeft een concert dat al is geweest niet', () => {
      maakPartnerschap(eigen.id, partner.id, { events: true });
      maakConcert(partner.id, 'Voorjaarsconcert', overDagen(-30));
      expect(haalGedeeldeConcerten(eigen.id)).toEqual([]);
    });

    it('geeft een verwijderd concert niet', () => {
      maakPartnerschap(eigen.id, partner.id, { events: true });
      maakConcert(partner.id, 'Afgelast concert', overDagen(30), { deletedAt: '2026-01-01 12:00:00' });
      expect(haalGedeeldeConcerten(eigen.id)).toEqual([]);
    });

    it('geeft de interne notities niet mee', () => {
      maakPartnerschap(eigen.id, partner.id, { events: true });
      maakConcert(partner.id, 'Kerstconcert', overDagen(30), { notes: 'Dirigent nog regelen' });

      const gedeeld = haalGedeeldeConcerten(eigen.id);
      expect(JSON.stringify(gedeeld)).not.toContain('Dirigent nog regelen');
    });

    it('geeft niets als het partnerschap agenda niet deelt', () => {
      maakPartnerschap(eigen.id, partner.id, { events: false, music: true });
      maakConcert(partner.id, 'Kerstconcert', overDagen(30));
      expect(haalGedeeldeConcerten(eigen.id)).toEqual([]);
    });

    it('geeft niets zodra het partnerschap wordt beeindigd', () => {
      const id = maakPartnerschap(eigen.id, partner.id, { events: true });
      maakConcert(partner.id, 'Kerstconcert', overDagen(30));
      expect(haalGedeeldeConcerten(eigen.id)).toHaveLength(1);

      db.prepare('DELETE FROM association_partnerships WHERE id = ?').run(id);
      expect(haalGedeeldeConcerten(eigen.id)).toEqual([]);
    });
  });
});
