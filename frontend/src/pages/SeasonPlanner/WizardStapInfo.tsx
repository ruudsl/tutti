import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../components/FormField';
import type { SeasonTemplate } from '../../api';
import type { WizardState } from './types';

/**
 * Stap 1 van de wizard: naam, periode, sjabloon, budget en notities.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen. De props heten net zo als de
 * variabelen daar heetten, zodat er binnen de opmaak geen enkele naam hoefde
 * te veranderen.
 */
export function WizardStapInfo({
  wizardState,
  setWizardState,
  templates,
  applyTemplate,
}: {
  wizardState: WizardState;
  setWizardState: Dispatch<SetStateAction<WizardState>>;
  templates: SeasonTemplate[];
  applyTemplate: (template: SeasonTemplate) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="card-title mb-3">{t('seasonPlanner.wizard.infoTitle')}</h2>

      <FormField label={<>{t('seasonPlanner.fields.name')} *</>}>
        <input
          type="text"
          className="form-control"
          value={wizardState.name}
          onChange={(e) => setWizardState((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t('seasonPlanner.fields.namePlaceholder')}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <FormField label={<>{t('seasonPlanner.fields.startDate')} *</>}>
          <input
            type="date"
            className="form-control"
            value={wizardState.startDate}
            onChange={(e) => setWizardState((prev) => ({ ...prev, startDate: e.target.value }))}
          />
        </FormField>
        <FormField label={<>{t('seasonPlanner.fields.endDate')} *</>}>
          <input
            type="date"
            className="form-control"
            value={wizardState.endDate}
            onChange={(e) => setWizardState((prev) => ({ ...prev, endDate: e.target.value }))}
          />
        </FormField>
      </div>

      {templates.length > 0 && (
        <FormField label={t('seasonPlanner.fields.template')}>
          <select
            className="form-control form-select"
            value={wizardState.templateId}
            onChange={(e) => {
              const template = templates.find((t) => t.id === e.target.value);
              if (template) {
                applyTemplate(template);
              } else {
                setWizardState((prev) => ({ ...prev, templateId: '' }));
              }
            }}
          >
            <option value="">{t('seasonPlanner.fields.noTemplate')}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField label={t('seasonPlanner.fields.budgetTotal')}>
        <input
          type="number"
          className="form-control"
          value={wizardState.budgetTotal || ''}
          onChange={(e) =>
            setWizardState((prev) => ({
              ...prev,
              budgetTotal: e.target.value ? Number(e.target.value) : null,
            }))
          }
          placeholder="0.00"
          step="0.01"
        />
      </FormField>

      <FormField label={t('common.notes')}>
        <textarea
          className="form-control"
          value={wizardState.notes}
          onChange={(e) => setWizardState((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
        />
      </FormField>
    </div>
  );
}
