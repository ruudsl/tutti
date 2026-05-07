import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import { authenticateToken, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler, ApiError } from '../middleware/errorHandler';
import { logAuditEvent } from './audit-logs';
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
    accountSubtype: z.enum([
        'bank', 'cash', 'receivable', 'payable', 'inventory',
        'fixed_asset', 'current_liability', 'long_term_liability',
        'retained_earnings', 'membership_fees', 'donations', 'grants',
        'ticket_sales', 'sponsoring', 'personnel', 'materials', 'rent',
        'utilities', 'insurance', 'depreciation', 'other'
    ]).optional().nullable(),
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
    lines: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().min(0),
        unitPrice: z.number(),
        vatRate: z.number().min(0).max(100).optional(),
        accountId: z.string().uuid().optional().nullable(),
        costCenterId: z.string().uuid().optional().nullable(),
        membershipId: z.string().uuid().optional().nullable(),
    })).min(1, 'Minimaal één regel vereist.'),
});

const transactionSchema = z.object({
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ongeldige datum.'),
    transactionType: z.enum(['journal', 'payment', 'receipt', 'bank', 'transfer']),
    reference: z.string().optional(),
    description: z.string().min(1, 'Omschrijving is verplicht.'),
    invoiceId: z.string().uuid().optional().nullable(),
    lines: z.array(z.object({
        accountId: z.string().uuid(),
        costCenterId: z.string().uuid().optional().nullable(),
        description: z.string().optional(),
        debitAmount: z.number().min(0).optional(),
        creditAmount: z.number().min(0).optional(),
    })).min(2, 'Minimaal twee regels vereist.'),
});

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
router.get('/fiscal-years', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const years = db.prepare(`
        SELECT * FROM fiscal_years WHERE association_id = ? ORDER BY start_date DESC
    `).all(associationId);

    res.json(years.map((y: any) => ({
        id: y.id,
        name: y.name,
        startDate: y.start_date,
        endDate: y.end_date,
        status: y.status,
        isCurrent: !!y.is_current,
        createdAt: y.created_at,
        closedAt: y.closed_at,
    })));
}));

router.post('/fiscal-years', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = fiscalYearSchema.parse(req.body);
    const id = uuidv4();

    if (data.isCurrent) {
        db.prepare('UPDATE fiscal_years SET is_current = 0 WHERE association_id = ?').run(associationId);
    }

    db.prepare(`
        INSERT INTO fiscal_years (id, association_id, name, start_date, end_date, is_current)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.name, data.startDate, data.endDate, data.isCurrent ? 1 : 0);

    await logAuditEvent(req.user!.id, 'create', 'fiscal_year', id, data.name);
    res.status(201).json({ id, message: 'Boekjaar aangemaakt.' });
}));

router.put('/fiscal-years/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Boekjaar niet gevonden.');
    if (existing.status === 'locked') throw new ApiError(400, 'Vergrendeld boekjaar kan niet worden bewerkt.');

    const data = fiscalYearSchema.partial().parse(req.body);

    if (data.isCurrent) {
        db.prepare('UPDATE fiscal_years SET is_current = 0 WHERE association_id = ?').run(associationId);
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.startDate !== undefined) { updates.push('start_date = ?'); params.push(data.startDate); }
    if (data.endDate !== undefined) { updates.push('end_date = ?'); params.push(data.endDate); }
    if (data.isCurrent !== undefined) { updates.push('is_current = ?'); params.push(data.isCurrent ? 1 : 0); }

    if (updates.length > 0) {
        params.push(req.params.id, associationId);
        db.prepare(`UPDATE fiscal_years SET ${updates.join(', ')} WHERE id = ? AND association_id = ?`).run(...params);
    }

    await logAuditEvent(req.user!.id, 'update', 'fiscal_year', req.params.id, data.name || existing.name);
    res.json({ message: 'Boekjaar bijgewerkt.' });
}));

router.post('/fiscal-years/:id/close', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Boekjaar niet gevonden.');
    if (existing.status !== 'open') throw new ApiError(400, 'Boekjaar is al afgesloten.');

    db.prepare(`
        UPDATE fiscal_years SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    await logAuditEvent(req.user!.id, 'close', 'fiscal_year', req.params.id, existing.name);
    res.json({ message: 'Boekjaar afgesloten.' });
}));

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
router.get('/accounts', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const accounts = db.prepare(`
        SELECT a.*, p.name AS parent_name, p.code AS parent_code
        FROM accounts a
        LEFT JOIN accounts p ON a.parent_id = p.id
        WHERE a.association_id = ?
        ORDER BY a.code
    `).all(associationId);

    res.json(accounts.map((a: any) => ({
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
    })));
}));

