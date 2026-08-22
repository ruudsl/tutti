import { useTranslation } from 'react-i18next';
import { currentLocale } from '../../utils/locale';
import type { PlannedConcert } from '../../api';
import type { WizardState } from './types';

/**
 * Stap 4 van de wizard: het budget over de concerten verdelen.
 *
 * De lijst werd eerst op naam gefilterd en het bedrag daarna weggeschreven op
 * de index in díe gefilterde lijst, terwijl `updateConcert` op de ongefilterde
 * lijst werkt. Stond er een naamloos concert vóór een concert mét naam, dan
 * kwam het bedrag bij het verkeerde concert terecht - of bij een naamloos
 * concert dat niet eens op het scherm stond. Dat is nu gerepareerd; zie de
 * opmerking bij de lijst hieronder.
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
            // Eerst de positie in de échte lijst vastleggen, pas daarna
            // filteren. `updateConcert` zoekt het concert op met `i === index`
            // in de ongefilterde lijst, dus die index moet meereizen met de
            // rij. `PlannedConcert` heeft geen id om op te werken, dus de
            // index is het enige wat een rij aan zijn concert koppelt.
            // Map-dan-filter laat de getoonde volgorde ongemoeid: beide
            // bewerkingen houden de volgorde van de bronlijst aan.
            .map((concert, index) => ({ concert, index }))
            .filter(({ concert }) => concert.name)
            .map(({ concert, index }) => (
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
