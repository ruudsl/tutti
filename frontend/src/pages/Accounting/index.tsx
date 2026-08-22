import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../../hooks/useConfirm';
import { Icon, IconName } from '../../components/Icon';
import {
  getFiscalYears,
  createFiscalYear,
  getAccounts,
  getInvoices,
  deleteAccount,
  initializeAccounts,
  getBalanceReport,
  getProfitLossReport,
  getTransactions,
  getRelations,
  getCostCenters,
  getBudgets,
  deleteTransaction,
  postTransaction,
  getTransaction,
  sendInvoice,
  markInvoicePaid,
  deleteInvoice,
  exportTransactions,
  exportAccounts,
  exportInvoices,
  exportBalanceSheet,
  exportProfitLoss,
  exportRelations,
  Account,
  AccountType,
  Transaction,
  Invoice,
} from '../../api/accounting';
import InvoicePrinter from '../../components/InvoicePrinter';
import { showSuccess, showError } from '../../utils/toast';
import { SkeletonTable } from '../../components/Skeleton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { currentLocale } from '../../utils/locale';
import { AccountModal } from './AccountModal';
import { TransactionModal } from './TransactionModal';
import { InvoiceModal } from './InvoiceModal';
import { RelationModal } from './RelationModal';
import { CostCenterModal } from './CostCenterModal';
import { BudgetModal } from './BudgetModal';
import { FiscalYearModal } from './FiscalYearModal';
import { formatCurrency } from './formatteer';
import { RapportagesTab } from './RapportagesTab';
import { BudgettenTab } from './BudgettenTab';
import { KostenplaatsenTab } from './KostenplaatsenTab';
import { RelatiesTab } from './RelatiesTab';
import { FacturenTab } from './FacturenTab';
import { BoekingenTab } from './BoekingenTab';

type TabType = 'overview' | 'chart' | 'transactions' | 'invoices' | 'relations' | 'costcenters' | 'budgets' | 'reports';

const ACCOUNT_TYPE_ICONS: Record<AccountType, IconName> = {
  asset: 'creditCard',
  liability: 'clipboard',
  equity: 'building',
  income: 'plus',
  expense: 'arrow',
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  asset: 'text-info',
  liability: 'text-warning',
  equity: 'text-primary',
  income: 'text-success',
  expense: 'text-error',
};