router.post('/accounts', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = accountSchema.parse(req.body);
    const id = uuidv4();

    const existing = db.prepare('SELECT id FROM accounts WHERE association_id = ? AND code = ?')
        .get(associationId, data.code);
    if (existing) throw new ApiError(409, 'Rekeningcode bestaat al.');

    db.prepare(`
        INSERT INTO accounts (id, association_id, code, name, account_type, account_subtype, parent_id, description, opening_balance, current_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.code, data.name, data.accountType, data.accountSubtype || null,
        data.parentId || null, data.description || null, data.openingBalance || 0, data.openingBalance || 0);

    await logAuditEvent(req.user!.id, 'create', 'account', id, `${data.code} - ${data.name}`);
    res.status(201).json({ id, message: 'Rekening aangemaakt.' });
}));

router.put('/accounts/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Rekening niet gevonden.');
    if (existing.is_system) throw new ApiError(400, 'Systeemrekening kan niet worden bewerkt.');

    const data = accountSchema.partial().parse(req.body);

    if (data.code && data.code !== existing.code) {
        const duplicate = db.prepare('SELECT id FROM accounts WHERE association_id = ? AND code = ? AND id != ?')
            .get(associationId, data.code, req.params.id);
        if (duplicate) throw new ApiError(409, 'Rekeningcode bestaat al.');
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (data.code !== undefined) { updates.push('code = ?'); params.push(data.code); }
    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.accountType !== undefined) { updates.push('account_type = ?'); params.push(data.accountType); }
    if (data.accountSubtype !== undefined) { updates.push('account_subtype = ?'); params.push(data.accountSubtype); }
    if (data.parentId !== undefined) { updates.push('parent_id = ?'); params.push(data.parentId); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }

    params.push(req.params.id, associationId);
    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ? AND association_id = ?`).run(...params);

    await logAuditEvent(req.user!.id, 'update', 'account', req.params.id, `${data.code || existing.code} - ${data.name || existing.name}`);
    res.json({ message: 'Rekening bijgewerkt.' });
}));

router.delete('/accounts/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Rekening niet gevonden.');
    if (existing.is_system) throw new ApiError(400, 'Systeemrekening kan niet worden verwijderd.');

    const hasTransactions = db.prepare('SELECT 1 FROM transaction_lines WHERE account_id = ? LIMIT 1')
        .get(req.params.id);
    if (hasTransactions) throw new ApiError(400, 'Rekening heeft transacties en kan niet worden verwijderd.');

    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
    await logAuditEvent(req.user!.id, 'delete', 'account', req.params.id, `${existing.code} - ${existing.name}`);
    res.json({ message: 'Rekening verwijderd.' });
}));

// Initialize default chart of accounts
router.post('/accounts/initialize', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT COUNT(*) as count FROM accounts WHERE association_id = ?')
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
}));

// =====================================================
// MEMBERSHIP FEE TYPES
// =====================================================

router.get('/membership-fee-types', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const types = db.prepare(`
        SELECT mft.*, a.code AS account_code, a.name AS account_name,
            (SELECT COUNT(*) FROM memberships WHERE fee_type_id = mft.id AND status = 'active') AS active_count
        FROM membership_fee_types mft
        LEFT JOIN accounts a ON mft.income_account_id = a.id
        WHERE mft.association_id = ?
        ORDER BY mft.name
    `).all(associationId);

    res.json(types.map((t: any) => ({
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
    })));
}));

