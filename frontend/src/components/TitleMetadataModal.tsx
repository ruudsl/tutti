import { useState, ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getYouTubeMeta, searchMusicaInfo, getMusicaInfoDetail } from '../api';
import type { MusicaInfoSearchResult, MusicaInfoDetail } from '../api';
import { parseDuration } from '../utils/format';
import { searchSheetMusicWebsites } from '../utils/sheetMusic';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { MusicXMLUpload } from './MusicXMLUpload';
import { InstrumentPicker } from './InstrumentPicker';
import { GenrePicker } from './GenrePicker';
import { useTitleMetadata, useUpdateTitleMetadata, TitleInstrument } from '../hooks/useVocabulary';
import type { MusicTitle, Genre } from '../types';

interface TitleMetaForm {
  youtubeUrl: string;
  description: string;
  durationStr: string;
  grade: string;
  genreIds: string[];
  isShared: boolean;
  internalNotes: string;
  // Extended metadata (WP5)
  workNumber: string;
  movementNumber: string;
  movementTitle: string;
  lyricist: string;
  rights: string;
  source: string;
  instruments: TitleInstrument[];
  genreUris: string[];
}

interface TitleMetadataModalProps {
  title: MusicTitle;
  genres: Genre[];
  onClose: () => void;
  onSave: (data: {
    youtubeUrl: string | null;
    description: string | null;
    durationSeconds: number;
    grade: string | null;
    genreIds: string[];
    isShared: boolean;
    internalNotes: string | null;
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
  const { t, i18n } = useTranslation();

  const [form, setForm] = useState<TitleMetaForm>({
    youtubeUrl: title.youtubeUrl || '',
    description: title.description || '',
    durationStr: formatDurationForForm(title.durationSeconds),
    grade: title.grade || '',
    genreIds: title.genres?.map((g) => g.id) || [],
    isShared: title.isShared || false,
    internalNotes: title.internalNotes || '',
    // Extended metadata (WP5)
    workNumber: '',
    movementNumber: '',
    movementTitle: '',
    lyricist: '',
    rights: '',
    source: '',
    instruments: [],
    genreUris: [],
  });
  const [fetchingYouTube, setFetchingYouTube] = useState(false);
  const [youtubeMeta, setYoutubeMeta] = useState<{ title: string; author: string } | null>(null);
  const [showExtendedMeta, setShowExtendedMeta] = useState(false);

  // WP5: Extended metadata
  const titleId = title.id || '';
  const { data: extendedMeta, isLoading: loadingExtendedMeta } = useTitleMetadata(titleId);
  const updateExtendedMeta = useUpdateTitleMetadata();

  // Load extended metadata when it's fetched
  useEffect(() => {
    if (extendedMeta) {
      const lang = i18n.language === 'nl' ? 'nl' : i18n.language === 'de' ? 'de' : 'en';
      const meta = extendedMeta.metadata || {};

      // Transform instruments with multilingual labels
      const instruments = (extendedMeta.instruments || []).map(
        (i: { uri: string; count: number; isOptional: boolean; notes?: string; label?: Record<string, string> }) => ({
          uri: i.uri,
          count: i.count,
          isOptional: i.isOptional,
          notes: i.notes,
          label: i.label?.[lang] || i.label?.en || i.uri,
        }),
      );

      // Extract genre URIs
      const genreUris = (extendedMeta.genres || []).map((g: { uri: string }) => g.uri);

      setForm((f) => ({
        ...f,
        workNumber: meta.workNumber || '',
        movementNumber: meta.movementNumber?.toString() || '',
        movementTitle: meta.movementTitle || '',
        lyricist: meta.lyricist || '',
        rights: meta.rights || '',
        source: meta.source || '',
        instruments,
        genreUris,
      }));

      if (extendedMeta.instruments?.length > 0 || extendedMeta.genres?.length > 0 || meta.workNumber) {
        setShowExtendedMeta(true);
      }
    }
  }, [extendedMeta, i18n.language]);

  // MusicaInfo state
  const [musicaInfoSearching, setMusicaInfoSearching] = useState(false);
  const [musicaInfoResults, setMusicaInfoResults] = useState<MusicaInfoSearchResult[] | null>(null);
  const [musicaInfoSearchUrl, setMusicaInfoSearchUrl] = useState('');
  const [musicaInfoError, setMusicaInfoError] = useState('');
  const [musicaInfoLoadingDetail, setMusicaInfoLoadingDetail] = useState<string | null>(null);
  const [musicaInfoDetail, setMusicaInfoDetail] = useState<MusicaInfoDetail | null>(null);

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

  const searchOnMusicaInfo = async () => {
    setMusicaInfoSearching(true);
    setMusicaInfoError('');
    setMusicaInfoResults(null);
    setMusicaInfoDetail(null);
    try {
      const data = await searchMusicaInfo(title.title);
      setMusicaInfoResults(data.results);
      setMusicaInfoSearchUrl(data.searchUrl);
    } catch (error: any) {
      setMusicaInfoError(error.response?.data?.error || t('titles.musicaInfoError'));
    } finally {
      setMusicaInfoSearching(false);
    }
  };

  const loadMusicaInfoDetail = async (artnr: string) => {
    setMusicaInfoLoadingDetail(artnr);
    setMusicaInfoDetail(null);
    try {
      const detail = await getMusicaInfoDetail(artnr);
      setMusicaInfoDetail(detail);
    } catch (error: any) {
      setMusicaInfoError(error.response?.data?.error || t('titles.musicaInfoError'));
    } finally {
      setMusicaInfoLoadingDetail(null);
    }
  };

  const applyMusicaInfoDetail = (detail: MusicaInfoDetail) => {
    setForm((f) => ({
      ...f,
      durationStr: detail.duration || f.durationStr,
      grade: detail.difficulty || f.grade,
    }));
    setMusicaInfoResults(null);
    setMusicaInfoDetail(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Save extended metadata (WP5)
    if (showExtendedMeta && titleId) {
      await updateExtendedMeta.mutateAsync({
        titleId,
        metadata: {
          workNumber: form.workNumber || undefined,
          movementNumber: form.movementNumber ? parseInt(form.movementNumber, 10) : undefined,
          movementTitle: form.movementTitle || undefined,
          lyricist: form.lyricist || undefined,
          rights: form.rights || undefined,
          source: form.source || undefined,
          instruments: form.instruments,
          genres: form.genreUris,
        },
      });
    }

    await onSave({
      youtubeUrl: form.youtubeUrl || null,
      description: form.description || null,
      durationSeconds: parseDuration(form.durationStr),
      grade: form.grade || null,
      genreIds: form.genreIds,
      isShared: form.isShared,
      internalNotes: form.internalNotes || null,
    });
  };

  const toggleGenre = (genreId: string) => {
    setForm((f) => ({
      ...f,
      genreIds: f.genreIds.includes(genreId) ? f.genreIds.filter((id) => id !== genreId) : [...f.genreIds, genreId],
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
            <input type="text" className="form-control" value={title.title} disabled style={{ flex: 1 }} />
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
                <Icon name="search" size={16} />
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
                <div
                  style={{
                    padding: '0.5rem',
                    borderBottom: '1px solid var(--border)',
                    fontWeight: 'bold',
                    fontSize: '0.875rem',
                  }}
                >
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
            <input type="text" className="form-control" value={title.arranger} disabled />
          </div>
        )}

        {/* WP5: Extended Music Metadata Section */}
        <div
          className="form-group"
          style={{
            background: 'var(--background)',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            overflow: 'visible',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            onClick={() => setShowExtendedMeta(!showExtendedMeta)}
          >
            <Icon name={showExtendedMeta ? 'chevronDown' : 'chevronRight'} size={16} />
            <strong style={{ fontSize: '0.875rem', flex: 1 }}>{t('metadata.extendedMetadata')}</strong>
            {loadingExtendedMeta && <span className="loading loading-spinner loading-sm" />}
            {extendedMeta?.metadata?.parts?.length > 0 && (
              <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                MusicXML
              </span>
            )}
          </div>

          {showExtendedMeta && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* MusicXML Upload */}
              <div>
                <label className="form-label" style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  {t('metadata.musicXMLFile')}
                </label>
                <MusicXMLUpload
                  titleId={titleId}
                  hasExistingData={extendedMeta?.metadata?.parts?.length > 0}
                  onSuccess={() => {}}
                />
              </div>

              {/* Work/Movement Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>
                    {t('metadata.workNumber')}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.workNumber}
                    onChange={(e) => setForm((f) => ({ ...f, workNumber: e.target.value }))}
                    placeholder="Op. 21, BWV 1004"
                    style={{ fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>
                    {t('metadata.movementNumber')}
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={form.movementNumber}
                    onChange={(e) => setForm((f) => ({ ...f, movementNumber: e.target.value }))}
                    min="1"
                    style={{ fontSize: '0.875rem' }}
                  />
                </div>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  {t('metadata.movementTitle')}
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.movementTitle}
                  onChange={(e) => setForm((f) => ({ ...f, movementTitle: e.target.value }))}
                  placeholder="Allegro con brio"
                  style={{ fontSize: '0.875rem' }}
                />
              </div>

              {/* Instruments */}
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  {t('metadata.instruments')}
                </label>
                <InstrumentPicker
                  value={form.instruments}
                  onChange={(instruments) => setForm((f) => ({ ...f, instruments }))}
                />
              </div>

              {/* JSKOS Genres */}
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  {t('metadata.jskosGenres')}
                </label>
                <GenrePicker value={form.genreUris} onChange={(genreUris) => setForm((f) => ({ ...f, genreUris }))} />
              </div>

              {/* Additional Credits */}
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  {t('metadata.lyricist')}
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.lyricist}
                  onChange={(e) => setForm((f) => ({ ...f, lyricist: e.target.value }))}
                  style={{ fontSize: '0.875rem' }}
                />
              </div>

              {/* Rights & Source */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>
                    {t('metadata.rights')}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.rights}
                    onChange={(e) => setForm((f) => ({ ...f, rights: e.target.value }))}
                    placeholder="Public Domain, CC BY-SA"
                    style={{ fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>
                    {t('metadata.source')}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.source}
                    onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                    placeholder="IMSLP, Archive.org"
                    style={{ fontSize: '0.875rem' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MusicaInfo.net lookup section */}
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
              onClick={searchOnMusicaInfo}
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
                  onClick={() => loadMusicaInfoDetail(result.articleNumber)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'white')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
                background: 'white',
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
                  onClick={() => applyMusicaInfoDetail(musicaInfoDetail)}
                >
                  {t('titles.musicaInfoApply')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                  onClick={() => {
                    setMusicaInfoDetail(null);
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">{t('titles.youtubeUrl')}</label>
          <div className="flex gap-2">
            <input
              type="url"
              className="form-control"
              value={form.youtubeUrl}
              onChange={(e) => {
                setForm((f) => ({ ...f, youtubeUrl: e.target.value }));
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
              {fetchingYouTube ? '...' : <Icon name="download" size={16} />}
            </button>
          </div>
          {youtubeMeta && (
            <div
              className="piece-meta"
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: 'var(--background)',
                borderRadius: '0.25rem',
              }}
            >
              <strong>{youtubeMeta.title}</strong>
              <div>
                {t('titles.by')}: {youtubeMeta.author}
              </div>
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">{t('titles.durationFormat')}</label>
          <input
            type="text"
            className="form-control"
            value={form.durationStr}
            onChange={(e) => setForm((f) => ({ ...f, durationStr: e.target.value }))}
            placeholder="3:45"
            pattern="[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?"
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('titles.difficulty')}</label>
          <input
            type="text"
            className="form-control"
            value={form.grade}
            onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
            placeholder={t('titles.difficultyPlaceholder')}
          />
        </div>
        {extraFields}
        <div className="form-group">
          <label className="form-label">{t('titles.description')}</label>
          <textarea
            className="form-control"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder={t('titles.descriptionPlaceholder')}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('titles.internalNotes')}</label>
          <textarea
            className="form-control"
            value={form.internalNotes}
            onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
            rows={2}
            placeholder={t('titles.internalNotesPlaceholder')}
            style={{ background: 'var(--warning-bg, #fff8e1)', borderColor: 'var(--warning, #ffc107)' }}
          />
          <small className="text-light">{t('titles.internalNotesHelp')}</small>
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
              onChange={(e) => setForm((f) => ({ ...f, isShared: e.target.checked }))}
            />
            <span style={{ marginLeft: '0.5rem' }}>{t('titles.sharingAllowed')}</span>
          </label>
        </div>
      </form>
    </Modal>
  );
}
