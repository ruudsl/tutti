import api from './client';

// =====================================================
// TYPES
// =====================================================

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type AccountSubtype = 'bank' | 'cash' | 'receivable' | 'payable' | 'inventory' |
  'fixed_asset' | 'current_liability' | 'long_term_liability' | 'retained_earnings' |
  'membership_fees' | 'donations' | 'grants' | 'ticket_sales' | 'sponsoring' |
  'personnel' | 'materials' | 'rent' | 'utilities' | 'insurance' | 'depreciation' | 'other';
export type FiscalYearStatus = 'open' | 'closed' | 'locked';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled' | 'written_off';
export type InvoiceType = 'sales' | 'purchase' | 'credit_note';
export type FeeFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'one_time';

export interface FiscalYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  isCurrent: boolean;
  createdAt: string;
  closedAt?: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  parentId?: string;
  parentName?: string;
  parentCode?: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  openingBalance: number;
  currentBalance: number;
  createdAt: string;
}

export interface MembershipFeeType {
  id: string;
  name: string;
  description?: string;
  amount: number;
  frequency: FeeFrequency;
  ageMin?: number;
  ageMax?: number;
  isDefault: boolean;
  isActive: boolean;
  incomeAccountId?: string;
  incomeAccountCode?: string;
  incomeAccountName?: string;
  activeCount: number;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
  costCenterId?: string;
  costCenterCode?: string;
  costCenterName?: string;
  membershipId?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  fiscalYearId?: string;
  relationId: string;
  relationName: string;
  relationEmail?: string;
  userId?: string;
  userName?: string;
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  reference?: string;
  description?: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentReference?: string;
  notes?: string;
  sentAt?: string;
  paidAt?: string;
  reminderCount: number;
  lastReminderAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  lines?: InvoiceLine[];
}

export interface BalanceReport {
  fiscalYear: { id: string; name: string };
  date: string;
  assets: (Account & { currentBalance: number })[];
  liabilities: (Account & { currentBalance: number })[];
  equity: (Account & { currentBalance: number })[];
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesAndEquity: number;
  };
}

export interface ProfitLossReport {
  fiscalYear: { id: string; name: string };
  period: { start: string; end: string };
  income: (Account & { amount: number })[];
  expenses: (Account & { amount: number })[];
  totals: {
    income: number;
    expenses: number;
    netResult: number;
  };
}

// =====================================================
// CREATE/UPDATE DATA TYPES
// =====================================================

export interface CreateFiscalYearData {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface CreateAccountData {
  code: string;
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  parentId?: string;
  description?: string;
  openingBalance?: number;
}

export interface CreateMembershipFeeTypeData {
  name: string;
  description?: string;
  amount: number;
  frequency: FeeFrequency;
  ageMin?: number;
  ageMax?: number;
  isDefault?: boolean;
  incomeAccountId?: string;
}

export interface CreateInvoiceLineData {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
  accountId?: string;
  costCenterId?: string;
  membershipId?: string;
}

export interface CreateInvoiceData {
  invoiceType: InvoiceType;
  relationId: string;
  userId?: string;
  invoiceDate: string;
  dueDate: string;
  reference?: string;
  description?: string;
  notes?: string;
  lines: CreateInvoiceLineData[];
}

// =====================================================
// FISCAL YEARS API
// =====================================================

export async function getFiscalYears(): Promise<FiscalYear[]> {
  const response = await api.get('/accounting/fiscal-years');
  return response.data;
}

export async function createFiscalYear(data: CreateFiscalYearData): Promise<{ id: string; message: string }> {
  const response = await api.post('/accounting/fiscal-years', data);
  return response.data;
}

export async function updateFiscalYear(id: string, data: Partial<CreateFiscalYearData>): Promise<{ message: string }> {
  const response = await api.put(`/accounting/fiscal-years/${id}`, data);
  return response.data;
}

export async function closeFiscalYear(id: string): Promise<{ message: string }> {
  const response = await api.post(`/accounting/fiscal-years/${id}/close`);
  return response.data;
}

// =====================================================
// ACCOUNTS API
// =====================================================

export async function getAccounts(): Promise<Account[]> {
  const response = await api.get('/accounting/accounts');
  return response.data;
}

export async function createAccount(data: CreateAccountData): Promise<{ id: string; message: string }> {
  const response = await api.post('/accounting/accounts', data);
  return response.data;
}

export async function updateAccount(id: string, data: Partial<CreateAccountData>): Promise<{ message: string }> {
  const response = await api.put(`/accounting/accounts/${id}`, data);
  return response.data;
}

export async function deleteAccount(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/accounts/${id}`);
  return response.data;
}

export async function initializeAccounts(): Promise<{ message: string; count: number }> {
  const response = await api.post('/accounting/accounts/initialize');
  return response.data;
}

// =====================================================
// MEMBERSHIP FEE TYPES API
// =====================================================

export async function getMembershipFeeTypes(): Promise<MembershipFeeType[]> {
  const response = await api.get('/accounting/membership-fee-types');
  return response.data;
}

export async function createMembershipFeeType(data: CreateMembershipFeeTypeData): Promise<{ id: string; message: string }> {
  const response = await api.post('/accounting/membership-fee-types', data);
  return response.data;
}

export async function updateMembershipFeeType(id: string, data: Partial<CreateMembershipFeeTypeData>): Promise<{ message: string }> {
  const response = await api.put(`/accounting/membership-fee-types/${id}`, data);
  return response.data;
}

export async function deleteMembershipFeeType(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/membership-fee-types/${id}`);
  return response.data;
}

