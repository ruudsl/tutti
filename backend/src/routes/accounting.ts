import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { logAuditEvent } from './audit-logs';
import logger from '../utils/logger';
import { z } from 'zod';

const router = Router();

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const fiscalYearSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
  isCurrent: z.boolean().optional(),
});

const accountSchema = z.object({
  code: z.string().min(1, 'Code is verplicht.').max(20),
  name: z.string().min(1, 'Naam is verplicht.'),
  accountType: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
  accountSubtype: z
    .enum([
      'bank',
      'cash',
      'receivable',
      'payable',
      'inventory',
      'fixed_asset',
      'current_liability',
      'long_term_liability',
      'retained_earnings',
      'membership_fees',
      'donations',
      'grants',
      'ticket_sales',
      'sponsoring',
      'personnel',
      'materials',
      'rent',
      'utilities',
      'insurance',
      'depreciation',
      'other',
    ])
    .optional()
    .nullable(),
  parentId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  openingBalance: z.number().optional(),
});

const membershipFeeTypeSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht.'),
  description: z.string().optional(),
  amount: z.number().min(0, 'Bedrag moet positief zijn.'),
  frequency: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time']),
  ageMin: z.number().min(0).optional().nullable(),
  ageMax: z.number().min(0).optional().nullable(),
  isDefault: z.boolean().optional(),
  incomeAccountId: z.string().uuid().optional().nullable(),
});

const invoiceSchema = z.object({
  invoiceType: z.enum(['sales', 'purchase', 'credit_note']),
  relationId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
  reference: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().min(0),
        // Zonder ondergrens maakt een negatieve prijs van een verkoopfactuur
        // stilzwijgend een creditfactuur; daar is een eigen soort voor.
        unitPrice: z.number().min(0, 'Stukprijs mag niet negatief zijn.'),
        vatRate: z.number().min(0).max(100).optional(),
        accountId: z.string().uuid().optional().nullable(),
        costCenterId: z.string().uuid().optional().nullable(),
        membershipId: z.string().uuid().optional().nullable(),
      }),
    )
    .min(1, 'Minimaal één regel vereist.'),
});

/**
 * Een betaling op een factuur. Een bedrag is een getal groter dan nul: een
 * negatieve betaling is een correctie en hoort via een creditfactuur.
 */
const invoicePaymentSchema = z.object({
  amount: z.number().positive('Bedrag moet groter dan nul zijn.').optional(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.')
    .optional(),
});

const transactionSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
  transactionType: z.enum(['journal', 'payment', 'receipt', 'bank', 'transfer']),
  reference: z.string().optional(),
  description: z.string().min(1, 'Omschrijving is verplicht.'),
  invoiceId: z.string().uuid().optional().nullable(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        costCenterId: z.string().uuid().optional().nullable(),
        description: z.string().optional(),
        debitAmount: z.number().min(0).optional(),
        creditAmount: z.number().min(0).optional(),
      }),
    )
    .min(2, 'Minimaal twee regels vereist.'),
});

// =====================================================
// HULPMIDDELEN
// =====================================================

/**
 * Rond een bedrag af op hele centen.
 *
 * Drijvende komma is voor geld net niet nauwkeurig genoeg: 3 x 19,99 tegen 21%
 * btw geeft 12,593700000000002. Zo'n bedrag hoort niet in een grootboek en
 * niet op een btw-aangifte, en het maakt elke vergelijking op gelijkheid
 * onbetrouwbaar.
 */
function afrondenOpCenten(bedrag: number): number {
  return Math.round((bedrag + Number.EPSILON) * 100) / 100;
}

/**
 * Waar een id uit de aanvraag vandaan mag komen.
 *
 * De sleutelcontrole van de database kijkt alleen of een rij bestaat, niet bij
 * welke vereniging hij hoort. Een beheerder van vereniging A die het id van
 * een grootboekrekening van vereniging B meestuurt, boekt daar dus gewoon op -
 * de INSERT slaagt. Deze controle staat tussen de aanvraag en de INSERT.
 */
const EIGENDOMSCONTROLES = {
  account: 'SELECT id FROM accounts WHERE id = ? AND association_id = ?',
  costCenter: 'SELECT id FROM cost_centers WHERE id = ? AND association_id = ?',
  fiscalYear: 'SELECT id FROM fiscal_years WHERE id = ? AND association_id = ?',
  relation: 'SELECT id FROM accounting_relations WHERE id = ? AND association_id = ?',
  user: 'SELECT id FROM users WHERE id = ? AND association_id = ?',
  contact: 'SELECT id FROM contacts WHERE id = ? AND association_id = ?',
  // memberships kent zelf geen vereniging; die loopt via het lid.
  membership: 'SELECT m.id FROM memberships m JOIN users u ON m.user_id = u.id WHERE m.id = ? AND u.association_id = ?',
} as const;

/**
 * Eist dat een id bij de eigen vereniging hoort. Leeg of ontbrekend is goed:
 * dan wordt er niets gekoppeld.
 */
function eisEigenId(
  soort: keyof typeof EIGENDOMSCONTROLES,
  id: string | null | undefined,
  associationId: string | null | undefined,
  melding: string,
): void {
  if (id === null || id === undefined || id === '') return;
  // Zonder vereniging is er niets om bij te horen; dan gaat er ook niets in.
  if (!associationId) throw new ApiError(400, 'Geen vereniging.');
  const rij = db.prepare(EIGENDOMSCONTROLES[soort]).get(id, associationId);
  if (!rij) throw new ApiError(400, melding);
}

/**
 * Leest een bedrag uit een bankbestand.
 *
 * Nederlandse export schrijft "1.234,56": punt als duizendtalscheiding, komma
 * als decimaalteken. Een enkele `replace(',', '.')` vervangt alleen het eerste
 * voorkomen en laat de punt staan, waarna parseFloat er 1,23 van maakt.
 * Onleesbare tekst geeft NaN, en die hoort niet in de administratie te
 * belanden - vandaar een uitzondering in plaats van een stille nul.
 */
function leesBedrag(tekst: string): number {
  const opgeschoond = tekst.replace(/[\s\u00a0]/g, '').replace(/€/g, '');
  let normaal: string;

  if (opgeschoond.includes(',')) {
    // Komma is het decimaalteken; punten zijn dan duizendtalscheidingen.
    normaal = opgeschoond.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(opgeschoond)) {
    // "1.234" of "1.234.567": alleen duizendtallen, geen decimalen.
    normaal = opgeschoond.replace(/\./g, '');
  } else {
    normaal = opgeschoond;
  }

  if (!/^[+-]?\d+(\.\d+)?$/.test(normaal)) {
    throw new ApiError(400, `Onleesbaar bedrag in het bankbestand: "${tekst.trim()}".`);
  }

  return afrondenOpCenten(parseFloat(normaal));
}

/**
 * Geeft het volgende boekstuknummer voor deze vereniging.
 *
 * Het nummer is uniek per vereniging (UNIQUE(association_id,
 * transaction_number)), dus mag de reeks niet per boekjaar opnieuw beginnen:
 * de eerste boeking in een nieuw boekjaar botste anders op TX-000001 van het
 * jaar ervoor.
 */
function volgendBoekstuknummer(associationId: string): string {
  const laatste = db
    .prepare(
      `
        SELECT transaction_number FROM transactions
        WHERE association_id = ?
        ORDER BY transaction_number DESC LIMIT 1
    `,
    )
    .get(associationId) as any;

  const volgnummer = laatste ? parseInt(laatste.transaction_number.split('-')[1], 10) + 1 : 1;
  return `TX-${volgnummer.toString().padStart(6, '0')}`;
}

// =====================================================
// FISCAL YEARS
// =====================================================

/**
 * @swagger
 * /accounting/fiscal-years:
 *   get:
 *     summary: Haal alle boekjaren op
 *     tags: [Accounting]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lijst van boekjaren
 */
router.get(
  '/fiscal-years',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const years = db
      .prepare(
        `
        SELECT * FROM fiscal_years WHERE association_id = ? ORDER BY start_date DESC
    `,
      )
      .all(associationId);

    res.json(
      years.map((y: any) => ({
        id: y.id,
        name: y.name,
        startDate: y.start_date,
        endDate: y.end_date,
        status: y.status,
        isCurrent: !!y.is_current,
        createdAt: y.created_at,
        closedAt: y.closed_at,
      })),
    );
  }),
);

router.post(
  '/fiscal-years',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = fiscalYearSchema.parse(req.body);
    const id = uuidv4();

    if (data.isCurrent) {
      db.prepare('UPDATE fiscal_years SET is_current = 0 WHERE association_id = ?').run(associationId);
    }

    db.prepare(
      `
        INSERT INTO fiscal_years (id, association_id, name, start_date, end_date, is_current)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(id, associationId, data.name, data.startDate, data.endDate, data.isCurrent ? 1 : 0);

    await logAuditEvent(req.user!.id, 'create', 'fiscal_year', id, data.name);
    res.status(201).json({ id, message: 'Boekjaar aangemaakt.' });
  }),
);

router.put(
  '/fiscal-years/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Boekjaar niet gevonden.');
    if (existing.status === 'locked') throw new ApiError(400, 'Vergrendeld boekjaar kan niet worden bewerkt.');

    const data = fiscalYearSchema.partial().parse(req.body);

    if (data.isCurrent) {
      db.prepare('UPDATE fiscal_years SET is_current = 0 WHERE association_id = ?').run(associationId);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.startDate !== undefined) {
      updates.push('start_date = ?');
      params.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      updates.push('end_date = ?');
      params.push(data.endDate);
    }
    if (data.isCurrent !== undefined) {
      updates.push('is_current = ?');
      params.push(data.isCurrent ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(req.params.id, associationId);
      db.prepare(`UPDATE fiscal_years SET ${updates.join(', ')} WHERE id = ? AND association_id = ?`).run(...params);
    }

    await logAuditEvent(req.user!.id, 'update', 'fiscal_year', req.params.id, data.name || existing.name);
    res.json({ message: 'Boekjaar bijgewerkt.' });
  }),
);

router.post(
  '/fiscal-years/:id/close',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Boekjaar niet gevonden.');
    if (existing.status !== 'open') throw new ApiError(400, 'Boekjaar is al afgesloten.');

    db.prepare(
      `
        UPDATE fiscal_years SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
    ).run(req.params.id);

    await logAuditEvent(req.user!.id, 'close', 'fiscal_year', req.params.id, existing.name);
    res.json({ message: 'Boekjaar afgesloten.' });
  }),
);

// =====================================================
// ACCOUNTS (Chart of Accounts)
// =====================================================

/**
 * @swagger
 * /accounting/accounts:
 *   get:
 *     summary: Haal rekeningschema op
 *     tags: [Accounting]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lijst van rekeningen
 */
router.get(
  '/accounts',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const accounts = db
      .prepare(
        `
        SELECT a.*, p.name AS parent_name, p.code AS parent_code
        FROM accounts a
        LEFT JOIN accounts p ON a.parent_id = p.id
        WHERE a.association_id = ?
        ORDER BY a.code
    `,
      )
      .all(associationId);

    res.json(
      accounts.map((a: any) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        accountType: a.account_type,
        accountSubtype: a.account_subtype,
        parentId: a.parent_id,
        parentName: a.parent_name,
        parentCode: a.parent_code,
        description: a.description,
        isSystem: !!a.is_system,
        isActive: !!a.is_active,
        sortOrder: a.sort_order,
        openingBalance: a.opening_balance,
        currentBalance: a.current_balance,
        createdAt: a.created_at,
      })),
    );
  }),
);

router.post(
  '/accounts',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = accountSchema.parse(req.body);
    const id = uuidv4();

    const existing = db
      .prepare('SELECT id FROM accounts WHERE association_id = ? AND code = ?')
      .get(associationId, data.code);
    if (existing) throw new ApiError(409, 'Rekeningcode bestaat al.');

    // Een rekening onder een moederrekening van een andere vereniging hangen
    // laat het rekeningschema over de verenigingsgrens heen lopen.
    eisEigenId('account', data.parentId, associationId, 'Onbekende moederrekening.');

    db.prepare(
      `
        INSERT INTO accounts (id, association_id, code, name, account_type, account_subtype, parent_id, description, opening_balance, current_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.code,
      data.name,
      data.accountType,
      data.accountSubtype || null,
      data.parentId || null,
      data.description || null,
      data.openingBalance || 0,
      data.openingBalance || 0,
    );

    await logAuditEvent(req.user!.id, 'create', 'account', id, `${data.code} - ${data.name}`);
    res.status(201).json({ id, message: 'Rekening aangemaakt.' });
  }),
);

router.put(
  '/accounts/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT * FROM accounts WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Rekening niet gevonden.');
    if (existing.is_system) throw new ApiError(400, 'Systeemrekening kan niet worden bewerkt.');

    const data = accountSchema.partial().parse(req.body);

    if (data.code && data.code !== existing.code) {
      const duplicate = db
        .prepare('SELECT id FROM accounts WHERE association_id = ? AND code = ? AND id != ?')
        .get(associationId, data.code, req.params.id);
      if (duplicate) throw new ApiError(409, 'Rekeningcode bestaat al.');
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (data.code !== undefined) {
      updates.push('code = ?');
      params.push(data.code);
    }
    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.accountType !== undefined) {
      updates.push('account_type = ?');
      params.push(data.accountType);
    }
    if (data.accountSubtype !== undefined) {
      updates.push('account_subtype = ?');
      params.push(data.accountSubtype);
    }
    if (data.parentId !== undefined) {
      updates.push('parent_id = ?');
      params.push(data.parentId);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }

    params.push(req.params.id, associationId);
    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ? AND association_id = ?`).run(...params);

    await logAuditEvent(
      req.user!.id,
      'update',
      'account',
      req.params.id,
      `${data.code || existing.code} - ${data.name || existing.name}`,
    );
    res.json({ message: 'Rekening bijgewerkt.' });
  }),
);

