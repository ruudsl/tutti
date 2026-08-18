import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { SkeletonCard } from '../components/Skeleton';
import { getModuleSettings, setModuleEnabled, type ModuleSetting } from '../api/modules';
import { useModules } from '../context/ModulesContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { showError, showSuccess } from '../utils/toast';

/**
 * Modules aan- en uitzetten.
 *
 * Uitgezette modules verdwijnen uit de zijbalk en zijn niet meer op te vragen,
 * ook niet via een bewaarde link. De gegevens blijven staan: aanzetten laat
 * alles onveranderd terugkomen. Dat staat er ook met zoveel woorden bij, want
 * bij een schakelaar met het woord "uit" is de eerste vraag van een beheerder
 * of de boekhouding van vorig jaar nu weg is.
 */
export default function Modules() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.modules');
  const queryClient = useQueryClient();
  const { refresh } = useModules();

  const {
    data: modules,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['module-settings'],
    queryFn: getModuleSettings,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) => setModuleEnabled(key, enabled),
    onSuccess: async (_result, { enabled }) => {
      await queryClient.invalidateQueries({ queryKey: ['module-settings'] });
      // De zijbalk leest uit de context, niet uit deze query.
      await refresh();
      showSuccess(enabled ? t('modules.enabled') : t('modules.disabled'));
    },
    onError: () => {
      showError(t('modules.errorSave'));
    },
  });

  if (isLoading) {
    return (
      <div>
        <h1>{t('modules.title')}</h1>
        <SkeletonCard />
      </div>
    );
  }

  // Zonder deze twee takken toont de pagina bij een mislukte of lege respons
  // alleen de kop en de toelichting, zonder een enkele schakelaar en zonder
  // uitleg waarom. Dat ziet eruit als een kapotte pagina.
  if (isError) {
    // "Het lukte niet" laat een beheerder met lege handen staan. De drie
    // gevallen die hier echt voorkomen hebben elk een ander vervolg, dus die
    // krijgen elk hun eigen zin.
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    const message =
      status === 404
        ? t('modules.errorNotDeployed')
        : status === 403
          ? t('modules.errorNotAdmin')
          : t('modules.errorLoad');

    return (
      <div className="page">
        <h1>{t('modules.title')}</h1>
        <div className="alert alert-danger">
          <Icon name="warning" /> {message}
        </div>
        {status !== 403 && (
          <button className="btn btn-secondary" onClick={() => refetch()}>
            <Icon name="refresh" /> {t('modules.retry')}
          </button>
        )}
      </div>
    );
  }

  if (!modules || modules.length === 0) {
    return (
      <div className="page">
        <h1>{t('modules.title')}</h1>
        <div className="alert alert-info">
          <Icon name="info" /> {t('modules.empty')}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>{t('modules.title')}</h1>

      <div className="alert alert-info mb-3">
        <Icon name="info" /> {t('modules.description')}
      </div>

      {modules.map((module: ModuleSetting) => (
        <div key={module.key} className="card mb-2">
          <div className="card-body module-row">
            <div className="module-info">
              <strong>{module.title}</strong>
              <p className="text-muted mb-0">{module.description}</p>
              {!module.enabled && module.navPaths.length > 0 && (
                <small className="text-muted d-block mt-1">
                  {t('modules.hiddenPages', { count: module.navPaths.length })}
                </small>
              )}
            </div>

            <label className="module-toggle">
              <input
                type="checkbox"
                checked={module.enabled}
                disabled={toggleMutation.isPending}
                onChange={(e) => toggleMutation.mutate({ key: module.key, enabled: e.target.checked })}
                aria-label={module.title}
              />
              <span>{module.enabled ? t('modules.on') : t('modules.off')}</span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