router.post('/membership-fee-types', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = membershipFeeTypeSchema.parse(req.body);
    const id = uuidv4();

    if (data.isDefault) {
        db.prepare('UPDATE membership_fee_types SET is_default = 0 WHERE association_id = ?').run(associationId);
    }

    db.prepare(`
        INSERT INTO membership_fee_types (id, association_id, name, description, amount, frequency, age_min, age_max, is_default, income_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, associationId, data.name, data.description || null, data.amount, data.frequency,
        data.ageMin || null, data.ageMax || null, data.isDefault ? 1 : 0, data.incomeAccountId || null);

    await logAuditEvent(req.user!.id, 'create', 'membership_fee_type', id, data.name);
    res.status(201).json({ id, message: 'Contributiecategorie aangemaakt.' });
}));

router.put('/membership-fee-types/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT * FROM membership_fee_types WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Contributiecategorie niet gevonden.');

    const data = membershipFeeTypeSchema.partial().parse(req.body);

    if (data.isDefault) {
        db.prepare('UPDATE membership_fee_types SET is_default = 0 WHERE association_id = ?').run(associationId);
    }

    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.amount !== undefined) { updates.push('amount = ?'); params.push(data.amount); }
    if (data.frequency !== undefined) { updates.push('frequency = ?'); params.push(data.frequency); }
    if (data.ageMin !== undefined) { updates.push('age_min = ?'); params.push(data.ageMin); }
    if (data.ageMax !== undefined) { updates.push('age_max = ?'); params.push(data.ageMax); }
    if (data.isDefault !== undefined) { updates.push('is_default = ?'); params.push(data.isDefault ? 1 : 0); }
    if (data.incomeAccountId !== undefined) { updates.push('income_account_id = ?'); params.push(data.incomeAccountId); }

    params.push(req.params.id, associationId);
    db.prepare(`UPDATE membership_fee_types SET ${updates.join(', ')} WHERE id = ? AND association_id = ?`).run(...params);

    await logAuditEvent(req.user!.id, 'update', 'membership_fee_type', req.params.id, data.name || existing.name);
    res.json({ message: 'Contributiecategorie bijgewerkt.' });
}));

router.delete('/membership-fee-types/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const existing = db.prepare('SELECT * FROM membership_fee_types WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!existing) throw new ApiError(404, 'Contributiecategorie niet gevonden.');

    const hasMembers = db.prepare('SELECT 1 FROM memberships WHERE fee_type_id = ? LIMIT 1').get(req.params.id);
    if (hasMembers) throw new ApiError(400, 'Categorie heeft leden en kan niet worden verwijderd.');

    db.prepare('DELETE FROM membership_fee_types WHERE id = ?').run(req.params.id);
    await logAuditEvent(req.user!.id, 'delete', 'membership_fee_type', req.params.id, existing.name);
    res.json({ message: 'Contributiecategorie verwijderd.' });
}));

// =====================================================
// INVOICES
// =====================================================

router.get('/invoices', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
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

    if (status) { query += ' AND i.status = ?'; params.push(status); }
    if (type) { query += ' AND i.invoice_type = ?'; params.push(type); }
    if (fiscalYearId) { query += ' AND i.fiscal_year_id = ?'; params.push(fiscalYearId); }
    if (relationId) { query += ' AND i.relation_id = ?'; params.push(relationId); }

    query += ' ORDER BY i.invoice_date DESC, i.invoice_number DESC';

    const invoices = db.prepare(query).all(...params);

    res.json(invoices.map((i: any) => ({
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
    })));
}));

router.get('/invoices/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db.prepare(`
        SELECT i.*, r.name AS relation_name, r.email AS relation_email,
            u.first_name || ' ' || u.last_name AS user_name,
            c.first_name || ' ' || c.last_name AS created_by_name
        FROM invoices i
        LEFT JOIN accounting_relations r ON i.relation_id = r.id
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN users c ON i.created_by = c.id
        WHERE i.id = ? AND i.association_id = ?
    `).get(req.params.id, associationId) as any;

    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');

    const lines = db.prepare(`
        SELECT il.*, a.code AS account_code, a.name AS account_name,
            cc.code AS cost_center_code, cc.name AS cost_center_name
        FROM invoice_lines il
        LEFT JOIN accounts a ON il.account_id = a.id
        LEFT JOIN cost_centers cc ON il.cost_center_id = cc.id
        WHERE il.invoice_id = ?
        ORDER BY il.line_number
    `).all(req.params.id);

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
}));

router.post('/invoices', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const data = invoiceSchema.parse(req.body);

    // Get current fiscal year
    const fiscalYear = db.prepare(`
        SELECT id FROM fiscal_years WHERE association_id = ? AND is_current = 1 AND status = 'open'
    `).get(associationId) as any;
    if (!fiscalYear) throw new ApiError(400, 'Geen actief boekjaar gevonden.');

    // Generate invoice number
    const lastInvoice = db.prepare(`
        SELECT invoice_number FROM invoices WHERE association_id = ? AND fiscal_year_id = ?
        ORDER BY invoice_number DESC LIMIT 1
    `).get(associationId, fiscalYear.id) as any;

    const year = new Date().getFullYear();
    const prefix = data.invoiceType === 'sales' ? 'F' : data.invoiceType === 'purchase' ? 'I' : 'C';
    let nextNumber = 1;
    if (lastInvoice) {
        const match = lastInvoice.invoice_number.match(/\d+$/);
        if (match) nextNumber = parseInt(match[0]) + 1;
    }
    const invoiceNumber = `${prefix}${year}-${String(nextNumber).padStart(4, '0')}`;

    // Calculate totals
    let subtotal = 0;
    let vatAmount = 0;
    for (const line of data.lines) {
        const lineTotal = line.quantity * line.unitPrice;
        const lineVat = lineTotal * ((line.vatRate || 0) / 100);
        subtotal += lineTotal;
        vatAmount += lineVat;
    }
    const total = subtotal + vatAmount;

    const invoiceId = uuidv4();

    db.prepare(`
        INSERT INTO invoices (id, association_id, fiscal_year_id, invoice_number, invoice_type, relation_id, user_id,
            status, invoice_date, due_date, reference, description, subtotal, vat_amount, total, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, associationId, fiscalYear.id, invoiceNumber, data.invoiceType, data.relationId,
        data.userId || null, data.invoiceDate, data.dueDate, data.reference || null, data.description || null,
        subtotal, vatAmount, total, data.notes || null, req.user!.id);

    // Insert lines
    const lineStmt = db.prepare(`
        INSERT INTO invoice_lines (id, invoice_id, line_number, description, quantity, unit_price, vat_rate, vat_amount, line_total, account_id, cost_center_id, membership_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    data.lines.forEach((line, index) => {
        const lineTotal = line.quantity * line.unitPrice;
        const lineVat = lineTotal * ((line.vatRate || 0) / 100);
        lineStmt.run(uuidv4(), invoiceId, index + 1, line.description, line.quantity, line.unitPrice,
            line.vatRate || 0, lineVat, lineTotal, line.accountId || null, line.costCenterId || null, line.membershipId || null);
    });

    await logAuditEvent(req.user!.id, 'create', 'invoice', invoiceId, invoiceNumber);
    res.status(201).json({ id: invoiceId, invoiceNumber, message: 'Factuur aangemaakt.' });
}));

router.post('/invoices/:id/send', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');
    if (invoice.status !== 'draft') throw new ApiError(400, 'Alleen concept-facturen kunnen worden verzonden.');

    db.prepare(`
        UPDATE invoices SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(req.params.id);

    // TODO: Actually send the invoice via email

    await logAuditEvent(req.user!.id, 'send', 'invoice', req.params.id, invoice.invoice_number);
    res.json({ message: 'Factuur verzonden.' });
}));

