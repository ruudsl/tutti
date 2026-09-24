/**
 * De apparatuur-api spreekt de backend aan die er werkelijk is.
 *
 * BEWIJS - de api-laag en backend/src/routes/equipment.ts liepen volledig uit
 * elkaar. Gemeten met echte verzoeken tegen de backend:
 *
 *   - POST /equipment met { instrumentType, brandModel } gaf 400: de backend
 *     eist `name` en `equipmentType`.
 *   - GET /equipment geeft een kale array; de pagina las `.data` en toonde
 *     daardoor altijd een leeg magazijn.
 *   - PUT /equipment/:id gaf 404; de backend kent PATCH.
 *   - /:id/damage-logs, /:id/loans, /:id/loans/:loanId/return,
 *     /:id/record-maintenance en /maintenance-alerts bestaan niet (404).
 *
 * De paginatests mocken deze laag, dus daar zag niemand het. Hier wordt
 * `./client` gemockt en per functie vastgelegd welke methode, welk pad en welk
 * lichaam er de deur uitgaan. Daarnaast toetst elk verzoek tegen de routes die
 * de router in de backend echt registreert (gelezen uit het bronbestand): een
 * pad dat daar niet staat, valt hier om.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { serverroutes, serverBiedtAan } from './serverroutes';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../client', () => ({ default: client, api: client }));

import {
  getEquipmentTypes,
  getEquipmentCategories,
  getEquipment,
  getEquipmentItem,
  getEquipmentStats,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  createEquipmentLoan,
  returnEquipmentLoan,
  recordEquipmentMaintenance,
  getEquipmentDamageLogs,
  addEquipmentDamageLog,
  updateEquipmentDamageLog,
  deleteEquipmentDamageLog,
} from '../equipment';

type Methode = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Aanroep {
  methode: Methode;
  pad: string;
  /** Het lichaam (post/put/patch) of de axios-opties (get/delete). */
  tweede: unknown;
}

/** Het enige verzoek dat de functie deed. Twee verzoeken is ook een fout. */
function hetVerzoek(): Aanroep {
  const aanroepen: Aanroep[] = [];
  for (const methode of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    for (const [pad, tweede] of client[methode].mock.calls) {
      aanroepen.push({ methode, pad, tweede });
    }
  }
  expect(aanroepen).toHaveLength(1);
  return aanroepen[0];
}

const routes = serverroutes('equipment.ts');

/** Biedt de router onder /api/equipment dit verzoek aan? */
function bestaatOpDeServer({ methode, pad }: Aanroep): boolean {
  return serverBiedtAan(routes, '/equipment', methode, pad);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const methode of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    client[methode].mockResolvedValue({ data: {} });
  }
});

