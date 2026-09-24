import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAchtergrondtaken, probeerAchtergrondtaakOpnieuw, type TaakStatus } from '../api';
import { formatDateTime } from '../utils/dateFormat';
import { getErrorMessage } from '../utils/errors';
import { showError, showSuccess } from '../utils/toast';
import { Icon } from './Icon';

const STATUSSEN: TaakStatus[] = ['mislukt', 'wachtend', 'bezig', 'gelukt'];
const PER_PAGINA = 25;

const STATUS_KLEUR: Record<TaakStatus, string> = {
  mislukt: 'bg-red-100 text-red-800',
  wachtend: 'bg-yellow-100 text-yellow-800',
  bezig: 'bg-blue-100 text-blue-800',
  gelukt: 'bg-green-100 text-green-800',
};

/**
 * De wachtrij voor achtergrondtaken, voor superbeheerders: wat er klaarstaat,
 * wat er loopt, wat er mislukte en waarom - en een knop om een mislukte taak
 * opnieuw te proberen. Zie docs/ACHTERGRONDTAKEN.md.
 *
 * Opent op "mislukt": dat is waarvoor iemand hier komt kijken.
 */
export function AchtergrondtakenBeheer() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaakStatus | undefined>('mislukt');
  const [pagina, setPagina] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['achtergrondtaken', status, pagina],
    queryFn: () => getAchtergrondtaken({ status, page: pagina, limit: PER_PAGINA }),
  });

  const opnieuw = useMutation({
    mutationFn: probeerAchtergrondtaakOpnieuw,
    onSuccess: () => {
      showSuccess(t('achtergrondtaken.opnieuwIngepland'));
      queryClient.invalidateQueries({ queryKey: ['achtergrondtaken'] });
    },
    onError: (fout) => showError(getErrorMessage(fout)),
  });

  const kies = (nieuw: TaakStatus | undefined) => {
    setStatus(nieuw);
    setPagina(1);
  };

  const soortNaam = (soort: string) => t(`achtergrondtaken.soorten.${soort}`, { defaultValue: soort });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">{t('achtergrondtaken.titel')}</h2>
      <p className="text-gray-600 mb-4">{t('achtergrondtaken.uitleg')}</p>

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={t('achtergrondtaken.filterOpStatus')}>
        {STATUSSEN.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => kies(s)}
            className={`px-3 py-1 rounded-full border text-sm ${status === s ? 'border-blue-500 text-blue-700 font-medium' : 'border-gray-300 text-gray-700'}`}
          >
            {t(`achtergrondtaken.status.${s}`)} ({data?.tellingen[s] ?? 0})
          </button>
        ))}
        <button
          type="button"
          aria-pressed={status === undefined}
          onClick={() => kies(undefined)}
          className={`px-3 py-1 rounded-full border text-sm ${status === undefined ? 'border-blue-500 text-blue-700 font-medium' : 'border-gray-300 text-gray-700'}`}
        >
          {t('achtergrondtaken.alle')}
        </button>
      </div>

      {isLoading ? (
        <div role="status" className="text-center py-12 text-gray-500">
          {t('common.loading')}
        </div>
      ) : isError ? (
        <div role="alert" className="text-center py-12 text-red-700">
          {getErrorMessage(error)}
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="check" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{status ? t('achtergrondtaken.geenMetStatus') : t('achtergrondtaken.geen')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <caption className="sr-only">{t('achtergrondtaken.titel')}</caption>
              <thead>
                <tr className="text-left text-sm text-gray-600 border-b">
                  <th scope="col" className="py-2 pr-4">
                    {t('achtergrondtaken.kolommen.soort')}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t('achtergrondtaken.kolommen.status')}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t('achtergrondtaken.kolommen.pogingen')}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t('achtergrondtaken.kolommen.bijgewerkt')}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {t('achtergrondtaken.kolommen.fout')}
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">{t('achtergrondtaken.kolommen.acties')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((taak) => (
                  <tr key={taak.id} className="border-b align-top">
                    <td className="py-2 pr-4 font-medium">{soortNaam(taak.soort)}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-sm ${STATUS_KLEUR[taak.status]}`}>
                        {t(`achtergrondtaken.status.${taak.status}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{taak.pogingen}</td>
                    <td className="py-2 pr-4 text-sm text-gray-600 whitespace-nowrap">
                      {formatDateTime(taak.bijgewerkt_op)}
                    </td>
                    <td className="py-2 pr-4 text-sm text-gray-700 break-words max-w-md">{taak.laatste_fout ?? ''}</td>
                    <td className="py-2 text-right">
                      {taak.status === 'mislukt' && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          disabled={opnieuw.isPending}
                          onClick={() => opnieuw.mutate(taak.id)}
                          aria-label={t('achtergrondtaken.opnieuwVoor', { soort: soortNaam(taak.soort) })}
                        >
                          {t('achtergrondtaken.opnieuw')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pagination.totalPages > 1 && (
            <nav className="flex items-center justify-between mt-4" aria-label={t('achtergrondtaken.paginas')}>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={!data.pagination.hasPrev}
                onClick={() => setPagina((p) => p - 1)}
              >
                {t('common.previous')}
              </button>
              <span className="text-sm text-gray-600">
                {t('achtergrondtaken.paginaVan', { pagina: data.pagination.page, totaal: data.pagination.totalPages })}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={!data.pagination.hasNext}
                onClick={() => setPagina((p) => p + 1)}
              >
                {t('common.next')}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
