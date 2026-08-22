import { useTranslation } from 'react-i18next';
import type { BalanceReport, FiscalYear, ProfitLossReport } from '../../api/accounting';
import { Icon } from '../../components/Icon';
import { SkeletonCard } from '../../components/Skeleton';
import { formatCurrency } from './formatteer';

export function RapportagesTab({
  balanceReport,
  currentFiscalYear,
  profitLossReport,
}: {
  balanceReport: BalanceReport | undefined;
  currentFiscalYear: FiscalYear | undefined;
  profitLossReport: ProfitLossReport | undefined;
}) {
  const { t } = useTranslation();

  return (
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
  );
}
