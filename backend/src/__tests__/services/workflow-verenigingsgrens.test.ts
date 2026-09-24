/**
 * De workflowmotor en de verenigingsgrens bij regels die over een entiteit
 * gaan.
 *
 * Een regel met een datumveld-trigger zocht zijn entiteiten met
 * `SELECT id FROM <tabel> WHERE DATE(<veld>) = ?`, zonder vereniging. De motor
 * las daarna de rij met `SELECT * FROM <tabel> WHERE id = ?`, ook zonder
 * vereniging, en de actie 'mail naar de entiteit' stuurde naar het adres in
 * die rij. Een beheerder van vereniging A kon zo met een regel op
 * `user.created_at` de leden van vereniging B mailen, met hun naam en
 * gegevens ingevuld in een tekst naar keuze.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { sendEmail } from '../../utils/email';
import { createTestAssociation, createTestEnvironment, createTestUser, TestAssociation, TestUser } from '../testUtils';
import { controleerDatumveld, executeWorkflow, processDateFieldWorkflows } from '../../services/workflowEngine';

function zetModuleAan(associationId: string, userId: string): void {
  testDb
    .prepare(
      `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
       VALUES (?, ?, 'workflows', 1, ?)`,
    )
    .run(uuidv4(), associationId, userId);
}

/** Wacht tot er ten minste zoveel uitvoeringen klaar zijn. */
async function wachtOpAfgerond(aantal: number): Promise<void> {
  for (let poging = 0; poging < 200; poging++) {
    const rij = testDb.prepare("SELECT COUNT(*) as n FROM workflow_executions WHERE status <> 'running'").get() as {
      n: number;
    };
    if (rij.n >= aantal) return;
    await new Promise((klaar) => setTimeout(klaar, 5));
  }
}