router.delete(
  '/accounts/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT * FROM accounts WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Rekening niet gevonden.');
    if (existing.is_system) throw new ApiError(400, 'Systeemrekening kan niet worden verwijderd.');

    const hasTransactions = db
      .prepare('SELECT 1 FROM transaction_lines WHERE account_id = ? LIMIT 1')
      .get(req.params.id);
    if (hasTransactions) throw new ApiError(400, 'Rekening heeft transacties en kan niet worden verwijderd.');

    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
    await logAuditEvent(req.user!.id, 'delete', 'account', req.params.id, `${existing.code} - ${existing.name}`);
    res.json({ message: 'Rekening verwijderd.' });
  }),
);

// Initialize default chart of accounts
router.post(
  '/accounts/initialize',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT COUNT(*) as count FROM accounts WHERE association_id = ?')
      .get(associationId) as any;
    if (existing.count > 0) throw new ApiError(400, 'Er zijn al rekeningen aanwezig.');

    const defaultAccounts = [
      // Assets
      { code: '1000', name: 'Kas', type: 'asset', subtype: 'cash' },
      { code: '1100', name: 'Bank', type: 'asset', subtype: 'bank' },
      { code: '1200', name: 'Debiteuren', type: 'asset', subtype: 'receivable' },
      { code: '1300', name: 'Voorraad', type: 'asset', subtype: 'inventory' },
      { code: '1500', name: 'Vaste activa', type: 'asset', subtype: 'fixed_asset' },
      // Liabilities
      { code: '2000', name: 'Crediteuren', type: 'liability', subtype: 'payable' },
      { code: '2100', name: 'Vooruit ontvangen', type: 'liability', subtype: 'current_liability' },
      { code: '2500', name: 'Leningen', type: 'liability', subtype: 'long_term_liability' },
      // Equity
      { code: '3000', name: 'Eigen vermogen', type: 'equity', subtype: 'retained_earnings' },
      { code: '3100', name: 'Reserves', type: 'equity', subtype: 'retained_earnings' },
      // Income
      { code: '8000', name: 'Contributie', type: 'income', subtype: 'membership_fees' },
      { code: '8100', name: 'Donaties', type: 'income', subtype: 'donations' },
      { code: '8200', name: 'Subsidies', type: 'income', subtype: 'grants' },
      { code: '8300', name: 'Kaartverkoop', type: 'income', subtype: 'ticket_sales' },
      { code: '8400', name: 'Sponsoring', type: 'income', subtype: 'sponsoring' },
      { code: '8900', name: 'Overige inkomsten', type: 'income', subtype: 'other' },
      // Expenses
      { code: '4000', name: 'Personeelskosten', type: 'expense', subtype: 'personnel' },
      { code: '4100', name: 'Materialen', type: 'expense', subtype: 'materials' },
      { code: '4200', name: 'Huur', type: 'expense', subtype: 'rent' },
      { code: '4300', name: 'Energie', type: 'expense', subtype: 'utilities' },
      { code: '4400', name: 'Verzekeringen', type: 'expense', subtype: 'insurance' },
      { code: '4500', name: 'Afschrijvingen', type: 'expense', subtype: 'depreciation' },
      { code: '4900', name: 'Overige kosten', type: 'expense', subtype: 'other' },
    ];

    const stmt = db.prepare(`
        INSERT INTO accounts (id, association_id, code, name, account_type, account_subtype, is_system)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    for (const acc of defaultAccounts) {
      stmt.run(uuidv4(), associationId, acc.code, acc.name, acc.type, acc.subtype);
    }

    await logAuditEvent(req.user!.id, 'initialize', 'accounts', associationId, 'Standaard rekeningschema');
    res.status(201).json({ message: 'Standaard rekeningschema aangemaakt.', count: defaultAccounts.length });
  }),
);

// =====================================================
// MEMBERSHIP FEE TYPES
// =====================================================

router.get(
  '/membership-fee-types',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const types = db
      .prepare(
        `
        SELECT mft.*, a.code AS account_code, a.name AS account_name,
            (SELECT COUNT(*) FROM memberships WHERE fee_type_id = mft.id AND status = 'active') AS active_count
        FROM membership_fee_types mft
        LEFT JOIN accounts a ON mft.income_account_id = a.id
        WHERE mft.association_id = ?
        ORDER BY mft.name
    `,
      )
      .all(associationId);

    res.json(
      types.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        amount: t.amount,
        frequency: t.frequency,
        ageMin: t.age_min,
        ageMax: t.age_max,
        isDefault: !!t.is_default,
        isActive: !!t.is_active,
        incomeAccountId: t.income_account_id,
        incomeAccountCode: t.account_code,
        incomeAccountName: t.account_name,
        activeCount: t.active_count,
        createdAt: t.created_at,
      })),
    );
  }),
);

router.post(
  '/membership-fee-types',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = membershipFeeTypeSchema.parse(req.body);
    const id = uuidv4();

    eisEigenId('account', data.incomeAccountId, associationId, 'Onbekende opbrengstrekening.');

    if (data.isDefault) {
      db.prepare('UPDATE membership_fee_types SET is_default = 0 WHERE association_id = ?').run(associationId);
    }

    db.prepare(
      `
        INSERT INTO membership_fee_types (id, association_id, name, description, amount, frequency, age_min, age_max, is_default, income_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      id,
      associationId,
      data.name,
      data.description || null,
      data.amount,
      data.frequency,
      data.ageMin || null,
      data.ageMax || null,
      data.isDefault ? 1 : 0,
      data.incomeAccountId || null,
    );

    await logAuditEvent(req.user!.id, 'create', 'membership_fee_type', id, data.name);
    res.status(201).json({ id, message: 'Contributiecategorie aangemaakt.' });
  }),
);

router.put(
  '/membership-fee-types/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT * FROM membership_fee_types WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Contributiecategorie niet gevonden.');

    const data = membershipFeeTypeSchema.partial().parse(req.body);

    if (data.isDefault) {
      db.prepare('UPDATE membership_fee_types SET is_default = 0 WHERE association_id = ?').run(associationId);
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.amount !== undefined) {
      updates.push('amount = ?');
      params.push(data.amount);
    }
    if (data.frequency !== undefined) {
      updates.push('frequency = ?');
      params.push(data.frequency);
    }
    if (data.ageMin !== undefined) {
      updates.push('age_min = ?');
      params.push(data.ageMin);
    }
    if (data.ageMax !== undefined) {
      updates.push('age_max = ?');
      params.push(data.ageMax);
    }
    if (data.isDefault !== undefined) {
      updates.push('is_default = ?');
      params.push(data.isDefault ? 1 : 0);
    }
    if (data.incomeAccountId !== undefined) {
      updates.push('income_account_id = ?');
      params.push(data.incomeAccountId);
    }

    params.push(req.params.id, associationId);
    db.prepare(`UPDATE membership_fee_types SET ${updates.join(', ')} WHERE id = ? AND association_id = ?`).run(
      ...params,
    );

    await logAuditEvent(req.user!.id, 'update', 'membership_fee_type', req.params.id, data.name || existing.name);
    res.json({ message: 'Contributiecategorie bijgewerkt.' });
  }),
);

router.delete(
  '/membership-fee-types/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare('SELECT * FROM membership_fee_types WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Contributiecategorie niet gevonden.');

    const hasMembers = db.prepare('SELECT 1 FROM memberships WHERE fee_type_id = ? LIMIT 1').get(req.params.id);
    if (hasMembers) throw new ApiError(400, 'Categorie heeft leden en kan niet worden verwijderd.');

    db.prepare('DELETE FROM membership_fee_types WHERE id = ?').run(req.params.id);
    await logAuditEvent(req.user!.id, 'delete', 'membership_fee_type', req.params.id, existing.name);
    res.json({ message: 'Contributiecategorie verwijderd.' });
  }),
);

// =====================================================
// INVOICES
// =====================================================

router.get(
  '/invoices',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { status, type, fiscalYearId, relationId } = req.query;

    let query = `
        SELECT i.*, r.name AS relation_name, u.first_name || ' ' || u.last_name AS user_name,
            c.first_name || ' ' || c.last_name AS created_by_name
        FROM invoices i
        LEFT JOIN accounting_relations r ON i.relation_id = r.id
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN users c ON i.created_by = c.id
        WHERE i.association_id = ?
    `;
    const params: any[] = [associationId];

    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }
    if (type) {
      query += ' AND i.invoice_type = ?';
      params.push(type);
    }
    if (fiscalYearId) {
      query += ' AND i.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }
    if (relationId) {
      query += ' AND i.relation_id = ?';
      params.push(relationId);
    }

    query += ' ORDER BY i.invoice_date DESC, i.invoice_number DESC';

    const invoices = db.prepare(query).all(...params);

    res.json(
      invoices.map((i: any) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        invoiceType: i.invoice_type,
        relationId: i.relation_id,
        relationName: i.relation_name,
        userId: i.user_id,
        userName: i.user_name,
        status: i.status,
        invoiceDate: i.invoice_date,
        dueDate: i.due_date,
        reference: i.reference,
        description: i.description,
        subtotal: i.subtotal,
        vatAmount: i.vat_amount,
        total: i.total,
        amountPaid: i.amount_paid,
        amountDue: i.total - i.amount_paid,
        sentAt: i.sent_at,
        paidAt: i.paid_at,
        createdBy: i.created_by,
        createdByName: i.created_by_name,
        createdAt: i.created_at,
      })),
    );
  }),
);

router.get(
  '/invoices/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db
      .prepare(
        `
        SELECT i.*, r.name AS relation_name, r.email AS relation_email,
            u.first_name || ' ' || u.last_name AS user_name,
            c.first_name || ' ' || c.last_name AS created_by_name
        FROM invoices i
        LEFT JOIN accounting_relations r ON i.relation_id = r.id
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN users c ON i.created_by = c.id
        WHERE i.id = ? AND i.association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');

    const lines = db
      .prepare(
        `
        SELECT il.*, a.code AS account_code, a.name AS account_name,
            cc.code AS cost_center_code, cc.name AS cost_center_name
        FROM invoice_lines il
        LEFT JOIN accounts a ON il.account_id = a.id
        LEFT JOIN cost_centers cc ON il.cost_center_id = cc.id
        WHERE il.invoice_id = ?
        ORDER BY il.line_number
    `,
      )
      .all(req.params.id);

    res.json({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceType: invoice.invoice_type,
      fiscalYearId: invoice.fiscal_year_id,
      relationId: invoice.relation_id,
      relationName: invoice.relation_name,
      relationEmail: invoice.relation_email,
      userId: invoice.user_id,
      userName: invoice.user_name,
      status: invoice.status,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      reference: invoice.reference,
      description: invoice.description,
      subtotal: invoice.subtotal,
      vatAmount: invoice.vat_amount,
      total: invoice.total,
      amountPaid: invoice.amount_paid,
      amountDue: invoice.total - invoice.amount_paid,
      paymentReference: invoice.payment_reference,
      notes: invoice.notes,
      sentAt: invoice.sent_at,
      paidAt: invoice.paid_at,
      reminderCount: invoice.reminder_count,
      lastReminderAt: invoice.last_reminder_at,
      createdBy: invoice.created_by,
      createdByName: invoice.created_by_name,
      createdAt: invoice.created_at,
      lines: lines.map((l: any) => ({
        id: l.id,
        lineNumber: l.line_number,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        vatRate: l.vat_rate,
        vatAmount: l.vat_amount,
        lineTotal: l.line_total,
        accountId: l.account_id,
        accountCode: l.account_code,
        accountName: l.account_name,
        costCenterId: l.cost_center_id,
        costCenterCode: l.cost_center_code,
        costCenterName: l.cost_center_name,
        membershipId: l.membership_id,
      })),
    });
  }),
);

router.post(
  '/invoices',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = invoiceSchema.parse(req.body);

    // Get current fiscal year
    const fiscalYear = db
      .prepare(
        `
        SELECT id FROM fiscal_years WHERE association_id = ? AND is_current = 1 AND status = 'open'
    `,
      )
      .get(associationId) as any;
    if (!fiscalYear) throw new ApiError(400, 'Geen actief boekjaar gevonden.');

    // Verwijzingen uit de aanvraag horen bij deze vereniging; de
    // sleutelcontrole van de database let daar niet op.
    eisEigenId('relation', data.relationId, associationId, 'Onbekende relatie.');
    eisEigenId('user', data.userId, associationId, 'Onbekend lid.');
    for (const line of data.lines) {
      eisEigenId('account', line.accountId, associationId, 'Onbekende grootboekrekening op een factuurregel.');
      eisEigenId('costCenter', line.costCenterId, associationId, 'Onbekende kostenplaats op een factuurregel.');
      eisEigenId('membership', line.membershipId, associationId, 'Onbekend lidmaatschap op een factuurregel.');
    }

    // Generate invoice number
    //
    // Elke factuursoort heeft een eigen letter ('F', 'I', 'C') en dus een eigen
    // reeks. Werd het hoogste nummer over alle soorten heen gezocht, dan gaf
    // 'I' (dat na 'F' sorteert) het volgnummer van de verkoopreeks door, en
    // botste de volgende verkoopfactuur op UNIQUE(association_id,
    // invoice_number).
    const prefix = data.invoiceType === 'sales' ? 'F' : data.invoiceType === 'purchase' ? 'I' : 'C';
    const lastInvoice = db
      .prepare(
        `
        SELECT invoice_number FROM invoices
        WHERE association_id = ? AND fiscal_year_id = ? AND invoice_type = ?
        ORDER BY invoice_number DESC LIMIT 1
    `,
      )
      .get(associationId, fiscalYear.id, data.invoiceType) as any;

    const year = new Date().getFullYear();
    let nextNumber = 1;
    if (lastInvoice) {
      const match = lastInvoice.invoice_number.match(/\d+$/);
      if (match) nextNumber = parseInt(match[0]) + 1;
    }
    const invoiceNumber = `${prefix}${year}-${String(nextNumber).padStart(4, '0')}`;

    // Calculate totals
    //
    // Per regel op centen afronden en pas daarna optellen: dat is wat er ook
    // op de factuur staat, en het houdt subtotaal, btw en totaal op elkaar
    // aansluiten.
    const berekendeRegels = data.lines.map((line) => {
      const lineTotal = afrondenOpCenten(line.quantity * line.unitPrice);
      return { line, lineTotal, lineVat: afrondenOpCenten(lineTotal * ((line.vatRate || 0) / 100)) };
    });

    const subtotal = afrondenOpCenten(berekendeRegels.reduce((som, r) => som + r.lineTotal, 0));
    const vatAmount = afrondenOpCenten(berekendeRegels.reduce((som, r) => som + r.lineVat, 0));
    const total = afrondenOpCenten(subtotal + vatAmount);

    const invoiceId = uuidv4();

    db.prepare(
      `
        INSERT INTO invoices (id, association_id, fiscal_year_id, invoice_number, invoice_type, relation_id, user_id,
            status, invoice_date, due_date, reference, description, subtotal, vat_amount, total, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      invoiceId,
      associationId,
      fiscalYear.id,
      invoiceNumber,
      data.invoiceType,
      data.relationId,
      data.userId || null,
      data.invoiceDate,
      data.dueDate,
      data.reference || null,
      data.description || null,
      subtotal,
      vatAmount,
      total,
      data.notes || null,
      req.user!.id,
    );

    // Insert lines
    const lineStmt = db.prepare(`
        INSERT INTO invoice_lines (id, invoice_id, line_number, description, quantity, unit_price, vat_rate, vat_amount, line_total, account_id, cost_center_id, membership_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    berekendeRegels.forEach(({ line, lineTotal, lineVat }, index) => {
      lineStmt.run(
        uuidv4(),
        invoiceId,
        index + 1,
        line.description,
        line.quantity,
        line.unitPrice,
        line.vatRate || 0,
        lineVat,
        lineTotal,
        line.accountId || null,
        line.costCenterId || null,
        line.membershipId || null,
      );
    });

    await logAuditEvent(req.user!.id, 'create', 'invoice', invoiceId, invoiceNumber);
    res.status(201).json({ id: invoiceId, invoiceNumber, message: 'Factuur aangemaakt.' });
  }),
);

router.post(
  '/invoices/:id/send',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');
    if (invoice.status !== 'draft') throw new ApiError(400, 'Alleen concept-facturen kunnen worden verzonden.');

    db.prepare(
      `
        UPDATE invoices SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(req.params.id);

    // Email sending - requires email service configuration (SendGrid, SMTP, etc.)
    // For now, log a warning that email is not actually sent
    logger.warn('Invoice marked as sent but email delivery not configured', {
      invoiceId: req.params.id,
      invoiceNumber: invoice.invoice_number,
      recipientEmail: invoice.client_email,
      action: 'MANUAL_DELIVERY_REQUIRED',
    });

    await logAuditEvent(req.user!.id, 'send', 'invoice', req.params.id, invoice.invoice_number);
    res.json({
      message:
        'Factuur gemarkeerd als verzonden. Let op: automatisch e-mailen is niet geconfigureerd - lever handmatig af.',
    });
  }),
);

