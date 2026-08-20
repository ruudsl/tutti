/**
 * De workflowactie 'veld bijwerken'.
 *
 * De veldnaam komt uit de vrij invulbare config van de workflow (de route
 * valideert die met z.any()) en werd rechtstreeks in de query geplakt. Een
 * beheerder kon daar een hele SET-clausule in kwijt en zo rijen van andere
 * verenigingen aanpassen. Deze tests leggen vast dat alleen een bestaande,
 * niet-beschermde kolom er nog doorheen komt.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';
import { executeWorkflow } from '../../services/workflowEngine';

function zetModuleAan(associationId: string, userId: string): void {
  testDb
    .prepare(
      `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
       VALUES (?, ?, 'workflows', 1, ?)`,
    )
    .run(uuidv4(), associationId, userId);
}

describe("workflowactie 'veld bijwerken'", () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let doelwit: TestUser;

  function maakWorkflow(config: Record<string, unknown>): string {
    const workflowId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO workflows (id, association_id, name, is_active, created_by)
         VALUES (?, ?, 'Test', 1, ?)`,
      )
      .run(workflowId, vereniging.id, beheerder.id);

    testDb
      .prepare(
        `INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, is_active)
         VALUES (?, ?, 'update_field', 1, ?, 1)`,
      )
      .run(uuidv4(), workflowId, JSON.stringify(config));

    return workflowId;
  }

  function voerUit(workflowId: string, entityId: string): Promise<{ success: boolean }> {
    return executeWorkflow(workflowId, vereniging.id, 'manual', beheerder.id, 'user', entityId);
  }

  function rolVan(userId: string): string {
    const rij = testDb.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string };
    return rij.role;
  }

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    doelwit = omgeving.memberUser;
    zetModuleAan(vereniging.id, beheerder.id);
  });

  it('werkt een gewoon veld bij', async () => {
    const workflowId = maakWorkflow({ entityType: 'user', fieldName: 'first_name', fieldValue: 'Gewijzigd' });
    await voerUit(workflowId, doelwit.id);

    const rij = testDb.prepare('SELECT first_name FROM users WHERE id = ?').get(doelwit.id) as { first_name: string };
    expect(rij.first_name).toBe('Gewijzigd');
  });

  it('weigert een veldnaam met sql erin', async () => {
    const workflowId = maakWorkflow({
      entityType: 'user',
      fieldName: "role = 'admin' WHERE 1=1 --",
      fieldValue: 'x',
    });
    await voerUit(workflowId, doelwit.id);

    expect(rolVan(doelwit.id)).toBe('member');
  });

  it('laat leden van een andere vereniging met rust bij zo’n poging', async () => {
    const andereVereniging = createTestAssociation();
    const buitenstaander = createTestUser(andereVereniging.id, {
      email: `buiten-${uuidv4()}@test.nl`,
      role: 'member',
    });

    const workflowId = maakWorkflow({
      entityType: 'user',
      fieldName: "role = 'admin' WHERE 1=1 --",
      fieldValue: 'x',
    });
    await voerUit(workflowId, doelwit.id);

    expect(rolVan(buitenstaander.id)).toBe('member');
  });

  it('weigert een kolom die de tabel niet heeft', async () => {
    const workflowId = maakWorkflow({ entityType: 'user', fieldName: 'bestaat_niet', fieldValue: 'x' });
    const resultaat = await voerUit(workflowId, doelwit.id);

    expect(resultaat.success).toBe(true);
  });

  it('weigert een kolom die bepaalt bij wie de rij hoort', async () => {
    const andereVereniging = createTestAssociation();
    const workflowId = maakWorkflow({
      entityType: 'user',
      fieldName: 'association_id',
      fieldValue: andereVereniging.id,
    });
    await voerUit(workflowId, doelwit.id);

    const rij = testDb.prepare('SELECT association_id FROM users WHERE id = ?').get(doelwit.id) as {
      association_id: string;
    };
    expect(rij.association_id).toBe(vereniging.id);
  });

  it('weigert een kolom waarmee wordt ingelogd', async () => {
    const voor = testDb.prepare('SELECT password_hash FROM users WHERE id = ?').get(doelwit.id) as {
      password_hash: string;
    };

    const workflowId = maakWorkflow({ entityType: 'user', fieldName: 'password_hash', fieldValue: 'bekend' });
    await voerUit(workflowId, doelwit.id);

    const na = testDb.prepare('SELECT password_hash FROM users WHERE id = ?').get(doelwit.id) as {
      password_hash: string;
    };
    expect(na.password_hash).toBe(voor.password_hash);
  });

  it('weigert een onbekend soort entiteit', async () => {
    const workflowId = maakWorkflow({ entityType: 'geheim', fieldName: 'first_name', fieldValue: 'x' });
    const resultaat = await voerUit(workflowId, doelwit.id);

    expect(resultaat.success).toBe(true);
  });

  it('werkt ook op een tabel zonder updated_at', async () => {
    // rehearsals houdt geen updated_at bij; de query moet die kolom dan
    // weglaten in plaats van erop stuk te lopen.
    const orkestId = uuidv4();
    testDb
      .prepare("INSERT INTO orchestras (id, association_id, name) VALUES (?, ?, 'Harmonie')")
      .run(orkestId, vereniging.id);

    const repetitieId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO rehearsals (id, association_id, orchestra_id, date, start_time, end_time, location)
         VALUES (?, ?, ?, '2026-09-01', '20:00', '22:00', 'Oude zaal')`,
      )
      .run(repetitieId, vereniging.id, orkestId);

    const workflowId = uuidv4();
    testDb
      .prepare(`INSERT INTO workflows (id, association_id, name, is_active, created_by) VALUES (?, ?, 'Test', 1, ?)`)
      .run(workflowId, vereniging.id, beheerder.id);
    testDb
      .prepare(
        `INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, is_active)
         VALUES (?, ?, 'update_field', 1, ?, 1)`,
      )
      .run(
        uuidv4(),
        workflowId,
        JSON.stringify({ entityType: 'rehearsal', fieldName: 'location', fieldValue: 'Nieuwe zaal' }),
      );

    await executeWorkflow(workflowId, vereniging.id, 'manual', beheerder.id, 'rehearsal', repetitieId);

    const rij = testDb.prepare('SELECT location FROM rehearsals WHERE id = ?').get(repetitieId) as {
      location: string;
    };
    expect(rij.location).toBe('Nieuwe zaal');
  });
});
