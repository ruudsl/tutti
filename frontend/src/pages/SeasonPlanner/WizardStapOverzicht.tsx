import { useTranslation } from 'react-i18next';
import { currentLocale } from '../../utils/locale';
import { formatDate } from './formatteer';
import type { WizardState } from './types';

/**
 * Stap 5 van de wizard: samenvatting van wat er aangemaakt gaat worden.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen.
 */
export function WizardStapOverzicht({
  wizardState,
  rehearsalPreview,
}: {
  wizardState: WizardState;
  rehearsalPreview: string[];
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="card-title mb-3">{t('seasonPlanner.wizard.reviewTitle')}</h2>

      <div className="card mb-3" style={{ background: 'var(--background)' }}>
        <div className="card-body">
          <h3>{t('seasonPlanner.wizard.summary')}</h3>
          <table className="table">
            <tbody>
              <tr>
                <td>
                  <strong>{t('seasonPlanner.fields.name')}</strong>
                </td>
                <td>{wizardState.name}</td>
              </tr>
              <tr>
                <td>
                  <strong>{t('seasonPlanner.fields.period')}</strong>
                </td>
                <td>
                  {formatDate(wizardState.startDate)} - {formatDate(wizardState.endDate)}
                </td>
              </tr>
              {wizardState.budgetTotal && (
                <tr>
                  <td>
                    <strong>{t('seasonPlanner.budget.total')}</strong>
                  </td>
                  <td>
                    {wizardState.budgetTotal.toLocaleString(currentLocale(), {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </td>
                </tr>
              )}
              <tr>
                <td>
                  <strong>{t('seasonPlanner.wizard.rehearsalsToCreate')}</strong>
                </td>
                <td>
                  {wizardState.generateRehearsals ? rehearsalPreview.length - wizardState.excludedDates.length : 0}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>{t('seasonPlanner.wizard.concertsToCreate')}</strong>
                </td>
                <td>
                  {wizardState.generateConcerts ? wizardState.concerts.filter((c) => c.name && c.date).length : 0}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {wizardState.generateConcerts && wizardState.concerts.filter((c) => c.name && c.date).length > 0 && (
        <div className="card mb-3" style={{ background: 'var(--background)' }}>
          <div className="card-body">
            <h3>{t('seasonPlanner.wizard.plannedConcerts')}</h3>
            <ul>
              {wizardState.concerts
                .filter((c) => c.name && c.date)
                .map((concert, index) => (
                  <li key={index}>
                    <strong>{concert.name}</strong> - {formatDate(concert.date)}
                    {concert.location && ` @ ${concert.location}`}
                    {concert.budgetAmount
                      ? ` (${concert.budgetAmount.toLocaleString(currentLocale(), { style: 'currency', currency: 'EUR' })})`
                      : ''}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
