import { useState, useMemo } from 'react';
import { useMusicTitles } from '../hooks/useMusicTitles';
import { useGenres } from '../hooks/useGenres';
import { SkeletonTable } from '../components/Skeleton';
import { useDebounce } from '../hooks/useDebounce';
import { formatDuration } from '../utils/format';
import type { MusicTitle } from '../types';

export default function MusicTitles() {
  const [search, setSearch] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);

  // Debounce search for API calls
  const debouncedSearch = useDebounce(search, 300);

  // Build filters object
  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    genreId: filterGenre || undefined,
  }), [debouncedSearch, filterGenre]);

  // TanStack Query hooks
  const { data: titles = [], isLoading: titlesLoading } = useMusicTitles(filters);
  const { data: genres = [], isLoading: genresLoading } = useGenres();

  const isLoading = titlesLoading || genresLoading;

  const toggleExpand = (title: string) => {
    setExpandedTitle(expandedTitle === title ? null : title);
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>Titels</h1>
        </div>
        <SkeletonTable rows={10} columns={5} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          Titels
          <span className="badge badge-primary" style={{ marginLeft: '0.75rem', fontSize: '1rem', verticalAlign: 'middle' }}>
            {titles.length}
          </span>
        </h1>
      </div>

      <div className="card mb-2">
        <div className="card-body">
          <div className="flex gap-2 flex-wrap">
            <div className="form-group mb-0" style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Zoeken op titel of arrangeur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group mb-0" style={{ minWidth: '200px' }}>
              <select
                className="form-control form-select"
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
              >
                <option value="">Alle genres</option>
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name}
                  </option>
                ))}
              </select>
            </div>
            {(search || filterGenre) && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setSearch('');
                  setFilterGenre('');
                }}
              >
                Wis filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {titles.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th style={{ width: '30px' }}></th>
                  <th>Titel</th>
                  <th>Arrangeur</th>
                  <th>Genres</th>
                  <th>Duur</th>
                  <th>Partijen</th>
                  <th>Lijsten</th>
                </tr>
              </thead>
              <tbody>
                {titles.map((title) => (
                  <TitleRow
                    key={`${title.title}-${title.arranger}`}
                    title={title}
                    isExpanded={expandedTitle === `${title.title}-${title.arranger}`}
                    onToggle={() => toggleExpand(`${title.title}-${title.arranger}`)}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🎵</div>
              <p>Geen titels gevonden.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TitleRowProps {
  title: MusicTitle;
  isExpanded: boolean;
  onToggle: () => void;
}

function TitleRow({ title, isExpanded, onToggle }: TitleRowProps) {
  const hasDetails = (title.lists && title.lists.length > 0) ||
                     title.youtubeUrl ||
                     title.description ||
                     (title.instruments && title.instruments.length > 0);

  return (
    <>
      <tr
        style={{ cursor: hasDetails ? 'pointer' : 'default' }}
        onClick={hasDetails ? onToggle : undefined}
      >
        <td style={{ width: '30px', textAlign: 'center' }}>
          {hasDetails && (
            <span style={{ opacity: 0.5 }}>{isExpanded ? '▼' : '▶'}</span>
          )}
        </td>
        <td>
          <strong>{title.title}</strong>
          {title.isShared && (
            <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
              Gedeeld
            </span>
          )}
        </td>
        <td>{title.arranger || '-'}</td>
        <td>
          <div className="tags">
            {title.genres && title.genres.length > 0 ? (
              title.genres.map((genre) => (
                <span key={genre.id} className="tag">{genre.name}</span>
              ))
            ) : (
              <span style={{ color: 'var(--text-light)' }}>-</span>
            )}
          </div>
        </td>
        <td>
          {title.durationSeconds > 0
            ? formatDuration(title.durationSeconds)
            : '-'}
        </td>
        <td>
          <span className="badge badge-secondary">{title.pieceCount}</span>
        </td>
        <td>
          {title.lists && title.lists.length > 0 ? (
            <span className="badge badge-primary">{title.lists.length}</span>
          ) : (
            <span style={{ color: 'var(--text-light)' }}>-</span>
          )}
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="expanded-row">
          <td></td>
          <td colSpan={6}>
            <div className="expanded-content" style={{
              padding: '1rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              margin: '0.5rem 0'
            }}>
              {title.instruments && title.instruments.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Instrumenten:</strong>{' '}
                  {title.instruments.join(', ')}
                </div>
              )}

              {title.youtubeUrl && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>YouTube:</strong>{' '}
                  <a href={title.youtubeUrl} target="_blank" rel="noopener noreferrer">
                    {title.youtubeUrl}
                  </a>
                </div>
              )}

              {title.description && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Beschrijving:</strong>{' '}
                  {title.description}
                </div>
              )}

              {title.lists && title.lists.length > 0 && (
                <div>
                  <strong>Voorkomend in lijsten:</strong>
                  <div className="tags" style={{ marginTop: '0.5rem' }}>
                    {title.lists.map((list) => (
                      <span key={list.id} className="tag">
                        {list.orchestra_name}: {list.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
