/**
 * Definitief wissen van leden, als één van hen nog niet te wissen is.
 *
 * Een lid met een chatbericht laat zich niet wissen: chat_messages verwijst
 * zonder ON DELETE naar users (docs/PIA.md §6, bevinding 1). Dat is een keuze
 * voor het bestuur. Wat hier vastligt is dat zo'n lid alléén zichzelf
 * tegenhoudt. Voorheen wiste de opruimtaak alle leden met één DELETE; faalde
 * die op één lid, dan werd niemand op de hele installatie gewist, en stond dat
 * alleen in het logboek.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import db from '../../database/connection';
import { purgeSoftDeleted, wisLeden } from '../../scheduler/gdpr-cleanup';
import { createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';

let vereniging: TestAssociation;
let zonderChat: TestUser;
let metChat: TestUser;

beforeEach(() => {
  delete process.env.SOFT_DELETE_RETENTION_DAYS;
  vereniging = createTestEnvironment().association;
  zonderChat = createTestUser(vereniging.id, { email: 'zonder-chat@test.com' });
  metChat = createTestUser(vereniging.id, { email: 'met-chat@test.com' });
  db.prepare('INSERT INTO chat_messages (id, association_id, user_id, content) VALUES (?, ?, ?, ?)').run(
    uuidv4(),
    vereniging.id,
    metChat.id,
    'Tot donderdag!',
  );
  // Allebei lang geleden verwijderd: de opruimtaak hoort ze nu te wissen.
  db.prepare("UPDATE users SET status = 'deleted', deleted_at = '2000-01-01T00:00:00.000Z' WHERE id IN (?, ?)").run(
    zonderChat.id,
    metChat.id,
  );
});

const bestaat = (id: string) => db.prepare('SELECT 1 FROM users WHERE id = ?').get(id) !== undefined;

describe('definitief wissen met een lid dat nog niet te wissen is', () => {
  it('wist de anderen wel', () => {
    const uitkomst = purgeSoftDeleted();

    expect(bestaat(zonderChat.id)).toBe(false);
    expect(bestaat(metChat.id)).toBe(true);
    expect(uitkomst).toContainEqual({ association_id: 'global', data_type: 'purged_users', deleted_count: 1 });
  });

  it('zegt welk lid er blijft staan', () => {
    expect(wisLeden([zonderChat.id, metChat.id])).toEqual({ gewist: [zonderChat.id], geblokkeerd: [metChat.id] });
  });
});
