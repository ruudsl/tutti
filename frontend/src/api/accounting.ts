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
