import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { updateSettings } from '../../api';
import { showSuccess, showError } from '../../utils/toast';
import type { AssociationSettings } from '../../types';
import { foutmelding } from './foutmelding';

/**
 * De naam van de vereniging, zoals die in de kop van de app verschijnt.
 *
 * De opgehaalde instellingen komen als prop binnen, omdat de pagina ze toch al
 * nodig heeft om te weten of ze klaar is met laden. Alles wat alleen dit
 * formulier aangaat - de ingetypte naam, of er op dit moment opgeslagen wordt -
 * staat hier.
 */
export function OrganisatieSectie({ settings }: { settings: AssociationSettings | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const opgehaaldeNaam = settings?.displayName ?? '';

  // HERSTELD GEDRAG (1 van 2). Hier stond eerder:
  //
  //   useEffect(() => {
  //     if (settings?.displayName && !displayName) setDisplayName(settings.displayName);
  //   }, [settings, displayName]);
  //
  // Dat effect keek mee met het veld zelf. Maakte je het veld leeg, dan was
  // `!displayName` waar en vulde het zichzelf onmiddellijk weer met de
  // opgehaalde naam. Typte je daarna door, dan kreeg je de oude naam mét je
  // nieuwe tekst erachter: "Harmonie TuttiFanfare Tutti".
  //
  // Nu hangt het effect alleen aan de naam die van de server komt. Het vult het
  // veld wanneer er een andere naam binnenkomt - bij het laden en na een
  // geslaagde opslag - en laat verder met rust wat de gebruiker intypt of
  // weghaalt.
  useEffect(() => {
    setDisplayName(opgehaaldeNaam);
  }, [opgehaaldeNaam]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // HERSTELD GEDRAG (2 van 2). Hier stond `displayName.trim() || undefined`.
      // Een leeg veld verdween daarmee uit het verzoek, en de backend slaat een
      // ontbrekend veld bewust over. Wissen was dus onmogelijk, ook als het
      // veld wél leeg te krijgen was geweest. Een lege tekst meesturen betekent
      // voor de backend wél "wissen"; die zet de naam dan terug op de interne
      // verenigingsnaam.
      await updateSettings({ displayName: displayName.trim() });
      showSuccess(t('settings.saved'));
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      window.dispatchEvent(new Event('settings-updated'));
    } catch (error) {
      showError(foutmelding(error, t('settings.errorSaving')));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('settings.organization')}</h2>
      </div>
      <div className="card-body">
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="displayName" className="form-label">
              {t('settings.organizationName')}
            </label>
            <input
              type="text"
              id="displayName"
              className="form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('settings.organizationNamePlaceholder')}
              maxLength={100}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