describe('workflowmotor en de verenigingsgrens', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let andereVereniging: TestAssociation;
  let buitenstaander: TestUser;

  const vandaag = '2026-09-01';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${vandaag}T12:00:00Z`));

    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    zetModuleAan(vereniging.id, beheerder.id);

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    buitenstaander = createTestUser(andereVereniging.id, { email: 'buiten@elders.nl', role: 'member' });

    // Alle leden van onze eigen vereniging zijn eerder aangemaakt; alleen de
    // buitenstaander valt op de datum waar de regel naar kijkt.
    testDb.prepare('UPDATE users SET created_at = ? WHERE association_id = ?').run('2020-01-01', vereniging.id);
    testDb.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(`${vandaag} 10:00:00`, buitenstaander.id);

    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue(true as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function maakWorkflow(actie: { type: string; config: unknown }): string {
    const workflowId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO workflows (id, association_id, name, is_active, created_by)
         VALUES (?, ?, 'Welkom', 1, ?)`,
      )
      .run(workflowId, vereniging.id, beheerder.id);
    testDb
      .prepare(
        `INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, is_active)
         VALUES (?, ?, ?, 0, ?, 1)`,
      )
      .run(uuidv4(), workflowId, actie.type, JSON.stringify(actie.config));
    return workflowId;
  }

  function legDatumTriggerNeer(workflowId: string, entiteit: string, veld: string): void {
    testDb
      .prepare(
        `INSERT INTO workflow_triggers (id, workflow_id, trigger_type, date_field_entity, date_field_name, is_active)
         VALUES (?, ?, 'date_field', ?, ?, 1)`,
      )
      .run(uuidv4(), workflowId, entiteit, veld);
  }

  it('mailt via een datumveld-trigger geen lid van een andere vereniging', async () => {
    const werkstroom = maakWorkflow({
      type: 'send_email',
      config: { recipientType: 'entity_user', subject: 'Welkom {{first_name}}', body: 'Hallo' },
    });
    legDatumTriggerNeer(werkstroom, 'user', 'created_at');

    processDateFieldWorkflows();
    await wachtOpAfgerond(1);
    await new Promise((klaar) => setTimeout(klaar, 20));

    const adressen = vi.mocked(sendEmail).mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(adressen).not.toContain(buitenstaander.email);

    const uitvoeringen = testDb.prepare('SELECT entity_id FROM workflow_executions').all() as { entity_id: string }[];
    expect(uitvoeringen.map((u) => u.entity_id)).not.toContain(buitenstaander.id);
  });

  it('gaat via een datumveld-trigger nog wel af op een eigen lid', async () => {
    const eigenLid = createTestUser(vereniging.id, { email: 'nieuw@eigen.nl', role: 'member' });
    testDb.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(`${vandaag} 09:00:00`, eigenLid.id);

    const werkstroom = maakWorkflow({
      type: 'send_email',
      config: { recipientType: 'entity_user', subject: 'Welkom', body: 'Hallo' },
    });
    legDatumTriggerNeer(werkstroom, 'user', 'created_at');

    processDateFieldWorkflows();
    await wachtOpAfgerond(1);

    const adressen = vi.mocked(sendEmail).mock.calls.map((c) => (c[0] as { to: string }).to);
    expect(adressen).toEqual([eigenLid.email]);
  });

  it('leest de gegevens van een entiteit van een andere vereniging niet in', async () => {
    // Ook zonder datumveld: een entiteits-id van elders mag niet in de tekst
    // of bij de ontvanger terechtkomen.
    const werkstroom = maakWorkflow({
      type: 'send_email',
      config: { recipientType: 'entity_user', subject: 'Dag {{first_name}}', body: '{{email}}' },
    });

    await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', buitenstaander.id);

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('werkt geen veld bij van een entiteit van een andere vereniging', async () => {
    const werkstroom = maakWorkflow({
      type: 'update_field',
      config: { entityType: 'user', fieldName: 'first_name', fieldValue: 'Overgenomen' },
    });

    await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', buitenstaander.id);

    const rij = testDb.prepare('SELECT first_name FROM users WHERE id = ?').get(buitenstaander.id) as {
      first_name: string;
    };
    expect(rij.first_name).not.toBe('Overgenomen');
  });

  it('voert een regel niet uit namens een vereniging waar hij niet bij hoort', async () => {
    zetModuleAan(andereVereniging.id, buitenstaander.id);
    const werkstroom = maakWorkflow({
      type: 'send_email',
      config: { recipientType: 'all_members', subject: 'x', body: 'y' },
    });

    const resultaat = await executeWorkflow(werkstroom, andereVereniging.id, 'manual');

    expect(resultaat.success).toBe(false);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('draait geen datumveld-trigger met sql in de veldnaam', async () => {
    // date_field_name ging rechtstreeks de query in. "1=1 OR created_at" als
    // veld maakt van de WHERE iets wat altijd waar is.
    const werkstroom = maakWorkflow({
      type: 'send_email',
      config: { recipientType: 'entity_user', subject: 'x', body: 'y' },
    });
    legDatumTriggerNeer(werkstroom, 'user', 'created_at) OR 1=1 OR DATE(created_at');

    processDateFieldWorkflows();
    await new Promise((klaar) => setTimeout(klaar, 20));

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
    expect(aantal.n).toBe(0);
  });

  describe('controleerDatumveld', () => {
    it('accepteert een kolom die de tabel heeft', () => {
      expect(controleerDatumveld('concert', 'date')).toBeNull();
    });

    it('weigert een onbekende soort, een onbekende kolom en lege waarden', () => {
      expect(controleerDatumveld('geheim', 'date')).toMatch(/soort entiteit/);
      expect(controleerDatumveld('user', 'bestaat_niet')).toMatch(/veld/);
      expect(controleerDatumveld('user', null)).toBeTruthy();
      expect(controleerDatumveld('constructor', 'id')).toBeTruthy();
    });

    it('kent alleen tabellen met een eigen association_id', () => {
      // De motor filtert op <tabel>.association_id. Een tabel zonder die
      // kolom zou de query stuk laten lopen - of, na een haastige
      // aanpassing, zonder grens laten draaien.
      for (const soort of ['user', 'member', 'concert', 'rehearsal', 'task', 'project', 'tour', 'equipment']) {
        expect(controleerDatumveld(soort, 'association_id'), soort).toBeNull();
      }
    });
  });
});