// =====================================================
// INVOICES API
// =====================================================

export async function getInvoices(filters?: {
  status?: InvoiceStatus;
  type?: InvoiceType;
  fiscalYearId?: string;
  relationId?: string;
}): Promise<Invoice[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.fiscalYearId) params.append('fiscalYearId', filters.fiscalYearId);
  if (filters?.relationId) params.append('relationId', filters.relationId);

  const response = await api.get(`/accounting/invoices?${params.toString()}`);
  return response.data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const response = await api.get(`/accounting/invoices/${id}`);
  return response.data;
}

export async function createInvoice(data: CreateInvoiceData): Promise<{ id: string; invoiceNumber: string; message: string }> {
  const response = await api.post('/accounting/invoices', data);
  return response.data;
}

export async function sendInvoice(id: string): Promise<{ message: string }> {
  const response = await api.post(`/accounting/invoices/${id}/send`);
  return response.data;
}

export async function markInvoicePaid(id: string, amount?: number, paymentDate?: string): Promise<{ message: string }> {
  const response = await api.post(`/accounting/invoices/${id}/mark-paid`, { amount, paymentDate });
  return response.data;
}

export async function deleteInvoice(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/invoices/${id}`);
  return response.data;
}

// =====================================================
// REPORTS API
// =====================================================

export async function getBalanceReport(fiscalYearId?: string, date?: string): Promise<BalanceReport> {
  const params = new URLSearchParams();
  if (fiscalYearId) params.append('fiscalYearId', fiscalYearId);
  if (date) params.append('date', date);

  const response = await api.get(`/accounting/reports/balance?${params.toString()}`);
  return response.data;
}

export async function getProfitLossReport(fiscalYearId?: string, startDate?: string, endDate?: string): Promise<ProfitLossReport> {
  const params = new URLSearchParams();
  if (fiscalYearId) params.append('fiscalYearId', fiscalYearId);
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const response = await api.get(`/accounting/reports/profit-loss?${params.toString()}`);
  return response.data;
}

// =====================================================
// TRANSACTIONS
// =====================================================

export type TransactionType = 'journal' | 'payment' | 'receipt' | 'bank' | 'transfer';

export interface TransactionLine {
  id?: string;
  lineNumber?: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  accountType?: AccountType;
  costCenterId?: string;
  costCenterCode?: string;
  costCenterName?: string;
  description?: string;
  debitAmount: number;
  creditAmount: number;
}

export interface Transaction {
  id: string;
  transactionNumber: string;
  fiscalYearId?: string;
  transactionDate: string;
  transactionType: TransactionType;
  reference?: string;
  description: string;
  totalAmount: number;
  isPosted: boolean;
  isReconciled: boolean;
  invoiceId?: string;
  bankStatementId?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  lines?: TransactionLine[];
}

export interface CreateTransactionData {
  transactionDate: string;
  transactionType: TransactionType;
  reference?: string;
  description: string;
  invoiceId?: string;
  lines: Omit<TransactionLine, 'id' | 'lineNumber' | 'accountCode' | 'accountName' | 'accountType' | 'costCenterCode' | 'costCenterName'>[];
}

export interface TransactionFilters {
  fiscalYearId?: string;
  accountId?: string;
  startDate?: string;
  endDate?: string;
  transactionType?: TransactionType;
  search?: string;
}

export async function getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (filters?.fiscalYearId) params.append('fiscalYearId', filters.fiscalYearId);
  if (filters?.accountId) params.append('accountId', filters.accountId);
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.transactionType) params.append('transactionType', filters.transactionType);
  if (filters?.search) params.append('search', filters.search);

  const response = await api.get(`/accounting/transactions?${params.toString()}`);
  return response.data;
}

export async function getTransaction(id: string): Promise<Transaction> {
  const response = await api.get(`/accounting/transactions/${id}`);
  return response.data;
}

export async function createTransaction(data: CreateTransactionData): Promise<{ id: string; transactionNumber: string; message: string }> {
  const response = await api.post('/accounting/transactions', data);
  return response.data;
}

export async function updateTransaction(id: string, data: CreateTransactionData): Promise<{ message: string }> {
  const response = await api.put(`/accounting/transactions/${id}`, data);
  return response.data;
}

export async function deleteTransaction(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/transactions/${id}`);
  return response.data;
}

