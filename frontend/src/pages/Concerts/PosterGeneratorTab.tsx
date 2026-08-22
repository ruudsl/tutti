import { useTranslation } from 'react-i18next';
import ConcertPosterGenerator from '../../components/ConcertPosterGenerator';
import { showSuccess } from '../../utils/toast';

/** Het tabblad met de postergenerator. */
export function PosterGeneratorTab() {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        <ConcertPosterGenerator
          onDownload={(format, data) => {
            showSuccess(
              t('concerts.posterDownloaded', `Poster "${data.title}" gedownload als ${format.toUpperCase()}`),
            );
          }}
        />
      </div>
    </div>
  );
}
