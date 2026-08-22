import { useTranslation } from 'react-i18next';
import { currentLocale } from '../../utils/locale';
import type { PlannedConcert } from '../../api';
import type { WizardState } from './types';

/**
 * Stap 4 van de wizard: het budget over de concerten verdelen.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen, inclusief de eigenaardigheid
 * dat de lijst eerst op naam gefilterd wordt maar het bedrag daarna op de
 * index in díe gefilterde lijst wordt weggeschreven. Dat is bestaand gedrag,
 * geen gevolg van deze verhuizing; zie het rapport.
 */
export function WizardStapBudget({
  wizardState,
  totalConcertBudget,
  updateConcert,
}: {
  wizardState: WizardState;
  totalConcertBudget: number;
  updateConcert: (index: number, field: keyof PlannedConcert, value: string | number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="card-title mb-3">{t('seasonPlanner.wizard.budgetTitle')}</h2>

      {wizardState.budgetTotal && (
        <div className="card mb-3" style={{ background: 'var(--background)' }}>
          <div className="card-body">
            <div className="flex gap-4">
              <div>
                <span className="piece-meta">{t('seasonPlanner.budget.total')}</span>
                <div className="text-lg font-bold">
                  {wizardState.budgetTotal.toLocaleString(currentLocale(), {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </div>
              </div>
              <div>
                <span className="piece-meta">{t('seasonPlanner.budget.allocated')}</span>
                <div className="text-lg font-bold">
                  {totalConcertBudget.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
              <div>
                <span className="piece-meta">{t('seasonPlanner.budget.remaining')}</span>
                <div
                  className="text-lg font-bold"
                  style={{
                    color: wizardState.budgetTotal - totalConcertBudget < 0 ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {(wizardState.budgetTotal - totalConcertBudget).toLocaleString(currentLocale(), {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {wizardState.generateConcerts && wizardState.concerts.length > 0 && (
        <div>
          <h3>{t('seasonPlanner.wizard.concertBudgets')}</h3>
          {wizardState.concerts
            .filter((c) => c.name)
            .map((concert, index) => (
              <div key={index} className="flex items-center gap-2 mb-2">
                <span style={{ minWidth: '200px' }}>{concert.name || `Concert ${index + 1}`}</span>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: '150px' }}
                  value={concert.budgetAmount || ''}
                  onChange={(e) => updateConcert(index, 'budgetAmount', e.target.value ? Number(e.target.value) : 0)}
                  placeholder="0.00"
                  step="0.01"
                />
                <span>EUR</span>
              </div>
            ))}
        </div>
      )}

      {!wizardState.budgetTotal && <p className="piece-meta">{t('seasonPlanner.wizard.noBudgetSet')}</p>}
    </div>
  );
}
