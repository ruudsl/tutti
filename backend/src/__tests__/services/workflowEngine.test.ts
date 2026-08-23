/**
 * De workflowmotor: wat er gebeurt als een regel afgaat.
 *
 * De motor is het enige stuk van de installatie dat uit zichzelf mails
 * verstuurt, meldingen wegschrijft, taken aanmaakt, velden bijwerkt en een
 * externe adres aanroept - zonder dat er op dat moment iemand kijkt. Alles
 * wat hij doet komt uit `workflow_actions.config`, en dat is vrij invulbare
 * json die een beheerder van een vereniging zelf neerzet.
 *
 * Daarom gaan deze tests vooral over de randen: de verenigingsgrens, een stap
 * die halverwege omvalt, een regel die zichzelf blijft voeden, en config die
 * niet klopt. Het gelukkige pad staat er alleen bij waar het nodig is om te
 * laten zien dat de rand daadwerkelijk een rand is.
 *
 * De uitvoeringsvolgorde is bewust zichtbaar in `workflow_executions`: status,
 * foutmelding en logboek. Daar wordt op getoetst, niet op een 200.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { sendEmail } from '../../utils/email';
import {
  createTestAssociation,
  createTestEnvironment,
  createTestUser,
  TestAssociation,
  TestUser,
} from '../testUtils';
import { executeWorkflow, processScheduledWorkflows, processDateFieldWorkflows } from '../../services/workflowEngine';

function zetModuleAan(associationId: string, userId: string): void {
  testDb
    .prepare(
      `INSERT INTO association_modules (id, association_id, module_key, enabled, updated_by)
       VALUES (?, ?, 'workflows', 1, ?)`,
    )
    .run(uuidv4(), associationId, userId);
}

interface Uitvoering {
  status: string;
  error_message: string | null;
  execution_log: string | null;
}

describe('workflowmotor', () => {
  let vereniging: TestAssociation;
  let beheerder: TestUser;
  let lid: TestUser;

  let andereVereniging: TestAssociation;
  let buitenstaander: TestUser;

  beforeEach(() => {
    const omgeving = createTestEnvironment();
    vereniging = omgeving.association;
    beheerder = omgeving.adminUser;
    lid = omgeving.memberUser;
    zetModuleAan(vereniging.id, beheerder.id);

    andereVereniging = createTestAssociation({ name: 'Andere vereniging' });
    buitenstaander = createTestUser(andereVereniging.id, { email: 'buiten@elders.nl', role: 'member' });
    zetModuleAan(andereVereniging.id, buitenstaander.id);

    // De mail-mock komt uit setup.ts en leeft dus het hele bestand; zonder
    // deze regel telt een test de verzendingen van zijn voorgangers mee.
    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue(true as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Legt een workflow neer met de opgegeven acties, in volgorde. */
  function maakWorkflow(
    acties: { type: string; config: unknown; conditions?: unknown; actief?: boolean }[],
    opties: { associationId?: string; createdBy?: string; actief?: boolean } = {},
  ): string {
    const workflowId = uuidv4();
    testDb
      .prepare(
        `INSERT INTO workflows (id, association_id, name, is_active, created_by)
         VALUES (?, ?, 'Testregel', ?, ?)`,
      )
      .run(
        workflowId,
        opties.associationId ?? vereniging.id,
        opties.actief === false ? 0 : 1,
        opties.createdBy ?? beheerder.id,
      );

    acties.forEach((actie, index) => {
      testDb
        .prepare(
          `INSERT INTO workflow_actions (id, workflow_id, action_type, action_order, config, conditions, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uuidv4(),
          workflowId,
          actie.type,
          index,
          typeof actie.config === 'string' ? actie.config : JSON.stringify(actie.config),
          actie.conditions === undefined ? null : JSON.stringify(actie.conditions),
          actie.actief === false ? 0 : 1,
        );
    });

    return workflowId;
  }

  function uitvoeringVan(executionId: string): Uitvoering {
    return testDb
      .prepare('SELECT status, error_message, execution_log FROM workflow_executions WHERE id = ?')
      .get(executionId) as Uitvoering;
  }

  function logboekVan(executionId: string): string[] {
    return JSON.parse(uitvoeringVan(executionId).execution_log || '[]');
  }

  describe('de module als schakelaar', () => {
    it('doet niets voor een vereniging die de module uit heeft staan', async () => {
      const zonderModule = createTestAssociation({ name: 'Zonder module' });
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Zou niet moeten' } }], {
        associationId: zonderModule.id,
        createdBy: beheerder.id,
      });

      const resultaat = await executeWorkflow(werkstroom, zonderModule.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(false);
      expect(resultaat.error).toContain('workflows staat uit');
      expect(resultaat.executionId).toBe('');
    });

    it('legt geen uitvoering vast als de module uit staat', async () => {
      const zonderModule = createTestAssociation({ name: 'Nog een zonder module' });
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'x' } }], {
        associationId: zonderModule.id,
      });

      await executeWorkflow(werkstroom, zonderModule.id, 'schedule');

      const aantal = testDb
        .prepare('SELECT COUNT(*) as n FROM workflow_executions WHERE workflow_id = ?')
        .get(werkstroom) as { n: number };
      expect(aantal.n).toBe(0);
    });
  });

  describe('een stap die halverwege omvalt', () => {
    it('markeert de uitvoering als mislukt en noemt de fout', async () => {
      const werkstroom = maakWorkflow([
        { type: 'create_task', config: { title: 'Eerste stap' } },
        { type: 'send_email', config: 'dit is geen json' },
        { type: 'create_task', config: { title: 'Derde stap' } },
      ]);

      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(false);
      const uitvoering = uitvoeringVan(resultaat.executionId);
      expect(uitvoering.status).toBe('failed');
      expect(uitvoering.error_message).toBeTruthy();
    });

    it('draait de stappen die al gelukt waren niet terug', async () => {
      // Er zit geen transactie omheen. Dat is te verdedigen - een verstuurde
      // mail draai je ook niet terug - maar het is wel iets om te weten: na
      // een mislukte regel staat het halve werk er.
      const werkstroom = maakWorkflow([
        { type: 'create_task', config: { title: 'Blijft staan' } },
        { type: 'send_email', config: '{kapot' },
      ]);

      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const taken = testDb
        .prepare('SELECT title FROM tasks WHERE association_id = ?')
        .all(vereniging.id) as { title: string }[];
      expect(taken.map((t) => t.title)).toEqual(['Blijft staan']);
    });

    it('voert de stappen daarna niet meer uit', async () => {
      const werkstroom = maakWorkflow([
        { type: 'send_email', config: '{kapot' },
        { type: 'create_task', config: { title: 'Komt er niet' } },
      ]);

      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('slaat een uitgeschakelde actie over', async () => {
      const werkstroom = maakWorkflow([
        { type: 'create_task', config: { title: 'Aan' } },
        { type: 'create_task', config: { title: 'Uit' }, actief: false },
      ]);

      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(true);
      const taken = testDb.prepare('SELECT title FROM tasks').all() as { title: string }[];
      expect(taken.map((t) => t.title)).toEqual(['Aan']);
    });

    it('noteert een soort actie dat de motor niet kent', async () => {
      // 'add_to_group' mag van het schema nog wel in de tabel staan, maar de
      // motor kent hem niet meer: de tabel group_members is nooit aangemaakt.
      const werkstroom = maakWorkflow([{ type: 'add_to_group', config: {} }]);

      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(true);
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('Unknown action type: add_to_group');
    });
  });

  describe('taken aanmaken', () => {
    it('maakt een taak met een status die de tabel accepteert', async () => {
      // BEWIJS. Op de oude code zette de motor status 'open' in tasks, terwijl
      // de CHECK-constraint alleen todo/in_progress/review/done/cancelled
      // toestaat. De insert liep dus altijd stuk en de hele regel viel om:
      // de actie 'taak aanmaken' werkte in geen enkele workflow.
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Zaal reserveren' } }]);

      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success, resultaat.error).toBe(true);
      const taak = testDb.prepare('SELECT title, status FROM tasks WHERE association_id = ?').get(vereniging.id) as {
        title: string;
        status: string;
      };
      expect(taak.title).toBe('Zaal reserveren');
      expect(taak.status).toBe('todo');
    });

    it('maakt ook een taak aan als er geen gebruiker achter de regel zit', async () => {
      // BEWIJS. tasks.created_by is NOT NULL. Een geplande regel heeft geen
      // aanvrager, dus de motor zette daar null neer en de insert liep stuk:
      // taken aanmaken werkte alleen handmatig, nooit vanuit de planner.
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Uit de planner' } }]);

      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'schedule');

      expect(resultaat.success, resultaat.error).toBe(true);
      const taak = testDb.prepare('SELECT created_by FROM tasks').get() as { created_by: string };
      expect(taak.created_by).toBe(beheerder.id);
    });

    it('rekent dueDaysFromNow om naar een datum', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));

      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Over drie dagen', dueDaysFromNow: 3 } }]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const taak = testDb.prepare('SELECT due_date FROM tasks').get() as { due_date: string };
      expect(taak.due_date).toBe('2026-09-04');
    });

    it('neemt een vaste einddatum over', async () => {
      const werkstroom = maakWorkflow([
        { type: 'create_task', config: { title: 'Op datum', dueDate: '2026-12-24', priority: 'high' } },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const taak = testDb.prepare('SELECT due_date, priority FROM tasks').get() as {
        due_date: string;
        priority: string;
      };
      expect(taak.due_date).toBe('2026-12-24');
      expect(taak.priority).toBe('high');
    });

    it('wijst een taak toe aan een eigen lid', async () => {
      const werkstroom = maakWorkflow([
        { type: 'create_task', config: { title: 'Voor het lid', assigneeType: 'specific', assigneeUserId: lid.id } },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const taak = testDb.prepare('SELECT assigned_to FROM tasks').get() as { assigned_to: string };
      expect(taak.assigned_to).toBe(lid.id);
    });

    it('wijst geen taak toe aan iemand van een andere vereniging', async () => {
      // BEWIJS. assigneeUserId komt uit de vrij invulbare config. Zonder deze
      // controle zette de motor daar elk gebruikersnummer neer, ook een lid
      // van een andere vereniging.
      const werkstroom = maakWorkflow([
        {
          type: 'create_task',
          config: { title: 'Voor een vreemde', assigneeType: 'specific', assigneeUserId: buitenstaander.id },
        },
      ]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const taak = testDb.prepare('SELECT assigned_to FROM tasks').get() as { assigned_to: string | null };
      expect(taak.assigned_to).toBeNull();
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('hoort niet bij deze vereniging');
    });
  });

  describe('meldingen', () => {
    it('schrijft een melding voor een eigen lid', async () => {
      const werkstroom = maakWorkflow([
        {
          type: 'send_notification',
          config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Let op', message: 'Repetitie valt uit' },
        },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const melding = testDb.prepare('SELECT user_id, title, body, data FROM notifications').get() as {
        user_id: string;
        title: string;
        body: string;
        data: string;
      };
      expect(melding.user_id).toBe(lid.id);
      expect(melding.title).toBe('Let op');
      expect(JSON.parse(melding.data).priority).toBe('medium');
    });

    it('stuurt geen melding naar een lid van een andere vereniging', async () => {
      // BEWIJS. De tabel notifications kent alleen user_id, geen
      // association_id: een melding komt terecht bij wie erin staat, punt.
      // recipientUserId komt uit de config van de workflow, en die zette de
      // motor er ongecontroleerd in. Een beheerder van vereniging A kon zo
      // meldingen in de lijst van een lid van vereniging B laten verschijnen,
      // met een tekst naar keuze.
      const werkstroom = maakWorkflow([
        {
          type: 'send_notification',
          config: {
            recipientType: 'specific',
            recipientUserId: buitenstaander.id,
            title: 'Namens uw bestuur',
            message: 'Klik hier',
          },
        },
      ]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const aantal = testDb
        .prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ?')
        .get(buitenstaander.id) as { n: number };
      expect(aantal.n).toBe(0);
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('hoort niet bij deze vereniging');
    });

    it('stuurt bij alle leden alleen naar de eigen vereniging', async () => {
      const werkstroom = maakWorkflow([
        { type: 'send_notification', config: { recipientType: 'all_members', title: 'Aan allen' } },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const ontvangers = testDb.prepare('SELECT user_id FROM notifications').all() as { user_id: string }[];
      expect(ontvangers.length).toBeGreaterThan(0);
      expect(ontvangers.map((o) => o.user_id)).not.toContain(buitenstaander.id);
    });

    it('slaat een lid over dat op verwijderd staat', async () => {
      testDb.prepare("UPDATE users SET deleted_at = '2026-01-01' WHERE id = ?").run(lid.id);

      const werkstroom = maakWorkflow([
        { type: 'send_notification', config: { recipientType: 'all_members', title: 'Aan allen' } },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM notifications WHERE user_id = ?').get(lid.id) as {
        n: number;
      };
      expect(aantal.n).toBe(0);
    });

    it('schrijft niets als er niemand overblijft', async () => {
      const werkstroom = maakWorkflow([
        { type: 'send_notification', config: { recipientType: 'specific', title: 'Aan niemand' } },
      ]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(true);
      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM notifications').get() as { n: number };
      expect(aantal.n).toBe(0);
    });
  });

  describe('e-mail', () => {
    it('stuurt naar een vast adres en zet de tekst zonder opmaak in het tekstdeel', async () => {
      const werkstroom = maakWorkflow([
        {
          type: 'send_email',
          config: {
            recipientType: 'specific',
            recipientEmail: 'dirigent@test.nl',
            subject: 'Repetitie',
            body: '<b>Vanavond</b> om acht uur',
          },
        },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
      const bericht = vi.mocked(sendEmail).mock.calls[0][0] as { to: string; text: string; html: string };
      expect(bericht.to).toBe('dirigent@test.nl');
      expect(bericht.text).toBe('Vanavond om acht uur');
      expect(bericht.html).toContain('<b>');
    });

    it('stuurt bij alle leden alleen naar de eigen vereniging', async () => {
      const werkstroom = maakWorkflow([
        { type: 'send_email', config: { recipientType: 'all_members', subject: 'Aan allen', body: 'hoi' } },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const adressen = vi.mocked(sendEmail).mock.calls.map((c) => (c[0] as { to: string }).to);
      expect(adressen.length).toBeGreaterThan(0);
      expect(adressen).not.toContain(buitenstaander.email);
    });

    it('laat de regel niet omvallen als het versturen mislukt', async () => {
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error('mailserver weg'));

      const werkstroom = maakWorkflow([
        {
          type: 'send_email',
          config: { recipientType: 'specific', recipientEmail: 'weg@test.nl', subject: 'x', body: 'y' },
        },
      ]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(true);
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('Failed to send email');
    });

    it('doet niets als er geen ontvanger uit de config komt', async () => {
      const werkstroom = maakWorkflow([
        { type: 'send_email', config: { recipientType: 'specific', subject: 'x', body: 'y' } },
      ]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('No recipients');
    });
  });

  describe('variabelen in de tekst', () => {
    it('vult een veld van de entiteit in', async () => {
      const werkstroom = maakWorkflow([
        {
          type: 'send_notification',
          config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Dag {{first_name}}', message: 'x' },
        },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', lid.id);

      const melding = testDb.prepare('SELECT title FROM notifications').get() as { title: string };
      expect(melding.title).toBe(`Dag ${lid.firstName}`);
    });

    it('zet een leeg veld om in een lege tekst', async () => {
      const werkstroom = maakWorkflow([
        {
          type: 'send_notification',
          config: { recipientType: 'specific', recipientUserId: lid.id, title: 'a{{locked_until}}b', message: 'x' },
        },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', lid.id);

      const melding = testDb.prepare('SELECT title FROM notifications').get() as { title: string };
      expect(melding.title).toBe('ab');
    });

    it('laat een dollarteken in de waarde met rust', async () => {
      // BEWIJS. De invulling ging via String.replace met een tekst als
      // vervanging, en daarin hebben $& en $' een eigen betekenis. Een lid dat
      // "Jan $& Co" heet leverde op de oude code "Jan {{first_name}} Co" op:
      // de variabele kwam letterlijk terug in de verstuurde melding.
      testDb.prepare('UPDATE users SET first_name = ? WHERE id = ?').run("Jan $& Co $' ", lid.id);

      const werkstroom = maakWorkflow([
        {
          type: 'send_notification',
          config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Dag {{first_name}}!', message: 'x' },
        },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', lid.id);

      const melding = testDb.prepare('SELECT title FROM notifications').get() as { title: string };
      expect(melding.title).toBe("Dag Jan $& Co $' !");
    });

    it('vult datum en tijd in', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      const verwacht = new Date().toLocaleDateString();

      const werkstroom = maakWorkflow([
        {
          type: 'send_notification',
          config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Op {{date}}', message: 'x' },
        },
      ]);
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      const melding = testDb.prepare('SELECT title FROM notifications').get() as { title: string };
      expect(melding.title).toBe(`Op ${verwacht}`);
    });
  });

  describe('voorwaarden bij een actie', () => {
    const metVoorwaarde = (voorwaarde: unknown) =>
      maakWorkflow([{ type: 'create_task', config: { title: 'Alleen indien' }, conditions: voorwaarde }]);

    async function draaiOpLid(werkstroom: string): Promise<number> {
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', lid.id);
      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number };
      return aantal.n;
    }

    it('voert uit als het veld gelijk is', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'role', operator: 'equals', value: 'member' }))).toBe(1);
    });

    it('slaat over als het veld niet gelijk is', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'role', operator: 'equals', value: 'admin' }))).toBe(0);
    });

    it('kent niet gelijk aan', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'role', operator: 'not_equals', value: 'admin' }))).toBe(1);
    });

    it('kent bevat', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'email', operator: 'contains', value: '@test.com' }))).toBe(1);
    });

    it('kent groter dan en kleiner dan', async () => {
      testDb.prepare('UPDATE users SET failed_login_attempts = 5 WHERE id = ?').run(lid.id);
      expect(await draaiOpLid(metVoorwaarde({ field: 'failed_login_attempts', operator: 'greater_than', value: 3 }))).toBe(
        1,
      );
    });

    it('kent leeg en niet leeg', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'locked_until', operator: 'is_empty', value: null }))).toBe(1);
    });

    it('slaat over bij niet leeg op een leeg veld', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'locked_until', operator: 'is_not_empty', value: null }))).toBe(0);
    });

    it('voert uit bij een operator die de motor niet kent', async () => {
      expect(await draaiOpLid(metVoorwaarde({ field: 'role', operator: 'lijkt_op', value: 'x' }))).toBe(1);
    });

    it('voert uit bij een lege voorwaarde', async () => {
      expect(await draaiOpLid(metVoorwaarde({}))).toBe(1);
    });

    it('voert uit als er geen entiteit bij de uitvoering hoort', async () => {
      const werkstroom = metVoorwaarde({ field: 'role', operator: 'equals', value: 'admin' });
      await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);
      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number };
      expect(aantal.n).toBe(1);
    });
  });

  describe('gegevens van de entiteit ophalen', () => {
    it('noteert wat er is ingelezen', async () => {
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'x' } }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', lid.id);

      expect(logboekVan(resultaat.executionId)[0]).toContain(`Loaded user data for ID ${lid.id}`);
    });

    it('loopt niet stuk op een soort entiteit dat niet bestaat', async () => {
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'x' } }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'geheim', 'iets');

      expect(resultaat.success).toBe(true);
    });

    it('loopt niet stuk op een entiteit die niet bestaat', async () => {
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'x' } }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id, 'user', uuidv4());

      expect(resultaat.success).toBe(true);
    });
  });

  describe('een extern adres aanroepen', () => {
    it('noteert de statuscode', async () => {
      const nep = vi.fn().mockResolvedValue({ status: 204 });
      vi.stubGlobal('fetch', nep);

      const werkstroom = maakWorkflow([
        { type: 'webhook', config: { url: 'https://elders.test/haak', method: 'PUT', body: { a: 1 } } },
      ]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(nep).toHaveBeenCalledOnce();
      expect(nep.mock.calls[0][1].method).toBe('PUT');
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('204');
    });

    it('laat de regel niet omvallen als het adres niet bereikbaar is', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('geen verbinding')));

      const werkstroom = maakWorkflow([{ type: 'webhook', config: { url: 'https://elders.test/haak' } }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(resultaat.success).toBe(true);
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('Webhook failed');
    });

    it('doet niets zonder adres', async () => {
      const nep = vi.fn();
      vi.stubGlobal('fetch', nep);

      const werkstroom = maakWorkflow([{ type: 'webhook', config: {} }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(nep).not.toHaveBeenCalled();
      expect(logboekVan(resultaat.executionId).join(' ')).toContain('No webhook URL');
    });
  });

  describe('wachten', () => {
    it('wacht en noteert dat', async () => {
      const werkstroom = maakWorkflow([{ type: 'delay', config: { minutes: 0.001 } }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(logboekVan(resultaat.executionId).join(' ')).toContain('Delayed');
    });

    it('wacht niet bij nul minuten', async () => {
      const werkstroom = maakWorkflow([{ type: 'delay', config: { minutes: 0 } }]);
      const resultaat = await executeWorkflow(werkstroom, vereniging.id, 'manual', beheerder.id);

      expect(logboekVan(resultaat.executionId).join(' ')).not.toContain('Delayed');
    });
  });

  describe('geplande regels', () => {
    /** Wacht tot er ten minste zoveel uitvoeringen klaar zijn. */
    async function wachtOpAfgerond(aantal: number): Promise<void> {
      for (let poging = 0; poging < 200; poging++) {
        const rij = testDb
          .prepare("SELECT COUNT(*) as n FROM workflow_executions WHERE status <> 'running'")
          .get() as { n: number };
        if (rij.n >= aantal) return;
        await new Promise((klaar) => setTimeout(klaar, 5));
      }
    }

    function legTriggerNeer(workflowId: string, tijd: string): void {
      testDb
        .prepare(
          `INSERT INTO workflow_triggers (id, workflow_id, trigger_type, time_of_day, is_active)
           VALUES (?, ?, 'schedule', ?, 1)`,
        )
        .run(uuidv4(), workflowId, tijd);
    }

    it('start de regel waarvan het tijdstip nu is', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 1, 10, 30, 0));

      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Gepland' } }]);
      legTriggerNeer(werkstroom, '10:30');

      processScheduledWorkflows();
      await wachtOpAfgerond(1);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('start niets op een ander tijdstip', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 1, 10, 30, 0));

      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Later' } }]);
      legTriggerNeer(werkstroom, '11:45');

      processScheduledWorkflows();

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('start de regel van een andere vereniging niet als er een vereniging is opgegeven', async () => {
      // De route die dit handmatig aftrapt geeft de vereniging van de
      // aanvrager mee. Een beheerder hoort alleen zijn eigen automatisering te
      // kunnen laten afgaan, niet de mails en meldingen van elke andere
      // vereniging op de installatie.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 1, 10, 30, 0));

      const hunWerkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Van hen' } }], {
        associationId: andereVereniging.id,
        createdBy: buitenstaander.id,
      });
      legTriggerNeer(hunWerkstroom, '10:30');

      processScheduledWorkflows(vereniging.id);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('start zonder vereniging de regels van alle verenigingen', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 1, 10, 30, 0));

      const eigen = maakWorkflow([{ type: 'create_task', config: { title: 'Van ons' } }]);
      const hun = maakWorkflow([{ type: 'create_task', config: { title: 'Van hen' } }], {
        associationId: andereVereniging.id,
        createdBy: buitenstaander.id,
      });
      legTriggerNeer(eigen, '10:30');
      legTriggerNeer(hun, '10:30');

      processScheduledWorkflows();
      await wachtOpAfgerond(2);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(2);
    });

    it('start een regel die op verwijderd staat niet', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 1, 10, 30, 0));

      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Weg' } }]);
      testDb.prepare("UPDATE workflows SET deleted_at = '2026-01-01' WHERE id = ?").run(werkstroom);
      legTriggerNeer(werkstroom, '10:30');

      processScheduledWorkflows();

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('start een regel die uit staat niet', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 1, 10, 30, 0));

      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Uit' } }], { actief: false });
      legTriggerNeer(werkstroom, '10:30');

      processScheduledWorkflows();

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(0);
    });
  });

  describe('regels die op een datumveld afgaan', () => {
    async function wachtOpAfgerond(aantal: number): Promise<void> {
      for (let poging = 0; poging < 200; poging++) {
        const rij = testDb
          .prepare("SELECT COUNT(*) as n FROM workflow_executions WHERE status <> 'running'")
          .get() as { n: number };
        if (rij.n >= aantal) return;
        await new Promise((klaar) => setTimeout(klaar, 5));
      }
    }

    function legDatumTriggerNeer(
      workflowId: string,
      entiteit: string | null,
      veld: string | null,
      dagen: { voor?: number; na?: number } = {},
    ): void {
      testDb
        .prepare(
          `INSERT INTO workflow_triggers (id, workflow_id, trigger_type, date_field_entity, date_field_name, days_before, days_after, is_active)
           VALUES (?, ?, 'date_field', ?, ?, ?, ?, 1)`,
        )
        .run(uuidv4(), workflowId, entiteit, veld, dagen.voor ?? 0, dagen.na ?? 0);
    }

    function maakTaak(titel: string, datum: string): string {
      const id = uuidv4();
      testDb
        .prepare(
          `INSERT INTO tasks (id, association_id, title, due_date, status, priority, created_by)
           VALUES (?, ?, ?, ?, 'todo', 'medium', ?)`,
        )
        .run(id, vereniging.id, titel, datum, beheerder.id);
      return id;
    }

    it('gaat af op een taak die vandaag afloopt', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      maakTaak('Loopt af', '2026-09-01');

      const werkstroom = maakWorkflow([
        { type: 'send_notification', config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Herinner' } },
      ]);
      legDatumTriggerNeer(werkstroom, 'task', 'due_date');

      processDateFieldWorkflows();
      await wachtOpAfgerond(1);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM notifications').get() as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('kijkt met dagen vooruit naar de toekomst', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      maakTaak('Over drie dagen', '2026-09-04');

      const werkstroom = maakWorkflow([
        { type: 'send_notification', config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Bijna' } },
      ]);
      legDatumTriggerNeer(werkstroom, 'task', 'due_date', { voor: 3 });

      processDateFieldWorkflows();
      await wachtOpAfgerond(1);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM notifications').get() as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('kijkt met dagen terug naar het verleden', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      maakTaak('Twee dagen te laat', '2026-08-30');

      const werkstroom = maakWorkflow([
        { type: 'send_notification', config: { recipientType: 'specific', recipientUserId: lid.id, title: 'Te laat' } },
      ]);
      legDatumTriggerNeer(werkstroom, 'task', 'due_date', { na: 2 });

      processDateFieldWorkflows();
      await wachtOpAfgerond(1);

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM notifications').get() as { n: number };
      expect(aantal.n).toBe(1);
    });

    it('slaat een soort entiteit over dat de motor niet kent', async () => {
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'x' } }]);
      legDatumTriggerNeer(werkstroom, 'geheim', 'datum');

      processDateFieldWorkflows();

      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('loopt niet stuk op een kolomnaam die niet bestaat', async () => {
      // date_field_name gaat rechtstreeks de query in. Een naam die niet
      // bestaat mag de planner niet omver halen; de fout hoort per trigger
      // opgevangen te worden.
      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'x' } }]);
      legDatumTriggerNeer(werkstroom, 'task', 'bestaat_niet');

      expect(() => processDateFieldWorkflows()).not.toThrow();
      const aantal = testDb.prepare('SELECT COUNT(*) as n FROM workflow_executions').get() as { n: number };
      expect(aantal.n).toBe(0);
    });

    it('laat de taken van een andere vereniging met rust', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));

      const hunTaak = uuidv4();
      testDb
        .prepare(
          `INSERT INTO tasks (id, association_id, title, due_date, status, priority, created_by)
           VALUES (?, ?, 'Van hen', '2026-09-01', 'todo', 'medium', ?)`,
        )
        .run(hunTaak, andereVereniging.id, buitenstaander.id);

      const werkstroom = maakWorkflow([{ type: 'create_task', config: { title: 'Van ons' } }]);
      legDatumTriggerNeer(werkstroom, 'task', 'due_date');

      processDateFieldWorkflows(vereniging.id);
      await new Promise((klaar) => setTimeout(klaar, 50));

      // De trigger hoort bij onze vereniging, dus onze regel gaat af - maar
      // hij gaat wel af *op* de taak van de andere vereniging: de query achter
      // date_field kent geen verenigingsgrens. Zie het rapport; dit legt de
      // huidige stand vast.
      const uitvoeringen = testDb.prepare('SELECT entity_id FROM workflow_executions').all() as { entity_id: string }[];
      expect(uitvoeringen.map((u) => u.entity_id)).toContain(hunTaak);
    });

    it('blijft zichzelf voeden als de regel maakt waar hij op afgaat', async () => {
      // WACHT, geen bewijs: dit legt vast wat er nu gebeurt.
      //
      // De trigger kijkt naar taken die vandaag aflopen, en de actie maakt een
      // taak die vandaag afloopt. Er zit geen enkele rem op: elke ronde
      // verdubbelt het aantal taken, en daarmee het aantal uitvoeringen. Op een
      // planner die elk uur draait loopt dat binnen een dag in de duizenden.
      //
      // Niet gerepareerd: een rem hoort een ontwerpkeuze te zijn (een teller
      // per uitvoering, of run_once_per_entity - die kolom staat er al maar
      // wordt nergens gelezen), en niet iets wat hier stilletjes wordt
      // ingevoerd.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      maakTaak('Zaadje', '2026-09-01');

      const werkstroom = maakWorkflow([
        { type: 'create_task', config: { title: 'Nakomeling', dueDate: '2026-09-01' } },
      ]);
      legDatumTriggerNeer(werkstroom, 'task', 'due_date');

      const aantalTaken = () => (testDb.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number }).n;

      processDateFieldWorkflows();
      await wachtOpAfgerond(1);
      expect(aantalTaken()).toBe(2);

      processDateFieldWorkflows();
      await wachtOpAfgerond(3);
      expect(aantalTaken()).toBe(4);

      processDateFieldWorkflows();
      await wachtOpAfgerond(7);
      expect(aantalTaken()).toBe(8);
    });
  });
});