router.post(
  '/invoices/:id/mark-paid',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');
    if (invoice.status === 'paid') throw new ApiError(400, 'Factuur is al betaald.');

    // Zonder schema kwam hier alles binnen wat de aanvraag stuurde. Een
    // negatief bedrag draaide het openstaande saldo omhoog, en amount als
    // tekst maakte van 0 + "100" de tekst "0100": JavaScript plakt dan aan
    // elkaar wat opgeteld had moeten worden.
    const betaling = invoicePaymentSchema.parse(req.body);

    const openstaand = afrondenOpCenten(invoice.total - invoice.amount_paid);
    const paymentAmount = betaling.amount !== undefined ? betaling.amount : openstaand;

    if (paymentAmount > openstaand + 0.005) {
      throw new ApiError(400, `Bedrag is hoger dan het openstaande bedrag (€${openstaand.toFixed(2)}).`);
    }

    const newAmountPaid = afrondenOpCenten(invoice.amount_paid + paymentAmount);
    const newStatus = newAmountPaid >= invoice.total - 0.005 ? 'paid' : 'partial';
    const paymentDate = betaling.paymentDate;

    db.prepare(
      `
        UPDATE invoices SET status = ?, amount_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(
      newStatus,
      newAmountPaid,
      newStatus === 'paid' ? paymentDate || new Date().toISOString() : null,
      req.params.id,
    );

    await logAuditEvent(
      req.user!.id,
      'payment',
      'invoice',
      req.params.id,
      `${invoice.invoice_number} - €${paymentAmount}`,
    );
    res.json({ message: newStatus === 'paid' ? 'Factuur volledig betaald.' : 'Betaling geregistreerd.' });
  }),
);

router.delete(
  '/invoices/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId) as any;
    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');
    if (invoice.status !== 'draft') throw new ApiError(400, 'Alleen concept-facturen kunnen worden verwijderd.');

    db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);

    await logAuditEvent(req.user!.id, 'delete', 'invoice', req.params.id, invoice.invoice_number);
    res.json({ message: 'Factuur verwijderd.' });
  }),
);

// =====================================================
// REPORTS
// =====================================================

router.get(
  '/reports/balance',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { fiscalYearId, date } = req.query;

    let fiscalYear: any;
    if (fiscalYearId) {
      fiscalYear = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
        .get(fiscalYearId, associationId);
    } else {
      fiscalYear = db
        .prepare('SELECT * FROM fiscal_years WHERE association_id = ? AND is_current = 1')
        .get(associationId);
    }

    if (!fiscalYear) throw new ApiError(404, 'Boekjaar niet gevonden.');

    const endDate = date || fiscalYear.end_date;

    const accounts = db
      .prepare(
        `
        -- De datumgrens hoort bij het optellen zelf en niet in de
        -- ON-clausule van een LEFT JOIN: daar maakt hij t.* leeg maar blijft
        -- tl.debit_amount gewoon meetellen. Zo stonden alle boekingen ooit in
        -- elk rapport, ook die van na de periode. Meteen ook de vereniging en
        -- de vlag is_posted erbij: een concept hoort niet in een rapport.
        SELECT a.id, a.code, a.name, a.account_type, a.account_subtype, a.opening_balance,
            COALESCE(bal.total_debit, 0) AS total_debit,
            COALESCE(bal.total_credit, 0) AS total_credit
        FROM accounts a
        LEFT JOIN (
            SELECT tl.account_id,
                SUM(tl.debit_amount) AS total_debit,
                SUM(tl.credit_amount) AS total_credit
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE t.association_id = ? AND t.is_posted = 1 AND t.transaction_date <= ?
            GROUP BY tl.account_id
        ) bal ON bal.account_id = a.id
        WHERE a.association_id = ? AND a.is_active = 1
        ORDER BY a.code
    `,
      )
      .all(associationId, endDate, associationId);

    const balance: Record<string, any[]> = {
      assets: [],
      liabilities: [],
      equity: [],
    };

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const acc of accounts as any[]) {
      const movements = acc.total_debit - acc.total_credit;
      let currentBalance = acc.opening_balance;

      if (acc.account_type === 'asset' || acc.account_type === 'expense') {
        currentBalance += movements;
      } else {
        currentBalance -= movements;
      }

      if (['asset'].includes(acc.account_type)) {
        balance.assets.push({ ...acc, currentBalance });
        totalAssets += currentBalance;
      } else if (['liability'].includes(acc.account_type)) {
        balance.liabilities.push({ ...acc, currentBalance });
        totalLiabilities += currentBalance;
      } else if (['equity'].includes(acc.account_type)) {
        balance.equity.push({ ...acc, currentBalance });
        totalEquity += currentBalance;
      }
    }

    res.json({
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      date: endDate,
      assets: balance.assets,
      liabilities: balance.liabilities,
      equity: balance.equity,
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        liabilitiesAndEquity: totalLiabilities + totalEquity,
      },
    });
  }),
);

router.get(
  '/reports/profit-loss',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { fiscalYearId, startDate, endDate } = req.query;

    let fiscalYear: any;
    if (fiscalYearId) {
      fiscalYear = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
        .get(fiscalYearId, associationId);
    } else {
      fiscalYear = db
        .prepare('SELECT * FROM fiscal_years WHERE association_id = ? AND is_current = 1')
        .get(associationId);
    }

    if (!fiscalYear) throw new ApiError(404, 'Boekjaar niet gevonden.');

    const start = startDate || fiscalYear.start_date;
    const end = endDate || fiscalYear.end_date;

    const accounts = db
      .prepare(
        `
        -- De datumgrens hoort bij het optellen zelf en niet in de
        -- ON-clausule van een LEFT JOIN: daar maakt hij t.* leeg maar blijft
        -- tl.debit_amount gewoon meetellen. Zo stonden alle boekingen ooit in
        -- elk rapport, ook die van na de periode. Meteen ook de vereniging en
        -- de vlag is_posted erbij: een concept hoort niet in een rapport.
        SELECT a.id, a.code, a.name, a.account_type, a.account_subtype,
            COALESCE(bal.total_debit, 0) AS total_debit,
            COALESCE(bal.total_credit, 0) AS total_credit
        FROM accounts a
        LEFT JOIN (
            SELECT tl.account_id,
                SUM(tl.debit_amount) AS total_debit,
                SUM(tl.credit_amount) AS total_credit
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE t.association_id = ? AND t.is_posted = 1
                AND t.transaction_date >= ? AND t.transaction_date <= ?
            GROUP BY tl.account_id
        ) bal ON bal.account_id = a.id
        WHERE a.association_id = ? AND a.is_active = 1
            AND a.account_type IN ('income', 'expense')
        ORDER BY a.code
    `,
      )
      .all(associationId, start, end, associationId);

    const income: any[] = [];
    const expenses: any[] = [];
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const acc of accounts as any[]) {
      const amount =
        acc.account_type === 'income' ? acc.total_credit - acc.total_debit : acc.total_debit - acc.total_credit;

      if (acc.account_type === 'income') {
        income.push({ ...acc, amount });
        totalIncome += amount;
      } else {
        expenses.push({ ...acc, amount });
        totalExpenses += amount;
      }
    }

    res.json({
      fiscalYear: { id: fiscalYear.id, name: fiscalYear.name },
      period: { start, end },
      income,
      expenses,
      totals: {
        income: totalIncome,
        expenses: totalExpenses,
        netResult: totalIncome - totalExpenses,
      },
    });
  }),
);

// Account ledger report
router.get(
  '/reports/account-ledger/:accountId',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { startDate, endDate } = req.query;

    const account = db
      .prepare(
        `
        SELECT * FROM accounts WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.accountId, associationId) as any;

    if (!account) throw new ApiError(404, 'Rekening niet gevonden.');

    let query = `
        SELECT t.transaction_number, t.transaction_date, t.description AS tx_description,
            tl.description AS line_description, tl.debit_amount, tl.credit_amount,
            cc.code AS cost_center_code, cc.name AS cost_center_name
        FROM transaction_lines tl
        JOIN transactions t ON tl.transaction_id = t.id
        LEFT JOIN cost_centers cc ON tl.cost_center_id = cc.id
        WHERE tl.account_id = ? AND t.association_id = ?
    `;
    const params: any[] = [req.params.accountId, associationId];

    if (startDate) {
      query += ' AND t.transaction_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND t.transaction_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY t.transaction_date, t.transaction_number';

    const entries = db.prepare(query).all(...params);

    let runningBalance = account.opening_balance || 0;
    const ledgerEntries = (entries as any[]).map((e) => {
      if (account.account_type === 'asset' || account.account_type === 'expense') {
        runningBalance += e.debit_amount - e.credit_amount;
      } else {
        runningBalance += e.credit_amount - e.debit_amount;
      }
      return {
        transactionNumber: e.transaction_number,
        date: e.transaction_date,
        description: e.line_description || e.tx_description,
        debit: e.debit_amount,
        credit: e.credit_amount,
        balance: runningBalance,
        costCenter: e.cost_center_name,
      };
    });

    res.json({
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.account_type,
        openingBalance: account.opening_balance,
      },
      entries: ledgerEntries,
      closingBalance: runningBalance,
    });
  }),
);

// Aging report (outstanding invoices)
router.get(
  '/reports/aging',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const today = new Date().toISOString().split('T')[0];

    const invoices = db
      .prepare(
        `
        SELECT i.*, r.name AS relation_name, r.email AS relation_email
        FROM invoices i
        JOIN accounting_relations r ON i.relation_id = r.id
        WHERE i.association_id = ? AND i.status NOT IN ('paid', 'cancelled', 'written_off')
        ORDER BY i.due_date ASC
    `,
      )
      .all(associationId) as any[];

    const agingBuckets = {
      current: { invoices: [] as any[], total: 0 },
      days1to30: { invoices: [] as any[], total: 0 },
      days31to60: { invoices: [] as any[], total: 0 },
      days61to90: { invoices: [] as any[], total: 0 },
      over90: { invoices: [] as any[], total: 0 },
    };

    for (const inv of invoices) {
      const amountDue = inv.total - inv.amount_paid;
      const dueDate = new Date(inv.due_date);
      const todayDate = new Date(today);
      const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      const entry = {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        relationName: inv.relation_name,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        total: inv.total,
        amountPaid: inv.amount_paid,
        amountDue,
        daysOverdue: Math.max(0, daysOverdue),
      };

      if (daysOverdue <= 0) {
        agingBuckets.current.invoices.push(entry);
        agingBuckets.current.total += amountDue;
      } else if (daysOverdue <= 30) {
        agingBuckets.days1to30.invoices.push(entry);
        agingBuckets.days1to30.total += amountDue;
      } else if (daysOverdue <= 60) {
        agingBuckets.days31to60.invoices.push(entry);
        agingBuckets.days31to60.total += amountDue;
      } else if (daysOverdue <= 90) {
        agingBuckets.days61to90.invoices.push(entry);
        agingBuckets.days61to90.total += amountDue;
      } else {
        agingBuckets.over90.invoices.push(entry);
        agingBuckets.over90.total += amountDue;
      }
    }

    const grandTotal = Object.values(agingBuckets).reduce((sum, b) => sum + b.total, 0);

    res.json({
      asOfDate: today,
      buckets: agingBuckets,
      grandTotal,
    });
  }),
);

