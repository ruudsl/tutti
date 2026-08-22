import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineManager } from '../../components/OfflineManager';

/**
 * Toegang tot het beheer van offline bewaarde partituren en audio.
 *
 * Klein, maar wel een geheel: de kaart en het venster dat eraan hangt horen bij
 * elkaar, en het enige stukje toestand - staat het venster open - hoeft nergens
 * anders bekend te zijn.
 */
export function OfflineSectie() {
  const { t } = useTranslation();
  const [toonBeheer, setToonBeheer] = useState(false);

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('offline.manager', 'Offline Opslag')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-3">
            {t('offline.description', 'Beheer de partituren en audio die offline beschikbaar zijn.')}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setToonBeheer(true)}>
            {t('offline.manage', 'Beheer Offline Opslag')}
          </button>
        </div>
      </div>

      <OfflineManager isOpen={toonBeheer} onClose={() => setToonBeheer(false)} />
    </>
  );
}
