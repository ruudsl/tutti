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
import { SkeletonTable, SkeletonCard } from '../../components/Skeleton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { currentLocale } from '../../utils/locale';
import { AccountModal } from './AccountModal';
import { TransactionModal } from './TransactionModal';
import { InvoiceModal } from './InvoiceModal';
import { RelationModal } from './RelationModal';
import { CostCenterModal } from './CostCenterModal';
import { BudgetModal } from './BudgetModal';
import { FiscalYearModal } from './FiscalYearModal';

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'EUR' }).format(amount);
  };

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
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-xl font-semibold">{t('accounting.journalEntries')}</h2>
            <button className="btn btn-primary gap-2" onClick={() => setShowTransactionModal(true)}>
              <Icon name="plus" size={16} />
              {t('accounting.newEntry')}
            </button>
          </div>

          {loadingTransactions ? (
            <SkeletonTable rows={10} columns={6} />
          ) : transactions.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="fileText" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noTransactions')}</p>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('accounting.transactionNumber')}</th>
                        <th>{t('accounting.date')}</th>
                        <th>{t('accounting.type')}</th>
                        <th>{t('accounting.description')}</th>
                        <th className="text-right">{t('accounting.amount')}</th>
                        <th>{t('common.status')}</th>
                        <th>
                          <span className="sr-only">{t('common.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="font-mono">{tx.transactionNumber}</td>
                          <td>{new Date(tx.transactionDate).toLocaleDateString(currentLocale())}</td>
                          <td>
                            <span className="badge badge-ghost badge-sm">
                              {t(`accounting.transactionTypes.${tx.transactionType}`)}
                            </span>
                          </td>
                          <td className="max-w-xs truncate">{tx.description}</td>
                          <td className="text-right font-mono">{formatCurrency(tx.totalAmount)}</td>
                          <td>
                            <span className={`badge badge-sm ${tx.isPosted ? 'badge-success' : 'badge-warning'}`}>
                              {tx.isPosted ? t('accounting.posted') : t('accounting.draft')}
                            </span>
                          </td>
                          <td>
                            {/* Een geboekte transactie staat vast: bewerken,
                                opnieuw boeken en verwijderen kan alleen zolang
                                hij op concept staat. */}
                            {!tx.isPosted && (
                              <div className="flex gap-1 justify-end">
                                <button
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => openBewerken(tx.id)}
                                  title={t('common.edit')}
                                >
                                  <Icon name="pencil" size={16} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-xs text-success"
                                  onClick={() => boekingMutatie.mutate(tx.id)}
                                  disabled={boekingMutatie.isPending}
                                  title={t('accounting.postTransaction')}
                                >
                                  <Icon name="check" size={16} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-xs text-error"
                                  onClick={() => {
                                    if (window.confirm(t('accounting.confirmDeleteTransaction'))) {
                                      boekingVerwijderMutatie.mutate(tx.id);
                                    }
                                  }}
                                  disabled={boekingVerwijderMutatie.isPending}
                                  title={t('common.delete')}
                                >
                                  <Icon name="trash" size={16} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-xl font-semibold">{t('accounting.invoices')}</h2>
            <button className="btn btn-primary gap-2" onClick={() => setShowInvoiceModal(true)}>
              <Icon name="plus" size={16} />
              {t('accounting.newInvoice')}
            </button>
          </div>

          {loadingInvoices ? (
            <SkeletonTable rows={10} columns={6} />
          ) : invoices.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="clipboard" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noInvoices')}</p>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('accounting.invoiceNumber')}</th>
                        <th>{t('accounting.relation')}</th>
                        <th>{t('accounting.date')}</th>
                        <th>{t('accounting.due')}</th>
                        <th className="text-right">{t('accounting.amount')}</th>
                        <th>{t('common.status')}</th>
                        <th>
                          <span className="sr-only">{t('common.actions')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="font-mono">{invoice.invoiceNumber}</td>
                          <td>{invoice.relationName}</td>
                          <td>{new Date(invoice.invoiceDate).toLocaleDateString(currentLocale())}</td>
                          <td>{new Date(invoice.dueDate).toLocaleDateString(currentLocale())}</td>
                          <td className="text-right font-mono">{formatCurrency(invoice.total)}</td>
                          <td>
                            <span
                              className={`badge badge-sm ${
                                invoice.status === 'paid'
                                  ? 'badge-success'
                                  : invoice.status === 'overdue'
                                    ? 'badge-error'
                                    : invoice.status === 'sent'
                                      ? 'badge-info'
                                      : 'badge-ghost'
                              }`}
                            >
                              {t(`accounting.invoiceStatus.${invoice.status}`)}
                            </span>
                          </td>
                          <td>
                            <div className="flex gap-1 justify-end">
                              <button
                                className="btn btn-ghost btn-xs"
                                onClick={() => setPrintInvoice(invoice)}
                                title={t('printTemplates.invoice.printButton')}
                              >
                                {t('printTemplates.print')}
                              </button>
                              {/* Een concept moet eerst verstuurd worden; pas
                                  daarna kan hij betaald gemeld worden. */}
                              {invoice.status === 'draft' && (
                                <>
                                  <button
                                    className="btn btn-ghost btn-xs text-info"
                                    onClick={() => factuurVerzendMutatie.mutate(invoice.id)}
                                    disabled={factuurVerzendMutatie.isPending}
                                    title={t('accounting.sendInvoice')}
                                  >
                                    <Icon name="envelope" size={16} />
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-xs text-error"
                                    onClick={() => {
                                      if (window.confirm(t('accounting.confirmDeleteInvoice'))) {
                                        factuurVerwijderMutatie.mutate(invoice.id);
                                      }
                                    }}
                                    disabled={factuurVerwijderMutatie.isPending}
                                    title={t('common.delete')}
                                  >
                                    <Icon name="trash" size={16} />
                                  </button>
                                </>
                              )}
                              {invoice.status !== 'draft' && invoice.status !== 'paid' && (
                                <button
                                  className="btn btn-ghost btn-xs text-success"
                                  onClick={() => factuurBetaaldMutatie.mutate(invoice.id)}
                                  disabled={factuurBetaaldMutatie.isPending}
                                  title={t('accounting.markPaid')}
                                >
                                  <Icon name="check" size={16} />
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
          )}
        </div>
      )}

      {/* Relations Tab */}
      {activeTab === 'relations' && (
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-xl font-semibold">{t('accounting.relations')}</h2>
            <button className="btn btn-primary gap-2" onClick={() => setShowRelationModal(true)}>
              <Icon name="plus" size={16} />
              {t('accounting.newRelation')}
            </button>
          </div>

          {loadingRelations ? (
            <SkeletonTable rows={10} columns={5} />
          ) : relations.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="users" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noRelations')}</p>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('accounting.relationNumber')}</th>
                        <th>{t('common.name')}</th>
                        <th>{t('accounting.type')}</th>
                        <th>{t('common.email')}</th>
                        <th className="text-right">{t('accounting.balance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relations.map((rel) => (
                        <tr key={rel.id}>
                          <td className="font-mono">{rel.relationNumber || '-'}</td>
                          <td>{rel.name}</td>
                          <td>
                            <span
                              className={`badge badge-sm ${
                                rel.relationType === 'customer'
                                  ? 'badge-success'
                                  : rel.relationType === 'supplier'
                                    ? 'badge-warning'
                                    : 'badge-info'
                              }`}
                            >
                              {t(`accounting.relationTypes.${rel.relationType}`)}
                            </span>
                          </td>
                          <td className="text-sm">{rel.email || '-'}</td>
                          <td className={`text-right font-mono ${rel.balance >= 0 ? 'text-success' : 'text-error'}`}>
                            {formatCurrency(rel.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cost Centers Tab */}
      {activeTab === 'costcenters' && (
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-xl font-semibold">{t('accounting.costCenters')}</h2>
            <button className="btn btn-primary gap-2" onClick={() => setShowCostCenterModal(true)}>
              <Icon name="plus" size={16} />
              {t('accounting.newCostCenter')}
            </button>
          </div>

          {loadingCostCenters ? (
            <SkeletonTable rows={5} columns={4} />
          ) : costCenters.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="folder" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noCostCenters')}</p>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('accounting.code')}</th>
                        <th>{t('common.name')}</th>
                        <th>{t('common.description')}</th>
                        <th className="text-right">{t('accounting.budget')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costCenters.map((cc) => (
                        <tr key={cc.id}>
                          <td className="font-mono">{cc.code}</td>
                          <td>{cc.name}</td>
                          <td className="text-sm text-base-content/70">{cc.description || '-'}</td>
                          <td className="text-right font-mono">
                            {cc.budgetAmount ? formatCurrency(cc.budgetAmount) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Budgets Tab */}
      {activeTab === 'budgets' && (
        <div className="space-y-4">
          <div className="page-header">
            <h2 className="text-xl font-semibold">{t('accounting.budgets')}</h2>
            <button className="btn btn-primary gap-2" onClick={() => setShowBudgetModal(true)}>
              <Icon name="plus" size={16} />
              {t('accounting.newBudget')}
            </button>
          </div>

          {loadingBudgets ? (
            <SkeletonTable rows={5} columns={5} />
          ) : budgets.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="chart" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noBudgets')}</p>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md">
              <div className="card-body">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('common.name')}</th>
                        <th>{t('accounting.account')}</th>
                        <th className="text-right">{t('accounting.budgetAmount')}</th>
                        <th className="text-right">{t('accounting.actual')}</th>
                        <th className="text-right">{t('accounting.remaining')}</th>
                        <th>{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgets.map((budget) => {
                        const percentUsed = budget.amount > 0 ? (budget.actual / budget.amount) * 100 : 0;
                        return (
                          <tr key={budget.id}>
                            <td>{budget.name}</td>
                            <td className="text-sm">
                              <span className="font-mono">{budget.accountCode}</span> - {budget.accountName}
                            </td>
                            <td className="text-right font-mono">{formatCurrency(budget.amount)}</td>
                            <td className="text-right font-mono">{formatCurrency(budget.actual)}</td>
                            <td
                              className={`text-right font-mono ${budget.remaining >= 0 ? 'text-success' : 'text-error'}`}
                            >
                              {formatCurrency(budget.remaining)}
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <progress
                                  className={`progress w-16 ${percentUsed > 100 ? 'progress-error' : percentUsed > 80 ? 'progress-warning' : 'progress-success'}`}
                                  value={Math.min(percentUsed, 100)}
                                  max="100"
                                />
                                <span className="text-sm">{percentUsed.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {!currentFiscalYear && (
            <div className="alert alert-warning">
              <Icon name="warning" size={16} />
              <span>{t('accounting.noFiscalYearForReports')}</span>
            </div>
          )}
          {/* Balance Report */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h3 className="card-title">{t('accounting.balanceSheet')}</h3>
              {!currentFiscalYear ? (
                <p className="text-base-content/60">{t('accounting.selectFiscalYearFirst')}</p>
              ) : !balanceReport ? (
                <SkeletonCard />
              ) : balanceReport.assets?.length === 0 &&
                balanceReport.liabilities?.length === 0 &&
                balanceReport.equity?.length === 0 ? (
                <p className="text-base-content/60">{t('accounting.noAccountsForReport')}</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2 text-info">{t('accounting.assets')}</h4>
                    <div className="space-y-2">
                      {balanceReport.assets?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>
                            {item.code} - {item.name}
                          </span>
                          <span className="font-mono">{formatCurrency(item.currentBalance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>{t('accounting.totalAssets')}</span>
                        <span className="font-mono">{formatCurrency(balanceReport.totals?.assets || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-warning">{t('accounting.liabilitiesAndEquity')}</h4>
                    <div className="space-y-2">
                      {balanceReport.liabilities?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>
                            {item.code} - {item.name}
                          </span>
                          <span className="font-mono">{formatCurrency(item.currentBalance)}</span>
                        </div>
                      ))}
                      {balanceReport.equity?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>
                            {item.code} - {item.name}
                          </span>
                          <span className="font-mono">{formatCurrency(item.currentBalance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>{t('accounting.totalLiabilitiesEquity')}</span>
                        <span className="font-mono">
                          {formatCurrency(balanceReport.totals?.liabilitiesAndEquity || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Profit & Loss Report */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h3 className="card-title">{t('accounting.profitLoss')}</h3>
              {!currentFiscalYear ? (
                <p className="text-base-content/60">{t('accounting.selectFiscalYearFirst')}</p>
              ) : !profitLossReport ? (
                <SkeletonCard />
              ) : profitLossReport.income?.length === 0 && profitLossReport.expenses?.length === 0 ? (
                <p className="text-base-content/60">{t('accounting.noTransactionsForReport')}</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2 text-success">{t('accounting.income')}</h4>
                    <div className="space-y-1">
                      {profitLossReport.income?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>
                            {item.code} - {item.name}
                          </span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>{t('accounting.totalIncome')}</span>
                        <span className="font-mono">{formatCurrency(profitLossReport.totals?.income || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-error">{t('accounting.expenses')}</h4>
                    <div className="space-y-1">
                      {profitLossReport.expenses?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>
                            {item.code} - {item.name}
                          </span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>{t('accounting.totalExpenses')}</span>
                        <span className="font-mono">{formatCurrency(profitLossReport.totals?.expenses || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`text-xl font-bold p-4 rounded-lg ${
                      (profitLossReport.totals?.netResult || 0) >= 0
                        ? 'bg-success/10 text-success'
                        : 'bg-error/10 text-error'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>{t('accounting.netResult')}</span>
                      <span className="font-mono">{formatCurrency(profitLossReport.totals?.netResult || 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
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