// =====================================================
// SEPA PAYMENT FILES
// =====================================================

const sepaPaymentSchema = z.object({
  paymentType: z.enum(['credit_transfer', 'direct_debit']),
  executionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
  bankAccountId: z.string().uuid(),
  invoiceIds: z.array(z.string().uuid()).min(1, 'Minimaal één factuur selecteren.'),
});

router.post(
  '/sepa/generate',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = sepaPaymentSchema.parse(req.body);

    // Get association info
    const association = db.prepare('SELECT * FROM associations WHERE id = ?').get(associationId) as any;
    if (!association) throw new ApiError(404, 'Vereniging niet gevonden.');

    // Get bank account
    //
    // De aanvraag noemt de grootboekrekening (accounts, subtype 'bank'), maar
    // de IBAN en de batch horen bij de bankrekening zelf (bank_accounts).
    // sepa_batches.bank_account_id verwijst naar die tweede tabel: met een
    // accounts.id valt de INSERT om op de sleutelcontrole.
    const bankAccount = db
      .prepare(
        `
        SELECT a.id AS ledger_account_id, ba.id AS bank_account_id,
            ba.iban, ba.bic, ba.name AS account_holder_name
        FROM accounts a
        JOIN bank_accounts ba ON ba.account_id = a.id AND ba.association_id = a.association_id
        WHERE a.id = ? AND a.association_id = ? AND a.account_subtype = 'bank'
    `,
      )
      .get(data.bankAccountId, associationId) as any;

    if (!bankAccount || !bankAccount.iban) {
      throw new ApiError(400, 'Bankrekening heeft geen IBAN geconfigureerd.');
    }

    // Get invoices with relations
    const placeholders = data.invoiceIds.map(() => '?').join(',');
    const invoices = db
      .prepare(
        `
        -- accounting_relations heeft geen bic-kolom, en binnen de eurozone
        -- is een SEPA-betaling op IBAN alleen genoeg.
        SELECT i.*, r.name AS relation_name, r.email AS relation_email,
            r.iban AS relation_iban
        FROM invoices i
        JOIN accounting_relations r ON i.relation_id = r.id
        WHERE i.id IN (${placeholders}) AND i.association_id = ?
    `,
      )
      .all(...data.invoiceIds, associationId) as any[];

    if (invoices.length !== data.invoiceIds.length) {
      throw new ApiError(404, 'Eén of meer facturen niet gevonden.');
    }

    // Check all relations have IBAN
    const missingIban = invoices.filter((i) => !i.relation_iban);
    if (missingIban.length > 0) {
      throw new ApiError(400, `Relaties zonder IBAN: ${missingIban.map((i) => i.relation_name).join(', ')}`);
    }

    // Bij een incasso haalt de vereniging geld op bij het lid. Dat mag alleen
    // op een getekend mandaat en dat mandaat moet in het bestand mee: zonder
    // MndtId weigert de bank de batch. Bij een overboeking bestaat er geen
    // mandaat, want dan betaalt de vereniging zelf.
    const mandaatPerRelatie = new Map<string, any>();
    if (data.paymentType === 'direct_debit') {
      const relatieIds = [...new Set(invoices.map((i) => i.relation_id as string))];
      const mandaten = db
        .prepare(
          `
        SELECT * FROM sepa_mandates
        WHERE association_id = ? AND status = 'active'
            AND relation_id IN (${relatieIds.map(() => '?').join(',')})
        ORDER BY signature_date DESC
    `,
        )
        .all(associationId, ...relatieIds) as any[];

      for (const mandaat of mandaten) {
        if (!mandaatPerRelatie.has(mandaat.relation_id)) mandaatPerRelatie.set(mandaat.relation_id, mandaat);
      }

      const zonderMandaat = invoices.filter((i) => !mandaatPerRelatie.has(i.relation_id));
      if (zonderMandaat.length > 0) {
        throw new ApiError(400, `Geen actief mandaat voor: ${zonderMandaat.map((i) => i.relation_name).join(', ')}`);
      }
    }

    // Generate SEPA XML
    const messageId = `MSG-${Date.now()}`;
    const paymentId = `PMT-${Date.now()}`;
    const transacties = invoices.map((inv) => {
      const mandaat = mandaatPerRelatie.get(inv.relation_id);
      return {
        endToEndId: inv.invoice_number,
        amount: afrondenOpCenten(inv.total - inv.amount_paid),
        counterpartyName: inv.relation_name,
        // Bij een incasso is de IBAN van het mandaat leidend: daarvoor heeft
        // het lid getekend, en daarop mag afgeschreven worden.
        counterpartyIban: mandaat ? mandaat.iban : inv.relation_iban,
        counterpartyBic: mandaat ? mandaat.bic : null,
        remittanceInfo: `Factuur ${inv.invoice_number}`,
        mandateReference: mandaat?.mandate_reference,
        mandateSignatureDate: mandaat?.signature_date,
        sequenceType: mandaat?.sequence_type || 'RCUR',
      };
    });

    // De CtrlSum wordt opgeteld uit dezelfde afgeronde bedragen die straks als
    // InstdAmt in het bestand staan. Werd hij los uit de ruwe factuurbedragen
    // berekend, dan konden de twee een cent uiteenlopen - en een pain-bestand
    // waarvan de CtrlSum niet gelijk is aan de som van de bedragen wordt door
    // de bank geweigerd.
    const totalAmount = afrondenOpCenten(transacties.reduce((som, tx) => som + tx.amount, 0));

    const sepaXml = generateSepaXml({
      messageId,
      paymentId,
      creationDateTime: new Date().toISOString(),
      numberOfTransactions: transacties.length,
      controlSum: totalAmount,
      initiatorName: association.display_name || association.name,
      paymentType: data.paymentType,
      executionDate: data.executionDate,
      accountHolderName: bankAccount.account_holder_name || association.name,
      accountIban: bankAccount.iban,
      accountBic: bankAccount.bic,
      transactions: transacties,
    });

    // Store payment batch
    const batchId = uuidv4();
    const now = new Date().toISOString();
    const batchType = data.paymentType === 'direct_debit' ? 'DD' : 'CT';
    const batchReference = `SEPA-${batchType}-${Date.now()}`;

    db.prepare(
      `
        INSERT INTO sepa_batches (
            id, association_id, bank_account_id, batch_reference, batch_type,
            collection_date, status, total_amount, transaction_count, xml_file_path,
            generated_at, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      batchId,
      associationId,
      bankAccount.bank_account_id,
      batchReference,
      batchType,
      data.executionDate,
      totalAmount,
      invoices.length,
      sepaXml,
      now,
      req.user!.id,
      now,
    );

    // Link invoices to batch
    //
    // sepa_batch_items.mandate_id is verplicht en verwijst naar sepa_mandates.
    // Daar hoorde eerder een relation_id in, wat de sleutelcontrole niet haalt.
    // Bij een overboeking bestaat er geen mandaat en valt er dus niets vast te
    // leggen; de regels zelf staan in het XML-bestand van de batch.
    if (data.paymentType === 'direct_debit') {
      const linkInvoice = db.prepare(`
        INSERT INTO sepa_batch_items (id, batch_id, invoice_id, mandate_id, relation_id, amount, reference)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
      for (const inv of invoices) {
        linkInvoice.run(
          uuidv4(),
          batchId,
          inv.id,
          mandaatPerRelatie.get(inv.relation_id).id,
          inv.relation_id,
          afrondenOpCenten(inv.total - inv.amount_paid),
          inv.invoice_number,
        );
      }
    }

    await logAuditEvent(req.user!.id, 'sepa_generate', 'sepa_batch', batchId, `${invoices.length} betalingen`);

    res.status(201).json({
      id: batchId,
      messageId,
      transactionCount: invoices.length,
      totalAmount,
      message: 'SEPA-bestand gegenereerd.',
    });
  }),
);

router.get(
  '/sepa/batches',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const batches = db
      .prepare(
        `
        SELECT sb.*, ba.account_id AS ledger_account_id, a.code AS account_code, a.name AS account_name,
            u.first_name || ' ' || u.last_name AS created_by_name
        FROM sepa_batches sb
        LEFT JOIN bank_accounts ba ON sb.bank_account_id = ba.id
        LEFT JOIN accounts a ON ba.account_id = a.id
        LEFT JOIN users u ON sb.created_by = u.id
        WHERE sb.association_id = ?
        ORDER BY sb.created_at DESC
    `,
      )
      .all(associationId);

    res.json(
      batches.map((b: any) => ({
        id: b.id,
        batchReference: b.batch_reference,
        batchType: b.batch_type,
        collectionDate: b.collection_date,
        // De client kent bankrekeningen als grootboekrekening; die id geven we
        // terug, met de bankrekening zelf ernaast.
        accountId: b.ledger_account_id,
        bankAccountId: b.bank_account_id,
        accountCode: b.account_code,
        accountName: b.account_name,
        totalAmount: b.total_amount,
        transactionCount: b.transaction_count,
        status: b.status,
        createdBy: b.created_by,
        createdByName: b.created_by_name,
        createdAt: b.created_at,
        generatedAt: b.generated_at,
        processedAt: b.processed_at,
      })),
    );
  }),
);

router.get(
  '/sepa/batches/:id/download',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const batch = db
      .prepare(
        `
        SELECT * FROM sepa_batches WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!batch) throw new ApiError(404, 'SEPA-batch niet gevonden.');
    if (!batch.xml_file_path) throw new ApiError(400, 'SEPA-bestand niet beschikbaar.');

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="sepa-${batch.batch_reference}.xml"`);
    res.send(batch.xml_file_path);
  }),
);

/** Eén regel uit een SEPA-bestand, gezien vanaf de vereniging. */
interface SepaTransactie {
  endToEndId: string;
  amount: number;
  /** De tegenpartij: bij een overboeking de begunstigde, bij een incasso de betaler. */
  counterpartyName: string;
  counterpartyIban: string;
  counterpartyBic?: string | null;
  remittanceInfo: string;
  /** Alleen bij een incasso: het mandaat waarop wordt geïncasseerd. */
  mandateReference?: string;
  mandateSignatureDate?: string;
  sequenceType?: string;
}

interface SepaBestand {
  messageId: string;
  paymentId: string;
  creationDateTime: string;
  numberOfTransactions: number;
  controlSum: number;
  initiatorName: string;
  paymentType: 'credit_transfer' | 'direct_debit';
  executionDate: string;
  /** De rekening van de vereniging: betaler bij een overboeking, incassant bij een incasso. */
  accountHolderName: string;
  accountIban: string;
  accountBic?: string | null;
  transactions: SepaTransactie[];
}

/**
 * Bouwt het SEPA-bestand.
 *
 * De richting van het geld zit niet in een veldje maar in het hele bericht.
 * Een overboeking is pain.001 (CstmrCdtTrfInitn, PmtMtd TRF): de vereniging
 * betaalt. Een incasso is pain.008 (CstmrDrctDbtInitn, PmtMtd DD): de
 * vereniging int. Dit onderscheid werd eerder niet gemaakt - elke batch werd
 * een overboeking, dus een contributie-incasso betaalde alle leden uit.
 */
function generateSepaXml(data: SepaBestand): string {
  return data.paymentType === 'direct_debit' ? incassoBestand(data) : overboekingBestand(data);
}

/** Kop van het bericht; gelijk voor beide berichtsoorten. */
function groepsKop(data: SepaBestand): string {
  return `        <GrpHdr>
            <MsgId>${escapeXml(data.messageId)}</MsgId>
            <CreDtTm>${data.creationDateTime}</CreDtTm>
            <NbOfTxs>${data.numberOfTransactions}</NbOfTxs>
            <CtrlSum>${data.controlSum.toFixed(2)}</CtrlSum>
            <InitgPty>
                <Nm>${escapeXml(data.initiatorName)}</Nm>
            </InitgPty>
        </GrpHdr>`;
}

function agentBlok(tag: string, bic?: string | null): string {
  if (!bic) return '';
  return `
                    <${tag}>
                        <FinInstnId>
                            <BIC>${escapeXml(bic)}</BIC>
                        </FinInstnId>
                    </${tag}>`;
}

