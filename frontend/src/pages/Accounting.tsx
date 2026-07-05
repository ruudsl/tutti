import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from '../components/Icon';
import {
  getFiscalYears,
  createFiscalYear,
  getAccounts,
  getInvoices,
  createAccount,
  updateAccount,
  deleteAccount,
  initializeAccounts,
  getBalanceReport,
  getProfitLossReport,
  getTransactions,
  getRelations,
  getCostCenters,
  getBudgets,
  createTransaction,
  createInvoice,
  createRelation,
  createCostCenter,
  createBudget,
  exportTransactions,
  exportAccounts,
  exportInvoices,
  exportBalanceSheet,
  exportProfitLoss,
  exportRelations,
  Account,
  AccountType,
  AccountSubtype,
  CreateAccountData,
  TransactionType,
  CreateTransactionData,
  CreateInvoiceData,
  AccountingRelation,
  RelationType,
  CostCenter,
  Budget,
} from '../api/accounting';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable, SkeletonCard } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';

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
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
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
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
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
              <div className="flex justify-between items-center">
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
                          <td>{new Date(tx.transactionDate).toLocaleDateString('nl-NL')}</td>
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
          <div className="flex justify-between items-center">
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
                      <div className="flex justify-between items-center">
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
                                          onClick={() => {
                                            if (confirm(t('accounting.confirmDeleteAccount'))) {
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
          <div className="flex justify-between items-center">
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
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="font-mono">{tx.transactionNumber}</td>
                          <td>{new Date(tx.transactionDate).toLocaleDateString('nl-NL')}</td>
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
          <div className="flex justify-between items-center">
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
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="font-mono">{invoice.invoiceNumber}</td>
                          <td>{invoice.relationName}</td>
                          <td>{new Date(invoice.invoiceDate).toLocaleDateString('nl-NL')}</td>
                          <td>{new Date(invoice.dueDate).toLocaleDateString('nl-NL')}</td>
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
          <div className="flex justify-between items-center">
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
          <div className="flex justify-between items-center">
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
          <div className="flex justify-between items-center">
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
      {showTransactionModal && (
        <TransactionModal
          accounts={accounts}
          costCenters={costCenters}
          onClose={() => setShowTransactionModal(false)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setShowTransactionModal(false);
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

function AccountModal({
  account,
  accounts,
  onClose,
  onSave,
}: {
  account: Account | null;
  accounts: Account[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateAccountData>({
    code: account?.code || '',
    name: account?.name || '',
    accountType: account?.accountType || 'expense',
    accountSubtype: account?.accountSubtype,
    parentId: account?.parentId,
    description: account?.description,
    openingBalance: account?.openingBalance || 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAccountData) => createAccount(data),
    onSuccess: () => {
      showSuccess(t('accounting.accountCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateAccountData) => updateAccount(account!.id, data),
    onSuccess: () => {
      showSuccess(t('accounting.accountUpdated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (account) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const parentOptions = accounts.filter((a) => a.id !== account?.id && a.accountType === formData.accountType);

  return (
    <Modal title={account ? t('accounting.editAccount') : t('accounting.newAccount')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.code')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.accountType')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.accountType}
              onChange={(e) =>
                setFormData({ ...formData, accountType: e.target.value as AccountType, parentId: undefined })
              }
            >
              {(['asset', 'liability', 'equity', 'income', 'expense'] as AccountType[]).map((type) => (
                <option key={type} value={type}>
                  {t(`accounting.accountTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.subtype')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.accountSubtype || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  accountSubtype: (e.target.value || undefined) as AccountSubtype | undefined,
                })
              }
            >
              <option value="">{t('accounting.noSubtype')}</option>
              {[
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
              ].map((subtype) => (
                <option key={subtype} value={subtype}>
                  {t(`accounting.accountSubtypes.${subtype}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.parentAccount')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.parentId || ''}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value || undefined })}
            >
              <option value="">{t('accounting.noParent')}</option>
              {parentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.openingBalance')}</span>
          </label>
          <input
            type="number"
            step="0.01"
            className="input input-bordered"
            value={formData.openingBalance}
            onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              t('common.save')
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// TRANSACTION MODAL
// =====================================================
function TransactionModal({
  accounts,
  costCenters,
  onClose,
  onSave,
}: {
  accounts: Account[];
  costCenters: CostCenter[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateTransactionData>({
    transactionDate: new Date().toISOString().split('T')[0],
    transactionType: 'journal',
    description: '',
    lines: [
      { accountId: '', debitAmount: 0, creditAmount: 0 },
      { accountId: '', debitAmount: 0, creditAmount: 0 },
    ],
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateTransactionData) => createTransaction(data),
    onSuccess: () => {
      showSuccess(t('accounting.transactionCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty lines and validate
    const validLines = formData.lines.filter(
      (line) => line.accountId && (line.debitAmount > 0 || line.creditAmount > 0),
    );
    if (validLines.length < 2) {
      showError(t('accounting.minTwoLines'));
      return;
    }
    const totalDebit = validLines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
    const totalCredit = validLines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      showError(t('accounting.debitCreditMustMatch'));
      return;
    }
    createMutation.mutate({ ...formData, lines: validLines });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { accountId: '', debitAmount: 0, creditAmount: 0 }],
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 2) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const totalDebit = formData.lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);
  const totalCredit = formData.lines.reduce((sum, l) => sum + (l.creditAmount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <Modal title={t('accounting.newEntry')} onClose={onClose} size="large">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.date')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.transactionDate}
              onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.type')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.transactionType}
              onChange={(e) => setFormData({ ...formData, transactionType: e.target.value as TransactionType })}
            >
              {(['journal', 'payment', 'receipt', 'bank', 'transfer'] as TransactionType[]).map((type) => (
                <option key={type} value={type}>
                  {t(`accounting.transactionTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.reference')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.reference || ''}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.description')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
          />
        </div>

        <div className="divider">{t('accounting.lines')}</div>

        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-2/5">{t('accounting.account')}</th>
                <th>{t('accounting.costCenter')}</th>
                <th className="text-right">{t('accounting.debit')}</th>
                <th className="text-right">{t('accounting.credit')}</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {formData.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={line.accountId}
                      onChange={(e) => updateLine(index, 'accountId', e.target.value)}
                    >
                      <option value="">{t('accounting.selectAccount')}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={line.costCenterId || ''}
                      onChange={(e) => updateLine(index, 'costCenterId', e.target.value || undefined)}
                    >
                      <option value="">-</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input input-bordered input-sm w-24 text-right"
                      value={line.debitAmount || ''}
                      onChange={(e) => updateLine(index, 'debitAmount', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input input-bordered input-sm w-24 text-right"
                      value={line.creditAmount || ''}
                      onChange={(e) => updateLine(index, 'creditAmount', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => removeLine(index)}
                      disabled={formData.lines.length <= 2}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`font-bold ${isBalanced ? '' : 'text-error'}`}>
                <td colSpan={2} className="text-right">
                  {t('common.total')}
                </td>
                <td className="text-right">{totalDebit.toFixed(2)}</td>
                <td className="text-right">{totalCredit.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={addLine}>
          <Icon name="plus" size={14} />
          {t('accounting.addLine')}
        </button>

        {!isBalanced && (
          <div className="alert alert-warning">
            <Icon name="warning" size={16} />
            <span>{t('accounting.debitCreditMustMatch')}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || !isBalanced}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// INVOICE MODAL
// =====================================================
function InvoiceModal({
  accounts,
  relations,
  costCenters: _costCenters,
  onClose,
  onSave,
}: {
  accounts: Account[];
  relations: AccountingRelation[];
  costCenters: CostCenter[];
  onClose: () => void;
  onSave: () => void;
}) {
  void _costCenters; // Future use for cost center allocation on invoice lines
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateInvoiceData>({
    invoiceType: 'sales',
    relationId: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    lines: [{ description: '', quantity: 1, unitPrice: 0 }],
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateInvoiceData) => createInvoice(data),
    onSuccess: () => {
      showSuccess(t('accounting.invoiceCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = formData.lines.filter((line) => line.description && line.quantity > 0);
    if (validLines.length === 0) {
      showError(t('accounting.minOneLine'));
      return;
    }
    createMutation.mutate({ ...formData, lines: validLines });
  };

  const addLine = () => {
    setFormData({
      ...formData,
      lines: [...formData.lines, { description: '', quantity: 1, unitPrice: 0 }],
    });
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...formData.lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setFormData({ ...formData, lines: newLines });
  };

  const removeLine = (index: number) => {
    if (formData.lines.length <= 1) return;
    setFormData({
      ...formData,
      lines: formData.lines.filter((_, i) => i !== index),
    });
  };

  const incomeAccounts = accounts.filter((a) => a.accountType === 'income');
  const expenseAccounts = accounts.filter((a) => a.accountType === 'expense');
  const relevantAccounts = formData.invoiceType === 'sales' ? incomeAccounts : expenseAccounts;

  const subtotal = formData.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <Modal title={t('accounting.newInvoice')} onClose={onClose} size="large">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.invoiceType')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.invoiceType}
              onChange={(e) => setFormData({ ...formData, invoiceType: e.target.value as any })}
            >
              <option value="sales">{t('accounting.invoiceTypes.sales')}</option>
              <option value="purchase">{t('accounting.invoiceTypes.purchase')}</option>
              <option value="credit_note">{t('accounting.invoiceTypes.credit_note')}</option>
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.relation')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.relationId}
              onChange={(e) => setFormData({ ...formData, relationId: e.target.value })}
              required
            >
              <option value="">{t('accounting.selectRelation')}</option>
              {relations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.invoiceDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.invoiceDate}
              onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.dueDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.reference')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.reference || ''}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.description')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
        </div>

        <div className="divider">{t('accounting.invoiceLines')}</div>

        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-2/5">{t('accounting.description')}</th>
                <th className="text-right">{t('accounting.quantity')}</th>
                <th className="text-right">{t('accounting.unitPrice')}</th>
                <th>{t('accounting.account')}</th>
                <th className="text-right">{t('accounting.lineTotal')}</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {formData.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      placeholder={t('accounting.lineDescription')}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      className="input input-bordered input-sm w-20 text-right"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="input input-bordered input-sm w-24 text-right"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={line.accountId || ''}
                      onChange={(e) => updateLine(index, 'accountId', e.target.value || undefined)}
                    >
                      <option value="">-</option>
                      {relevantAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right font-mono">{(line.quantity * line.unitPrice).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-error"
                      onClick={() => removeLine(index)}
                      disabled={formData.lines.length <= 1}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={4} className="text-right">
                  {t('accounting.subtotal')}
                </td>
                <td className="text-right font-mono">{subtotal.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={addLine}>
          <Icon name="plus" size={14} />
          {t('accounting.addLine')}
        </button>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.notes')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// RELATION MODAL
// =====================================================
function RelationModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<AccountingRelation>>({
    relationType: 'customer',
    name: '',
    paymentTermDays: 30,
    isActive: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<AccountingRelation>) => createRelation(data),
    onSuccess: () => {
      showSuccess(t('accounting.relationCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Modal title={t('accounting.newRelation')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.relationType')} *</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.relationType}
              onChange={(e) => setFormData({ ...formData, relationType: e.target.value as RelationType })}
            >
              <option value="customer">{t('accounting.relationTypes.customer')}</option>
              <option value="supplier">{t('accounting.relationTypes.supplier')}</option>
              <option value="both">{t('accounting.relationTypes.both')}</option>
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.name')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.email')}</span>
            </label>
            <input
              type="email"
              className="input input-bordered"
              value={formData.email || ''}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.phone')}</span>
            </label>
            <input
              type="tel"
              className="input input-bordered"
              value={formData.phone || ''}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.address')}</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.addressLine || ''}
            onChange={(e) => setFormData({ ...formData, addressLine: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.postalCode')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.postalCode || ''}
              onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.city')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.city || ''}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.country')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.country || ''}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="Nederland"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.iban')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.iban || ''}
              onChange={(e) => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
              placeholder="NL00BANK0000000000"
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.vatNumber')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.vatNumber || ''}
              onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value.toUpperCase() })}
              placeholder="NL000000000B00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.paymentTermDays')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input input-bordered"
              value={formData.paymentTermDays || 30}
              onChange={(e) => setFormData({ ...formData, paymentTermDays: parseInt(e.target.value) || 30 })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.creditLimit')}</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input input-bordered"
              value={formData.creditLimit || ''}
              onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || undefined })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// COST CENTER MODAL
// =====================================================
function CostCenterModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<CostCenter>>({
    code: '',
    name: '',
    isActive: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<CostCenter>) => createCostCenter(data),
    onSuccess: () => {
      showSuccess(t('accounting.costCenterCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Modal title={t('accounting.newCostCenter')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.code')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('common.name')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.budgetAmount')}</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input input-bordered"
            value={formData.budgetAmount || ''}
            onChange={(e) => setFormData({ ...formData, budgetAmount: parseFloat(e.target.value) || undefined })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// BUDGET MODAL
// =====================================================
function BudgetModal({
  accounts,
  costCenters,
  fiscalYears,
  currentFiscalYearId,
  onClose,
  onSave,
}: {
  accounts: Account[];
  costCenters: CostCenter[];
  fiscalYears: { id: string; name: string; isCurrent: boolean }[];
  currentFiscalYearId?: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Budget>>({
    name: '',
    amount: 0,
    accountId: '',
    fiscalYearId: currentFiscalYearId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Budget>) => createBudget(data),
    onSuccess: () => {
      showSuccess(t('accounting.budgetCreated'));
      onSave();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const expenseAccounts = accounts.filter((a) => a.accountType === 'expense');

  return (
    <Modal title={t('accounting.newBudget')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.account')} *</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.accountId || ''}
            onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
            required
          >
            <option value="">{t('accounting.selectAccount')}</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.fiscalYear')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.fiscalYearId || ''}
              onChange={(e) => setFormData({ ...formData, fiscalYearId: e.target.value || undefined })}
            >
              <option value="">{t('accounting.allYears')}</option>
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.costCenter')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.costCenterId || ''}
              onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value || undefined })}
            >
              <option value="">-</option>
              {costCenters.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.code} - {cc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('accounting.budgetAmount')} *</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input input-bordered"
            value={formData.amount || ''}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.notes')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FiscalYearModal({
  fiscalYears,
  onClose,
  onSave,
  isPending,
}: {
  fiscalYears: { id: string; name: string; isCurrent: boolean; startDate: string; endDate: string }[];
  onClose: () => void;
  onSave: (data: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [formData, setFormData] = useState({
    name: `${currentYear}`,
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
    isCurrent: fiscalYears.length === 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal onClose={onClose} title={t('accounting.newFiscalYear')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={t('accounting.fiscalYearNamePlaceholder')}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.startDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              required
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.endDate')} *</span>
            </label>
            <input
              type="date"
              className="input input-bordered"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={formData.isCurrent}
              onChange={(e) => setFormData({ ...formData, isCurrent: e.target.checked })}
            />
            <span className="label-text">{t('accounting.setAsCurrent')}</span>
          </label>
        </div>

        {fiscalYears.length > 0 && <div className="divider">{t('accounting.existingFiscalYears')}</div>}
        {fiscalYears.length > 0 && (
          <ul className="space-y-1 text-sm">
            {fiscalYears.map((fy) => (
              <li key={fy.id} className="flex justify-between items-center">
                <span>{fy.name}</span>
                <span className="text-base-content/60">
                  {new Date(fy.startDate).toLocaleDateString()} - {new Date(fy.endDate).toLocaleDateString()}
                  {fy.isCurrent && <span className="badge badge-primary badge-sm ml-2">{t('accounting.current')}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? <span className="loading loading-spinner loading-sm" /> : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
