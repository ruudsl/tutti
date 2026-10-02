import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadVerenigingsExport } from '../api';
import { showError, showSuccess } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Een kopie van de gegevens van de eigen vereniging downloaden, voor de
 * beheerder. Naast de reservekopie van de hele installatie, die alleen de
 * superbeheerder heeft (BackupSettings).
 */
export default function VerenigingsExport() {
  const { t } = useTranslation();
  const [bezig, setBezig] = useState(false);

  const download = async () => {
    setBezig(true);
    try {
      await downloadVerenigingsExport();
      showSuccess(t('verenigingsExport.gedownload'));
    } catch (fout) {
      showError(getErrorMessage(fout));
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="card mt-2">
      <div className="card-header">
        <h3 className="card-title">{t('verenigingsExport.titel')}</h3>
      </div>
      <div className="card-body">
        <p className="mb-2">{t('verenigingsExport.uitleg')}</p>
        <p className="text-muted mb-2">{t('verenigingsExport.privacy')}</p>
        <button className="btn btn-primary" onClick={download} disabled={bezig}>
          {bezig ? t('verenigingsExport.bezig') : t('verenigingsExport.knop')}
        </button>
      </div>
    </div>
  );
}
