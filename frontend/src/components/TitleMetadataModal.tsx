import { useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getYouTubeMeta } from '../api';
import { parseDuration } from '../utils/format';
import { searchSheetMusicWebsites } from '../utils/sheetMusic';
import { Modal } from './Modal';
import type { MusicTitle, Genre } from '../types';

interface TitleMetaForm {
  youtubeUrl: string;
  description: string;
  durationStr: string;
  genreIds: string[];
  isShared: boolean;
}

interface TitleMetadataModalProps {
  title: MusicTitle;
  genres: Genre[];
  onClose: () => void;
  onSave: (data: {
    youtubeUrl: string | null;
    description: string | null;
    durationSeconds: number;
    genreIds: string[];
    isShared: boolean;
  }) => Promise<void>;
  /** Extra form fields rendered before the description field */
  extraFields?: ReactNode;
  saving?: boolean;
}

function formatDurationForForm(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TitleMetadataModal({
  title,
  genres,
  onClose,
  onSave,
  extraFields,
  saving = false,
}: TitleMetadataModalProps) {
  const { t } = useTranslation();

  const [form, setForm] = useState<TitleMetaForm>({
    youtubeUrl: title.youtubeUrl || '',
    description: title.description || '',
    durationStr: formatDurationForForm(title.durationSeconds),
    genreIds: title.genres?.map(g => g.id) || [],
    isShared: title.isShared || false,
  });
  const [fetchingYouTube, setFetchingYouTube] = useState(false);
  const [youtubeMeta, setYoutubeMeta] = useState<{ title: string; author: string } | null>(null);

  const fetchYouTubeMetadata = async () => {
    if (!form.youtubeUrl) return;
    setFetchingYouTube(true);
    try {
      const meta = await getYouTubeMeta(form.youtubeUrl);
      setYoutubeMeta({ title: meta.title, author: meta.author });
    } catch (error: any) {
      alert(error.response?.data?.error || t('titles.errorFetchYouTube'));
    } finally {
      setFetchingYouTube(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      youtubeUrl: form.youtubeUrl || null,
      description: form.description || null,
      durationSeconds: parseDuration(form.durationStr),
      genreIds: form.genreIds,
      isShared: form.isShared,
    });
  };

  const toggleGenre = (genreId: string) => {
    setForm(f => ({
      ...f,
      genreIds: f.genreIds.includes(genreId)
        ? f.genreIds.filter(id => id !== genreId)
        : [...f.genreIds, genreId],
    }));
  };

  return (
    <Modal
      title={t('titles.editMetadata')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="title-meta-form" className="btn btn-primary" disabled={saving}>
            {saving ? `${t('common.save')}...` : t('common.save')}
          </button>
        </>
      }
    >
      <form id="title-meta-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('myMusic.table.title')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="form-control"
              value={title.title}
              disabled
              style={{ flex: 1 }}
            />
            <div className="dropdown" style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={(e) => {
                  const dropdown = e.currentTarget.nextElementSibling as HTMLElement;
                  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                }}
                title={t('titles.searchOnSites')}
              >
                🔍
              </button>
              <div
                style={{
                  display: 'none',
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  background: 'white',
                  border: '1px solid var(--border)',
                  borderRadius: '0.25rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  minWidth: '200px',
                }}
              >
                <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', fontWeight: 'bold', fontSize: '0.875rem' }}>
                  {t('titles.searchOnSites')}:
                </div>
                {searchSheetMusicWebsites(title.title).map((site) => (
                  <a
                    key={site.name}
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      padding: '0.5rem 1rem',
                      color: 'inherit',
                      textDecoration: 'none',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                  >
                    {site.name}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
        {title.arranger && (
          <div className="form-group">
            <label className="form-label">{t('titles.arranger')}</label>
            <input
              type="text"
              className="form-control"
              value={title.arranger}
              disabled
            />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">{t('titles.youtubeUrl')}</label>
          <div className="flex gap-2">
            <input
              type="url"
              className="form-control"
              value={form.youtubeUrl}
              onChange={(e) => {
                setForm(f => ({ ...f, youtubeUrl: e.target.value }));
                setYoutubeMeta(null);
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={fetchYouTubeMetadata}
              disabled={!form.youtubeUrl || fetchingYouTube}
              title={t('titles.fetchVideoInfo')}
            >
              {fetchingYouTube ? '...' : '📥'}
            </button>
          </div>
          {youtubeMeta && (
            <div className="piece-meta" style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--background)', borderRadius: '0.25rem' }}>
              <strong>{youtubeMeta.title}</strong>
              <div>{t('titles.by')}: {youtubeMeta.author}</div>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">{t('titles.durationFormat')}</label>
          <input
            type="text"
            className="form-control"
            value={form.durationStr}
            onChange={(e) => setForm(f => ({ ...f, durationStr: e.target.value }))}
            placeholder="3:45"
            pattern="[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?"
          />
        </div>
        {extraFields}
        <div className="form-group">
          <label className="form-label">{t('titles.description')}</label>
          <textarea
            className="form-control"
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder={t('titles.descriptionPlaceholder')}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('titles.genres')}</label>
          <div className="checkbox-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {genres.map((genre) => (
              <label
                key={genre.id}
                className="checkbox-item"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.25rem 0.5rem',
                  background: form.genreIds.includes(genre.id) ? 'var(--primary)' : 'var(--background)',
                  color: form.genreIds.includes(genre.id) ? 'white' : 'inherit',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.genreIds.includes(genre.id)}
                  onChange={() => toggleGenre(genre.id)}
                  style={{ display: 'none' }}
                />
                {genre.name}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-check" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="form-check-input"
              checked={form.isShared}
              onChange={(e) => setForm(f => ({ ...f, isShared: e.target.checked }))}
            />
            <span style={{ marginLeft: '0.5rem' }}>
              {t('titles.sharingAllowed')}
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