/** pain.001: de vereniging maakt geld over naar de tegenpartij. */
function overboekingBestand(data: SepaBestand): string {
  const txns = data.transactions
    .map(
      (tx) => `
                <CdtTrfTxInf>
                    <PmtId>
                        <EndToEndId>${escapeXml(tx.endToEndId)}</EndToEndId>
                    </PmtId>
                    <Amt>
                        <InstdAmt Ccy="EUR">${tx.amount.toFixed(2)}</InstdAmt>
                    </Amt>
                    <Cdtr>
                        <Nm>${escapeXml(tx.counterpartyName)}</Nm>
                    </Cdtr>
                    <CdtrAcct>
                        <Id>
                            <IBAN>${escapeXml(tx.counterpartyIban)}</IBAN>
                        </Id>
                    </CdtrAcct>${agentBlok('CdtrAgt', tx.counterpartyBic)}
                    <RmtInf>
                        <Ustrd>${escapeXml(tx.remittanceInfo)}</Ustrd>
                    </RmtInf>
                </CdtTrfTxInf>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
    <CstmrCdtTrfInitn>
${groepsKop(data)}
        <PmtInf>
            <PmtInfId>${escapeXml(data.paymentId)}</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <NbOfTxs>${data.numberOfTransactions}</NbOfTxs>
            <CtrlSum>${data.controlSum.toFixed(2)}</CtrlSum>
            <ReqdExctnDt>${data.executionDate}</ReqdExctnDt>
            <Dbtr>
                <Nm>${escapeXml(data.accountHolderName)}</Nm>
            </Dbtr>
            <DbtrAcct>
                <Id>
                    <IBAN>${escapeXml(data.accountIban)}</IBAN>
                </Id>
            </DbtrAcct>${agentBlok('DbtrAgt', data.accountBic)}${txns}
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>`;
}

/**
 * pain.008: de vereniging incasseert bij de tegenpartij.
 *
 * De regels worden per sequentietype gegroepeerd, want SeqTp staat in
 * pain.008.001.02 op het niveau van PmtInf. Een eerste incasso (FRST) en een
 * doorlopende (RCUR) door elkaar in één blok maakt het bestand ongeldig.
 */
function incassoBestand(data: SepaBestand): string {
  const perType = new Map<string, SepaTransactie[]>();
  for (const tx of data.transactions) {
    const type = tx.sequenceType || 'RCUR';
    if (!perType.has(type)) perType.set(type, []);
    perType.get(type)!.push(tx);
  }

  const blokken = [...perType.entries()]
    .map(([sequenceType, txs], index) => {
      const som = txs.reduce((totaal, tx) => totaal + tx.amount, 0);
      const regels = txs
        .map(
          (tx) => `
                <DrctDbtTxInf>
                    <PmtId>
                        <EndToEndId>${escapeXml(tx.endToEndId)}</EndToEndId>
                    </PmtId>
                    <InstdAmt Ccy="EUR">${tx.amount.toFixed(2)}</InstdAmt>
                    <DrctDbtTx>
                        <MndtRltdInf>
                            <MndtId>${escapeXml(tx.mandateReference || '')}</MndtId>
                            <DtOfSgntr>${escapeXml(tx.mandateSignatureDate || '')}</DtOfSgntr>
                        </MndtRltdInf>
                    </DrctDbtTx>${agentBlok('DbtrAgt', tx.counterpartyBic)}
                    <Dbtr>
                        <Nm>${escapeXml(tx.counterpartyName)}</Nm>
                    </Dbtr>
                    <DbtrAcct>
                        <Id>
                            <IBAN>${escapeXml(tx.counterpartyIban)}</IBAN>
                        </Id>
                    </DbtrAcct>
                    <RmtInf>
                        <Ustrd>${escapeXml(tx.remittanceInfo)}</Ustrd>
                    </RmtInf>
                </DrctDbtTxInf>`,
        )
        .join('');

      return `        <PmtInf>
            <PmtInfId>${escapeXml(data.paymentId)}-${index + 1}</PmtInfId>
            <PmtMtd>DD</PmtMtd>
            <NbOfTxs>${txs.length}</NbOfTxs>
            <CtrlSum>${som.toFixed(2)}</CtrlSum>
            <PmtTpInf>
                <SvcLvl>
                    <Cd>SEPA</Cd>
                </SvcLvl>
                <LclInstrm>
                    <Cd>CORE</Cd>
                </LclInstrm>
                <SeqTp>${escapeXml(sequenceType)}</SeqTp>
            </PmtTpInf>
            <ReqdColltnDt>${data.executionDate}</ReqdColltnDt>
            <Cdtr>
                <Nm>${escapeXml(data.accountHolderName)}</Nm>
            </Cdtr>
            <CdtrAcct>
                <Id>
                    <IBAN>${escapeXml(data.accountIban)}</IBAN>
                </Id>
            </CdtrAcct>${agentBlok('CdtrAgt', data.accountBic)}${regels}
        </PmtInf>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
    <CstmrDrctDbtInitn>
${groepsKop(data)}
${blokken}
    </CstmrDrctDbtInitn>
</Document>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =====================================================
// TRANSACTIONS
// =====================================================

router.get(
  '/transactions',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { fiscalYearId, accountId, startDate, endDate, transactionType, search } = req.query;

    let query = `
        SELECT t.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM transactions t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.association_id = ?
    `;
    const params: any[] = [associationId];

    if (fiscalYearId) {
      query += ' AND t.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }
    if (transactionType) {
      query += ' AND t.transaction_type = ?';
      params.push(transactionType);
    }
    if (startDate) {
      query += ' AND t.transaction_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND t.transaction_date <= ?';
      params.push(endDate);
    }
    if (search) {
      query += ' AND (t.description LIKE ? OR t.reference LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (accountId) {
      query += ' AND EXISTS (SELECT 1 FROM transaction_lines tl WHERE tl.transaction_id = t.id AND tl.account_id = ?)';
      params.push(accountId);
    }

    query += ' ORDER BY t.transaction_date DESC, t.created_at DESC';

    const transactions = db.prepare(query).all(...params);

    res.json(
      transactions.map((t: any) => ({
        id: t.id,
        transactionNumber: t.transaction_number,
        transactionDate: t.transaction_date,
        transactionType: t.transaction_type,
        reference: t.reference,
        description: t.description,
        totalAmount: t.amount,
        isPosted: !!t.is_posted,
        isReconciled: !!t.is_reconciled,
        invoiceId: t.invoice_id,
        bankStatementId: t.bank_statement_id,
        createdBy: t.created_by,
        createdByName: t.created_by_name,
        createdAt: t.created_at,
      })),
    );
  }),
);

router.get(
  '/transactions/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const transaction = db
      .prepare(
        `
        SELECT t.*, u.first_name || ' ' || u.last_name AS created_by_name
        FROM transactions t
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ? AND t.association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!transaction) throw new ApiError(404, 'Transactie niet gevonden.');

    const lines = db
      .prepare(
        `
        SELECT tl.*, a.code AS account_code, a.name AS account_name, a.account_type,
            cc.code AS cost_center_code, cc.name AS cost_center_name
        FROM transaction_lines tl
        LEFT JOIN accounts a ON tl.account_id = a.id
        LEFT JOIN cost_centers cc ON tl.cost_center_id = cc.id
        WHERE tl.transaction_id = ?
        ORDER BY tl.line_number
    `,
      )
      .all(req.params.id);

    res.json({
      id: transaction.id,
      transactionNumber: transaction.transaction_number,
      fiscalYearId: transaction.fiscal_year_id,
      transactionDate: transaction.transaction_date,
      transactionType: transaction.transaction_type,
      reference: transaction.reference,
      description: transaction.description,
      totalAmount: transaction.amount,
      isPosted: !!transaction.is_posted,
      isReconciled: !!transaction.is_reconciled,
      invoiceId: transaction.invoice_id,
      bankStatementId: transaction.bank_statement_id,
      createdBy: transaction.created_by,
      createdByName: transaction.created_by_name,
      createdAt: transaction.created_at,
      lines: lines.map((l: any) => ({
        id: l.id,
        lineNumber: l.line_number,
        accountId: l.account_id,
        accountCode: l.account_code,
        accountName: l.account_name,
        accountType: l.account_type,
        costCenterId: l.cost_center_id,
        costCenterCode: l.cost_center_code,
        costCenterName: l.cost_center_name,
        description: l.description,
        debitAmount: l.debit_amount,
        creditAmount: l.credit_amount,
      })),
    });
  }),
);

router.post(
  '/transactions',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = transactionSchema.parse(req.body);

    // Elke regel boekt op een rekening van deze vereniging; de sleutelcontrole
    // van de database let daar niet op, dus staat de controle hier.
    for (const line of data.lines) {
      eisEigenId('account', line.accountId, associationId, 'Onbekende grootboekrekening op een boekingsregel.');
      eisEigenId('costCenter', line.costCenterId, associationId, 'Onbekende kostenplaats op een boekingsregel.');
    }

    // Validate debit/credit balance
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of data.lines) {
      totalDebit += line.debitAmount || 0;
      totalCredit += line.creditAmount || 0;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new ApiError(
        400,
        `Debet en credit moeten in balans zijn. Verschil: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`,
      );
    }

    // Get current fiscal year
    const fiscalYear = db
      .prepare(
        `
        SELECT id FROM fiscal_years
        WHERE association_id = ? AND is_current = 1 AND status = 'open'
    `,
      )
      .get(associationId) as any;

    if (!fiscalYear) {
      throw new ApiError(400, 'Geen actief boekjaar gevonden.');
    }

    // Generate transaction number
    const transactionNumber = volgendBoekstuknummer(associationId);

    const transactionId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `
        INSERT INTO transactions (
            id, association_id, fiscal_year_id, transaction_number, transaction_date,
            transaction_type, reference, description, amount, invoice_id,
            created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      transactionId,
      associationId,
      fiscalYear.id,
      transactionNumber,
      data.transactionDate,
      data.transactionType,
      data.reference || null,
      data.description,
      totalDebit,
      data.invoiceId || null,
      req.user!.id,
      now,
    );

    // Insert lines
    const insertLine = db.prepare(`
        INSERT INTO transaction_lines (
            id, transaction_id, line_number, account_id, cost_center_id,
            description, debit_amount, credit_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    data.lines.forEach((line, index) => {
      insertLine.run(
        uuidv4(),
        transactionId,
        index + 1,
        line.accountId,
        line.costCenterId || null,
        line.description || null,
        line.debitAmount || 0,
        line.creditAmount || 0,
      );
    });

    await logAuditEvent(req.user!.id, 'create', 'transaction', transactionId, transactionNumber);

    res.status(201).json({
      id: transactionId,
      transactionNumber,
      message: 'Transactie aangemaakt.',
    });
  }),
);

router.put(
  '/transactions/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare(
        `
        SELECT * FROM transactions WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!existing) throw new ApiError(404, 'Transactie niet gevonden.');
    if (existing.is_posted) throw new ApiError(400, 'Geboekte transacties kunnen niet worden bewerkt.');

    const data = transactionSchema.parse(req.body);

    // Elke regel boekt op een rekening van deze vereniging; de sleutelcontrole
    // van de database let daar niet op, dus staat de controle hier.
    for (const line of data.lines) {
      eisEigenId('account', line.accountId, associationId, 'Onbekende grootboekrekening op een boekingsregel.');
      eisEigenId('costCenter', line.costCenterId, associationId, 'Onbekende kostenplaats op een boekingsregel.');
    }

    // Validate balance
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of data.lines) {
      totalDebit += line.debitAmount || 0;
      totalCredit += line.creditAmount || 0;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new ApiError(400, `Debet en credit moeten in balans zijn.`);
    }

    // Update transaction
    db.prepare(
      `
        UPDATE transactions SET
            transaction_date = ?, transaction_type = ?, reference = ?, description = ?,
            amount = ?, invoice_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(
      data.transactionDate,
      data.transactionType,
      data.reference || null,
      data.description,
      totalDebit,
      data.invoiceId || null,
      req.params.id,
    );

    // Replace lines
    db.prepare('DELETE FROM transaction_lines WHERE transaction_id = ?').run(req.params.id);

    const insertLine = db.prepare(`
        INSERT INTO transaction_lines (
            id, transaction_id, line_number, account_id, cost_center_id,
            description, debit_amount, credit_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    data.lines.forEach((line, index) => {
      insertLine.run(
        uuidv4(),
        req.params.id,
        index + 1,
        line.accountId,
        line.costCenterId || null,
        line.description || null,
        line.debitAmount || 0,
        line.creditAmount || 0,
      );
    });

    await logAuditEvent(req.user!.id, 'update', 'transaction', req.params.id, existing.transaction_number);
    res.json({ message: 'Transactie bijgewerkt.' });
  }),
);

router.delete(
  '/transactions/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare(
        `
        SELECT * FROM transactions WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!existing) throw new ApiError(404, 'Transactie niet gevonden.');
    if (existing.is_posted) throw new ApiError(400, 'Geboekte transacties kunnen niet worden verwijderd.');

    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    await logAuditEvent(req.user!.id, 'delete', 'transaction', req.params.id, existing.transaction_number);
    res.json({ message: 'Transactie verwijderd.' });
  }),
);

router.post(
  '/transactions/:id/post',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db
      .prepare(
        `
        SELECT * FROM transactions WHERE id = ? AND association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!existing) throw new ApiError(404, 'Transactie niet gevonden.');
    if (existing.is_posted) throw new ApiError(400, 'Transactie is al geboekt.');

    db.prepare(
      `
        UPDATE transactions SET is_posted = 1, posted_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
    ).run(req.params.id);

    await logAuditEvent(req.user!.id, 'post', 'transaction', req.params.id, existing.transaction_number);
    res.json({ message: 'Transactie geboekt.' });
  }),
);

// =====================================================
// BANK IMPORT (MT940/CAMT053)
// =====================================================

const bankImportSchema = z.object({
  accountId: z.string().uuid(),
  format: z.enum(['mt940', 'camt053', 'csv']),
  content: z.string().min(1, 'Bestandsinhoud is verplicht.'),
});

