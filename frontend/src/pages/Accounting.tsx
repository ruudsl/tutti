import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from '../components/Icon';
import {
  getFiscalYears,
  getAccounts,
  getMembershipFeeTypes,
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
  Account,
  AccountType,
  AccountSubtype,
  CreateAccountData,
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

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: getFiscalYears,
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  useQuery({
    queryKey: ['membership-fee-types'],
    queryFn: getMembershipFeeTypes,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
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

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.accountType]) acc[account.accountType] = [];
    acc[account.accountType].push(account);
    return acc;
  }, {} as Record<AccountType, Account[]>);

  const bankAccounts = accounts.filter(a => a.accountSubtype === 'bank');
  const receivableAccounts = accounts.filter(a => a.accountSubtype === 'receivable');
  const payableAccounts = accounts.filter(a => a.accountSubtype === 'payable');

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('accounting.title')}</h1>
        <div className="flex items-center gap-2">
          {fiscalYears.length > 0 && (
            <select
              className="select select-bordered select-sm"
              value={selectedFiscalYear || currentFiscalYear?.id || ''}
              onChange={(e) => setSelectedFiscalYear(e.target.value || undefined)}
            >
              {fiscalYears.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name} {fy.isCurrent ? '(huidig)' : ''}
                </option>
              ))}
            </select>
          )}
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
            <div className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('chart')}>
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.chartOfAccounts')}</div>
                <div className="text-2xl font-bold">{accounts.length}</div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('transactions')}>
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.journalEntries')}</div>
                <div className="text-2xl font-bold">{transactions.length}</div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('invoices')}>
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.openInvoices')}</div>
                <div className="text-2xl font-bold">
                  {invoices.filter((i) => ['draft', 'sent', 'partial', 'overdue'].includes(i.status)).length}
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('relations')}>
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.relations')}</div>
                <div className="text-2xl font-bold">{relations.length}</div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('costcenters')}>
              <div className="card-body p-4">
                <div className="text-sm text-base-content/60">{t('accounting.costCenters')}</div>
                <div className="text-2xl font-bold">{costCenters.length}</div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow" onClick={() => setActiveTab('budgets')}>
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
                          <div className={`text-lg font-bold ${account.currentBalance >= 0 ? 'text-success' : 'text-error'}`}>
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
                onClick={() => { setEditingAccount(null); setShowAccountModal(true); }}
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
                            {typeAccounts.sort((a, b) => a.code.localeCompare(b.code)).map((account) => (
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
                                  {account.accountSubtype && t(`accounting.accountSubtypes.${account.accountSubtype}`)}
                                </td>
                                <td className="text-right font-mono">
                                  {formatCurrency(account.currentBalance)}
                                </td>
                                <td>
                                  <div className="flex gap-1">
                                    <button
                                      className="btn btn-ghost btn-xs"
                                      onClick={() => { setEditingAccount(account); setShowAccountModal(true); }}
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
            <button className="btn btn-primary gap-2">
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
            <button className="btn btn-primary gap-2">
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
                            <span className={`badge badge-sm ${
                              invoice.status === 'paid' ? 'badge-success' :
                              invoice.status === 'overdue' ? 'badge-error' :
                              invoice.status === 'sent' ? 'badge-info' : 'badge-ghost'
                            }`}>
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
            <button className="btn btn-primary gap-2">
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
                            <span className={`badge badge-sm ${
                              rel.relationType === 'customer' ? 'badge-success' :
                              rel.relationType === 'supplier' ? 'badge-warning' : 'badge-info'
                            }`}>
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
            <button className="btn btn-primary gap-2">
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
            <button className="btn btn-primary gap-2">
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
                            <td className={`text-right font-mono ${budget.remaining >= 0 ? 'text-success' : 'text-error'}`}>
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
          {/* Balance Report */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h3 className="card-title">{t('accounting.balanceSheet')}</h3>
              {!balanceReport ? (
                <SkeletonCard />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2 text-info">{t('accounting.assets')}</h4>
                    <div className="space-y-2">
                      {balanceReport.assets?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>{item.code} - {item.name}</span>
                          <span className="font-mono">{formatCurrency(item.balance)}</span>
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
                          <span>{item.code} - {item.name}</span>
                          <span className="font-mono">{formatCurrency(item.balance)}</span>
                        </div>
                      ))}
                      {balanceReport.equity?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>{item.code} - {item.name}</span>
                          <span className="font-mono">{formatCurrency(item.balance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>{t('accounting.totalLiabilitiesEquity')}</span>
                        <span className="font-mono">{formatCurrency(balanceReport.totals?.liabilitiesAndEquity || 0)}</span>
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
              {!profitLossReport ? (
                <SkeletonCard />
              ) : (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2 text-success">{t('accounting.income')}</h4>
                    <div className="space-y-1">
                      {profitLossReport.income?.map((item: any) => (
                        <div key={item.code} className="flex justify-between">
                          <span>{item.code} - {item.name}</span>
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
                          <span>{item.code} - {item.name}</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold border-t pt-2">
                        <span>{t('accounting.totalExpenses')}</span>
                        <span className="font-mono">{formatCurrency(profitLossReport.totals?.expenses || 0)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-xl font-bold p-4 rounded-lg ${
                    (profitLossReport.totals?.netResult || 0) >= 0 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                  }`}>
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
          onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setShowAccountModal(false);
            setEditingAccount(null);
          }}
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

  const parentOptions = accounts.filter(a => a.id !== account?.id && a.accountType === formData.accountType);

  return (
    <Modal title={account ? t('accounting.editAccount') : t('accounting.newAccount')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
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
              onChange={(e) => setFormData({ ...formData, accountType: e.target.value as AccountType, parentId: undefined })}
            >
              {(['asset', 'liability', 'equity', 'income', 'expense'] as AccountType[]).map((type) => (
                <option key={type} value={type}>{t(`accounting.accountTypes.${type}`)}</option>
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

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('accounting.subtype')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.accountSubtype || ''}
              onChange={(e) => setFormData({ ...formData, accountSubtype: (e.target.value || undefined) as AccountSubtype | undefined })}
            >
              <option value="">{t('accounting.noSubtype')}</option>
              {['bank', 'cash', 'receivable', 'payable', 'inventory', 'fixed_asset', 'current_liability',
                'long_term_liability', 'retained_earnings', 'membership_fees', 'donations', 'grants',
                'ticket_sales', 'sponsoring', 'personnel', 'materials', 'rent', 'utilities', 'insurance',
                'depreciation', 'other'].map((subtype) => (
                <option key={subtype} value={subtype}>{t(`accounting.accountSubtypes.${subtype}`)}</option>
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
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
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
