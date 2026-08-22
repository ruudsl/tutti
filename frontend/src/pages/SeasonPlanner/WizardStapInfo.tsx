import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
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

      <div className="form-group">
        <label className="form-label">{t('seasonPlanner.fields.name')} *</label>
        <input
          type="text"
          className="form-control"
          value={wizardState.name}
          onChange={(e) => setWizardState((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t('seasonPlanner.fields.namePlaceholder')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">{t('seasonPlanner.fields.startDate')} *</label>
          <input
            type="date"
            className="form-control"
            value={wizardState.startDate}
            onChange={(e) => setWizardState((prev) => ({ ...prev, startDate: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('seasonPlanner.fields.endDate')} *</label>
          <input
            type="date"
            className="form-control"
            value={wizardState.endDate}
            onChange={(e) => setWizardState((prev) => ({ ...prev, endDate: e.target.value }))}
          />
        </div>
      </div>

      {templates.length > 0 && (
        <div className="form-group">
          <label className="form-label">{t('seasonPlanner.fields.template')}</label>
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
        </div>
      )}

      <div className="form-group">
        <label className="form-label">{t('seasonPlanner.fields.budgetTotal')}</label>
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
      </div>

      <div className="form-group">
        <label className="form-label">{t('common.notes')}</label>
        <textarea
          className="form-control"
          value={wizardState.notes}
          onChange={(e) => setWizardState((prev) => ({ ...prev, notes: e.target.value }))}
          rows={3}
        />
      </div>
    </div>
  );
}
