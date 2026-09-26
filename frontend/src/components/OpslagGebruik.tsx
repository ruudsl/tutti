import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getOpslag } from '../api';
import { formatFileSize } from '../utils/format';

/** Cachesleutel van het opslaggebruik; een upload kan hem ongeldig maken. */
export const OPSLAG_QUERY_KEY = ['opslag'] as const;

/**
 * Hoeveel opslag de vereniging gebruikt tegenover haar grens: een balk met
 * "x van y in gebruik", of alleen het gebruik als er geen grens is. Voor de
 * beheerder; de server geeft een lid 403 en dan toont de kaart niets.
 */
export default function OpslagGebruik() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({ queryKey: OPSLAG_QUERY_KEY, queryFn: getOpslag });

  if (isError) return null;

  const gebruikt = data ? formatFileSize(data.gebruik.totaal) : '';
  const procent = data && data.limiet ? Math.min(100, Math.round((data.gebruik.totaal / data.limiet) * 100)) : null;

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header">
        <h3 className="card-title">{t('opslag.titel')}</h3>
      </div>
      <div className="card-body">
        {isLoading || !data ? (
          <p className="text-light">{t('common.loading')}</p>
        ) : data.limiet === null ? (
          <p data-testid="opslag-tekst">{t('opslag.gebruiktOnbeperkt', { gebruikt })}</p>
        ) : (
          <>
            <div
              className="progress-bar-container"
              role="progressbar"
              aria-label={t('opslag.titel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={procent ?? 0}
            >
              <div
                className="progress-bar"
                style={{
                  width: `${procent}%`,
                  background: (procent ?? 0) >= 90 ? 'var(--danger, #dc2626)' : undefined,
                }}
              />
            </div>
            <p data-testid="opslag-tekst" className="text-sm mt-1">
              {t('opslag.gebruiktVanLimiet', { gebruikt, limiet: formatFileSize(data.limiet), procent })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
