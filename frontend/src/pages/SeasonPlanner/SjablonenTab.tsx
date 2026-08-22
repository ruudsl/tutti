import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import type { SeasonTemplate } from '../../api';

/**
 * Het tabblad met de sjablonen: een knop om er een toe te voegen, daaronder
 * het formulier zodra dat open staat, en daaronder de tabel.
 *
 * Het formulier komt als `formulier` binnen in plaats van dat dit tabblad hem
 * zelf samenstelt. Anders zou het de formuliergegevens, de opslaanknop en het
 * annuleren allemaal moeten doorgeven zonder er zelf iets mee te doen: vijf
 * props doorreiken om één blok op de goede plek te zetten.
 */
export function SjablonenTab({
  templates,
  formulier,
  onNieuwSjabloon,
  onVerwijder,
}: {
  templates: SeasonTemplate[];
  formulier: ReactNode;
  onNieuwSjabloon: () => void;
  onVerwijder: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn btn-outline" onClick={onNieuwSjabloon}>
          <Icon name="plus" size={16} /> {t('seasonPlanner.newTemplate')}
        </button>
      </div>

      {formulier}

      <div className="card">
        <div className="card-body flush">
          {templates.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.description')}</th>
                  <th>{t('seasonPlanner.fields.defaultRehearsalDay')}</th>
                  <th>{t('seasonPlanner.fields.typicalConcerts')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <strong>{template.name}</strong>
                    </td>
                    <td>{template.description || '-'}</td>
                    <td>
                      {template.defaultRehearsalDay !== null
                        ? t(`rehearsals.days.${template.defaultRehearsalDay}`)
                        : '-'}
                    </td>
                    <td>{template.typicalConcertsCount}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => onVerwijder(template.id)}
                        style={{ color: 'var(--danger)' }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-center">
              <Icon name="fileText" size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p className="piece-meta">{t('seasonPlanner.templates.empty')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
