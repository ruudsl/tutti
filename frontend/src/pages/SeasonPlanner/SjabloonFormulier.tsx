import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { FormField } from '../../components/FormField';
import { WEEKDAYS } from './types';
import type { TemplateFormState } from './types';

/**
 * Het formulier voor een nieuw seizoenssjabloon.
 *
 * Letterlijk uit SeasonPlanner.tsx overgenomen. De ingevulde gegevens blijven
 * bewust búiten dit formulier, in de hoofdcomponent: die wist ze na opslaan
 * maar niet na annuleren, waardoor je bij heropenen terugvindt wat je getypt
 * had. Zou de toestand hierheen verhuizen, dan zou het aankoppelen hem elke
 * keer wissen en was dat gedrag stilletjes weg.
 */
export function SjabloonFormulier({
  templateForm,
  setTemplateForm,
  onOpslaan,
  opslaanBezig,
  onAnnuleren,
}: {
  templateForm: TemplateFormState;
  setTemplateForm: Dispatch<SetStateAction<TemplateFormState>>;
  onOpslaan: () => void;
  opslaanBezig: boolean;
  onAnnuleren: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('seasonPlanner.newTemplate')}</h2>
      </div>
      <div className="card-body">
        <FormField label={<>{t('common.name')} *</>}>
          <input
            type="text"
            className="form-control"
            value={templateForm.name}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </FormField>
        <FormField label={t('common.description')}>
          <textarea
            className="form-control"
            value={templateForm.description}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
          />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <FormField label={t('seasonPlanner.fields.defaultRehearsalDay')}>
            <select
              className="form-control form-select"
              value={templateForm.defaultRehearsalDay}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, defaultRehearsalDay: Number(e.target.value) }))}
            >
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {t(`rehearsals.days.${day.value}`)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('seasonPlanner.fields.defaultRehearsalTime')}>
            <input
              type="time"
              className="form-control"
              value={templateForm.defaultRehearsalTime}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, defaultRehearsalTime: e.target.value }))}
            />
          </FormField>
          <FormField label={t('seasonPlanner.fields.typicalConcerts')}>
            <input
              type="number"
              className="form-control"
              value={templateForm.typicalConcertsCount}
              onChange={(e) => setTemplateForm((prev) => ({ ...prev, typicalConcertsCount: Number(e.target.value) }))}
              min={0}
            />
          </FormField>
        </div>
        <FormField label={t('seasonPlanner.fields.defaultRehearsalLocation')}>
          <input
            type="text"
            className="form-control"
            value={templateForm.defaultRehearsalLocation}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, defaultRehearsalLocation: e.target.value }))}
          />
        </FormField>
        <div className="flex gap-2 mt-3">
          <button className="btn btn-primary" onClick={onOpslaan} disabled={!templateForm.name || opslaanBezig}>
            {opslaanBezig ? t('common.loading') : t('common.save')}
          </button>
          <button className="btn btn-outline" onClick={onAnnuleren}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