export default function Accounting() {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  useDocumentTitle('pageTitle.accounting');
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string | undefined>();

  // Modal states for all entity types
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [showCostCenterModal, setShowCostCenterModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showFiscalYearModal, setShowFiscalYearModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);

  // Boekingen en facturen konden alleen aangemaakt worden: de knoppen om ze
  // te boeken, te verzenden, betaald te melden of te bewerken ontbraken in de
  // interface, terwijl de api ze wel kende. Daardoor bleef alles op concept.
  const boekingMutatie = useMutation({
    mutationFn: (id: string) => postTransaction(id),
    onSuccess: () => {
      showSuccess(t('accounting.transactionPosted'));
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: any) => showError(error.response?.data?.error || t('accounting.errorSave')),
  });

  const boekingVerwijderMutatie = useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => {
      showSuccess(t('accounting.transactionDeleted'));
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (error: any) => showError(error.response?.data?.error || t('accounting.errorDelete')),
  });

  const factuurVerzendMutatie = useMutation({
    mutationFn: (id: string) => sendInvoice(id),
    onSuccess: () => {
      showSuccess(t('accounting.invoiceSent'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: any) => showError(error.response?.data?.error || t('accounting.errorSave')),
  });

  const factuurBetaaldMutatie = useMutation({
    mutationFn: (id: string) => markInvoicePaid(id),
    onSuccess: () => {
      showSuccess(t('accounting.invoiceMarkedPaid'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: any) => showError(error.response?.data?.error || t('accounting.errorSave')),
  });

  const factuurVerwijderMutatie = useMutation({
    mutationFn: (id: string) => deleteInvoice(id),
    onSuccess: () => {
      showSuccess(t('accounting.invoiceDeleted'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: any) => showError(error.response?.data?.error || t('accounting.errorDelete')),
  });

  /** De regels van een boeking zitten niet in het overzicht; die halen we erbij. */
  const openBewerken = async (id: string) => {
    try {
      setEditTransaction(await getTransaction(id));
    } catch (error: any) {
      showError(error.response?.data?.error || t('accounting.errorLoad'));
    }
  };

  // Fiscal years intentionally have no `enabled` condition: the fiscal year
  // selector in the page header (and the reports/budgets/export logic) needs
  // them on every tab.
  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: getFiscalYears,
  });

  // Accounts are shown on the overview and chart tabs, and are needed by the
  // transaction/invoice/budget modals opened from those tabs.
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
    enabled: ['overview', 'chart', 'transactions', 'invoices', 'budgets'].includes(activeTab),
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
    enabled: activeTab === 'invoices' || activeTab === 'overview',
  });

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions', selectedFiscalYear],
    queryFn: () => getTransactions({ fiscalYearId: selectedFiscalYear }),
    enabled: activeTab === 'transactions' || activeTab === 'overview',
  });

  const { data: relations = [], isLoading: loadingRelations } = useQuery({
    queryKey: ['accounting-relations'],
    queryFn: getRelations,
    enabled: activeTab === 'relations' || activeTab === 'overview',
  });

  const { data: costCenters = [], isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: getCostCenters,
    enabled: activeTab === 'costcenters' || activeTab === 'overview',
  });

  const { data: budgets = [], isLoading: loadingBudgets } = useQuery({
    queryKey: ['budgets', selectedFiscalYear],
    queryFn: () => getBudgets({ fiscalYearId: selectedFiscalYear }),
    enabled: activeTab === 'budgets' || activeTab === 'overview',
  });

  const currentFiscalYear = fiscalYears.find((fy) => fy.isCurrent);

  const { data: balanceReport } = useQuery({
    queryKey: ['balance-report', currentFiscalYear?.id],
    queryFn: () => getBalanceReport(currentFiscalYear?.id),
    enabled: !!currentFiscalYear && activeTab === 'reports',
  });

  const { data: profitLossReport } = useQuery({
    queryKey: ['profit-loss-report', currentFiscalYear?.id],
    queryFn: () => getProfitLossReport(currentFiscalYear?.id),
    enabled: !!currentFiscalYear && activeTab === 'reports',
  });

  const initAccountsMutation = useMutation({
    mutationFn: initializeAccounts,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showSuccess(data.message);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorInitialize'));
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showSuccess(t('accounting.accountDeleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorDelete'));
    },
  });

  const createFiscalYearMutation = useMutation({
    mutationFn: createFiscalYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-years'] });
      showSuccess(t('accounting.fiscalYearCreated'));
      setShowFiscalYearModal(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleExport = async (type: string) => {
    setIsExporting(true);
    try {
      const fiscalYearId = selectedFiscalYear || currentFiscalYear?.id;
      switch (type) {
        case 'transactions':
          await exportTransactions(fiscalYearId);
          break;
        case 'accounts':
          await exportAccounts(fiscalYearId);
          break;
        case 'invoices':
          await exportInvoices(fiscalYearId);
          break;
        case 'balance-sheet':
          if (!fiscalYearId) {
            showError(t('accounting.selectFiscalYearFirst'));
            return;
          }
          await exportBalanceSheet(fiscalYearId);
          break;
        case 'profit-loss':
          if (!fiscalYearId) {
            showError(t('accounting.selectFiscalYearFirst'));
            return;
          }
          await exportProfitLoss(fiscalYearId);
          break;
        case 'relations':
          await exportRelations();
          break;
      }
      showSuccess(t('accounting.exportSuccess'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('accounting.exportError'));
    } finally {
      setIsExporting(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: IconName }[] = [
    { id: 'overview', label: t('accounting.overview'), icon: 'home' },
    { id: 'chart', label: t('accounting.chartOfAccounts'), icon: 'book' },
    { id: 'transactions', label: t('accounting.journalEntries'), icon: 'fileText' },
    { id: 'invoices', label: t('accounting.invoices'), icon: 'clipboard' },
    { id: 'relations', label: t('accounting.relations'), icon: 'users' },
    { id: 'costcenters', label: t('accounting.costCenters'), icon: 'folder' },
    { id: 'budgets', label: t('accounting.budgets'), icon: 'chart' },
    { id: 'reports', label: t('accounting.reports'), icon: 'chart' },
  ];

  const groupedAccounts = accounts.reduce(
    (acc, account) => {
      if (!acc[account.accountType]) acc[account.accountType] = [];
      acc[account.accountType].push(account);
      return acc;
    },
    {} as Record<AccountType, Account[]>,
  );

  const bankAccounts = accounts.filter((a) => a.accountSubtype === 'bank');
  const receivableAccounts = accounts.filter((a) => a.accountSubtype === 'receivable');
  const payableAccounts = accounts.filter((a) => a.accountSubtype === 'payable');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-2xl font-bold">{t('accounting.title')}</h1>
        <div className="flex items-center gap-2">
          {fiscalYears.length > 0 ? (
            <>
              <select
                className="select select-bordered select-sm"
                value={selectedFiscalYear || currentFiscalYear?.id || ''}
                onChange={(e) => setSelectedFiscalYear(e.target.value || undefined)}
              >
                {fiscalYears.map((fy) => (
                  <option key={fy.id} value={fy.id}>
                    {fy.name} {fy.isCurrent ? `(${t('accounting.current')})` : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowFiscalYearModal(true)}
                title={t('accounting.manageFiscalYears')}
              >
                <Icon name="settings" size={16} />
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setShowFiscalYearModal(true)}>
              <Icon name="plus" size={16} />
              {t('accounting.newFiscalYear')}
            </button>
          )}
          <div className="dropdown dropdown-end">
            <button tabIndex={0} className="btn btn-outline btn-sm" disabled={isExporting}>
              {isExporting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Icon name="download" size={16} />
              )}
              {t('accounting.export')}
            </button>
            <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-56 z-50">
              <li className="menu-title">{t('accounting.exportData')}</li>
              <li>
                <button onClick={() => handleExport('transactions')}>{t('accounting.journalEntries')}</button>
              </li>
              <li>
                <button onClick={() => handleExport('accounts')}>{t('accounting.chartOfAccounts')}</button>
              </li>
              <li>
                <button onClick={() => handleExport('invoices')}>{t('accounting.invoices')}</button>
              </li>
              <li>
                <button onClick={() => handleExport('relations')}>{t('accounting.relations')}</button>
              </li>
              <li className="menu-title">{t('accounting.reports')}</li>
              <li>
                <button onClick={() => handleExport('balance-sheet')}>{t('accounting.balanceSheet')}</button>
              </li>
              <li>
                <button onClick={() => handleExport('profit-loss')}>{t('accounting.profitLoss')}</button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tabs tabs-boxed bg-base-200 p-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab gap-2 ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} size={16} />
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setActiveTab('chart')}
            >
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.chartOfAccounts')}</div>
                <div className="text-2xl font-bold">{accounts.length}</div>
              </div>
            </div>

            <div
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setActiveTab('transactions')}
            >
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.journalEntries')}</div>
                <div className="text-2xl font-bold">{transactions.length}</div>
              </div>
            </div>

            <div
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setActiveTab('invoices')}
            >
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.openInvoices')}</div>
                <div className="text-2xl font-bold">
                  {invoices.filter((i) => ['draft', 'sent', 'partial', 'overdue'].includes(i.status)).length}
                </div>
              </div>
            </div>

            <div
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setActiveTab('relations')}
            >
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.relations')}</div>
                <div className="text-2xl font-bold">{relations.length}</div>
              </div>
            </div>

            <div
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setActiveTab('costcenters')}
            >
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.costCenters')}</div>
                <div className="text-2xl font-bold">{costCenters.length}</div>
              </div>
            </div>

            <div
              className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setActiveTab('budgets')}
            >
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.budgets')}</div>
                <div className="text-2xl font-bold">{budgets.length}</div>
              </div>
            </div>
          </div>

          {/* Bank Accounts Overview */}
          {bankAccounts.length > 0 && (
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <h3 className="card-title text-lg">{t('accounting.bankAccounts')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bankAccounts.map((account) => (
                    <div key={account.id} className="bg-base-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{account.name}</div>
                          <div className="text-sm text-base-content/60">{account.code}</div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`text-lg font-bold ${account.currentBalance >= 0 ? 'text-success' : 'text-error'}`}
                          >
                            {formatCurrency(account.currentBalance)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <div className="page-header">
                <h3 className="card-title text-lg">{t('accounting.recentTransactions')}</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveTab('transactions')}>
                  {t('common.viewAll')} <Icon name="chevronRight" size={16} />
                </button>
              </div>
              {loadingTransactions ? (
                <SkeletonTable rows={5} columns={4} />
              ) : transactions.length === 0 ? (
                <p className="text-base-content/60">{t('accounting.noTransactions')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>{t('accounting.transactionNumber')}</th>
                        <th>{t('accounting.date')}</th>
                        <th>{t('accounting.description')}</th>
                        <th className="text-right">{t('accounting.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.slice(0, 5).map((tx) => (
                        <tr key={tx.id}>
                          <td className="font-mono text-sm">{tx.transactionNumber}</td>
                          <td>{new Date(tx.transactionDate).toLocaleDateString(currentLocale())}</td>
                          <td className="max-w-xs truncate">{tx.description}</td>
                          <td className="text-right font-mono">{formatCurrency(tx.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Debtors/Creditors Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <h3 className="card-title text-lg text-success">{t('accounting.debtors')}</h3>
                <div className="text-3xl font-bold">
                  {formatCurrency(receivableAccounts.reduce((sum, a) => sum + a.currentBalance, 0))}
                </div>
                <p className="text-sm text-base-content/60">{t('accounting.totalOutstanding')}</p>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <h3 className="card-title text-lg text-error">{t('accounting.creditors')}</h3>
                <div className="text-3xl font-bold">
                  {formatCurrency(Math.abs(payableAccounts.reduce((sum, a) => sum + a.currentBalance, 0)))}
                </div>
                <p className="text-sm text-base-content/60">{t('accounting.totalPayable')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart of Accounts Tab */}
      {activeTab === 'chart' && (
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-xl font-semibold">{t('accounting.chartOfAccounts')}</h2>
            <div className="flex gap-2">
              {accounts.length === 0 && (
                <button
                  className="btn btn-secondary gap-2"
                  onClick={() => initAccountsMutation.mutate()}
                  disabled={initAccountsMutation.isPending}
                >
                  {initAccountsMutation.isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <Icon name="refresh" size={16} />
                  )}
                  {t('accounting.initializeAccounts')}
                </button>
              )}
              <button
                className="btn btn-primary gap-2"
                onClick={() => {
                  setEditingAccount(null);
                  setShowAccountModal(true);
                }}
              >
                <Icon name="plus" size={16} />
                {t('accounting.newAccount')}
              </button>
            </div>
          </div>

          {loadingAccounts ? (
            <SkeletonTable rows={10} columns={5} />
          ) : accounts.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="book" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70 mb-4">{t('accounting.noAccounts')}</p>
              <button
                className="btn btn-primary gap-2 mx-auto"
                onClick={() => initAccountsMutation.mutate()}
                disabled={initAccountsMutation.isPending}
              >
                <Icon name="refresh" size={16} />
                {t('accounting.initializeAccounts')}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {(['asset', 'liability', 'equity', 'income', 'expense'] as AccountType[]).map((type) => {
                const typeAccounts = groupedAccounts[type] || [];
                if (typeAccounts.length === 0) return null;

                const typeTotal = typeAccounts.reduce((sum, a) => sum + a.currentBalance, 0);

                return (
                  <div key={type} className="card bg-base-100 shadow-md">
                    <div className="card-body">
                      <div className="page-header">
                        <h3 className={`card-title text-lg flex items-center gap-2 ${ACCOUNT_TYPE_COLORS[type]}`}>
                          <Icon name={ACCOUNT_TYPE_ICONS[type]} size={20} />
                          {t(`accounting.accountTypes.${type}`)}
                          <span className="badge badge-ghost badge-sm">{typeAccounts.length}</span>
                        </h3>
                        <div className={`text-lg font-bold ${typeTotal >= 0 ? '' : 'text-error'}`}>
                          {formatCurrency(typeTotal)}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th className="w-24">{t('accounting.code')}</th>
                              <th>{t('common.name')}</th>
                              <th>{t('accounting.subtype')}</th>
                              <th className="text-right">{t('accounting.balance')}</th>
                              <th className="w-20"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeAccounts
                              .sort((a, b) => a.code.localeCompare(b.code))
                              .map((account) => (
                                <tr key={account.id} className={account.parentId ? 'bg-base-200/50' : ''}>
                                  <td className="font-mono">
                                    {account.parentId && <span className="text-base-content/40 mr-1">└</span>}
                                    {account.code}
                                  </td>
                                  <td>
                                    {account.name}
                                    {account.isSystem && (
                                      <span className="badge badge-ghost badge-xs ml-2">{t('accounting.system')}</span>
                                    )}
                                  </td>
                                  <td className="text-sm text-base-content/70">
                                    {account.accountSubtype &&
                                      t(`accounting.accountSubtypes.${account.accountSubtype}`)}
                                  </td>
                                  <td className="text-right font-mono">{formatCurrency(account.currentBalance)}</td>
                                  <td>
                                    <div className="flex gap-1">
                                      <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => {
                                          setEditingAccount(account);
                                          setShowAccountModal(true);
                                        }}
                                      >
                                        <Icon name="pencil" size={14} />
                                      </button>
                                      {!account.isSystem && (
                                        <button
                                          className="btn btn-ghost btn-xs text-error"
                                          onClick={async () => {
                                            if (await confirmDialog(t('accounting.confirmDeleteAccount'))) {
                                              deleteAccountMutation.mutate(account.id);
                                            }
                                          }}
                                        >
                                          <Icon name="trash" size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Transactions/Journal Entries Tab */}
      {activeTab === 'transactions' && (
        <BoekingenTab
          transactions={transactions}
          loadingTransactions={loadingTransactions}
          boekingMutatie={boekingMutatie}
          boekingVerwijderMutatie={boekingVerwijderMutatie}
          openBewerken={openBewerken}
          setShowTransactionModal={setShowTransactionModal}
        />
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <FacturenTab
          invoices={invoices}
          loadingInvoices={loadingInvoices}
          factuurVerzendMutatie={factuurVerzendMutatie}
          factuurBetaaldMutatie={factuurBetaaldMutatie}
          factuurVerwijderMutatie={factuurVerwijderMutatie}
          setPrintInvoice={setPrintInvoice}
          setShowInvoiceModal={setShowInvoiceModal}
        />
      )}

      {/* Relations Tab */}
      {activeTab === 'relations' && (
        <RelatiesTab
          relations={relations}
          loadingRelations={loadingRelations}
          setShowRelationModal={setShowRelationModal}
        />
      )}

      {/* Cost Centers Tab */}
      {activeTab === 'costcenters' && (
        <KostenplaatsenTab
          costCenters={costCenters}
          loadingCostCenters={loadingCostCenters}
          setShowCostCenterModal={setShowCostCenterModal}
        />
      )}

      {/* Budgets Tab */}
      {activeTab === 'budgets' && (
        <BudgettenTab budgets={budgets} loadingBudgets={loadingBudgets} setShowBudgetModal={setShowBudgetModal} />
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <RapportagesTab
          balanceReport={balanceReport}
          currentFiscalYear={currentFiscalYear}
          profitLossReport={profitLossReport}
        />
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <AccountModal
          account={editingAccount}
          accounts={accounts}
          onClose={() => {
            setShowAccountModal(false);
            setEditingAccount(null);
          }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setShowAccountModal(false);
            setEditingAccount(null);
          }}
        />
      )}

      {/* Transaction Modal */}
      {(showTransactionModal || editTransaction) && (
        <TransactionModal
          transaction={editTransaction}
          accounts={accounts}
          costCenters={costCenters}
          onClose={() => {
            setShowTransactionModal(false);
            setEditTransaction(null);
          }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setShowTransactionModal(false);
            setEditTransaction(null);
          }}
        />
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          accounts={accounts}
          relations={relations}
          costCenters={costCenters}
          onClose={() => setShowInvoiceModal(false)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            setShowInvoiceModal(false);
          }}
        />
      )}

      {/* Invoice Print View */}
      {printInvoice && <InvoicePrinter invoice={printInvoice} onClose={() => setPrintInvoice(null)} />}

      {/* Relation Modal */}
      {showRelationModal && (
        <RelationModal
          onClose={() => setShowRelationModal(false)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['accounting-relations'] });
            setShowRelationModal(false);
          }}
        />
      )}

      {/* Cost Center Modal */}
      {showCostCenterModal && (
        <CostCenterModal
          onClose={() => setShowCostCenterModal(false)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['cost-centers'] });
            setShowCostCenterModal(false);
          }}
        />
      )}

      {/* Budget Modal */}
      {showBudgetModal && (
        <BudgetModal
          accounts={accounts}
          costCenters={costCenters}
          fiscalYears={fiscalYears}
          currentFiscalYearId={currentFiscalYear?.id}
          onClose={() => setShowBudgetModal(false)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            setShowBudgetModal(false);
          }}
        />
      )}

      {/* Fiscal Year Modal */}
      {showFiscalYearModal && (
        <FiscalYearModal
          fiscalYears={fiscalYears}
          onClose={() => setShowFiscalYearModal(false)}
          onSave={(data) => {
            createFiscalYearMutation.mutate(data);
          }}
          isPending={createFiscalYearMutation.isPending}
        />
      )}
    </div>
  );
}