export async function postTransaction(id: string): Promise<{ message: string }> {
  const response = await api.post(`/accounting/transactions/${id}/post`);
  return response.data;
}

// =====================================================
// BANK STATEMENTS
// =====================================================

export type BankStatementStatus = 'imported' | 'processing' | 'reconciled' | 'closed';
export type BankImportFormat = 'mt940' | 'camt053' | 'csv';

export interface BankStatement {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  statementDate: string;
  importFileName?: string;
  status: BankStatementStatus;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  importedAt: string;
}

export interface BankStatementLine {
  id: string;
  lineNumber: number;
  bookingDate: string;
  valueDate?: string;
  description: string;
  amount: number;
  reference?: string;
  counterpartyName?: string;
  counterpartyIban?: string;
  status: 'pending' | 'matched' | 'manual' | 'ignored';
  transactionId?: string;
  transactionNumber?: string;
  matchedInvoiceId?: string;
}

export interface BankStatementDetail {
  statement: {
    id: string;
    statementDate: string;
    status: BankStatementStatus;
    totalDebit: number;
    totalCredit: number;
  };
  entries: BankStatementLine[];
}

export async function importBankStatement(
  accountId: string,
  format: BankImportFormat,
  content: string
): Promise<{ id: string; entryCount: number; totalDebit: number; totalCredit: number; message: string }> {
  const response = await api.post('/accounting/bank-import', { accountId, format, content });
  return response.data;
}

export async function getBankStatements(): Promise<BankStatement[]> {
  const response = await api.get('/accounting/bank-statements');
  return response.data;
}

export async function getBankStatementEntries(statementId: string): Promise<BankStatementDetail> {
  const response = await api.get(`/accounting/bank-statements/${statementId}/entries`);
  return response.data;
}

export async function bookBankLine(
  statementId: string,
  lineId: string,
  counterAccountId: string,
  costCenterId?: string
): Promise<{ transactionId: string; transactionNumber: string; message: string }> {
  const response = await api.post(`/accounting/bank-statements/${statementId}/lines/${lineId}/book`, {
    counterAccountId,
    costCenterId,
  });
  return response.data;
}

// =====================================================
// ADDITIONAL REPORTS
// =====================================================

export interface LedgerEntry {
  transactionNumber: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  costCenter?: string;
}

export interface AccountLedgerReport {
  account: {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    openingBalance: number;
  };
  entries: LedgerEntry[];
  closingBalance: number;
}

export interface AgingInvoice {
  id: string;
  invoiceNumber: string;
  relationName: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  daysOverdue: number;
}

export interface AgingBucket {
  invoices: AgingInvoice[];
  total: number;
}

export interface AgingReport {
  asOfDate: string;
  buckets: {
    current: AgingBucket;
    days1to30: AgingBucket;
    days31to60: AgingBucket;
    days61to90: AgingBucket;
    over90: AgingBucket;
  };
  grandTotal: number;
}

export async function getAccountLedger(accountId: string, startDate?: string, endDate?: string): Promise<AccountLedgerReport> {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const response = await api.get(`/accounting/reports/account-ledger/${accountId}?${params.toString()}`);
  return response.data;
}

export async function getAgingReport(): Promise<AgingReport> {
  const response = await api.get('/accounting/reports/aging');
  return response.data;
}

// =====================================================
// SEPA PAYMENTS
// =====================================================

export type SepaBatchType = 'DD' | 'CT';
export type SepaBatchStatus = 'draft' | 'generated' | 'submitted' | 'processed' | 'failed';

