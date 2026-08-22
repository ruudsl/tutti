import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadLogo, removeLogo } from '../../api';
import { useVerversSettings } from '../../hooks/useSettings';
import { showSuccess, showError } from '../../utils/toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LazyImage } from '../../components/LazyImage';
import { foutmelding } from './foutmelding';

const TOEGESTANE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_BESTANDSGROOTTE = 2 * 1024 * 1024;

/**
 * Het logo van de vereniging: tonen, vervangen en weghalen.
 *
 * De bevestiging voor het weghalen staat hier, in de sectie zelf. Zie de uitleg
 * bij `index.tsx` over waarom de vijf verwijderacties niet langer één gedeelde
 * dialoog delen.
 */
export function LogoSectie({ logoUrl }: { logoUrl: string | null }) {
  const { t } = useTranslation();
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [bevestigVerwijderen, setBevestigVerwijderen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ververs = useVerversSettings();

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!TOEGESTANE_TYPES.includes(file.type)) {
      showError(t('settings.invalidFileType'));
      return;
    }

    if (file.size > MAX_BESTANDSGROOTTE) {
      showError(t('settings.fileTooLarge'));
      return;
    }

    setIsUploadingLogo(true);
    try {
      await uploadLogo(file);
      showSuccess(t('settings.logoUploaded'));
      ververs();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error) {
      showError(foutmelding(error, t('settings.errorUploadingLogo')));
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await removeLogo();
      showSuccess(t('settings.logoRemoved'));
      ververs();
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error) {
      showError(foutmelding(error, t('settings.errorRemovingLogo')));
    }
  };

  return (
    <>
      <div className="card mb-3">
        <div className="card-header">
          <h2 className="card-title">{t('settings.logo')}</h2>
        </div>
        <div className="card-body">
          <p className="piece-meta mb-2">{t('settings.logoDescription')}</p>
          <p className="piece-meta mb-3" style={{ fontSize: '0.8rem' }}>
            {t('settings.logoRequirements')}
          </p>

          {logoUrl && (
            <div className="mb-3" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <LazyImage
                src={logoUrl}
                alt="Logo"
                width={64}
                height={64}
                objectFit="contain"
                containerStyle={{
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  padding: '0.25rem',
                  background: 'white',
                }}
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setBevestigVerwijderen(true)}>
                {t('settings.removeLogo')}
              </button>
            </div>
          )}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
              id="logo-upload"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo ? t('common.loading') : logoUrl ? t('settings.changeLogo') : t('settings.uploadLogo')}
            </button>
          </div>
        </div>
      </div>

      {bevestigVerwijderen && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('settings.removeLogoConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={() => {
            setBevestigVerwijderen(false);
            void handleRemoveLogo();
          }}
          onCancel={() => setBevestigVerwijderen(false)}
          variant="danger"
        />
      )}
    </>
  );
}
