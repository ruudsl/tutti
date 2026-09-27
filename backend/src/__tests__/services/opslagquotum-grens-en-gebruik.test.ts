/**
 * De opslaggrens van een vereniging en wat ze gebruikt.
 *
 * De grens komt uit de eigen grens van de super-admin, anders uit de grens van
 * het abonnement, anders uit de standaard in de omgeving; staat nergens iets,
 * dan is er geen grens - zodat een bestaande installatie niets merkt. Het
 * gebruik wordt live opgeteld uit de groottes bij de rijen, per vereniging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import {
  bewaakOpslag,
  OPSLAGLIMIET_CODE,
  opslagGebruik,
  opslagLimiet,
  ruimteVoorOpslag,
} from '../../services/abonnementLimieten';
import { ApiError } from '../../middleware/errorHandler';
import { createTestAssociation, createTestMusicPiece, createTestUser, TestAssociation } from '../testUtils';

const OMGEVING = [
  'STORAGE_QUOTA_BYTES',
  'STORAGE_QUOTA_BYTES_FREE',
  'STORAGE_QUOTA_BYTES_BASIC',
  'STORAGE_QUOTA_BYTES_PRO',
  'STORAGE_QUOTA_BYTES_ENTERPRISE',
];
const eerder: Record<string, string | undefined> = {};

let vereniging: TestAssociation;
let andere: TestAssociation;
let lidId: string;

beforeEach(() => {
  for (const naam of OMGEVING) {
    eerder[naam] = process.env[naam];
    delete process.env[naam];
  }
  vereniging = createTestAssociation({ name: 'Harmonie' });
  andere = createTestAssociation({ name: 'Fanfare elders' });
  lidId = createTestUser(vereniging.id, { email: 'lid@harmonie.nl', role: 'admin' }).id;
});

afterEach(() => {
  for (const naam of OMGEVING) {
    if (eerder[naam] === undefined) delete process.env[naam];
    else process.env[naam] = eerder[naam];
  }
});

const zetAbonnement = (id: string, abonnement: string) =>
  db.prepare('UPDATE associations SET subscription_tier = ? WHERE id = ?').run(abonnement, id);
const zetEigenGrens = (id: string, bytes: number | null) =>
  db.prepare('UPDATE associations SET opslag_limiet_bytes = ? WHERE id = ?').run(bytes, id);

function partij(associationId: string, bytes: number): void {
  const stuk = createTestMusicPiece(associationId);
  db.prepare('UPDATE music_pieces SET file_size = ? WHERE id = ?').run(bytes, stuk.id);
}

function titelMetMp3EnMusicxml(associationId: string, mp3: number, xml: string): void {
  const id = uuidv4();
  db.prepare(
    'INSERT INTO music_titles (id, title, association_id, mp3_file_path, mp3_file_size) VALUES (?, ?, ?, ?, ?)',
  ).run(id, `Titel ${id}`, associationId, `${id}.mp3`, mp3);
  db.prepare('INSERT INTO music_metadata (id, music_title_id, musicxml_raw) VALUES (?, ?, ?)').run(uuidv4(), id, xml);
}

describe('de opslaggrens', () => {
  it('is er niet als er niets is ingesteld, zodat een bestaande installatie niets merkt', () => {
    expect(opslagLimiet(vereniging.id)).toBeNull();
    expect(ruimteVoorOpslag(vereniging.id)).toBeNull();
    expect(() => bewaakOpslag(vereniging.id, 10 * 1024 ** 3)).not.toThrow();
  });

  it('komt uit STORAGE_QUOTA_BYTES als er verder niets staat', () => {
    process.env.STORAGE_QUOTA_BYTES = '5000';
    expect(opslagLimiet(vereniging.id)).toBe(5000);
  });

  it('volgt het abonnement vóór de algemene standaard', () => {
    process.env.STORAGE_QUOTA_BYTES = '5000';
    process.env.STORAGE_QUOTA_BYTES_PRO = '90000';
    zetAbonnement(vereniging.id, 'pro');

    expect(opslagLimiet(vereniging.id)).toBe(90000);
    // Een vereniging op een ander abonnement houdt de standaard.
    expect(opslagLimiet(andere.id)).toBe(5000);
  });

  it('kan per abonnement onbeperkt zijn terwijl de standaard begrensd is', () => {
    process.env.STORAGE_QUOTA_BYTES = '5000';
    process.env.STORAGE_QUOTA_BYTES_ENTERPRISE = 'unlimited';
    zetAbonnement(vereniging.id, 'enterprise');
    expect(opslagLimiet(vereniging.id)).toBeNull();

    process.env.STORAGE_QUOTA_BYTES_ENTERPRISE = '0';
    expect(opslagLimiet(vereniging.id)).toBeNull();
  });

  it('laat de eigen grens van de super-admin voorgaan op het abonnement', () => {
    process.env.STORAGE_QUOTA_BYTES = '5000';
    zetEigenGrens(vereniging.id, 123456);
    expect(opslagLimiet(vereniging.id)).toBe(123456);
  });

  it('leest een eigen grens van nul als bewust onbeperkt', () => {
    process.env.STORAGE_QUOTA_BYTES = '5000';
    zetEigenGrens(vereniging.id, 0);
    expect(opslagLimiet(vereniging.id)).toBeNull();
  });

  it('negeert een waarde in de omgeving die geen aantal bytes is', () => {
    process.env.STORAGE_QUOTA_BYTES = '5 GB';
    expect(opslagLimiet(vereniging.id)).toBeNull();
  });

  it('kijkt niet naar max_storage_mb, dat op elke vereniging op de standaard 5000 staat', () => {
    db.prepare('UPDATE associations SET max_storage_mb = 1 WHERE id = ?').run(vereniging.id);
    expect(opslagLimiet(vereniging.id)).toBeNull();
  });
});

describe('het gebruik', () => {
  it('telt bladmuziek, mp3, MusicXML, opnames, wiki- en mailbijlagen op', () => {
    partij(vereniging.id, 1000);
    partij(vereniging.id, 500);
    titelMetMp3EnMusicxml(vereniging.id, 3000, 'ë'.repeat(10)); // 20 bytes in utf-8
    db.prepare(
      'INSERT INTO audio_recordings (id, association_id, title, file_path, file_size, duration_seconds, recorded_by) VALUES (?, ?, ?, ?, ?, 0, ?)',
    ).run(uuidv4(), vereniging.id, 'Repetitie', '/uploads/recordings/a.webm', 700, lidId);
    const pagina = uuidv4();
    db.prepare(
      'INSERT INTO wiki_pages (id, association_id, slug, title, content, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(pagina, vereniging.id, 'huisregels', 'Huisregels', '', lidId);
    db.prepare(
      'INSERT INTO wiki_attachments (id, page_id, file_name, file_path, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), pagina, 'regels.pdf', 'regels.pdf', 40, lidId);
    const campagne = uuidv4();
    db.prepare(
      "INSERT INTO email_campaigns (id, association_id, name, subject, body_html, status, target_type, created_by) VALUES (?, ?, ?, ?, ?, 'draft', 'all', ?)",
    ).run(campagne, vereniging.id, 'Nieuwsbrief', 'Nieuws', '<p>x</p>', lidId);
    db.prepare(
      'INSERT INTO email_campaign_attachments (id, campaign_id, filename, original_filename, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(uuidv4(), campagne, 'a.pdf', 'a.pdf', 8, lidId);

    expect(opslagGebruik(vereniging.id)).toEqual({
      bladmuziek: 1500,
      mp3: 3000,
      musicxml: 20,
      opnames: 700,
      wikibijlagen: 40,
      mailbijlagen: 8,
      totaal: 5268,
    });
  });

  it('telt de bestanden van een andere vereniging niet mee', () => {
    partij(vereniging.id, 1000);
    partij(andere.id, 999_999);
    titelMetMp3EnMusicxml(andere.id, 888_888, '<score/>');

    expect(opslagGebruik(vereniging.id).totaal).toBe(1000);
    expect(opslagGebruik(andere.id).totaal).toBe(999_999 + 888_888 + 8);
  });

  it('telt een verwijderd stuk mee zolang het bestand er nog staat', () => {
    partij(vereniging.id, 1000);
    db.prepare('UPDATE music_pieces SET deleted_at = CURRENT_TIMESTAMP WHERE association_id = ?').run(vereniging.id);
    expect(opslagGebruik(vereniging.id).bladmuziek).toBe(1000);
  });

  it('telt een rij zonder grootte als nul', () => {
    createTestMusicPiece(vereniging.id);
    expect(opslagGebruik(vereniging.id).totaal).toBe(0);
  });
});

describe('bewaken', () => {
  beforeEach(() => {
    process.env.STORAGE_QUOTA_BYTES = '10000';
    partij(vereniging.id, 8000);
  });

  it('laat door wat nog past, tot en met de grens', () => {
    expect(() => bewaakOpslag(vereniging.id, 2000)).not.toThrow();
    expect(ruimteVoorOpslag(vereniging.id)).toBe(2000);
  });

  it('weigert met 413 en een vaste code wat er niet meer bij past', () => {
    let fout: unknown;
    try {
      bewaakOpslag(vereniging.id, 2001);
    } catch (e) {
      fout = e;
    }
    expect(fout).toBeInstanceOf(ApiError);
    expect((fout as ApiError).statusCode).toBe(413);
    expect((fout as ApiError).code).toBe(OPSLAGLIMIET_CODE);
    expect((fout as ApiError).message).toContain('opslaglimiet');
  });

  it('rekent met wat er bij het vervangen vrijkomt', () => {
    expect(() => bewaakOpslag(vereniging.id, 5000, 3000)).not.toThrow();
    expect(() => bewaakOpslag(vereniging.id, 5001, 3000)).toThrow(ApiError);
  });

  it('laat een vereniging boven haar grens niets kwijtraken, maar er kan niets meer bij', () => {
    process.env.STORAGE_QUOTA_BYTES = '5000';
    expect(ruimteVoorOpslag(vereniging.id)).toBe(0);
    expect(opslagGebruik(vereniging.id).totaal).toBe(8000);
    expect(() => bewaakOpslag(vereniging.id, 1)).toThrow(ApiError);
  });

  it('kijkt alleen naar het gebruik van de eigen vereniging', () => {
    // Elders staat de grens op dezelfde standaard, maar daar staat niets.
    expect(() => bewaakOpslag(andere.id, 10000)).not.toThrow();
  });
});