export interface SepaBatch {
  id: string;
  batchReference: string;
  batchType: SepaBatchType;
  collectionDate: string;
  bankAccountId: string;
  accountCode?: string;
  accountName?: string;
  totalAmount: number;
  transactionCount: number;
  status: SepaBatchStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  generatedAt?: string;
  processedAt?: string;
}

export async function generateSepaBatch(
  paymentType: 'credit_transfer' | 'direct_debit',
  executionDate: string,
  bankAccountId: string,
  invoiceIds: string[]
): Promise<{ id: string; transactionCount: number; totalAmount: number; message: string }> {
  const response = await api.post('/accounting/sepa/generate', {
    paymentType,
    executionDate,
    bankAccountId,
    invoiceIds,
  });
  return response.data;
}

export async function getSepaBatches(): Promise<SepaBatch[]> {
  const response = await api.get('/accounting/sepa/batches');
  return response.data;
}

export async function downloadSepaBatch(batchId: string): Promise<Blob> {
  const response = await api.get(`/accounting/sepa/batches/${batchId}/download`, {
    responseType: 'blob',
  });
  return response.data;
}

// =====================================================
// RELATIONS (DEBTORS/CREDITORS)
// =====================================================

export type RelationType = 'customer' | 'supplier' | 'both';

export interface AccountingRelation {
  id: string;
  relationType: RelationType;
  userId?: string;
  contactId?: string;
  relationNumber?: string;
  name: string;
  email?: string;
  phone?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  iban?: string;
  vatNumber?: string;
  paymentTermDays: number;
  receivableAccountId?: string;
  payableAccountId?: string;
  creditLimit?: number;
  balance: number;
  isActive: boolean;
  createdAt: string;
}

export async function getRelations(): Promise<AccountingRelation[]> {
  const response = await api.get('/accounting/relations');
  return response.data;
}

export async function getRelation(id: string): Promise<AccountingRelation> {
  const response = await api.get(`/accounting/relations/${id}`);
  return response.data;
}

export async function createRelation(data: Partial<AccountingRelation>): Promise<{ id: string; message: string }> {
  const response = await api.post('/accounting/relations', data);
  return response.data;
}

export async function updateRelation(id: string, data: Partial<AccountingRelation>): Promise<{ message: string }> {
  const response = await api.put(`/accounting/relations/${id}`, data);
  return response.data;
}

export async function deleteRelation(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/relations/${id}`);
  return response.data;
}

// =====================================================
// COST CENTERS
// =====================================================

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  orchestraId?: string;
  orchestraName?: string;
  isActive: boolean;
  budgetAmount?: number;
  createdAt: string;
}

export async function getCostCenters(): Promise<CostCenter[]> {
  const response = await api.get('/accounting/cost-centers');
  return response.data;
}

export async function getCostCenter(id: string): Promise<CostCenter> {
  const response = await api.get(`/accounting/cost-centers/${id}`);
  return response.data;
}

export async function createCostCenter(data: Partial<CostCenter>): Promise<{ id: string; message: string }> {
  const response = await api.post('/accounting/cost-centers', data);
  return response.data;
}

export async function updateCostCenter(id: string, data: Partial<CostCenter>): Promise<{ message: string }> {
  const response = await api.put(`/accounting/cost-centers/${id}`, data);
  return response.data;
}

export async function deleteCostCenter(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/cost-centers/${id}`);
  return response.data;
}

// =====================================================
// BUDGETS
// =====================================================

export interface Budget {
  id: string;
  name: string;
  amount: number;
  actual: number;
  remaining: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  costCenterId?: string;
  costCenterName?: string;
  fiscalYearId?: string;
  fiscalYearName?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export async function getBudgets(filters?: { fiscalYearId?: string }): Promise<Budget[]> {
  const params = new URLSearchParams();
  if (filters?.fiscalYearId) params.append('fiscalYearId', filters.fiscalYearId);
  const response = await api.get(`/accounting/budgets?${params.toString()}`);
  return response.data;
}

export async function getBudget(id: string): Promise<Budget> {
  const response = await api.get(`/accounting/budgets/${id}`);
  return response.data;
}

export async function createBudget(data: Partial<Budget>): Promise<{ id: string; message: string }> {
  const response = await api.post('/accounting/budgets', data);
  return response.data;
}

export async function updateBudget(id: string, data: Partial<Budget>): Promise<{ message: string }> {
  const response = await api.put(`/accounting/budgets/${id}`, data);
  return response.data;
}

export async function deleteBudget(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/accounting/budgets/${id}`);
  return response.data;
}