router.post(
  '/bank-import',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = bankImportSchema.parse(req.body);

    // Verify account exists and is a bank account
    //
    // Een afschrift hangt aan de bankrekening (bank_accounts), niet aan de
    // grootboekrekening. De aanvraag noemt de grootboekrekening, dus zoeken we
    // de bankrekening erbij op: met een accounts.id in bank_statements viel
    // elke import om op de sleutelcontrole.
    const account = db
      .prepare(
        `
        SELECT id, name FROM accounts WHERE id = ? AND association_id = ? AND account_subtype = 'bank'
    `,
      )
      .get(data.accountId, associationId) as any;

    if (!account) throw new ApiError(404, 'Bankrekening niet gevonden.');

    const bankAccount = db
      .prepare('SELECT id FROM bank_accounts WHERE account_id = ? AND association_id = ?')
      .get(data.accountId, associationId) as any;

    if (!bankAccount) {
      throw new ApiError(400, `Voor grootboekrekening ${account.name} is nog geen bankrekening met IBAN ingericht.`);
    }

    // Get current fiscal year
    const fiscalYear = db
      .prepare(
        `
        SELECT id FROM fiscal_years WHERE association_id = ? AND is_current = 1 AND status = 'open'
    `,
      )
      .get(associationId) as any;

    if (!fiscalYear) throw new ApiError(400, 'Geen actief boekjaar gevonden.');

    const statementId = uuidv4();
    const now = new Date().toISOString();

    // Parse bank statement based on format
    //
    // Eerst inlezen, dan pas wegschrijven: een onleesbaar bedrag hoort geen
    // half afschrift achter te laten.
    const entries: Array<{
      date: string;
      description: string;
      amount: number;
      reference?: string;
      counterpartyName?: string;
      counterpartyIban?: string;
    }> = [];

    if (data.format === 'csv') {
      // Simple CSV format: date;description;amount;reference
      const lines = data.content.split('\n').filter((l) => l.trim());
      for (let i = 1; i < lines.length; i++) {
        // Skip header
        const parts = lines[i].split(';');
        if (parts.length >= 3) {
          entries.push({
            date: parts[0].trim(),
            description: parts[1].trim(),
            amount: leesBedrag(parts[2]),
            reference: parts[3]?.trim(),
            counterpartyName: parts[4]?.trim(),
            counterpartyIban: parts[5]?.trim(),
          });
        }
      }
    } else if (data.format === 'mt940') {
      // Simplified MT940 parsing - in production use a proper library
      const statementRegex = /:61:(\d{6})(\d{4})?(C|D)(\d+,\d{2})/g;
      const descriptionRegex = /:86:(.*?)(?=:6[01]|$)/gs;

      let match;
      const amounts: Array<{ date: string; type: string; amount: number }> = [];
      while ((match = statementRegex.exec(data.content)) !== null) {
        const dateStr = match[1];
        const type = match[3]; // C = credit, D = debit
        const bedrag = leesBedrag(match[4]);
        amounts.push({
          date: `20${dateStr.slice(0, 2)}-${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}`,
          type,
          amount: type === 'D' ? -bedrag : bedrag,
        });
      }

      const descriptions: string[] = [];
      while ((match = descriptionRegex.exec(data.content)) !== null) {
        descriptions.push(match[1].replace(/\n/g, ' ').trim());
      }

      for (let i = 0; i < amounts.length; i++) {
        entries.push({
          date: amounts[i].date,
          description: descriptions[i] || 'Bankafschrijving',
          amount: amounts[i].amount,
        });
      }
    }
    // CAMT053 would need XML parsing - simplified for now

    // Create bank statement record
    db.prepare(
      `
        INSERT INTO bank_statements (
            id, bank_account_id, statement_date, opening_balance, closing_balance,
            status, import_file_name
        ) VALUES (?, ?, ?, 0, 0, 'imported', ?)
    `,
    ).run(statementId, bankAccount.id, now.split('T')[0], data.format);

    // Insert entries
    const insertEntry = db.prepare(`
        INSERT INTO bank_statement_lines (
            id, statement_id, line_number, booking_date, amount, description,
            reference, counterparty_name, counterparty_iban, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    let lineNum = 0;
    for (const entry of entries) {
      lineNum++;
      insertEntry.run(
        uuidv4(),
        statementId,
        lineNum,
        entry.date,
        entry.amount,
        entry.description,
        entry.reference || null,
        entry.counterpartyName || null,
        entry.counterpartyIban || null,
      );
    }

    // Update statement totals
    const totals = entries.reduce(
      (acc, e) => ({
        debit: acc.debit + (e.amount < 0 ? Math.abs(e.amount) : 0),
        credit: acc.credit + (e.amount > 0 ? e.amount : 0),
      }),
      { debit: 0, credit: 0 },
    );

    db.prepare(
      `
        UPDATE bank_statements SET
            total_debit = ?, total_credit = ?, line_count = ?
        WHERE id = ?
    `,
    ).run(totals.debit, totals.credit, entries.length, statementId);

    await logAuditEvent(req.user!.id, 'import', 'bank_statement', statementId, `${entries.length} transacties`);

    res.status(201).json({
      id: statementId,
      entryCount: entries.length,
      totalDebit: totals.debit,
      totalCredit: totals.credit,
      message: `${entries.length} banktransacties geïmporteerd.`,
    });
  }),
);

router.get(
  '/bank-statements',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const statements = db
      .prepare(
        `
        SELECT bs.*, ba.account_id AS ledger_account_id, a.code AS account_code, a.name AS account_name
        FROM bank_statements bs
        JOIN bank_accounts ba ON bs.bank_account_id = ba.id
        LEFT JOIN accounts a ON ba.account_id = a.id
        WHERE ba.association_id = ?
        ORDER BY bs.statement_date DESC, bs.imported_at DESC
    `,
      )
      .all(associationId);

    res.json(
      statements.map((s: any) => ({
        id: s.id,
        accountId: s.ledger_account_id,
        bankAccountId: s.bank_account_id,
        accountCode: s.account_code,
        accountName: s.account_name,
        statementDate: s.statement_date,
        importFileName: s.import_file_name,
        status: s.status,
        totalDebit: s.total_debit,
        totalCredit: s.total_credit,
        lineCount: s.line_count,
        importedAt: s.imported_at,
      })),
    );
  }),
);

router.get(
  '/bank-statements/:id/entries',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const statement = db
      .prepare(
        `
        SELECT bs.*, ba.association_id
        FROM bank_statements bs
        JOIN bank_accounts ba ON bs.bank_account_id = ba.id
        WHERE bs.id = ? AND ba.association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!statement) throw new ApiError(404, 'Bankafschrift niet gevonden.');

    const lines = db
      .prepare(
        `
        SELECT bsl.*, t.transaction_number
        FROM bank_statement_lines bsl
        LEFT JOIN transactions t ON bsl.transaction_id = t.id
        WHERE bsl.statement_id = ?
        ORDER BY bsl.booking_date, bsl.line_number
    `,
      )
      .all(req.params.id);

    res.json({
      statement: {
        id: statement.id,
        statementDate: statement.statement_date,
        status: statement.status,
        totalDebit: statement.total_debit,
        totalCredit: statement.total_credit,
      },
      entries: lines.map((l: any) => ({
        id: l.id,
        lineNumber: l.line_number,
        bookingDate: l.booking_date,
        valueDate: l.value_date,
        description: l.description,
        amount: l.amount,
        reference: l.reference,
        counterpartyName: l.counterparty_name,
        counterpartyIban: l.counterparty_iban,
        status: l.status,
        transactionId: l.transaction_id,
        transactionNumber: l.transaction_number,
        matchedInvoiceId: l.matched_invoice_id,
      })),
    });
  }),
);

router.post(
  '/bank-statements/:statementId/lines/:lineId/book',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { counterAccountId, costCenterId } = req.body;
    if (!counterAccountId) throw new ApiError(400, 'Tegenrekening is verplicht.');

    // Zonder deze controle boekt de beheerder van vereniging A op een
    // grootboekrekening van vereniging B: de sleutelcontrole vindt die rij
    // gewoon, want die kijkt niet naar de vereniging.
    eisEigenId('account', counterAccountId, associationId, 'Onbekende tegenrekening.');
    eisEigenId('costCenter', costCenterId, associationId, 'Onbekende kostenplaats.');

    const line = db
      .prepare(
        `
        -- De boeking komt op de grootboekrekening achter de bankrekening
        -- terecht, niet op de bankrekening zelf: transaction_lines.account_id
        -- verwijst naar accounts.
        SELECT bsl.*, ba.account_id AS ledger_account_id, ba.association_id
        FROM bank_statement_lines bsl
        JOIN bank_statements bs ON bsl.statement_id = bs.id
        JOIN bank_accounts ba ON bs.bank_account_id = ba.id
        WHERE bsl.id = ? AND bs.id = ? AND ba.association_id = ?
    `,
      )
      .get(req.params.lineId, req.params.statementId, associationId) as any;

    if (!line) throw new ApiError(404, 'Bankregel niet gevonden.');
    if (line.status !== 'pending') throw new ApiError(400, 'Bankregel is al verwerkt.');

    // Get fiscal year
    const fiscalYear = db
      .prepare(
        `
        SELECT id FROM fiscal_years WHERE association_id = ? AND is_current = 1 AND status = 'open'
    `,
      )
      .get(associationId) as any;

    if (!fiscalYear) throw new ApiError(400, 'Geen actief boekjaar.');

    // Generate transaction number
    const transactionNumber = volgendBoekstuknummer(associationId);

    const transactionId = uuidv4();
    const now = new Date().toISOString();
    const amount = Math.abs(line.amount);

    // Create transaction
    db.prepare(
      `
        INSERT INTO transactions (
            id, association_id, fiscal_year_id, transaction_number, transaction_date,
            transaction_type, description, amount, bank_statement_line_id, is_posted,
            created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'bank', ?, ?, ?, 1, ?, ?)
    `,
    ).run(
      transactionId,
      associationId,
      fiscalYear.id,
      transactionNumber,
      line.booking_date,
      line.description,
      amount,
      req.params.lineId,
      req.user!.id,
      now,
    );

    // Create lines (bank account and counter account)
    const insertLine = db.prepare(`
        INSERT INTO transaction_lines (
            id, transaction_id, line_number, account_id, cost_center_id, debit_amount, credit_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    if (line.amount > 0) {
      // Money received: debit bank, credit counter
      insertLine.run(uuidv4(), transactionId, 1, line.ledger_account_id, null, amount, 0);
      insertLine.run(uuidv4(), transactionId, 2, counterAccountId, costCenterId || null, 0, amount);
    } else {
      // Money paid: credit bank, debit counter
      insertLine.run(uuidv4(), transactionId, 1, line.ledger_account_id, null, 0, amount);
      insertLine.run(uuidv4(), transactionId, 2, counterAccountId, costCenterId || null, amount, 0);
    }

    // Update line status
    db.prepare(
      `
        UPDATE bank_statement_lines SET status = 'manual', transaction_id = ?, reconciled_at = ? WHERE id = ?
    `,
    ).run(transactionId, now, req.params.lineId);

    res.json({
      transactionId,
      transactionNumber,
      message: 'Bankregel geboekt.',
    });
  }),
);

// =====================================================
// RELATIONS (DEBTORS/CREDITORS)
// =====================================================

router.get(
  '/relations',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const relations = db
      .prepare(
        `
        SELECT ar.*, u.first_name || ' ' || u.last_name AS user_name
        FROM accounting_relations ar
        LEFT JOIN users u ON ar.user_id = u.id
        WHERE ar.association_id = ?
        ORDER BY ar.name
    `,
      )
      .all(associationId);

    res.json(
      relations.map((r: any) => ({
        id: r.id,
        relationType: r.relation_type,
        userId: r.user_id,
        userName: r.user_name,
        contactId: r.contact_id,
        relationNumber: r.relation_number,
        name: r.name,
        email: r.email,
        phone: r.phone,
        addressLine: r.address_line,
        postalCode: r.postal_code,
        city: r.city,
        country: r.country,
        iban: r.iban,
        vatNumber: r.vat_number,
        paymentTermDays: r.payment_term_days,
        receivableAccountId: r.receivable_account_id,
        payableAccountId: r.payable_account_id,
        creditLimit: r.credit_limit,
        balance: r.balance,
        isActive: !!r.is_active,
        createdAt: r.created_at,
      })),
    );
  }),
);

router.post(
  '/relations',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const {
      relationType,
      name,
      email,
      phone,
      addressLine,
      postalCode,
      city,
      country,
      iban,
      vatNumber,
      paymentTermDays,
      userId,
      contactId,
    } = req.body;

    if (!relationType || !name) {
      throw new ApiError(400, 'Type en naam zijn verplicht.');
    }

    // Een relatie koppelen aan een lid of contact van een andere vereniging
    // maakt van hun naam- en adresgegevens daar een lek.
    eisEigenId('user', userId, associationId, 'Onbekend lid.');
    eisEigenId('contact', contactId, associationId, 'Onbekend contact.');

    const relationId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `
        INSERT INTO accounting_relations (id, association_id, relation_type, name, email, phone, address_line, postal_code, city, country, iban, vat_number, payment_term_days, user_id, contact_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      relationId,
      associationId,
      relationType,
      name,
      email || null,
      phone || null,
      addressLine || null,
      postalCode || null,
      city || null,
      country || 'NL',
      iban || null,
      vatNumber || null,
      paymentTermDays || 30,
      userId || null,
      contactId || null,
      now,
      now,
    );

    res.status(201).json({ id: relationId, message: 'Relatie aangemaakt.' });
  }),
);

