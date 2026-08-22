/**
 * Het opnieuw proberen van e-mail doorsturen (M365).
 *
 * Bij het aanmaken van een account is de mailbox in Microsoft 365 vaak nog niet
 * klaar; het doorsturen naar het privé-adres wordt dan als openstaande taak
 * weggeschreven en later opnieuw geprobeerd. Dat "later" gebeurt zonder dat
 * iemand meekijkt, dus loopt het stil vast als er iets misgaat: het lid mist
 * post en niemand ziet het.
 *
 * De Microsoft-kant (token ophalen, regel zetten) is vervangen door een
 * dubbelganger. De tests kijken naar wat er met de taak in onboarding_tasks
 * gebeurt: afgerond, opnieuw ingepland, of definitief mislukt.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';
import testDb from '../testDb';
import { createTestAssociation, createTestUser, TestAssociation, TestUser } from '../testUtils';
import { processPendingTasks, triggerRetryForUser } from '../../scheduler/email-forwarding-retry';
import { getMicrosoftConfig, getAppAccessToken, setupEmailForwarding } from '../../utils/m365';

vi.mock('../../utils/m365', () => ({
  getMicrosoftConfig: vi.fn(),
  getAppAccessToken: vi.fn(),
  setupEmailForwarding: vi.fn(),
}));

const microsoftInstellingen = getMicrosoftConfig as unknown as Mock;
const tokenOphalen = getAppAccessToken as unknown as Mock;
const doorsturenInstellen = setupEmailForwarding as unknown as Mock;

function minutenGeleden(minuten: number): string {
  return new Date(Date.now() - minuten * 60 * 1000).toISOString();
}

function minutenVanafNu(minuten: number): string {
  return new Date(Date.now() + minuten * 60 * 1000).toISOString();
}

interface TaakOpties {
  taskType?: string;
  status?: string;
  metadata?: string;
  retryCount?: number;
  volgendePogingNa?: string;
}

function maakTaak(gebruiker: TestUser, opties: TaakOpties = {}): string {
  const id = uuidv4();
  const metadata =
    opties.metadata ??
    JSON.stringify({
      privateEmail: gebruiker.email.replace('@', '.privé@'),
      retryCount: opties.retryCount ?? 0,
      lastAttempt: minutenGeleden(10),
      // Standaard is de taak aan de beurt: het moment ligt in het verleden.
      nextRetryAfter: opties.volgendePogingNa ?? minutenGeleden(1),
    });

  testDb
    .prepare(
      `INSERT INTO onboarding_tasks (id, user_id, association_id, task_type, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      gebruiker.id,
      gebruiker.associationId,
      opties.taskType ?? 'email_forwarding_pending',
      opties.status ?? 'pending',
      metadata,
    );
  return id;
}

function taak(
  id: string,
): { status: string; task_type: string; metadata: string; error_message: string | null } | undefined {
  return testDb
    .prepare('SELECT status, task_type, metadata, error_message FROM onboarding_tasks WHERE id = ?')
    .get(id) as { status: string; task_type: string; metadata: string; error_message: string | null } | undefined;
}

/** Een lid met een Microsoft-account en een privé-adres om naar door te sturen. */
function maakLidMetMailbox(associationId: string, naam: string): TestUser {
  const gebruiker = createTestUser(associationId, { email: `${naam}-${uuidv4()}@harmonie.nl` });
  testDb
    .prepare('UPDATE users SET microsoft_id = ?, private_email = ? WHERE id = ?')
    .run(`ms-${gebruiker.id}`, `${naam}@gmail.com`, gebruiker.id);
  return gebruiker;
}