describe('apparatuur-api - items', () => {
  it('geeft de lijst terug zoals de backend hem stuurt: een kale array', async () => {
    const lijst = [{ id: 'e1', name: 'Tuba' }];
    client.get.mockResolvedValue({ data: lijst });

    const antwoord = await getEquipment();

    expect(antwoord).toEqual(lijst);
    const verzoek = hetVerzoek();
    expect(verzoek).toMatchObject({ methode: 'get', pad: '/equipment' });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('stuurt alleen de filters mee die de backend kent, onder hun eigen naam', async () => {
    client.get.mockResolvedValue({ data: [] });

    await getEquipment({ type: 'audio', categoryId: 'c1', status: 'repair', loanable: false });

    expect(hetVerzoek().tweede).toEqual({
      params: { type: 'audio', categoryId: 'c1', status: 'repair', loanable: 'false' },
    });
  });

  it('laat lege filters weg', async () => {
    client.get.mockResolvedValue({ data: [] });

    await getEquipment({});

    expect(hetVerzoek().tweede).toEqual({ params: {} });
  });

  it('maakt aan met POST /equipment en de veldnamen van createEquipmentSchema', async () => {
    client.post.mockResolvedValue({ data: { id: 'e1', inventoryNumber: 'EQ-00001' } });

    const antwoord = await createEquipment({
      name: 'Tuba',
      equipmentType: 'instrument',
      brand: 'Besson',
      model: 'BE994',
      isLoanable: true,
    });

    expect(antwoord).toMatchObject({ id: 'e1', inventoryNumber: 'EQ-00001' });
    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'post',
      pad: '/equipment',
      tweede: { name: 'Tuba', equipmentType: 'instrument', brand: 'Besson', model: 'BE994', isLoanable: true },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('bewerkt met PATCH /equipment/:id, niet met PUT', async () => {
    await updateEquipment('e1', { status: 'repair', location: 'Zolder' });

    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'patch',
      pad: '/equipment/e1',
      tweede: { status: 'repair', location: 'Zolder' },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('haalt één item op en verwijdert met DELETE /equipment/:id', async () => {
    await getEquipmentItem('e1');
    let verzoek = hetVerzoek();
    expect(verzoek).toMatchObject({ methode: 'get', pad: '/equipment/e1' });
    expect(bestaatOpDeServer(verzoek)).toBe(true);

    vi.clearAllMocks();
    client.delete.mockResolvedValue({ data: {} });
    await deleteEquipment('e1');
    verzoek = hetVerzoek();
    expect(verzoek).toMatchObject({ methode: 'delete', pad: '/equipment/e1' });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('haalt soorten, categorieën en cijfers van hun eigen letterlijke paden', async () => {
    for (const [functie, pad] of [
      [getEquipmentTypes, '/equipment/types'],
      [getEquipmentCategories, '/equipment/categories'],
      [getEquipmentStats, '/equipment/stats'],
    ] as const) {
      vi.clearAllMocks();
      client.get.mockResolvedValue({ data: [] });
      await functie();
      const verzoek = hetVerzoek();
      expect(verzoek).toMatchObject({ methode: 'get', pad });
      expect(bestaatOpDeServer(verzoek)).toBe(true);
    }
  });
});

describe('apparatuur-api - uitlenen en innemen', () => {
  it('leent uit met POST /equipment/loans en het item als equipmentId in het lichaam', async () => {
    client.post.mockResolvedValue({ data: { id: 'l1' } });

    await createEquipmentLoan('e1', { userId: 'u1', expectedReturnDate: '2026-12-01', conditionAtCheckout: 'good' });

    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'post',
      pad: '/equipment/loans',
      tweede: { equipmentId: 'e1', userId: 'u1', expectedReturnDate: '2026-12-01', conditionAtCheckout: 'good' },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('neemt in met PATCH /equipment/loans/:id/return', async () => {
    await returnEquipmentLoan('l1', { conditionAtReturn: 'fair', returnNotes: 'kras op de beker' });

    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'patch',
      pad: '/equipment/loans/l1/return',
      tweede: { conditionAtReturn: 'fair', returnNotes: 'kras op de beker' },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });
});

describe('apparatuur-api - onderhoud', () => {
  it('legt onderhoud vast met POST /equipment/:id/maintenance en de velden van maintenanceSchema', async () => {
    client.post.mockResolvedValue({ data: { id: 'm1' } });

    await recordEquipmentMaintenance('e1', {
      maintenanceType: 'service',
      description: 'Ventielen gereinigd',
      performedDate: '2026-05-01',
      nextMaintenanceDate: '2027-05-01',
      cost: 45,
    });

    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'post',
      pad: '/equipment/e1/maintenance',
      tweede: {
        maintenanceType: 'service',
        description: 'Ventielen gereinigd',
        performedDate: '2026-05-01',
        nextMaintenanceDate: '2027-05-01',
        cost: 45,
      },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });
});

describe('apparatuur-api - schade', () => {
  it('haalt de meldingen op van GET /equipment/:id/damage', async () => {
    client.get.mockResolvedValue({ data: [] });

    await getEquipmentDamageLogs('e1');

    const verzoek = hetVerzoek();
    expect(verzoek).toMatchObject({ methode: 'get', pad: '/equipment/e1/damage' });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('meldt schade met POST /equipment/:id/damage, met ernst', async () => {
    client.post.mockResolvedValue({ data: { id: 's1' } });

    await addEquipmentDamageLog('e1', { description: 'Deuk in de beker', severity: 'moderate', repairCost: 80 });

    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'post',
      pad: '/equipment/e1/damage',
      tweede: { description: 'Deuk in de beker', severity: 'moderate', repairCost: 80 },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('werkt een melding bij met PATCH /equipment/:id/damage/:reportId', async () => {
    await updateEquipmentDamageLog('e1', 's1', { repairedAt: '2026-06-01', repairCost: 75 });

    const verzoek = hetVerzoek();
    expect(verzoek).toEqual({
      methode: 'patch',
      pad: '/equipment/e1/damage/s1',
      tweede: { repairedAt: '2026-06-01', repairCost: 75 },
    });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });

  it('verwijdert een melding met DELETE /equipment/:id/damage/:reportId', async () => {
    await deleteEquipmentDamageLog('e1', 's1');

    const verzoek = hetVerzoek();
    expect(verzoek).toMatchObject({ methode: 'delete', pad: '/equipment/e1/damage/s1' });
    expect(bestaatOpDeServer(verzoek)).toBe(true);
  });
});

describe('apparatuur-api - geen enkel verzoek valt buiten de router', () => {
  // Elke schrijvende functie hierboven, nog eens langs de routetabel. GET-paden
  // staan hier bewust niet: een onbekend GET-pad als /maintenance-alerts past
  // in het patroon /:id en zou hier ten onrechte slagen - die staan daarom
  // hierboven met hun letterlijke pad vastgelegd.
  const aanroepen: [string, () => Promise<unknown>][] = [
    ['createEquipment', () => createEquipment({ name: 'X', equipmentType: 'misc' })],
    ['updateEquipment', () => updateEquipment('e1', { name: 'Y' })],
    ['deleteEquipment', () => deleteEquipment('e1')],
    ['createEquipmentLoan', () => createEquipmentLoan('e1', { userId: 'u1' })],
    ['returnEquipmentLoan', () => returnEquipmentLoan('l1')],
    [
      'recordEquipmentMaintenance',
      () =>
        recordEquipmentMaintenance('e1', {
          maintenanceType: 'inspection',
          description: 'x',
          performedDate: '2026-01-01',
        }),
    ],
    ['addEquipmentDamageLog', () => addEquipmentDamageLog('e1', { description: 'x', severity: 'minor' })],
    ['updateEquipmentDamageLog', () => updateEquipmentDamageLog('e1', 's1', { notes: 'x' })],
    ['deleteEquipmentDamageLog', () => deleteEquipmentDamageLog('e1', 's1')],
  ];

  it.each(aanroepen)('%s raakt een route die backend/src/routes/equipment.ts registreert', async (_naam, aanroep) => {
    await aanroep();

    expect(bestaatOpDeServer(hetVerzoek())).toBe(true);
  });
});
