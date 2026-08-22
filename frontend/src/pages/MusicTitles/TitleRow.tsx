import { useTranslation } from 'react-i18next';
import { getMp3Url } from '../../api';
import { Icon } from '../../components/Icon';
import { StreamingLinks } from '../../components/StreamingLinks';
import { formatDuration } from '../../utils/format';
import type { MusicTitle } from '../../types';

interface TitleRowProps {
  title: MusicTitle;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}

export function TitleRow({ title, isExpanded, onToggle, onEdit }: TitleRowProps) {
  const { t } = useTranslation();

  const hasStreamingLinks =
    title.streamingLinks &&
    (title.streamingLinks.spotify_url ||
      title.streamingLinks.apple_music_url ||
      title.streamingLinks.youtube_music_url);

  const hasDetails =
    (title.lists && title.lists.length > 0) ||
    title.youtubeUrl ||
    title.mp3FilePath ||
    title.description ||
    hasStreamingLinks ||
    (title.instruments && title.instruments.length > 0);

  return (
    <>
      <tr style={{ cursor: hasDetails ? 'pointer' : 'default' }} onClick={hasDetails ? onToggle : undefined}>
        <td style={{ width: '30px', textAlign: 'center' }}>
          {hasDetails && <span style={{ opacity: 0.5 }}>{isExpanded ? '▼' : '▶'}</span>}
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
                <span key={genre.id} className="tag">
                  {genre.name}
                </span>
              ))
            ) : (
              <span style={{ color: 'var(--text-light)' }}>-</span>
            )}
          </div>
        </td>
        <td>{title.grade || '-'}</td>
        <td>{title.durationSeconds > 0 ? formatDuration(title.durationSeconds) : '-'}</td>
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
        <td onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-outline btn-sm" onClick={onEdit} title="Bewerk metadata">
            <Icon name="pencil" size={16} />
          </button>
        </td>
      </tr>
      {isExpanded && hasDetails && (
        <tr className="expanded-row">
          <td></td>
          <td colSpan={8}>
            <div
              className="expanded-content"
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '4px',
                margin: '0.5rem 0',
              }}
            >
              {title.instruments && title.instruments.length > 0 && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Instrumenten:</strong> {title.instruments.join(', ')}
                </div>
              )}

              {title.mp3FilePath && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>MP3 Preview:</strong>
                  <audio
                    controls
                    src={getMp3Url(title.mp3FilePath)}
                    style={{ display: 'block', marginTop: '0.5rem', maxWidth: '400px' }}
                  />
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

              {hasStreamingLinks && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>{t('streaming.title')}:</strong>
                  <div style={{ marginTop: '0.5rem' }}>
                    <StreamingLinks links={title.streamingLinks} />
                  </div>
                </div>
              )}

              {title.description && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong>Beschrijving:</strong> {title.description}
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
