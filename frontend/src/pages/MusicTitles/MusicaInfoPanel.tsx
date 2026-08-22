import { useTranslation } from 'react-i18next';
import type { MusicaInfoDetail, MusicaInfoSearchResult } from '../../api';

/**
 * Het opzoekblok voor MusicaInfo.net binnen het bewerkvenster: zoeken op de
 * titel, een resultaat kiezen, en de gevonden duur en moeilijkheidsgraad
 * overnemen in het formulier.
 */
export function MusicaInfoPanel({
  musicaInfoSearching,
  musicaInfoResults,
  musicaInfoSearchUrl,
  musicaInfoError,
  musicaInfoLoadingDetail,
  musicaInfoDetail,
  onSearch,
  onLoadDetail,
  onApply,
  onReset,
}: {
  musicaInfoSearching: boolean;
  musicaInfoResults: MusicaInfoSearchResult[] | null;
  musicaInfoSearchUrl: string;
  musicaInfoError: string;
  musicaInfoLoadingDetail: string | null;
  musicaInfoDetail: MusicaInfoDetail | null;
  onSearch: () => void;
  onLoadDetail: (artnr: string) => void;
  onApply: (detail: MusicaInfoDetail) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="form-group"
      style={{
        background: 'var(--background)',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: musicaInfoResults || musicaInfoDetail || musicaInfoError ? '0.5rem' : 0,
        }}
      >
        <strong style={{ fontSize: '0.875rem', flex: 1 }}>MusicaInfo.net</strong>
        <button
          type="button"
          className="btn btn-outline"
          onClick={onSearch}
          disabled={musicaInfoSearching}
          style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
        >
          {musicaInfoSearching ? `${t('titles.musicaInfoSearching')}...` : t('titles.musicaInfoSearch')}
        </button>
      </div>

      {musicaInfoError && (
        <div
          style={{
            color: 'var(--danger)',
            fontSize: '0.8rem',
            padding: '0.5rem',
            background: 'var(--danger-bg, #fee)',
            borderRadius: '0.25rem',
          }}
        >
          {musicaInfoError}
          {musicaInfoSearchUrl && (
            <div style={{ marginTop: '0.25rem' }}>
              <a
                href={musicaInfoSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)' }}
              >
                {t('titles.musicaInfoOpenManually')}
              </a>
            </div>
          )}
        </div>
      )}

      {musicaInfoResults && musicaInfoResults.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
          {t('titles.musicaInfoNoResults')}
          <a
            href={musicaInfoSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: '0.5rem', color: 'var(--primary)' }}
          >
            {t('titles.musicaInfoOpenManually')}
          </a>
        </div>
      )}

      {musicaInfoResults && musicaInfoResults.length > 0 && !musicaInfoDetail && (
        <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem' }}>
          {musicaInfoResults.map((result) => (
            <div
              key={result.articleNumber}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.4rem 0.5rem',
                borderBottom: '1px solid var(--border)',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
              onClick={() => onLoadDetail(result.articleNumber)}
              // Aanwijzen licht de regel op met het vlak uit het thema; een
              // vaste witte kleur gaf in het donkere thema een lichte balk.
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 'bold',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {result.title}
                </div>
                {result.composer && (
                  <div style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>
                    {result.composer}
                    {result.arranger ? ` / ${result.arranger}` : ''}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', flexShrink: 0 }}
                disabled={musicaInfoLoadingDetail === result.articleNumber}
              >
                {musicaInfoLoadingDetail === result.articleNumber ? '...' : t('titles.musicaInfoSelect')}
              </button>
            </div>
          ))}
          <div style={{ padding: '0.25rem 0.5rem', textAlign: 'center' }}>
            <a
              href={musicaInfoSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', fontSize: '0.75rem' }}
            >
              {t('titles.musicaInfoOpenManually')}
            </a>
          </div>
        </div>
      )}

      {musicaInfoDetail && (
        <div
          style={{
            fontSize: '0.8rem',
            // Het vlak van het venster, dus in beide thema's goed.
            background: 'var(--surface)',
            padding: '0.5rem',
            borderRadius: '0.25rem',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{musicaInfoDetail.title}</div>
          {musicaInfoDetail.composer && (
            <div>
              {t('titles.musicaInfoComposer')}: {musicaInfoDetail.composer}
            </div>
          )}
          {musicaInfoDetail.arranger && (
            <div>
              {t('titles.arranger')}: {musicaInfoDetail.arranger}
            </div>
          )}
          {musicaInfoDetail.duration && (
            <div>
              {t('titles.durationFormat')}: <strong>{musicaInfoDetail.duration}</strong>
            </div>
          )}
          {musicaInfoDetail.difficulty && (
            <div>
              {t('titles.difficulty')}: <strong>{musicaInfoDetail.difficulty}</strong>
            </div>
          )}
          {musicaInfoDetail.publisher && (
            <div>
              {t('titles.musicaInfoPublisher')}: {musicaInfoDetail.publisher}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              onClick={() => onApply(musicaInfoDetail)}
            >
              {t('titles.musicaInfoApply')}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              onClick={onReset}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
