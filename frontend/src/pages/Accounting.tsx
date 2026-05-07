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
  createMembershipFeeType,
  updateMembershipFeeType,
  deleteMembershipFeeType,
  getBalanceReport,
  getProfitLossReport,
  Account,
  MembershipFeeType,
  AccountType,
  CreateAccountData,
  CreateMembershipFeeTypeData,
} from '../api/accounting';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';

type TabType = 'overview' | 'accounts' | 'fees' | 'invoices' | 'reports';

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
  const [showFeeTypeModal, setShowFeeTypeModal] = useState(false);
  const [editingFeeType, setEditingFeeType] = useState<MembershipFeeType | null>(null);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: getFiscalYears,
  });

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: getAccounts,
  });

  const { data: feeTypes = [], isLoading: loadingFeeTypes } = useQuery({
    queryKey: ['membership-fee-types'],
    queryFn: getMembershipFeeTypes,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => getInvoices(),
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

  const deleteFeeTypeMutation = useMutation({
    mutationFn: deleteMembershipFeeType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-fee-types'] });
      showSuccess(t('accounting.feeTypeDeleted'));
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
    { id: 'accounts', label: t('accounting.accounts'), icon: 'creditCard' },
    { id: 'fees', label: t('accounting.membershipFees'), icon: 'users' },
    { id: 'invoices', label: t('accounting.invoices'), icon: 'fileText' },
    { id: 'reports', label: t('accounting.reports'), icon: 'chart' },
  ];

  const groupedAccounts = accounts.reduce((acc, account) => {
    if (!acc[account.accountType]) acc[account.accountType] = [];
    acc[account.accountType].push(account);
    return acc;
  }, {} as Record<AccountType, Account[]>);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('accounting.title')}</h1>
        {currentFiscalYear && (
          <div className="badge badge-primary badge-lg gap-2">
            <Icon name="calendar" size={14} />
            {currentFiscalYear.name}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs tabs-boxed bg-base-200 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab gap-2 ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} size={16} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card bg-base-100 shadow-md">
              <div className="card-body p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 rounded-lg p-3">
                    <Icon name="creditCard" size={24} className="text-primary" />
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">{t('accounting.totalAccounts')}</div>
                    <div className="text-2xl font-bold">{accounts.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md">
              <div className="card-body p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-success/10 rounded-lg p-3">
                    <Icon name="users" size={24} className="text-success" />
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">{t('accounting.feeCategories')}</div>
                    <div className="text-2xl font-bold">{feeTypes.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md">
              <div className="card-body p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-info/10 rounded-lg p-3">
                    <Icon name="fileText" size={24} className="text-info" />
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">{t('accounting.openInvoices')}</div>
                    <div className="text-2xl font-bold">
                      {invoices.filter((i) => ['draft', 'sent', 'partial', 'overdue'].includes(i.status)).length}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card bg-base-100 shadow-md">
              <div className="card-body p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-warning/10 rounded-lg p-3">
                    <Icon name="calendar" size={24} className="text-warning" />
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">{t('accounting.fiscalYears')}</div>
                    <div className="text-2xl font-bold">{fiscalYears.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h3 className="card-title text-lg">{t('accounting.recentInvoices')}</h3>
              {loadingInvoices ? (
                <SkeletonTable rows={5} columns={4} />
              ) : invoices.length === 0 ? (
                <p className="text-base-content/60">{t('accounting.noInvoices')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>{t('accounting.invoiceNumber')}</th>
                        <th>{t('accounting.relation')}</th>
                        <th>{t('common.status')}</th>
                        <th className="text-right">{t('accounting.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.slice(0, 5).map((invoice) => (
                        <tr key={invoice.id}>
                          <td className="font-mono">{invoice.invoiceNumber}</td>
                          <td>{invoice.relationName}</td>
                          <td>
                            <span className={`badge badge-sm ${
                              invoice.status === 'paid' ? 'badge-success' :
                              invoice.status === 'overdue' ? 'badge-error' :
                              invoice.status === 'sent' ? 'badge-info' : 'badge-ghost'
                            }`}>
                              {t(`accounting.invoiceStatus.${invoice.status}`)}
                            </span>
                          </td>
                          <td className="text-right font-mono">{formatCurrency(invoice.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
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

          {loadingAccounts ? (
            <SkeletonTable rows={10} columns={5} />
          ) : accounts.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="creditCard" size={48} className="mx-auto opacity-50 mb-4" />
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

                return (
                  <div key={type} className="card bg-base-100 shadow-md">
                    <div className="card-body">
                      <h3 className={`card-title text-lg flex items-center gap-2 ${ACCOUNT_TYPE_COLORS[type]}`}>
                        <Icon name={ACCOUNT_TYPE_ICONS[type]} size={20} />
                        {t(`accounting.accountTypes.${type}`)}
                        <span className="badge badge-ghost badge-sm">{typeAccounts.length}</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>{t('accounting.code')}</th>
                              <th>{t('common.name')}</th>
                              <th>{t('accounting.subtype')}</th>
                              <th className="text-right">{t('accounting.balance')}</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeAccounts.map((account) => (
                              <tr key={account.id}>
                                <td className="font-mono">{account.code}</td>
                                <td>{account.name}</td>
                                <td className="text-sm text-base-content/60">
                                  {account.accountSubtype && t(`accounting.accountSubtypes.${account.accountSubtype}`)}
                                </td>
                                <td className="text-right font-mono">{formatCurrency(account.currentBalance)}</td>
                                <td className="text-right">
                                  {!account.isSystem && (
                                    <div className="flex gap-1 justify-end">
                                      <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => { setEditingAccount(account); setShowAccountModal(true); }}
                                      >
                                        <Icon name="pencil" size={14} />
                                      </button>
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
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Membership Fees Tab */}
      {activeTab === 'fees' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              className="btn btn-primary gap-2"
              onClick={() => { setEditingFeeType(null); setShowFeeTypeModal(true); }}
            >
              <Icon name="plus" size={16} />
              {t('accounting.newFeeType')}
            </button>
          </div>

          {loadingFeeTypes ? (
            <SkeletonTable rows={5} columns={5} />
          ) : feeTypes.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="users" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noFeeTypes')}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {feeTypes.map((feeType) => (
                <div key={feeType.id} className="card bg-base-100 shadow-md">
                  <div className="card-body">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="card-title text-lg">
                          {feeType.name}
                          {feeType.isDefault && (
                            <span className="badge badge-primary badge-sm ml-2">{t('common.default')}</span>
                          )}
                        </h3>
                        {feeType.description && (
                          <p className="text-sm text-base-content/60 mt-1">{feeType.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setEditingFeeType(feeType); setShowFeeTypeModal(true); }}
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm text-error"
                          onClick={() => {
                            if (confirm(t('accounting.confirmDeleteFeeType'))) {
                              deleteFeeTypeMutation.mutate(feeType.id);
                            }
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-base-content/60">{t('accounting.amount')}</span>
                        <span className="font-bold text-lg">{formatCurrency(feeType.amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-base-content/60">{t('accounting.frequency')}</span>
                        <span>{t(`accounting.frequencies.${feeType.frequency}`)}</span>
                      </div>
                      {(feeType.ageMin || feeType.ageMax) && (
                        <div className="flex justify-between">
                          <span className="text-base-content/60">{t('accounting.ageRange')}</span>
                          <span>
                            {feeType.ageMin || 0} - {feeType.ageMax || '∞'} {t('accounting.years')}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-base-content/60">{t('accounting.activeMembers')}</span>
                        <span className="badge badge-ghost">{feeType.activeCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {loadingInvoices ? (
            <SkeletonTable rows={10} columns={6} />
          ) : invoices.length === 0 ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="fileText" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noInvoices')}</p>
            </div>
          ) : (
            <div className="card bg-base-100 shadow-md overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('accounting.invoiceNumber')}</th>
                    <th>{t('accounting.type')}</th>
                    <th>{t('accounting.relation')}</th>
                    <th>{t('accounting.date')}</th>
                    <th>{t('common.status')}</th>
                    <th className="text-right">{t('accounting.total')}</th>
                    <th className="text-right">{t('accounting.due')}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover">
                      <td className="font-mono">{invoice.invoiceNumber}</td>
                      <td>
                        <span className={`badge badge-sm ${
                          invoice.invoiceType === 'sales' ? 'badge-success' :
                          invoice.invoiceType === 'purchase' ? 'badge-warning' : 'badge-info'
                        }`}>
                          {t(`accounting.invoiceTypes.${invoice.invoiceType}`)}
                        </span>
                      </td>
                      <td>{invoice.relationName}</td>
                      <td>{invoice.invoiceDate}</td>
                      <td>
                        <span className={`badge badge-sm ${
                          invoice.status === 'paid' ? 'badge-success' :
                          invoice.status === 'overdue' ? 'badge-error' :
                          invoice.status === 'sent' ? 'badge-info' :
                          invoice.status === 'partial' ? 'badge-warning' : 'badge-ghost'
                        }`}>
                          {t(`accounting.invoiceStatus.${invoice.status}`)}
                        </span>
                      </td>
                      <td className="text-right font-mono">{formatCurrency(invoice.total)}</td>
                      <td className="text-right font-mono">
                        {invoice.amountDue > 0 ? formatCurrency(invoice.amountDue) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {!currentFiscalYear ? (
            <div className="card bg-base-200 p-8 text-center">
              <Icon name="calendar" size={48} className="mx-auto opacity-50 mb-4" />
              <p className="text-base-content/70">{t('accounting.noFiscalYear')}</p>
            </div>
          ) : (
            <>
              {/* Profit & Loss */}
              {profitLossReport && (
                <div className="card bg-base-100 shadow-md">
                  <div className="card-body">
                    <h3 className="card-title text-lg">{t('accounting.profitLoss')}</h3>
                    <div className="grid md:grid-cols-2 gap-6 mt-4">
                      <div>
                        <h4 className="font-semibold text-success mb-2">{t('accounting.income')}</h4>
                        <div className="space-y-1">
                          {profitLossReport.income.map((acc: any) => (
                            <div key={acc.id} className="flex justify-between text-sm">
                              <span>{acc.code} - {acc.name}</span>
                              <span className="font-mono">{formatCurrency(acc.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold pt-2 border-t">
                            <span>{t('accounting.totalIncome')}</span>
                            <span className="font-mono text-success">{formatCurrency(profitLossReport.totals.income)}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-error mb-2">{t('accounting.expenses')}</h4>
                        <div className="space-y-1">
                          {profitLossReport.expenses.map((acc: any) => (
                            <div key={acc.id} className="flex justify-between text-sm">
                              <span>{acc.code} - {acc.name}</span>
                              <span className="font-mono">{formatCurrency(acc.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold pt-2 border-t">
                            <span>{t('accounting.totalExpenses')}</span>
                            <span className="font-mono text-error">{formatCurrency(profitLossReport.totals.expenses)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 p-4 bg-base-200 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold">{t('accounting.netResult')}</span>
                        <span className={`text-2xl font-bold font-mono ${
                          profitLossReport.totals.netResult >= 0 ? 'text-success' : 'text-error'
                        }`}>
                          {formatCurrency(profitLossReport.totals.netResult)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Balance Sheet */}
              {balanceReport && (
                <div className="card bg-base-100 shadow-md">
                  <div className="card-body">
                    <h3 className="card-title text-lg">{t('accounting.balanceSheet')}</h3>
                    <div className="grid md:grid-cols-2 gap-6 mt-4">
                      <div>
                        <h4 className="font-semibold text-info mb-2">{t('accounting.assets')}</h4>
                        <div className="space-y-1">
                          {balanceReport.assets.map((acc: any) => (
                            <div key={acc.id} className="flex justify-between text-sm">
                              <span>{acc.code} - {acc.name}</span>
                              <span className="font-mono">{formatCurrency(acc.currentBalance)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold pt-2 border-t">
                            <span>{t('accounting.totalAssets')}</span>
                            <span className="font-mono">{formatCurrency(balanceReport.totals.assets)}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-warning mb-2">{t('accounting.liabilitiesAndEquity')}</h4>
                        <div className="space-y-1">
                          {balanceReport.liabilities.map((acc: any) => (
                            <div key={acc.id} className="flex justify-between text-sm">
                              <span>{acc.code} - {acc.name}</span>
                              <span className="font-mono">{formatCurrency(acc.currentBalance)}</span>
                            </div>
                          ))}
                          {balanceReport.equity.map((acc: any) => (
                            <div key={acc.id} className="flex justify-between text-sm">
                              <span>{acc.code} - {acc.name}</span>
                              <span className="font-mono">{formatCurrency(acc.currentBalance)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold pt-2 border-t">
                            <span>{t('accounting.totalLiabilitiesEquity')}</span>
                            <span className="font-mono">{formatCurrency(balanceReport.totals.liabilitiesAndEquity)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <AccountModal
          account={editingAccount}
          onClose={() => setShowAccountModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            setShowAccountModal(false);
          }}
        />
      )}

      {/* Fee Type Modal */}
      {showFeeTypeModal && (
        <FeeTypeModal
          feeType={editingFeeType}
          accounts={accounts.filter((a) => a.accountType === 'income')}
          onClose={() => setShowFeeTypeModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['membership-fee-types'] });
            setShowFeeTypeModal(false);
          }}
        />
      )}
    </div>
  );
}

// Account Modal Component
function AccountModal({
  account,
  onClose,
  onSuccess,
}: {
  account: Account | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateAccountData>({
    code: account?.code || '',
    name: account?.name || '',
    accountType: account?.accountType || 'expense',
    accountSubtype: account?.accountSubtype || undefined,
    parentId: account?.parentId || undefined,
    description: account?.description || '',
    openingBalance: account?.openingBalance || 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAccountData) => account ? updateAccount(account.id, data) : createAccount(data),
    onSuccess: () => {
      showSuccess(account ? t('accounting.accountUpdated') : t('accounting.accountCreated'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const canSubmit = formData.code.trim() && formData.name.trim();

  return (
    <Modal onClose={onClose} title={account ? t('accounting.editAccount') : t('accounting.newAccount')}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.code')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="1000"
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('common.name')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.accountType')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.accountType}
              onChange={(e) => setFormData({ ...formData, accountType: e.target.value as AccountType })}
            >
              <option value="asset">{t('accounting.accountTypes.asset')}</option>
              <option value="liability">{t('accounting.accountTypes.liability')}</option>
              <option value="equity">{t('accounting.accountTypes.equity')}</option>
              <option value="income">{t('accounting.accountTypes.income')}</option>
              <option value="expense">{t('accounting.accountTypes.expense')}</option>
            </select>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.openingBalance')}</span>
            </label>
            <input
              type="number"
              step="0.01"
              className="input input-bordered"
              value={formData.openingBalance}
              onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {account ? t('common.save') : t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Fee Type Modal Component
function FeeTypeModal({
  feeType,
  accounts,
  onClose,
  onSuccess,
}: {
  feeType: MembershipFeeType | null;
  accounts: Account[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateMembershipFeeTypeData>({
    name: feeType?.name || '',
    description: feeType?.description || '',
    amount: feeType?.amount || 0,
    frequency: feeType?.frequency || 'yearly',
    ageMin: feeType?.ageMin || undefined,
    ageMax: feeType?.ageMax || undefined,
    isDefault: feeType?.isDefault || false,
    incomeAccountId: feeType?.incomeAccountId || undefined,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateMembershipFeeTypeData) =>
      feeType ? updateMembershipFeeType(feeType.id, data) : createMembershipFeeType(data),
    onSuccess: () => {
      showSuccess(feeType ? t('accounting.feeTypeUpdated') : t('accounting.feeTypeCreated'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('accounting.errorSave'));
    },
  });

  const canSubmit = formData.name.trim() && formData.amount >= 0;

  return (
    <Modal onClose={onClose} title={feeType ? t('accounting.editFeeType') : t('accounting.newFeeType')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.description')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered w-full"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.amount')} *</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input input-bordered"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.frequency')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
            >
              <option value="monthly">{t('accounting.frequencies.monthly')}</option>
              <option value="quarterly">{t('accounting.frequencies.quarterly')}</option>
              <option value="half_yearly">{t('accounting.frequencies.half_yearly')}</option>
              <option value="yearly">{t('accounting.frequencies.yearly')}</option>
              <option value="one_time">{t('accounting.frequencies.one_time')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.ageMin')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input input-bordered"
              value={formData.ageMin || ''}
              onChange={(e) => setFormData({ ...formData, ageMin: parseInt(e.target.value) || undefined })}
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.ageMax')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input input-bordered"
              value={formData.ageMax || ''}
              onChange={(e) => setFormData({ ...formData, ageMax: parseInt(e.target.value) || undefined })}
            />
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('accounting.incomeAccount')}</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={formData.incomeAccountId || ''}
              onChange={(e) => setFormData({ ...formData, incomeAccountId: e.target.value || undefined })}
            >
              <option value="">{t('accounting.noAccount')}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="checkbox"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
            />
            <span className="label-text">{t('accounting.isDefaultFeeType')}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {feeType ? t('common.save') : t('common.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