// Een enkele relatie, in dezelfde vorm als het overzicht hierboven. De PUT en
// de DELETE eronder bestonden al; het detail ontbrak.
router.get(
  '/relations/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const r = db
      .prepare(
        `
        SELECT ar.*, u.first_name || ' ' || u.last_name AS user_name
        FROM accounting_relations ar
        LEFT JOIN users u ON ar.user_id = u.id
        WHERE ar.id = ? AND ar.association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!r) throw new ApiError(404, 'Relatie niet gevonden.');

    res.json({
      id: r.id,
      relationType: r.relation_type,
      userId: r.user_id,
      userName: r.user_name,
      contactId: r.contact_id,
      relationNumber: r.relation_number,
      name: r.name,
      email: r.email,
      phone: r.phone,
      addressLine: r.address_line,
      postalCode: r.postal_code,
      city: r.city,
      country: r.country,
      iban: r.iban,
      vatNumber: r.vat_number,
      paymentTermDays: r.payment_term_days,
      receivableAccountId: r.receivable_account_id,
      payableAccountId: r.payable_account_id,
      creditLimit: r.credit_limit,
      balance: r.balance,
      isActive: !!r.is_active,
      createdAt: r.created_at,
    });
  }),
);

router.put(
  '/relations/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const relation = db
      .prepare('SELECT id FROM accounting_relations WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId);
    if (!relation) throw new ApiError(404, 'Relatie niet gevonden.');

    const updates: string[] = [];
    const params: any[] = [];

    const fields = [
      'relation_type',
      'name',
      'email',
      'phone',
      'address_line',
      'postal_code',
      'city',
      'country',
      'iban',
      'vat_number',
      'payment_term_days',
      'credit_limit',
      'is_active',
    ];
    const bodyFields = [
      'relationType',
      'name',
      'email',
      'phone',
      'addressLine',
      'postalCode',
      'city',
      'country',
      'iban',
      'vatNumber',
      'paymentTermDays',
      'creditLimit',
      'isActive',
    ];

    fields.forEach((f, i) => {
      if (req.body[bodyFields[i]] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[bodyFields[i]]);
      }
    });

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(req.params.id);
      db.prepare(`UPDATE accounting_relations SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Relatie bijgewerkt.' });
  }),
);

router.delete(
  '/relations/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const result = db
      .prepare('DELETE FROM accounting_relations WHERE id = ? AND association_id = ?')
      .run(req.params.id, associationId);
    if (result.changes === 0) throw new ApiError(404, 'Relatie niet gevonden.');

    res.json({ message: 'Relatie verwijderd.' });
  }),
);

// =====================================================
// COST CENTERS
// =====================================================

router.get(
  '/cost-centers',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const costCenters = db
      .prepare(
        `
        SELECT cc.*, o.name AS orchestra_name
        FROM cost_centers cc
        LEFT JOIN orchestras o ON cc.orchestra_id = o.id
        WHERE cc.association_id = ?
        ORDER BY cc.code
    `,
      )
      .all(associationId);

    res.json(
      costCenters.map((cc: any) => ({
        id: cc.id,
        code: cc.code,
        name: cc.name,
        description: cc.description,
        orchestraId: cc.orchestra_id,
        orchestraName: cc.orchestra_name,
        isActive: !!cc.is_active,
        budgetAmount: cc.budget_amount,
        createdAt: cc.created_at,
      })),
    );
  }),
);

router.post(
  '/cost-centers',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { code, name, description, orchestraId, budgetAmount } = req.body;

    if (!code || !name) {
      throw new ApiError(400, 'Code en naam zijn verplicht.');
    }

    const costCenterId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `
        INSERT INTO cost_centers (id, association_id, code, name, description, orchestra_id, budget_amount, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(costCenterId, associationId, code, name, description || null, orchestraId || null, budgetAmount || null, now);

    res.status(201).json({ id: costCenterId, message: 'Kostenplaats aangemaakt.' });
  }),
);

// Een enkele kostenplaats, in dezelfde vorm als het overzicht hierboven.
router.get(
  '/cost-centers/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const cc = db
      .prepare(
        `
        SELECT cc.*, o.name AS orchestra_name
        FROM cost_centers cc
        LEFT JOIN orchestras o ON cc.orchestra_id = o.id
        WHERE cc.id = ? AND cc.association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!cc) throw new ApiError(404, 'Kostenplaats niet gevonden.');

    res.json({
      id: cc.id,
      code: cc.code,
      name: cc.name,
      description: cc.description,
      orchestraId: cc.orchestra_id,
      orchestraName: cc.orchestra_name,
      isActive: !!cc.is_active,
      budgetAmount: cc.budget_amount,
      createdAt: cc.created_at,
    });
  }),
);

router.put(
  '/cost-centers/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const cc = db
      .prepare('SELECT id FROM cost_centers WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId);
    if (!cc) throw new ApiError(404, 'Kostenplaats niet gevonden.');

    const { code, name, description, orchestraId, budgetAmount, isActive } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (code !== undefined) {
      updates.push('code = ?');
      params.push(code);
    }
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (orchestraId !== undefined) {
      updates.push('orchestra_id = ?');
      params.push(orchestraId || null);
    }
    if (budgetAmount !== undefined) {
      updates.push('budget_amount = ?');
      params.push(budgetAmount);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE cost_centers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Kostenplaats bijgewerkt.' });
  }),
);

router.delete(
  '/cost-centers/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const result = db
      .prepare('DELETE FROM cost_centers WHERE id = ? AND association_id = ?')
      .run(req.params.id, associationId);
    if (result.changes === 0) throw new ApiError(404, 'Kostenplaats niet gevonden.');

    res.json({ message: 'Kostenplaats verwijderd.' });
  }),
);

// =====================================================
// BUDGET ROUTES
// =====================================================

// Get all budgets
router.get(
  '/budgets',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId } = req.query;

    let query = `
        SELECT b.*,
               a.code AS account_code, a.name AS account_name,
               cc.name AS cost_center_name,
               fy.name AS fiscal_year_name,
               u.first_name || ' ' || u.last_name AS created_by_name
        FROM budgets b
        LEFT JOIN accounts a ON b.account_id = a.id
        LEFT JOIN cost_centers cc ON b.cost_center_id = cc.id
        LEFT JOIN fiscal_years fy ON b.fiscal_year_id = fy.id
        LEFT JOIN users u ON b.created_by = u.id
        WHERE b.association_id = ?
    `;
    const params: any[] = [associationId];

    if (fiscalYearId) {
      query += ' AND b.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }

    query += ' ORDER BY a.code, b.name';

    const budgets = db.prepare(query).all(...params);

    // Calculate actual amounts per budget
    const result = budgets.map((b: any) => {
      const actualQuery = `
            SELECT COALESCE(SUM(tl.debit_amount - tl.credit_amount), 0) AS actual
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE t.association_id = ?
              AND tl.account_id = ?
              AND t.is_posted = 1
              ${b.fiscal_year_id ? 'AND t.fiscal_year_id = ?' : ''}
              ${b.cost_center_id ? 'AND tl.cost_center_id = ?' : ''}
        `;
      const actualParams: any[] = [associationId, b.account_id];
      if (b.fiscal_year_id) actualParams.push(b.fiscal_year_id);
      if (b.cost_center_id) actualParams.push(b.cost_center_id);

      const actual = db.prepare(actualQuery).get(...actualParams) as any;

      return {
        id: b.id,
        name: b.name,
        amount: b.amount,
        actual: Math.abs(actual?.actual || 0),
        remaining: b.amount - Math.abs(actual?.actual || 0),
        accountId: b.account_id,
        accountCode: b.account_code,
        accountName: b.account_name,
        costCenterId: b.cost_center_id,
        costCenterName: b.cost_center_name,
        fiscalYearId: b.fiscal_year_id,
        fiscalYearName: b.fiscal_year_name,
        notes: b.notes,
        createdBy: b.created_by,
        createdByName: b.created_by_name,
        createdAt: b.created_at,
      };
    });

    res.json(result);
  }),
);

// Get single budget
router.get(
  '/budgets/:id',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const budget = db
      .prepare(
        `
        SELECT b.*,
               a.code AS account_code, a.name AS account_name,
               cc.name AS cost_center_name,
               fy.name AS fiscal_year_name
        FROM budgets b
        LEFT JOIN accounts a ON b.account_id = a.id
        LEFT JOIN cost_centers cc ON b.cost_center_id = cc.id
        LEFT JOIN fiscal_years fy ON b.fiscal_year_id = fy.id
        WHERE b.id = ? AND b.association_id = ?
    `,
      )
      .get(req.params.id, associationId) as any;

    if (!budget) {
      throw new ApiError(404, 'Budget niet gevonden.');
    }

    res.json({
      id: budget.id,
      name: budget.name,
      amount: budget.amount,
      accountId: budget.account_id,
      accountCode: budget.account_code,
      accountName: budget.account_name,
      costCenterId: budget.cost_center_id,
      costCenterName: budget.cost_center_name,
      fiscalYearId: budget.fiscal_year_id,
      fiscalYearName: budget.fiscal_year_name,
      notes: budget.notes,
    });
  }),
);

// Create budget
router.post(
  '/budgets',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { name, amount, accountId, costCenterId, fiscalYearId, notes } = req.body;

    if (!name || !accountId) {
      throw new ApiError(400, 'Naam en rekening zijn verplicht.');
    }

    const account = db
      .prepare('SELECT id, account_type FROM accounts WHERE id = ? AND association_id = ?')
      .get(accountId, associationId) as any;
    if (!account) {
      throw new ApiError(400, 'Ongeldige rekening.');
    }

    eisEigenId('costCenter', costCenterId, associationId, 'Ongeldige kostenplaats.');
    eisEigenId('fiscalYear', fiscalYearId, associationId, 'Ongeldig boekjaar.');

    // budgets.fiscal_year_id is verplicht; zonder boekjaar liep de INSERT stuk
    // op de sleutelcontrole in plaats van dat de aanvraag werd afgewezen.
    if (!fiscalYearId) {
      throw new ApiError(400, 'Boekjaar is verplicht.');
    }

    // budgets.budget_type is verplicht maar stond niet in de INSERT, waardoor
    // elk budget strandde op NOT NULL. De soort volgt uit de rekening: op een
    // opbrengstrekening begroot je inkomsten, op de rest uitgaven.
    const budgetType = account.account_type === 'income' ? 'income' : 'expense';

    const budgetId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `
        INSERT INTO budgets (id, association_id, fiscal_year_id, account_id, cost_center_id, name, budget_type, amount, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      budgetId,
      associationId,
      fiscalYearId,
      accountId,
      costCenterId || null,
      name,
      budgetType,
      amount || 0,
      notes || null,
      req.user!.id,
      now,
      now,
    );

    res.status(201).json({
      id: budgetId,
      message: 'Budget aangemaakt.',
    });
  }),
);

// Update budget
router.put(
  '/budgets/:id',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { name, amount, accountId, costCenterId, fiscalYearId, notes } = req.body;

    const budget = db
      .prepare('SELECT id FROM budgets WHERE id = ? AND association_id = ?')
      .get(req.params.id, associationId);
    if (!budget) {
      throw new ApiError(404, 'Budget niet gevonden.');
    }

    // POST /budgets controleert de rekening wel; dat het hier ontbrak was een
    // omissie, geen keuze.
    eisEigenId('account', accountId, associationId, 'Ongeldige rekening.');
    eisEigenId('costCenter', costCenterId, associationId, 'Ongeldige kostenplaats.');
    eisEigenId('fiscalYear', fiscalYearId, associationId, 'Ongeldig boekjaar.');

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (amount !== undefined) {
      updates.push('amount = ?');
      params.push(amount);
    }
    if (accountId !== undefined) {
      updates.push('account_id = ?');
      params.push(accountId);
    }
    if (costCenterId !== undefined) {
      updates.push('cost_center_id = ?');
      params.push(costCenterId || null);
    }
    if (fiscalYearId !== undefined) {
      updates.push('fiscal_year_id = ?');
      params.push(fiscalYearId || null);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(req.params.id);

      db.prepare(`UPDATE budgets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    res.json({ message: 'Budget bijgewerkt.' });
  }),
);

// Delete budget
router.delete(
  '/budgets/:id',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;

    const result = db
      .prepare('DELETE FROM budgets WHERE id = ? AND association_id = ?')
      .run(req.params.id, associationId);

    if (result.changes === 0) {
      throw new ApiError(404, 'Budget niet gevonden.');
    }

    res.json({ message: 'Budget verwijderd.' });
  }),
);

// Budget comparison report
router.get(
  '/reports/budget-comparison',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId } = req.query;

    if (!fiscalYearId) {
      throw new ApiError(400, 'Boekjaar is verplicht.');
    }

    const budgets = db
      .prepare(
        `
        SELECT b.*, a.code AS account_code, a.name AS account_name, cc.name AS cost_center_name
        FROM budgets b
        LEFT JOIN accounts a ON b.account_id = a.id
        LEFT JOIN cost_centers cc ON b.cost_center_id = cc.id
        WHERE b.association_id = ? AND b.fiscal_year_id = ?
        ORDER BY a.code
    `,
      )
      .all(associationId, fiscalYearId);

    const report = budgets.map((b: any) => {
      const actualQuery = `
            SELECT COALESCE(SUM(tl.debit_amount - tl.credit_amount), 0) AS actual
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE t.association_id = ?
              AND tl.account_id = ?
              AND t.fiscal_year_id = ?
              AND t.is_posted = 1
              ${b.cost_center_id ? 'AND tl.cost_center_id = ?' : ''}
        `;
      const actualParams: any[] = [associationId, b.account_id, fiscalYearId];
      if (b.cost_center_id) actualParams.push(b.cost_center_id);

      const actual = db.prepare(actualQuery).get(...actualParams) as any;
      const actualAmount = Math.abs(actual?.actual || 0);
      const variance = b.amount - actualAmount;
      const percentUsed = b.amount > 0 ? (actualAmount / b.amount) * 100 : 0;

      return {
        budgetId: b.id,
        name: b.name,
        accountCode: b.account_code,
        accountName: b.account_name,
        costCenterName: b.cost_center_name,
        budgetAmount: b.amount,
        actualAmount,
        variance,
        percentUsed: Math.round(percentUsed * 10) / 10,
        status: percentUsed > 100 ? 'over' : percentUsed > 80 ? 'warning' : 'ok',
      };
    });

    const totals = {
      totalBudget: report.reduce((sum, r) => sum + r.budgetAmount, 0),
      totalActual: report.reduce((sum, r) => sum + r.actualAmount, 0),
      totalVariance: report.reduce((sum, r) => sum + r.variance, 0),
    };

    res.json({ budgets: report, totals });
  }),
);

