import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getMp3Url } from '../../api';
import type { MusicaInfoDetail } from '../../api';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { FormField } from '../../components/FormField';
import { StreamingLinks } from '../../components/StreamingLinks';
import { searchSheetMusicWebsites } from '../../utils/sheetMusic';
import type { Genre, MusicTitle } from '../../types';
import type { MusicTitlesAction, MusicTitlesState } from './musicTitlesReducer';
import { MusicaInfoPanel } from './MusicaInfoPanel';

/**
 * Het bewerkvenster voor de metagegevens van één titel: YouTube, duur,
 * moeilijkheidsgraad, mp3, omschrijving, genres en streamingverwijzingen.
 */
export function TitleMetaModal({
  editingTitle,
  state,
  genres,
  dispatch,
  mp3InputRef,
  onSubmit,
  onSearchMusicaInfo,
  onLoadMusicaInfoDetail,
  onApplyMusicaInfoDetail,
  onFetchYouTube,
  onMp3Upload,
  onMp3Delete,
  onToggleGenre,
}: {
  editingTitle: MusicTitle;
  state: MusicTitlesState;
  genres: Genre[];
  dispatch: Dispatch<MusicTitlesAction>;
  /**
   * React 19 laat `useRef<T>(null)` een `RefObject<T | null>` teruggeven: de
   * ref is leeg tot het element getekend is, en dat staat nu in het type.
   */
  mp3InputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onSearchMusicaInfo: () => void;
  onLoadMusicaInfoDetail: (artnr: string) => void;
  onApplyMusicaInfoDetail: (detail: MusicaInfoDetail) => void;
  onFetchYouTube: () => void;
  onMp3Upload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMp3Delete: () => void;
  onToggleGenre: (genreId: string) => void;
}) {
  const { t } = useTranslation();

  // Het zoekmenu naast het titelveld hangt aan gewone React-state, net als de
  // andere uitklapmenu's in dit project (zie GenrePicker, SortDropdown). Het
  // opende eerder door in de klikafhandelaar `nextElementSibling.style.display`
  // te zetten: dan weet React er niets van, ging het menu nooit vanzelf dicht
  // en moest de achtergrondkleur met de hand teruggezet worden - met `white`
  // als vaste waarde, wat in het donkere thema fout uitpakt.
  const [zoekmenuOpen, setZoekmenuOpen] = useState(false);
  const zoekmenuRef = useRef<HTMLDivElement>(null);

  // Klik ergens buiten knop en menu: dichtdoen. De luisteraar staat er alleen
  // zolang het menu open is.
  useEffect(() => {
    if (!zoekmenuOpen) return;
    function bijKlikBuiten(event: MouseEvent) {
      if (zoekmenuRef.current && !zoekmenuRef.current.contains(event.target as Node)) {
        setZoekmenuOpen(false);
      }
    }
    document.addEventListener('mousedown', bijKlikBuiten);
    return () => document.removeEventListener('mousedown', bijKlikBuiten);
  }, [zoekmenuOpen]);

  const {
    titleMetaForm,
    youtubeMeta,
    currentMp3Path,
    pendingMp3File,
    fetchingYouTube,
    saving,
    uploadingMp3,
    musicaInfoSearching,
    musicaInfoResults,
    musicaInfoSearchUrl,
    musicaInfoError,
    musicaInfoLoadingDetail,
    musicaInfoDetail,
  } = state;

  return (
    <Modal
      title={t('titles.editMetadata')}
      onClose={() => dispatch({ type: 'CLOSE_EDIT_MODAL' })}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={() => dispatch({ type: 'CLOSE_EDIT_MODAL' })}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="edit-title-meta-form" className="btn btn-primary" disabled={saving}>
            {saving ? `${t('common.save')}...` : t('common.save')}
          </button>
        </>
      }
    >
      <form id="edit-title-meta-form" onSubmit={onSubmit}>
        {/* Geen FormField: het veld zit samen met de zoekknop in een flex-omhulsel,
            dus het kind van de form-group is niet het invoerveld zelf. */}
        <div className="form-group">
          <label className="form-label" htmlFor="edit-title-meta-titel">
            {t('myMusic.table.title')}
          </label>
          <div className="flex gap-2">
            <input
              id="edit-title-meta-titel"
              type="text"
              className="form-control"
              value={editingTitle.title}
              disabled
              style={{ flex: 1 }}
            />
            <div className="dropdown" style={{ position: 'relative' }} ref={zoekmenuRef}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setZoekmenuOpen((open) => !open)}
                title={t('titles.searchOnSites')}
                aria-expanded={zoekmenuOpen}
              >
                <Icon name="search" size={16} />
              </button>
              {zoekmenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    // Het vlak van het venster zelf, dus in beide thema's goed.
                    background: 'var(--surface)',
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
                  <button
                    type="button"
                    onClick={() => {
                      setZoekmenuOpen(false);
                      dispatch({ type: 'SHOW_IMSLP_SEARCH', payload: editingTitle.title });
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.5rem 1rem',
                      color: 'inherit',
                      textDecoration: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                    // Aanwijzen licht de regel op; loslaten geeft het vlak van
                    // het menu eronder terug in plaats van een vaste kleur.
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {t('imslp.findOnImslp')}
                  </button>
                  {searchSheetMusicWebsites(editingTitle.title).map((site) => (
                    <a
                      key={site.name}
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setZoekmenuOpen(false)}
                      style={{
                        display: 'block',
                        padding: '0.5rem 1rem',
                        color: 'inherit',
                        textDecoration: 'none',
                        borderBottom: '1px solid var(--border)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {site.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {editingTitle.arranger && (
          <FormField label={t('titles.arranger')}>
            <input type="text" className="form-control" value={editingTitle.arranger} disabled />
          </FormField>
        )}

        {/* MusicaInfo.net lookup section */}
        <MusicaInfoPanel
          musicaInfoSearching={musicaInfoSearching}
          musicaInfoResults={musicaInfoResults}
          musicaInfoSearchUrl={musicaInfoSearchUrl}
          musicaInfoError={musicaInfoError}
          musicaInfoLoadingDetail={musicaInfoLoadingDetail}
          musicaInfoDetail={musicaInfoDetail}
          onSearch={onSearchMusicaInfo}
          onLoadDetail={onLoadMusicaInfoDetail}
          onApply={onApplyMusicaInfoDetail}
          onReset={() => dispatch({ type: 'MUSICAINFO_RESET' })}
        />

        {/* Geen FormField: veld en ophaalknop zitten samen in een flex-omhulsel. */}
        <div className="form-group">
          <label className="form-label" htmlFor="edit-title-meta-youtube">
            {t('titles.youtubeUrl')}
          </label>
          <div className="flex gap-2">
            <input
              id="edit-title-meta-youtube"
              type="url"
              className="form-control"
              value={titleMetaForm.youtubeUrl}
              onChange={(e) => {
                dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { youtubeUrl: e.target.value } });
                dispatch({ type: 'SET_YOUTUBE_META', payload: null });
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={onFetchYouTube}
              disabled={!titleMetaForm.youtubeUrl || fetchingYouTube}
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
        <div className="grid grid-2">
          <FormField label={t('titles.durationFormat')}>
            <input
              type="text"
              className="form-control"
              value={titleMetaForm.durationStr}
              onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { durationStr: e.target.value } })}
              placeholder="3:45"
              pattern="[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?"
            />
          </FormField>
          <FormField label={t('titles.difficulty')}>
            <input
              type="text"
              className="form-control"
              value={titleMetaForm.grade}
              onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { grade: e.target.value } })}
              placeholder={t('titles.difficultyPlaceholder')}
            />
          </FormField>
        </div>
        <div className="form-group">
          {/* Bijschrift, geen veldlabel: hieronder staat een <audio>, een
              bijlagestrook of een verborgen bestandsveld achter een knop. Geen
              van drieën is een bedienbaar veld om een label aan te hangen. */}
          <span className="form-label">{t('titles.mp3Preview')}</span>
          {currentMp3Path ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <audio controls src={getMp3Url(currentMp3Path)} style={{ flex: 1, height: '40px' }} />
              <button type="button" className="btn btn-danger btn-sm" onClick={onMp3Delete} title={t('common.delete')}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ) : pendingMp3File ? (
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                padding: '0.5rem',
                background: 'var(--background)',
                borderRadius: '0.25rem',
              }}
            >
              <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="paperclip" size={16} /> {pendingMp3File.name}
                <span style={{ color: 'var(--text-light)', marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                  ({(pendingMp3File.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  dispatch({ type: 'SET_PENDING_MP3_FILE', payload: null });
                  if (mp3InputRef.current) mp3InputRef.current.value = '';
                }}
                title={t('common.delete')}
              >
                ×
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={mp3InputRef}
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (editingTitle?.id) {
                      onMp3Upload(e);
                    } else {
                      dispatch({ type: 'SET_PENDING_MP3_FILE', payload: file });
                    }
                  }
                }}
                disabled={uploadingMp3}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => mp3InputRef.current?.click()}
                disabled={uploadingMp3}
              >
                {uploadingMp3 ? (
                  t('upload.uploading')
                ) : (
                  <>
                    <Icon name="upload" size={16} /> {t('titles.selectMp3')}
                  </>
                )}
              </button>
              {!editingTitle?.id && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--text-light)', fontSize: '0.875rem' }}>
                  {t('titles.uploadOnSave')}
                </span>
              )}
            </div>
          )}
        </div>
        <FormField label={t('titles.description')}>
          <textarea
            className="form-control"
            value={titleMetaForm.description}
            onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { description: e.target.value } })}
            rows={3}
            placeholder={t('titles.descriptionPlaceholder')}
          />
        </FormField>
        {/* Geen FormField: hulptekst naast het veld in dezelfde form-group. */}
        <div className="form-group">
          <label className="form-label" htmlFor="edit-title-meta-notities">
            {t('titles.internalNotes')}
          </label>
          <textarea
            id="edit-title-meta-notities"
            aria-describedby="edit-title-meta-notities-hulp"
            className="form-control"
            value={titleMetaForm.internalNotes}
            onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { internalNotes: e.target.value } })}
            rows={2}
            placeholder={t('titles.internalNotesPlaceholder')}
            style={{ background: 'var(--warning-bg, #fff8e1)', borderColor: 'var(--warning, #ffc107)' }}
          />
          <small id="edit-title-meta-notities-hulp" className="text-light">
            {t('titles.internalNotesHelp')}
          </small>
        </div>
        <div className="form-group">
          {/* Kop boven een groep aankruisvakjes, geen veldlabel: elk vakje heeft
              zijn eigen label al. De groep krijgt hier een naam via role="group"
              en aria-labelledby. */}
          <span className="form-label" id="edit-title-meta-genres-kop">
            {t('titles.genres')}
          </span>
          <div
            className="checkbox-grid"
            role="group"
            aria-labelledby="edit-title-meta-genres-kop"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
          >
            {genres.map((genre) => (
              <label
                key={genre.id}
                className="checkbox-item"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.25rem 0.5rem',
                  background: titleMetaForm.genreIds.includes(genre.id) ? 'var(--primary)' : 'var(--background)',
                  color: titleMetaForm.genreIds.includes(genre.id) ? 'white' : 'inherit',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={titleMetaForm.genreIds.includes(genre.id)}
                  onChange={() => onToggleGenre(genre.id)}
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
              checked={titleMetaForm.isShared}
              onChange={(e) => dispatch({ type: 'UPDATE_TITLE_META_FORM', payload: { isShared: e.target.checked } })}
            />
            <span style={{ marginLeft: '0.5rem' }}>{t('titles.sharingAllowed')}</span>
          </label>
        </div>

        {/* Streaming Links Section */}
        {editingTitle.id && (
          <div
            className="form-group"
            style={{
              background: 'var(--background)',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '0.875rem' }}>{t('streaming.title')}</strong>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => dispatch({ type: 'SET_SHOW_STREAMING_EDITOR', payload: true })}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
              >
                {t('streaming.manageLinks')}
              </button>
            </div>
            {editingTitle.streamingLinks && (
              <div style={{ marginTop: '0.5rem' }}>
                <StreamingLinks links={editingTitle.streamingLinks} compact />
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
