/**
 * Tests voor de onderhoudswaarschuwingen van instrumenten.
 *
 * Twee dingen staan hier centraal. Ten eerste de grenzen: een instrument dat
 * over precies zoveel dagen aan de beurt is valt net wel of net niet binnen een
 * lijst, en dat soort randen zijn met een vergelijking op datumteksten makkelijk
 * een dag mis te slaan. Ten tweede de verenigingsgrens: elke lijst en elk
 * kostenoverzicht mag uitsluitend de eigen instrumenten van een vereniging
 * bevatten.
 *
 * Alle datums worden vanaf nu gerekend, in UTC, precies zoals de dienst zelf
 * doet. Zo is het aantal dagen tot de onderhoudsbeurt een exact geheel getal en
 * hoeft er geen vaste datum in de test te staan die op een dag omvalt.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import '../setup';

// De meldingendienst wordt vervangen: die schrijft naar tabellen, mailt en
// pusht. Hier gaat het alleen om de vraag wie er een melding krijgt en hoeveel.
vi.mock('../../services/notifications', () => ({
  sendNotification: vi.fn().mockResolvedValue({ success: true, channels: [] }),
  notifyAssociation: vi.fn().mockResolvedValue({ sent: 0, errors: 0 }),
}));

import testDb from '../testDb';
import { createTestAssociation, createTestUser, TestAssociation } from '../testUtils';
import { sendNotification } from '../../services/notifications';
import {
  getUpcomingMaintenance,
  getOverdueMaintenance,
  getMaintenanceSchedule,
  logMaintenance,
  getMaintenanceLog,
  updateMaintenanceSettings,
  getMaintenanceCosts,
  getAssociationMaintenanceCosts,
  sendMaintenanceNotifications,
  runMaintenanceCheck,
} from '../../services/maintenanceAlerts';

/** Datum n dagen vanaf nu in UTC - dezelfde rekenwijze als de dienst. */
function datumOverDagen(dagen: number): string {
  return new Date(Date.now() + dagen * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

describe('maintenanceAlerts', () => {
  let vereniging: TestAssociation;

  function maakInstrument(
    verenigingId: string,
    opties: {
      type?: string;
      merk?: string | null;
      serienummer?: string | null;
      volgendOnderhoud?: string | null;
      laatsteOnderhoud?: string | null;
      intervalMaanden?: number | null;
      status?: string;
      gebruikerId?: string | null;
      notities?: string | null;
    } = {},
  ): string {
    const id = uuidv4();
    testDb
      .prepare(
        `INSERT INTO equipment
            (id, association_id, instrument_type, brand_model, serial_number, status,
             current_user_id, maintenance_interval_months, last_maintenance_date,
             next_maintenance_date, maintenance_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        verenigingId,
        opties.type ?? 'Trompet',
        opties.merk ?? null,
        opties.serienummer ?? null,
        opties.status ?? 'available',
        opties.gebruikerId ?? null,
        opties.intervalMaanden ?? 12,
        opties.laatsteOnderhoud ?? null,
        opties.volgendOnderhoud ?? null,
        opties.notities ?? null,
      );
    return id;
  }

  function maakLogregel(
    instrumentId: string,
    datum: string,
    kosten: number | null,
    omschrijving = 'Grote beurt',
  ): void {
    testDb
      .prepare(
        `INSERT INTO equipment_maintenance_log (id, equipment_id, maintenance_date, description, cost)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(uuidv4(), instrumentId, datum, omschrijving, kosten);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vereniging = createTestAssociation({ name: `Harmonie ${uuidv4()}` });
  });

  describe('getUpcomingMaintenance', () => {
    it('rekent het aantal dagen tot de onderhoudsbeurt exact uit', () => {
      maakInstrument(vereniging.id, {
        type: 'Trombone',
        merk: 'Yamaha YSL-354',
        serienummer: 'SN-1',
        volgendOnderhoud: datumOverDagen(5),
        laatsteOnderhoud: datumOverDagen(-360),
        intervalMaanden: 12,
        notities: 'Ventielen nalopen',
      });

      const items = getUpcomingMaintenance(vereniging.id, 30);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        instrumentType: 'Trombone',
        brandModel: 'Yamaha YSL-354',
        serialNumber: 'SN-1',
        maintenanceIntervalMonths: 12,
        maintenanceNotes: 'Ventielen nalopen',
        isOverdue: false,
        daysUntilDue: 5,
        currentUser: null,
      });
      expect(items[0].equipmentId).toBe(items[0].id);
    });

    it('neemt de laatste dag van het venster nog wel mee en de dag erna niet', () => {
      maakInstrument(vereniging.id, { type: 'Precies-op-de-grens', volgendOnderhoud: datumOverDagen(30) });
      maakInstrument(vereniging.id, { type: 'Net-erbuiten', volgendOnderhoud: datumOverDagen(31) });

      const items = getUpcomingMaintenance(vereniging.id, 30);

      expect(items.map((i) => i.instrumentType)).toEqual(['Precies-op-de-grens']);
    });

    it('sorteert op onderhoudsdatum, de eerstvolgende voorop', () => {
      maakInstrument(vereniging.id, { type: 'Over 20 dagen', volgendOnderhoud: datumOverDagen(20) });
      maakInstrument(vereniging.id, { type: 'Over 2 dagen', volgendOnderhoud: datumOverDagen(2) });
      maakInstrument(vereniging.id, { type: 'Over 10 dagen', volgendOnderhoud: datumOverDagen(10) });

      const items = getUpcomingMaintenance(vereniging.id, 30);

      expect(items.map((i) => i.instrumentType)).toEqual(['Over 2 dagen', 'Over 10 dagen', 'Over 20 dagen']);
      expect(items.map((i) => i.daysUntilDue)).toEqual([2, 10, 20]);
    });

    it('laat afgeschreven instrumenten en instrumenten zonder onderhoudsdatum weg', () => {
      maakInstrument(vereniging.id, {
        type: 'Afgeschreven',
        volgendOnderhoud: datumOverDagen(5),
        status: 'written_off',
      });
      maakInstrument(vereniging.id, { type: 'Geen datum', volgendOnderhoud: null });
      maakInstrument(vereniging.id, { type: 'In bruikleen', volgendOnderhoud: datumOverDagen(5), status: 'on_loan' });

      const items = getUpcomingMaintenance(vereniging.id, 30);

      // 'on_loan' hoort er wel bij: alleen 'written_off' wordt uitgesloten.
      expect(items.map((i) => i.instrumentType)).toEqual(['In bruikleen']);
    });

    it('vult de huidige bespeler in als het instrument in bruikleen is', () => {
      const gebruiker = createTestUser(vereniging.id, {
        email: `speler-${uuidv4()}@example.com`,
        firstName: 'Anne',
        lastName: 'de Vries',
      });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(5), gebruikerId: gebruiker.id });

      const items = getUpcomingMaintenance(vereniging.id, 30);

      expect(items[0].currentUser).toEqual({
        id: gebruiker.id,
        firstName: 'Anne',
        lastName: 'de Vries',
        email: gebruiker.email,
      });
    });

    it('geeft een lege lijst als er niets gepland staat', () => {
      expect(getUpcomingMaintenance(vereniging.id, 30)).toEqual([]);
    });

    it('geeft bij nul dagen vooruit niets terug in plaats van te struikelen', () => {
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(5) });

      expect(getUpcomingMaintenance(vereniging.id, 0)).toEqual([]);
    });

    it('toont geen instrumenten van een andere vereniging', () => {
      const buren = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      maakInstrument(buren.id, { type: 'Bugel van de buren', volgendOnderhoud: datumOverDagen(5) });
      maakInstrument(vereniging.id, { type: 'Eigen trompet', volgendOnderhoud: datumOverDagen(5) });

      const items = getUpcomingMaintenance(vereniging.id, 30);

      expect(items.map((i) => i.instrumentType)).toEqual(['Eigen trompet']);
    });
  });

  describe('getOverdueMaintenance', () => {
    it('geeft een negatief aantal dagen voor achterstallig onderhoud', () => {
      maakInstrument(vereniging.id, { type: 'Hoorn', volgendOnderhoud: datumOverDagen(-45) });

      const items = getOverdueMaintenance(vereniging.id);

      expect(items).toHaveLength(1);
      expect(items[0].isOverdue).toBe(true);
      expect(items[0].daysUntilDue).toBe(-45);
    });

    it('zet het langst achterstallige instrument bovenaan', () => {
      maakInstrument(vereniging.id, { type: '3 dagen te laat', volgendOnderhoud: datumOverDagen(-3) });
      maakInstrument(vereniging.id, { type: '100 dagen te laat', volgendOnderhoud: datumOverDagen(-100) });

      const items = getOverdueMaintenance(vereniging.id);

      expect(items.map((i) => i.instrumentType)).toEqual(['100 dagen te laat', '3 dagen te laat']);
    });

    it('laat toekomstige onderhoudsbeurten en afgeschreven instrumenten weg', () => {
      maakInstrument(vereniging.id, { type: 'Toekomst', volgendOnderhoud: datumOverDagen(5) });
      maakInstrument(vereniging.id, {
        type: 'Afgeschreven',
        volgendOnderhoud: datumOverDagen(-5),
        status: 'written_off',
      });

      expect(getOverdueMaintenance(vereniging.id)).toEqual([]);
    });

    it('toont geen instrumenten van een andere vereniging', () => {
      const buren = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      maakInstrument(buren.id, { type: 'Bugel van de buren', volgendOnderhoud: datumOverDagen(-10) });

      expect(getOverdueMaintenance(vereniging.id)).toEqual([]);
    });

    it('een instrument dat vandaag aan de beurt is valt buiten beide lijsten', () => {
      // Vastgelegd omdat het een gat is: de achterstandslijst vraagt om
      // "< vandaag" en de plannenlijst om "> vandaag", dus precies vandaag komt
      // in geen van beide terug. Het onderhoudsschema noemt zo'n instrument wel
      // 'due_soon'. Wat de juiste lijst is, is een keuze; dat het in geen enkele
      // lijst zit is dat niet.
      maakInstrument(vereniging.id, { type: 'Vandaag', volgendOnderhoud: datumOverDagen(0) });

      expect(getOverdueMaintenance(vereniging.id)).toEqual([]);
      expect(getUpcomingMaintenance(vereniging.id, 30)).toEqual([]);
      expect(getMaintenanceSchedule(vereniging.id)[0].status).toBe('due_soon');
    });
  });

  describe('getMaintenanceSchedule', () => {
    it('deelt in op achterstallig, binnenkort en gepland - inclusief de grenzen', () => {
      maakInstrument(vereniging.id, { type: 'Gisteren', volgendOnderhoud: datumOverDagen(-1) });
      maakInstrument(vereniging.id, { type: 'Over 7 dagen', volgendOnderhoud: datumOverDagen(7) });
      maakInstrument(vereniging.id, { type: 'Over 8 dagen', volgendOnderhoud: datumOverDagen(8) });

      const schema = getMaintenanceSchedule(vereniging.id);

      expect(schema.map((i) => [i.instrumentType, i.status, i.daysUntilDue])).toEqual([
        ['Gisteren', 'overdue', -1],
        ['Over 7 dagen', 'due_soon', 7],
        ['Over 8 dagen', 'scheduled', 8],
      ]);
    });

    it('slaat instrumenten zonder onderhoudsdatum en afgeschreven instrumenten over', () => {
      maakInstrument(vereniging.id, { type: 'Geen datum', volgendOnderhoud: null });
      maakInstrument(vereniging.id, {
        type: 'Afgeschreven',
        volgendOnderhoud: datumOverDagen(3),
        status: 'written_off',
      });

      expect(getMaintenanceSchedule(vereniging.id)).toEqual([]);
    });

    it('toont geen instrumenten van een andere vereniging', () => {
      const buren = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      maakInstrument(buren.id, { volgendOnderhoud: datumOverDagen(3) });

      expect(getMaintenanceSchedule(vereniging.id)).toEqual([]);
    });
  });

  describe('logMaintenance', () => {
    it('legt de beurt vast en schuift de volgende datum het interval op', () => {
      const instrumentId = maakInstrument(vereniging.id, { intervalMaanden: 12 });
      const gebruiker = createTestUser(vereniging.id, { email: `beheer-${uuidv4()}@example.com` });

      const logId = logMaintenance(
        instrumentId,
        {
          maintenanceDate: '2020-03-10',
          performedBy: 'Muziekhuis Jansen',
          description: 'Grote beurt',
          cost: 125.5,
          notes: 'Nieuwe kurken',
        },
        gebruiker.id,
      );

      const regels = getMaintenanceLog(instrumentId);
      expect(regels).toHaveLength(1);
      expect(regels[0]).toMatchObject({
        id: logId,
        equipmentId: instrumentId,
        maintenanceDate: '2020-03-10',
        performedBy: 'Muziekhuis Jansen',
        description: 'Grote beurt',
        cost: 125.5,
        notes: 'Nieuwe kurken',
        createdBy: gebruiker.id,
      });

      const instrument = testDb
        .prepare('SELECT last_maintenance_date, next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { last_maintenance_date: string; next_maintenance_date: string };
      expect(instrument.last_maintenance_date).toBe('2020-03-10');
      expect(instrument.next_maintenance_date).toBe('2021-03-10'); // 12 maanden verder
    });

    it('rekent met een afwijkend interval van zes maanden', () => {
      const instrumentId = maakInstrument(vereniging.id, { intervalMaanden: 6 });

      logMaintenance(instrumentId, { maintenanceDate: '2020-03-10', description: 'Kleine beurt' });

      const instrument = testDb
        .prepare('SELECT next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { next_maintenance_date: string };
      expect(instrument.next_maintenance_date).toBe('2020-09-10');
    });

    it('valt terug op twaalf maanden als er geen interval is ingesteld', () => {
      const instrumentId = maakInstrument(vereniging.id, { intervalMaanden: null });

      logMaintenance(instrumentId, { maintenanceDate: '2020-03-10', description: 'Beurt' });

      const instrument = testDb
        .prepare('SELECT next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { next_maintenance_date: string };
      expect(instrument.next_maintenance_date).toBe('2021-03-10');
    });

    it('schuift bij een maand die de dag niet heeft door naar de volgende maand', () => {
      // 31 januari plus een maand bestaat niet; JavaScript schuift dan door.
      // Vastgelegd zodat duidelijk is dat dit het gedrag is en geen toeval.
      const instrumentId = maakInstrument(vereniging.id, { intervalMaanden: 1 });

      logMaintenance(instrumentId, { maintenanceDate: '2020-01-31', description: 'Beurt' });

      const instrument = testDb
        .prepare('SELECT next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { next_maintenance_date: string };
      expect(instrument.next_maintenance_date).toBe('2020-03-02'); // 2020 is een schrikkeljaar
    });

    it('slaat kosten van nul op als leeg', () => {
      // `data.cost || null` maakt van 0 een NULL. Voor het optellen maakt dat
      // niet uit, maar de opgeslagen waarde is daardoor niet wat er is meegegeven.
      const instrumentId = maakInstrument(vereniging.id);

      logMaintenance(instrumentId, { maintenanceDate: '2020-03-10', description: 'Kosteloos', cost: 0 });

      const regel = testDb
        .prepare('SELECT cost FROM equipment_maintenance_log WHERE equipment_id = ?')
        .get(instrumentId) as { cost: number | null };
      expect(regel.cost).toBeNull();
      expect(getMaintenanceCosts(instrumentId)).toEqual({ total: 0, count: 1 });
    });

    it('zet de nieuwste beurt bovenaan in het logboek', () => {
      const instrumentId = maakInstrument(vereniging.id);
      logMaintenance(instrumentId, { maintenanceDate: '2020-01-10', description: 'Oud' });
      logMaintenance(instrumentId, { maintenanceDate: '2021-01-10', description: 'Nieuw' });

      expect(getMaintenanceLog(instrumentId).map((r) => r.description)).toEqual(['Nieuw', 'Oud']);
    });

    it('geeft een leeg logboek voor een instrument zonder beurten', () => {
      expect(getMaintenanceLog(maakInstrument(vereniging.id))).toEqual([]);
    });
  });

  describe('updateMaintenanceSettings', () => {
    it('berekent de volgende datum opnieuw als de laatste beurt wordt gezet', () => {
      const instrumentId = maakInstrument(vereniging.id, { intervalMaanden: 6 });

      updateMaintenanceSettings(instrumentId, { lastMaintenanceDate: '2020-03-10' });

      const instrument = testDb
        .prepare('SELECT last_maintenance_date, next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { last_maintenance_date: string; next_maintenance_date: string };
      expect(instrument.last_maintenance_date).toBe('2020-03-10');
      expect(instrument.next_maintenance_date).toBe('2020-09-10');
    });

    it('gebruikt het nieuwe interval als dat in dezelfde wijziging meekomt', () => {
      const instrumentId = maakInstrument(vereniging.id, { intervalMaanden: 6 });

      updateMaintenanceSettings(instrumentId, { maintenanceIntervalMonths: 24, lastMaintenanceDate: '2020-03-10' });

      const instrument = testDb
        .prepare('SELECT maintenance_interval_months, next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { maintenance_interval_months: number; next_maintenance_date: string };
      expect(instrument.maintenance_interval_months).toBe(24);
      expect(instrument.next_maintenance_date).toBe('2022-03-10');
    });

    it('laat de volgende datum met rust als alleen de notitie verandert', () => {
      const instrumentId = maakInstrument(vereniging.id, { volgendOnderhoud: '2021-05-05' });

      updateMaintenanceSettings(instrumentId, { maintenanceNotes: 'Klep 3 klemt' });

      const instrument = testDb
        .prepare('SELECT maintenance_notes, next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { maintenance_notes: string; next_maintenance_date: string };
      expect(instrument.maintenance_notes).toBe('Klep 3 klemt');
      expect(instrument.next_maintenance_date).toBe('2021-05-05');
    });

    it('doet niets bij een lege wijziging', () => {
      const instrumentId = maakInstrument(vereniging.id, { volgendOnderhoud: '2021-05-05' });

      expect(() => updateMaintenanceSettings(instrumentId, {})).not.toThrow();

      const instrument = testDb
        .prepare('SELECT next_maintenance_date FROM equipment WHERE id = ?')
        .get(instrumentId) as { next_maintenance_date: string };
      expect(instrument.next_maintenance_date).toBe('2021-05-05');
    });
  });

  describe('getMaintenanceCosts', () => {
    it('telt de kosten op en telt ook regels zonder bedrag mee', () => {
      const instrumentId = maakInstrument(vereniging.id);
      maakLogregel(instrumentId, '2020-01-10', 100.25);
      maakLogregel(instrumentId, '2020-06-10', 49.75);
      maakLogregel(instrumentId, '2020-09-10', null);

      expect(getMaintenanceCosts(instrumentId)).toEqual({ total: 150, count: 3 });
    });

    it('geeft nul terug zonder logregels in plaats van NULL', () => {
      expect(getMaintenanceCosts(maakInstrument(vereniging.id))).toEqual({ total: 0, count: 0 });
    });

    it('geeft nul terug voor een instrument dat niet bestaat', () => {
      expect(getMaintenanceCosts('bestaat-niet')).toEqual({ total: 0, count: 0 });
    });

    it('telt de kosten van een ander instrument niet mee', () => {
      const eigen = maakInstrument(vereniging.id);
      const ander = maakInstrument(vereniging.id);
      maakLogregel(eigen, '2020-01-10', 10);
      maakLogregel(ander, '2020-01-10', 999);

      expect(getMaintenanceCosts(eigen)).toEqual({ total: 10, count: 1 });
    });
  });

  describe('getAssociationMaintenanceCosts', () => {
    it('telt op over alle instrumenten en splitst uit per instrument', () => {
      const trompet = maakInstrument(vereniging.id, { type: 'Trompet' });
      const tuba = maakInstrument(vereniging.id, { type: 'Tuba' });
      maakLogregel(trompet, '2020-01-10', 30);
      maakLogregel(trompet, '2020-02-10', 20);
      maakLogregel(tuba, '2020-03-10', 200);

      const kosten = getAssociationMaintenanceCosts(vereniging.id);

      expect(kosten.total).toBe(250);
      expect(kosten.count).toBe(3);
      // Aflopend op bedrag: de tuba kost het meest.
      expect(kosten.byEquipment).toEqual([
        { equipmentId: tuba, instrumentType: 'Tuba', total: 200, count: 1 },
        { equipmentId: trompet, instrumentType: 'Trompet', total: 50, count: 2 },
      ]);
    });

    it('filtert op periode, ook aan de randen', () => {
      const instrumentId = maakInstrument(vereniging.id);
      maakLogregel(instrumentId, '2020-01-31', 1); // net ervoor
      maakLogregel(instrumentId, '2020-02-01', 10); // eerste dag
      maakLogregel(instrumentId, '2020-06-15', 20);
      maakLogregel(instrumentId, '2020-11-30', 30); // laatste dag
      maakLogregel(instrumentId, '2020-12-01', 999); // net erna

      const kosten = getAssociationMaintenanceCosts(vereniging.id, '2020-02-01', '2020-11-30');

      expect(kosten.total).toBe(60);
      expect(kosten.count).toBe(3);
      expect(kosten.byEquipment).toEqual([
        { equipmentId: instrumentId, instrumentType: 'Trompet', total: 60, count: 3 },
      ]);
    });

    it('geeft nul terug als er niets is geregistreerd', () => {
      maakInstrument(vereniging.id);

      expect(getAssociationMaintenanceCosts(vereniging.id)).toEqual({ total: 0, count: 0, byEquipment: [] });
    });

    it('telt de kosten van een andere vereniging niet mee', () => {
      const buren = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      const eigen = maakInstrument(vereniging.id, { type: 'Trompet' });
      const vanBuren = maakInstrument(buren.id, { type: 'Bugel' });
      maakLogregel(eigen, '2020-01-10', 40);
      maakLogregel(vanBuren, '2020-01-10', 5000);

      const kosten = getAssociationMaintenanceCosts(vereniging.id);

      expect(kosten.total).toBe(40);
      expect(kosten.count).toBe(1);
      expect(kosten.byEquipment.map((i) => i.instrumentType)).toEqual(['Trompet']);
    });
  });

  describe('sendMaintenanceNotifications', () => {
    it('stuurt per ontvanger een bericht voor achterstand en een voor gepland onderhoud', async () => {
      const beheerder = createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      const commissie = createTestUser(vereniging.id, {
        email: `commissie-${uuidv4()}@example.com`,
        role: 'equipment_committee',
      });
      maakInstrument(vereniging.id, { type: 'Hoorn', merk: 'Alexander', volgendOnderhoud: datumOverDagen(-20) });
      maakInstrument(vereniging.id, { type: 'Klarinet', volgendOnderhoud: datumOverDagen(3) });

      const resultaat = await sendMaintenanceNotifications(vereniging.id);

      // 2 ontvangers x 2 soorten bericht.
      expect(resultaat).toEqual({ sent: 4, errors: 0 });
      expect(sendNotification).toHaveBeenCalledTimes(4);

      const ontvangers = vi.mocked(sendNotification).mock.calls.map((c) => c[0].userId);
      expect(new Set(ontvangers)).toEqual(new Set([beheerder.id, commissie.id]));

      const achterstand = vi.mocked(sendNotification).mock.calls.find((c) => c[0].title === 'Achterstallig onderhoud')!;
      expect(achterstand[0].body).toContain('Er zijn 1 instrumenten met achterstallig onderhoud');
      expect(achterstand[0].body).toContain('- Hoorn (Alexander): 20 dagen te laat');

      const gepland = vi.mocked(sendNotification).mock.calls.find((c) => c[0].title === 'Gepland onderhoud')!;
      expect(gepland[0].body).toContain('- Klarinet: over 3 dagen');
    });

    it('stuurt alleen een achterstandsbericht als er niets binnenkort aan de beurt is', async () => {
      createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-2) });
      // Over 20 dagen valt buiten het venster van 7 dagen dat de melding gebruikt.
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(20) });

      const resultaat = await sendMaintenanceNotifications(vereniging.id);

      expect(resultaat).toEqual({ sent: 1, errors: 0 });
      expect(vi.mocked(sendNotification).mock.calls[0][0].title).toBe('Achterstallig onderhoud');
    });

    it('kort de opsomming in bij meer dan vijf instrumenten', async () => {
      createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      for (let i = 1; i <= 7; i++) {
        maakInstrument(vereniging.id, { type: `Instrument ${i}`, volgendOnderhoud: datumOverDagen(-i) });
      }

      await sendMaintenanceNotifications(vereniging.id);

      const bericht = vi.mocked(sendNotification).mock.calls[0][0].body;
      expect(bericht).toContain('Er zijn 7 instrumenten met achterstallig onderhoud');
      expect(bericht).toContain('... en 2 meer');
    });

    it('stuurt niets als er geen ontvangers zijn', async () => {
      createTestUser(vereniging.id, { email: `lid-${uuidv4()}@example.com`, role: 'member' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-5) });

      expect(await sendMaintenanceNotifications(vereniging.id)).toEqual({ sent: 0, errors: 0 });
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('stuurt niets als er geen achterstand en niets binnenkort is', async () => {
      createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(60) });

      expect(await sendMaintenanceNotifications(vereniging.id)).toEqual({ sent: 0, errors: 0 });
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('slaat inactieve en zacht verwijderde ontvangers over', async () => {
      const actief = createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      const inactief = createTestUser(vereniging.id, { email: `oud-${uuidv4()}@example.com`, role: 'admin' });
      const verwijderd = createTestUser(vereniging.id, { email: `weg-${uuidv4()}@example.com`, role: 'admin' });
      testDb.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(inactief.id);
      // Zacht verwijderen zet in deze applicatie ook de status op 'inactive'.
      testDb
        .prepare("UPDATE users SET deleted_at = '2026-01-01 00:00:00', status = 'inactive' WHERE id = ?")
        .run(verwijderd.id);
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-5) });

      const resultaat = await sendMaintenanceNotifications(vereniging.id);

      expect(resultaat).toEqual({ sent: 1, errors: 0 });
      expect(vi.mocked(sendNotification).mock.calls.map((c) => c[0].userId)).toEqual([actief.id]);
    });

    it('waarschuwt geen beheerders van een andere vereniging', async () => {
      const buren = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      createTestUser(buren.id, { email: `buur-${uuidv4()}@example.com`, role: 'admin' });
      const eigen = createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-5) });

      const resultaat = await sendMaintenanceNotifications(vereniging.id);

      expect(resultaat).toEqual({ sent: 1, errors: 0 });
      expect(vi.mocked(sendNotification).mock.calls.map((c) => c[0].userId)).toEqual([eigen.id]);
    });

    it('waarschuwt niet over instrumenten van een andere vereniging', async () => {
      const buren = createTestAssociation({ name: `Fanfare ${uuidv4()}` });
      createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(buren.id, { volgendOnderhoud: datumOverDagen(-5) });

      expect(await sendMaintenanceNotifications(vereniging.id)).toEqual({ sent: 0, errors: 0 });
    });

    it('telt ook een mislukt bericht over gepland onderhoud als fout', async () => {
      createTestUser(vereniging.id, { email: `admin-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(3) });

      vi.mocked(sendNotification).mockRejectedValueOnce(new Error('kanaal ligt eruit'));

      expect(await sendMaintenanceNotifications(vereniging.id)).toEqual({ sent: 0, errors: 1 });
    });

    it('telt mislukte meldingen apart en gaat door met de rest', async () => {
      createTestUser(vereniging.id, { email: `admin1-${uuidv4()}@example.com`, role: 'admin' });
      createTestUser(vereniging.id, { email: `admin2-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-5) });

      vi.mocked(sendNotification)
        .mockRejectedValueOnce(new Error('kanaal ligt eruit'))
        .mockResolvedValueOnce({ success: true, channels: [] });

      expect(await sendMaintenanceNotifications(vereniging.id)).toEqual({ sent: 1, errors: 1 });
    });
  });

  describe('runMaintenanceCheck', () => {
    it('loopt alleen actieve verenigingen langs', async () => {
      const inactieveVereniging = createTestAssociation({ name: `Slapend ${uuidv4()}` });
      testDb.prepare('UPDATE associations SET is_active = 0 WHERE id = ?').run(inactieveVereniging.id);

      const actieveBeheerder = createTestUser(vereniging.id, {
        email: `admin-${uuidv4()}@example.com`,
        role: 'admin',
      });
      createTestUser(inactieveVereniging.id, { email: `slaper-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-5) });
      maakInstrument(inactieveVereniging.id, { volgendOnderhoud: datumOverDagen(-5) });

      await runMaintenanceCheck();

      expect(vi.mocked(sendNotification).mock.calls.map((c) => c[0].userId)).toEqual([actieveBeheerder.id]);
    });

    it('probeert elke actieve vereniging, ook als een melding onderweg mislukt', async () => {
      const tweede = createTestAssociation({ name: `Tweede ${uuidv4()}` });
      createTestUser(vereniging.id, { email: `admin1-${uuidv4()}@example.com`, role: 'admin' });
      createTestUser(tweede.id, { email: `admin2-${uuidv4()}@example.com`, role: 'admin' });
      maakInstrument(vereniging.id, { volgendOnderhoud: datumOverDagen(-5) });
      maakInstrument(tweede.id, { volgendOnderhoud: datumOverDagen(-5) });

      vi.mocked(sendNotification).mockRejectedValueOnce(new Error('kapot'));

      await expect(runMaintenanceCheck()).resolves.toBeUndefined();
      // Beide verenigingen zijn geprobeerd, ook al ging de eerste melding mis.
      expect(sendNotification).toHaveBeenCalledTimes(2);
    });
  });
});