router.post('/invoices/:id/mark-paid', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');
    if (invoice.status === 'paid') throw new ApiError(400, 'Factuur is al betaald.');

    const { amount, paymentDate } = req.body;
    const paymentAmount = amount || invoice.total - invoice.amount_paid;

    const newAmountPaid = invoice.amount_paid + paymentAmount;
    const newStatus = newAmountPaid >= invoice.total ? 'paid' : 'partial';

    db.prepare(`
        UPDATE invoices SET status = ?, amount_paid = ?, paid_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(newStatus, newAmountPaid, newStatus === 'paid' ? (paymentDate || new Date().toISOString()) : null, req.params.id);

    await logAuditEvent(req.user!.id, 'payment', 'invoice', req.params.id, `${invoice.invoice_number} - €${paymentAmount}`);
    res.json({ message: newStatus === 'paid' ? 'Factuur volledig betaald.' : 'Betaling geregistreerd.' });
}));

router.delete('/invoices/:id', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND association_id = ?')
        .get(req.params.id, associationId) as any;
    if (!invoice) throw new ApiError(404, 'Factuur niet gevonden.');
    if (invoice.status !== 'draft') throw new ApiError(400, 'Alleen concept-facturen kunnen worden verwijderd.');

    db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);

    await logAuditEvent(req.user!.id, 'delete', 'invoice', req.params.id, invoice.invoice_number);
    res.json({ message: 'Factuur verwijderd.' });
}));

// =====================================================
// REPORTS
// =====================================================

router.get('/reports/balance', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { fiscalYearId, date } = req.query;

    let fiscalYear: any;
    if (fiscalYearId) {
        fiscalYear = db.prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
            .get(fiscalYearId, associationId);
    } else {
        fiscalYear = db.prepare('SELECT * FROM fiscal_years WHERE association_id = ? AND is_current = 1')
            .get(associationId);
    }

    if (!fiscalYear) throw new ApiError(404, 'Boekjaar niet gevonden.');

    const endDate = date || fiscalYear.end_date;

    const accounts = db.prepare(`
        SELECT a.id, a.code, a.name, a.account_type, a.account_subtype, a.opening_balance,
            COALESCE(SUM(tl.debit_amount), 0) AS total_debit,
            COALESCE(SUM(tl.credit_amount), 0) AS total_credit
        FROM accounts a
        LEFT JOIN transaction_lines tl ON tl.account_id = a.id
        LEFT JOIN transactions t ON tl.transaction_id = t.id AND t.transaction_date <= ?
        WHERE a.association_id = ? AND a.is_active = 1
        GROUP BY a.id
        ORDER BY a.code
    `).all(endDate, associationId);

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
}));

router.get('/reports/profit-loss', authenticateToken, requireRole('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
    const associationId = req.user!.associationId;
    if (!associationId) throw new ApiError(400, 'Geen vereniging.');

    const { fiscalYearId, startDate, endDate } = req.query;

    let fiscalYear: any;
    if (fiscalYearId) {
        fiscalYear = db.prepare('SELECT * FROM fiscal_years WHERE id = ? AND association_id = ?')
            .get(fiscalYearId, associationId);
    } else {
        fiscalYear = db.prepare('SELECT * FROM fiscal_years WHERE association_id = ? AND is_current = 1')
            .get(associationId);
    }

    if (!fiscalYear) throw new ApiError(404, 'Boekjaar niet gevonden.');

    const start = startDate || fiscalYear.start_date;
    const end = endDate || fiscalYear.end_date;

    const accounts = db.prepare(`
        SELECT a.id, a.code, a.name, a.account_type, a.account_subtype,
            COALESCE(SUM(tl.debit_amount), 0) AS total_debit,
            COALESCE(SUM(tl.credit_amount), 0) AS total_credit
        FROM accounts a
        LEFT JOIN transaction_lines tl ON tl.account_id = a.id
        LEFT JOIN transactions t ON tl.transaction_id = t.id
            AND t.transaction_date >= ? AND t.transaction_date <= ?
        WHERE a.association_id = ? AND a.is_active = 1
            AND a.account_type IN ('income', 'expense')
        GROUP BY a.id
        ORDER BY a.code
    `).all(start, end, associationId);

    const income: any[] = [];
    const expenses: any[] = [];
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const acc of accounts as any[]) {
        const amount = acc.account_type === 'income'
            ? acc.total_credit - acc.total_debit
            : acc.total_debit - acc.total_credit;

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
}));

export default router;