// =====================================================
// EXPORT ENDPOINTS
// =====================================================

// Helper function to convert data to CSV
function toCSV(data: any[], columns: { key: string; header: string }[]): string {
  const headers = columns.map((c) => `"${c.header}"`).join(';');
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const value = row[c.key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') return value.toString().replace('.', ',');
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(';'),
  );
  return [headers, ...rows].join('\n');
}

// Export transactions (grootboek)
router.get(
  '/export/transactions',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId, format = 'csv' } = req.query;

    let query = `
        SELECT
            t.transaction_number,
            t.transaction_date,
            t.transaction_type,
            t.reference,
            t.description AS transaction_description,
            tl.description AS line_description,
            a.code AS account_code,
            a.name AS account_name,
            tl.debit_amount,
            tl.credit_amount,
            cc.name AS cost_center
        FROM transactions t
        JOIN transaction_lines tl ON t.id = tl.transaction_id
        JOIN accounts a ON tl.account_id = a.id
        LEFT JOIN cost_centers cc ON tl.cost_center_id = cc.id
        WHERE t.association_id = ?
    `;
    const params: any[] = [associationId];

    if (fiscalYearId) {
      query += ' AND t.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }

    query += ' ORDER BY t.transaction_date, t.transaction_number, a.code';

    const transactions = db.prepare(query).all(...params);

    if (format === 'csv') {
      const csv = toCSV(transactions, [
        { key: 'transaction_number', header: 'Boekstuknummer' },
        { key: 'transaction_date', header: 'Datum' },
        { key: 'transaction_type', header: 'Type' },
        { key: 'reference', header: 'Referentie' },
        { key: 'transaction_description', header: 'Omschrijving' },
        { key: 'account_code', header: 'Rekeningcode' },
        { key: 'account_name', header: 'Rekeningnaam' },
        { key: 'line_description', header: 'Regelomschrijving' },
        { key: 'debit_amount', header: 'Debet' },
        { key: 'credit_amount', header: 'Credit' },
        { key: 'cost_center', header: 'Kostenplaats' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="grootboek_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send('﻿' + csv); // BOM for Excel
    } else {
      res.json(transactions);
    }
  }),
);

// Export chart of accounts (rekeningschema)
router.get(
  '/export/accounts',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId, format = 'csv' } = req.query;

    let balanceQuery = '';
    const params: any[] = [associationId];

    if (fiscalYearId) {
      balanceQuery = `
            LEFT JOIN (
                SELECT tl.account_id,
                       SUM(tl.debit_amount) AS total_debit,
                       SUM(tl.credit_amount) AS total_credit
                FROM transaction_lines tl
                JOIN transactions t ON tl.transaction_id = t.id
                WHERE t.association_id = ? AND t.fiscal_year_id = ?
                GROUP BY tl.account_id
            ) bal ON a.id = bal.account_id
        `;
      params.push(associationId, fiscalYearId);
    }

    const accounts = db
      .prepare(
        `
        SELECT
            a.code,
            a.name,
            a.account_type,
            a.account_subtype,
            a.description,
            a.opening_balance,
            ${fiscalYearId ? 'COALESCE(bal.total_debit, 0) AS total_debit, COALESCE(bal.total_credit, 0) AS total_credit' : '0 AS total_debit, 0 AS total_credit'}
        FROM accounts a
        ${balanceQuery}
        WHERE a.association_id = ?
        ORDER BY a.code
    `,
      )
      .all(...params, associationId);

    const accountsWithBalance = accounts.map((a: any) => ({
      ...a,
      current_balance: (a.opening_balance || 0) + (a.total_debit || 0) - (a.total_credit || 0),
    }));

    if (format === 'csv') {
      const csv = toCSV(accountsWithBalance, [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Naam' },
        { key: 'account_type', header: 'Type' },
        { key: 'account_subtype', header: 'Subtype' },
        { key: 'description', header: 'Omschrijving' },
        { key: 'opening_balance', header: 'Beginsaldo' },
        { key: 'total_debit', header: 'Totaal Debet' },
        { key: 'total_credit', header: 'Totaal Credit' },
        { key: 'current_balance', header: 'Huidig Saldo' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rekeningschema_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send('﻿' + csv);
    } else {
      res.json(accountsWithBalance);
    }
  }),
);

// Export invoices (facturen)
router.get(
  '/export/invoices',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId, format = 'csv' } = req.query;

    let query = `
        SELECT
            i.invoice_number,
            i.invoice_type,
            i.invoice_date,
            i.due_date,
            i.status,
            r.name AS relation_name,
            r.relation_number,
            i.reference,
            i.description,
            i.subtotal,
            i.vat_amount,
            i.total,
            i.amount_paid
        FROM invoices i
        LEFT JOIN accounting_relations r ON i.relation_id = r.id
        WHERE i.association_id = ?
    `;
    const params: any[] = [associationId];

    if (fiscalYearId) {
      query += ' AND i.fiscal_year_id = ?';
      params.push(fiscalYearId);
    }

    query += ' ORDER BY i.invoice_date DESC, i.invoice_number';

    const invoices = db.prepare(query).all(...params);

    if (format === 'csv') {
      const csv = toCSV(invoices, [
        { key: 'invoice_number', header: 'Factuurnummer' },
        { key: 'invoice_type', header: 'Type' },
        { key: 'invoice_date', header: 'Factuurdatum' },
        { key: 'due_date', header: 'Vervaldatum' },
        { key: 'status', header: 'Status' },
        { key: 'relation_name', header: 'Relatie' },
        { key: 'relation_number', header: 'Relatienummer' },
        { key: 'reference', header: 'Referentie' },
        { key: 'description', header: 'Omschrijving' },
        { key: 'subtotal', header: 'Subtotaal' },
        { key: 'vat_amount', header: 'BTW' },
        { key: 'total', header: 'Totaal' },
        { key: 'amount_paid', header: 'Betaald' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="facturen_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send('﻿' + csv);
    } else {
      res.json(invoices);
    }
  }),
);

// Export balance sheet (balans)
router.get(
  '/export/balance-sheet',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId, format = 'csv' } = req.query;

    if (!fiscalYearId) {
      throw new ApiError(400, 'Boekjaar is verplicht.');
    }

    const accounts = db
      .prepare(
        `
        -- Het boekjaar hoort bij het optellen zelf en niet in de ON-clausule
        -- van een LEFT JOIN: daar maakt het t.* leeg maar blijft
        -- tl.debit_amount gewoon meetellen. Zo stond in deze export alles wat
        -- er ooit geboekt is, uit elk boekjaar. Meteen ook de vereniging en de
        -- vlag is_posted erbij: een concept hoort niet in een rapport.
        SELECT
            a.code,
            a.name,
            a.account_type,
            a.account_subtype,
            a.opening_balance,
            COALESCE(bal.total_debit, 0) AS total_debit,
            COALESCE(bal.total_credit, 0) AS total_credit
        FROM accounts a
        LEFT JOIN (
            SELECT tl.account_id,
                SUM(tl.debit_amount) AS total_debit,
                SUM(tl.credit_amount) AS total_credit
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE t.association_id = ? AND t.is_posted = 1 AND t.fiscal_year_id = ?
            GROUP BY tl.account_id
        ) bal ON bal.account_id = a.id
        WHERE a.association_id = ?
          AND a.account_type IN ('asset', 'liability', 'equity')
        ORDER BY a.code
    `,
      )
      .all(associationId, fiscalYearId, associationId);

    const balanceSheet = accounts.map((a: any) => {
      const balance = (a.opening_balance || 0) + a.total_debit - a.total_credit;
      return {
        code: a.code,
        name: a.name,
        account_type: a.account_type,
        account_subtype: a.account_subtype,
        opening_balance: a.opening_balance || 0,
        total_debit: a.total_debit,
        total_credit: a.total_credit,
        current_balance: balance,
      };
    });

    if (format === 'csv') {
      const csv = toCSV(balanceSheet, [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Naam' },
        { key: 'account_type', header: 'Type' },
        { key: 'account_subtype', header: 'Subtype' },
        { key: 'opening_balance', header: 'Beginsaldo' },
        { key: 'total_debit', header: 'Totaal Debet' },
        { key: 'total_credit', header: 'Totaal Credit' },
        { key: 'current_balance', header: 'Eindsaldo' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="balans_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send('﻿' + csv);
    } else {
      res.json(balanceSheet);
    }
  }),
);

// Export profit & loss (winst & verlies)
router.get(
  '/export/profit-loss',
  authenticateToken,
  requireRole('admin', 'board'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { fiscalYearId, format = 'csv' } = req.query;

    if (!fiscalYearId) {
      throw new ApiError(400, 'Boekjaar is verplicht.');
    }

    const accounts = db
      .prepare(
        `
        -- Het boekjaar hoort bij het optellen zelf en niet in de ON-clausule
        -- van een LEFT JOIN: daar maakt het t.* leeg maar blijft
        -- tl.debit_amount gewoon meetellen. Zo stond in deze export alles wat
        -- er ooit geboekt is, uit elk boekjaar. Meteen ook de vereniging en de
        -- vlag is_posted erbij: een concept hoort niet in een rapport.
        SELECT
            a.code,
            a.name,
            a.account_type,
            a.account_subtype,
            COALESCE(bal.total_debit, 0) AS total_debit,
            COALESCE(bal.total_credit, 0) AS total_credit
        FROM accounts a
        LEFT JOIN (
            SELECT tl.account_id,
                SUM(tl.debit_amount) AS total_debit,
                SUM(tl.credit_amount) AS total_credit
            FROM transaction_lines tl
            JOIN transactions t ON tl.transaction_id = t.id
            WHERE t.association_id = ? AND t.is_posted = 1 AND t.fiscal_year_id = ?
            GROUP BY tl.account_id
        ) bal ON bal.account_id = a.id
        WHERE a.association_id = ?
          AND a.account_type IN ('income', 'expense')
        ORDER BY a.account_type DESC, a.code
    `,
      )
      .all(associationId, fiscalYearId, associationId);

    const profitLoss = accounts.map((a: any) => {
      const amount = a.account_type === 'income' ? a.total_credit - a.total_debit : a.total_debit - a.total_credit;
      return {
        code: a.code,
        name: a.name,
        account_type: a.account_type,
        account_subtype: a.account_subtype,
        total_debit: a.total_debit,
        total_credit: a.total_credit,
        amount: amount,
      };
    });

    // Calculate totals
    const totalIncome = profitLoss.filter((a) => a.account_type === 'income').reduce((sum, a) => sum + a.amount, 0);
    const totalExpenses = profitLoss.filter((a) => a.account_type === 'expense').reduce((sum, a) => sum + a.amount, 0);
    const netResult = totalIncome - totalExpenses;

    if (format === 'csv') {
      const dataWithTotals = [
        ...profitLoss,
        {
          code: '',
          name: '--- TOTALEN ---',
          account_type: '',
          account_subtype: '',
          total_debit: 0,
          total_credit: 0,
          amount: 0,
        },
        {
          code: '',
          name: 'Totaal inkomsten',
          account_type: 'income',
          account_subtype: '',
          total_debit: 0,
          total_credit: 0,
          amount: totalIncome,
        },
        {
          code: '',
          name: 'Totaal uitgaven',
          account_type: 'expense',
          account_subtype: '',
          total_debit: 0,
          total_credit: 0,
          amount: totalExpenses,
        },
        {
          code: '',
          name: 'Netto resultaat',
          account_type: 'result',
          account_subtype: '',
          total_debit: 0,
          total_credit: 0,
          amount: netResult,
        },
      ];

      const csv = toCSV(dataWithTotals, [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Naam' },
        { key: 'account_type', header: 'Type' },
        { key: 'account_subtype', header: 'Subtype' },
        { key: 'total_debit', header: 'Totaal Debet' },
        { key: 'total_credit', header: 'Totaal Credit' },
        { key: 'amount', header: 'Bedrag' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="winst_verlies_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send('﻿' + csv);
    } else {
      res.json({ accounts: profitLoss, totals: { totalIncome, totalExpenses, netResult } });
    }
  }),
);

// Export relations (debiteuren/crediteuren)
//
// Deze export bevat IBAN, e-mailadres en woonadres van leden en leveranciers.
// GET /relations laat daar alleen de beheerder bij; dan hoort dezelfde lijst
// als bestand niet ruimer te staan.
router.get(
  '/export/relations',
  authenticateToken,
  requireRole('admin'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    const { format = 'csv' } = req.query;

    const relations = db
      .prepare(
        `
        SELECT
            relation_number,
            name,
            relation_type,
            email,
            phone,
            address_line AS address,
            postal_code,
            city,
            country,
            vat_number,
            iban,
            payment_term_days,
            credit_limit,
            balance
        FROM accounting_relations
        WHERE association_id = ?
        ORDER BY relation_type, name
    `,
      )
      .all(associationId);

    if (format === 'csv') {
      const csv = toCSV(relations, [
        { key: 'relation_number', header: 'Relatienummer' },
        { key: 'name', header: 'Naam' },
        { key: 'relation_type', header: 'Type' },
        { key: 'email', header: 'E-mail' },
        { key: 'phone', header: 'Telefoon' },
        { key: 'address', header: 'Adres' },
        { key: 'postal_code', header: 'Postcode' },
        { key: 'city', header: 'Plaats' },
        { key: 'country', header: 'Land' },
        { key: 'vat_number', header: 'BTW-nummer' },
        { key: 'iban', header: 'IBAN' },
        { key: 'payment_term_days', header: 'Betalingstermijn' },
        { key: 'credit_limit', header: 'Kredietlimiet' },
        { key: 'balance', header: 'Saldo' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="relaties_${new Date().toISOString().split('T')[0]}.csv"`,
      );
      res.send('﻿' + csv);
    } else {
      res.json(relations);
    }
  }),
);

export default router;