describe('Opnieuw proberen: e-mail doorsturen', () => {
  let vereniging: TestAssociation;
  let lid: TestUser;

  beforeEach(() => {
    microsoftInstellingen.mockReset();
    tokenOphalen.mockReset();
    doorsturenInstellen.mockReset();

    microsoftInstellingen.mockReturnValue({ tenantId: 't', clientId: 'c', clientSecret: 's', domain: 'harmonie.nl' });
    tokenOphalen.mockResolvedValue('test-token');
    doorsturenInstellen.mockResolvedValue({ success: true });

    vereniging = createTestAssociation({ name: 'Harmonie Sint Cecilia' });
    lid = maakLidMetMailbox(vereniging.id, 'anna');
  });

  describe('wat er gebeurt als het lukt', () => {
    it('zet het doorsturen aan en rondt de taak af', async () => {
      const taakId = maakTaak(lid);

      await processPendingTasks(0);

      expect(doorsturenInstellen).toHaveBeenCalledWith('test-token', `ms-${lid.id}`, 'anna@gmail.com');
      const resultaat = taak(taakId)!;
      expect(resultaat.status).toBe('completed');
      expect(resultaat.task_type).toBe('email_forwarding');
      expect(resultaat.error_message).toBeNull();
      expect(JSON.parse(resultaat.metadata).method).toBe('scheduler_retry');
    });

    it('gebruikt de Microsoft-instellingen van de eigen vereniging', async () => {
      // Twee verenigingen hebben elk hun eigen tenant. Een taak van vereniging
      // B mag niet met de sleutels van vereniging A worden uitgevoerd.
      const andereVereniging = createTestAssociation({ name: 'Fanfare Concordia' });
      const anderLid = maakLidMetMailbox(andereVereniging.id, 'bram');
      maakTaak(lid);
      maakTaak(anderLid);

      await processPendingTasks(0);

      const gebruikteVerenigingen = microsoftInstellingen.mock.calls.map((c) => c[0]).sort();
      expect(gebruikteVerenigingen).toEqual([vereniging.id, andereVereniging.id].sort());
    });
  });

  describe('wat er met rust blijft', () => {
    it('laat een taak liggen die nog niet aan de beurt is', async () => {
      const taakId = maakTaak(lid, { volgendePogingNa: minutenVanafNu(30) });

      await processPendingTasks(0);

      expect(doorsturenInstellen).not.toHaveBeenCalled();
      expect(taak(taakId)!.status).toBe('pending');
    });

    it('pakt een taak van een ander soort niet op', async () => {
      const taakId = maakTaak(lid, { taskType: 'spond_invite' });

      await processPendingTasks(0);

      expect(doorsturenInstellen).not.toHaveBeenCalled();
      expect(taak(taakId)!.status).toBe('pending');
    });

    it('pakt een taak die al afgerond is niet opnieuw op', async () => {
      maakTaak(lid, { status: 'completed' });

      await processPendingTasks(0);

      expect(doorsturenInstellen).not.toHaveBeenCalled();
    });

    it('laat een taak staan zolang het lid nog geen Microsoft-account heeft', async () => {
      testDb.prepare('UPDATE users SET microsoft_id = NULL WHERE id = ?').run(lid.id);
      const taakId = maakTaak(lid);

      await processPendingTasks(0);

      expect(doorsturenInstellen).not.toHaveBeenCalled();
      expect(taak(taakId)!.status).toBe('pending');
    });

    it('laat een taak staan als Microsoft niet is ingesteld voor de vereniging', async () => {
      microsoftInstellingen.mockReturnValue(null);
      const taakId = maakTaak(lid);

      await processPendingTasks(0);

      expect(tokenOphalen).not.toHaveBeenCalled();
      expect(taak(taakId)!.status).toBe('pending');
    });

    it('laat een taak met onleesbare gegevens staan zonder de ronde af te breken', async () => {
      const kapotteTaak = maakTaak(lid, { metadata: 'geen json' });
      const tweedeLid = maakLidMetMailbox(vereniging.id, 'bram');
      const goedeTaak = maakTaak(tweedeLid);

      await processPendingTasks(0);

      expect(taak(kapotteTaak)!.status).toBe('pending');
      expect(taak(goedeTaak)!.status).toBe('completed');
    });

    it('ruimt de taak op als het lid geen privé-adres meer heeft', async () => {
      // Zonder privé-adres valt er niets door te sturen; de taak blijft anders
      // eeuwig in de wachtrij staan.
      testDb.prepare('UPDATE users SET private_email = NULL WHERE id = ?').run(lid.id);
      const taakId = maakTaak(lid);

      await processPendingTasks(0);

      expect(taak(taakId)).toBeUndefined();
      expect(doorsturenInstellen).not.toHaveBeenCalled();
    });
  });

  describe('als het misgaat', () => {
    it('plant een nieuwe poging na een mislukte poging', async () => {
      doorsturenInstellen.mockResolvedValue({ success: false, error: 'mailbox nog niet klaar' });
      const taakId = maakTaak(lid);

      await processPendingTasks(0);

      const gegevens = JSON.parse(taak(taakId)!.metadata);
      expect(taak(taakId)!.status).toBe('pending');
      expect(gegevens.retryCount).toBe(1);
      expect(gegevens.lastError).toBe('mailbox nog niet klaar');
      // De eerstvolgende poging staat verderop in de tijd (oplopende wachttijd).
      expect(new Date(gegevens.nextRetryAfter).getTime()).toBeGreaterThan(Date.now());
    });

    it('geeft het na tien pogingen op en zet de taak op mislukt', async () => {
      doorsturenInstellen.mockResolvedValue({ success: false, error: 'mailbox blijft weg' });
      const taakId = maakTaak(lid, { retryCount: 9 });

      await processPendingTasks(0);

      const resultaat = taak(taakId)!;
      expect(resultaat.status).toBe('failed');
      expect(resultaat.error_message).toContain('10 pogingen');
      expect(JSON.parse(resultaat.metadata).retryCount).toBe(10);
    });

    it('telt ook een onverwachte fout als poging en plant een nieuwe', async () => {
      doorsturenInstellen.mockRejectedValue(new Error('Graph geeft 503'));
      const taakId = maakTaak(lid);

      await processPendingTasks(0);

      const gegevens = JSON.parse(taak(taakId)!.metadata);
      expect(gegevens.retryCount).toBe(1);
      expect(gegevens.lastError).toBe('Graph geeft 503');
      expect(new Date(gegevens.nextRetryAfter).getTime()).toBeGreaterThan(Date.now());
    });

    it('gaat door met de volgende taak als er één stukloopt', async () => {
      const tweedeLid = maakLidMetMailbox(vereniging.id, 'bram');
      const kapotteTaak = maakTaak(lid);
      const goedeTaak = maakTaak(tweedeLid);
      doorsturenInstellen.mockImplementation(async (_token: string, microsoftId: string) => {
        if (microsoftId === `ms-${lid.id}`) throw new Error('Graph geeft 500');
        return { success: true };
      });

      await processPendingTasks(0);

      expect(taak(kapotteTaak)!.status).toBe('pending');
      expect(taak(goedeTaak)!.status).toBe('completed');
    });
  });

  describe('handmatig opnieuw proberen vanuit de ledenlijst', () => {
    it('zet het doorsturen alsnog aan en meldt dat het gelukt is', async () => {
      // De taak staat pas over een half uur ingepland; een handmatige poging
      // hoort daar niet op te wachten.
      const taakId = maakTaak(lid, { volgendePogingNa: minutenVanafNu(30) });

      const resultaat = await triggerRetryForUser(lid.id);

      expect(resultaat.success).toBe(true);
      expect(taak(taakId)!.status).toBe('completed');
    });

    it('meldt dat er niets te proberen valt als er geen taak openstaat', async () => {
      const resultaat = await triggerRetryForUser(lid.id);

      expect(resultaat.success).toBe(false);
      expect(resultaat.message).toContain('Geen openstaande');
    });

    it('meldt dat het niet gelukt is als de mailbox nog niet klaar is', async () => {
      doorsturenInstellen.mockResolvedValue({ success: false, error: 'mailbox nog niet klaar' });
      const taakId = maakTaak(lid);

      const resultaat = await triggerRetryForUser(lid.id);

      expect(resultaat.success).toBe(false);
      expect(taak(taakId)!.status).toBe('pending');
    });

    it('raakt de taak van een ander lid niet aan', async () => {
      const tweedeLid = maakLidMetMailbox(vereniging.id, 'bram');
      const eigenTaak = maakTaak(lid);
      const andermansTaak = maakTaak(tweedeLid);

      await triggerRetryForUser(lid.id);

      expect(taak(eigenTaak)!.status).toBe('completed');
      expect(taak(andermansTaak)!.status).toBe('pending');
    });
  });
});
