import { useTranslation } from 'react-i18next';
import { FormModal } from '../../components/Modal';

/**
 * De Buma/Stemra-export over een periode.
 *
 * De begin- en einddatum blijven in de hoofdcomponent staan: die worden daar
 * bij het openen van de pagina op "vorig jaar tot vandaag" gezet en zijn ook
 * wat `handleExportBumaStemra` meestuurt.
 */
export function BumaStemraModal({
  bumaStemraStartDate,
  setBumaStemraStartDate,
  bumaStemraEndDate,
  setBumaStemraEndDate,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  bumaStemraStartDate: string;
  setBumaStemraStartDate: (waarde: string) => void;
  bumaStemraEndDate: string;
  setBumaStemraEndDate: (waarde: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();

  return (
    <FormModal
      title={t('concerts.bumaStemraExport')}
      onClose={onClose}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel={t('concerts.downloadExport')}
    >
      <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>{t('concerts.bumaStemraDescription')}</p>
      <div className="flex gap-2">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">{t('concerts.startDate')}</label>
          <input
            type="date"
            className="form-control"
            value={bumaStemraStartDate}
            onChange={(e) => setBumaStemraStartDate(e.target.value)}
            required
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">{t('concerts.endDateExport')}</label>
          <input
            type="date"
            className="form-control"
            value={bumaStemraEndDate}
            onChange={(e) => setBumaStemraEndDate(e.target.value)}
            required
          />
        </div>
      </div>
    </FormModal>
  );
}
