import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { searchStreamingTracks, updateStreamingLinks, getStreamingStatus } from '../api';
import type { StreamingLinks } from '../types';
import { showSuccess, showError } from '../utils/toast';
import { isVeiligeLink } from '../utils/videoInsluiten';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface StreamingLinkEditorProps {
  titleId: string;
  titleName: string;
  composer?: string | null;
  currentLinks?: StreamingLinks | null;
  onClose: () => void;
  onSave?: () => void;
}

interface SearchResult {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
  previewUrl: string | null;
  url: string;
  platform: 'spotify' | 'apple';
}

export function StreamingLinkEditor({
  titleId,
  titleName,
  composer,
  currentLinks,
  onClose,
  onSave,
}: StreamingLinkEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Local state for links
  const [links, setLinks] = useState<StreamingLinks>(currentLinks || {});

  // Search state
  const [searchQuery, setSearchQuery] = useState(titleName);
  const [searchPlatform, setSearchPlatform] = useState<'spotify' | 'apple'>('spotify');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Preview playback
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get streaming status
  const { data: status } = useQuery({
    queryKey: ['streamingStatus'],
    queryFn: getStreamingStatus,
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      const data = await searchStreamingTracks(searchQuery, searchPlatform, composer || undefined);
      setSearchResults(data.results);
    } catch (error: any) {
      showError(error.response?.data?.error || t('streaming.searchError'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectTrack = (track: SearchResult) => {
    if (track.platform === 'spotify') {
      setLinks((prev) => ({
        ...prev,
        spotify_url: track.url,
        spotify_preview_url: track.previewUrl || undefined,
      }));
    } else if (track.platform === 'apple') {
      setLinks((prev) => ({
        ...prev,
        apple_music_url: track.url,
        apple_music_preview_url: track.previewUrl || undefined,
      }));
    }

    // Clear search results
    setSearchResults([]);
  };

  const handleRemoveLink = (platform: 'spotify' | 'apple' | 'youtube') => {
    if (platform === 'spotify') {
      setLinks((prev) => {
        const newLinks = { ...prev };
        delete newLinks.spotify_url;
        delete newLinks.spotify_preview_url;
        return newLinks;
      });
    } else if (platform === 'apple') {
      setLinks((prev) => {
        const newLinks = { ...prev };
        delete newLinks.apple_music_url;
        delete newLinks.apple_music_preview_url;
        return newLinks;
      });
    } else if (platform === 'youtube') {
      setLinks((prev) => {
        const newLinks = { ...prev };
        delete newLinks.youtube_music_url;
        return newLinks;
      });
    }
  };

  // Een adres dat gevuld is maar niet met http of https begint, is geen
  // streaminglink. Het invoerveld draagt wel `type="url"`, maar dat doet hier
  // niets: er staat geen formulier omheen en er wordt niets ingediend, dus de
  // browser controleert nooit iets. Alles wat iemand intypte ging zo naar de
  // server en kwam er als `href` weer uit - `javascript:alert(1)` incluis.
  const onveiligeAdressen = [links.spotify_url, links.apple_music_url, links.youtube_music_url].filter(
    (adres): adres is string => !!adres && !isVeiligeLink(adres),
  );

  const handleSave = async () => {
    if (onveiligeAdressen.length > 0) {
      showError(t('errors.invalidUrl'));
      return;
    }

    setIsSaving(true);

    try {
      await updateStreamingLinks(titleId, links);
      showSuccess(t('streaming.linksSaved'));
      queryClient.invalidateQueries({ queryKey: ['musicTitles'] });
      onSave?.();
      onClose();
    } catch (error: any) {
      showError(error.response?.data?.error || t('streaming.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayPreview = (previewUrl: string, trackId: string) => {
    if (playingPreview === trackId) {
      // Stop playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingPreview(null);
    } else {
      // Stop any existing playback
      if (audioRef.current) {
        audioRef.current.pause();
      }

      // Start new playback
      const audio = new Audio(previewUrl);
      audio.volume = 0.5;
      audio.onended = () => setPlayingPreview(null);
      audio.onerror = () => setPlayingPreview(null);
      audio.play();
      audioRef.current = audio;
      setPlayingPreview(trackId);
    }
  };

  const formatDuration = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ minWidth: '400px' }}>
      {/* Current Links */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>{t('streaming.currentLinks')}</h4>

        {!links.spotify_url && !links.apple_music_url && !links.youtube_music_url ? (
          <p style={{ color: 'var(--text-light)', fontSize: '0.875rem', fontStyle: 'italic' }}>
            {t('streaming.noLinks')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {links.spotify_url && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem',
                  backgroundColor: '#1DB95415',
                  borderRadius: '0.25rem',
                  border: '1px solid #1DB95450',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#1DB954', fontWeight: 500 }}>Spotify</span>
                  <OpenLink href={links.spotify_url} label={t('streaming.openLink')} />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLink('spotify')}
                  className="btn btn-sm btn-outline"
                  style={{ padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}

            {links.apple_music_url && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem',
                  backgroundColor: '#FA243C15',
                  borderRadius: '0.25rem',
                  border: '1px solid #FA243C50',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#FA243C', fontWeight: 500 }}>Apple Music</span>
                  <OpenLink href={links.apple_music_url} label={t('streaming.openLink')} />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLink('apple')}
                  className="btn btn-sm btn-outline"
                  style={{ padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}

            {links.youtube_music_url && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem',
                  backgroundColor: '#FF000015',
                  borderRadius: '0.25rem',
                  border: '1px solid #FF000050',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: '#FF0000', fontWeight: 500 }}>YouTube Music</span>
                  <OpenLink href={links.youtube_music_url} label={t('streaming.openLink')} />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveLink('youtube')}
                  className="btn btn-sm btn-outline"
                  style={{ padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual URL Input */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>{t('streaming.manualEntry')}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            type="url"
            className="form-control"
            placeholder={t('streaming.youtubeMusicUrlPlaceholder')}
            value={links.youtube_music_url || ''}
            onChange={(e) => setLinks((prev) => ({ ...prev, youtube_music_url: e.target.value || undefined }))}
            aria-invalid={!!links.youtube_music_url && !isVeiligeLink(links.youtube_music_url)}
            style={{ fontSize: '0.875rem' }}
          />
        </div>
      </div>

      {/* Search Section */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
          {t('streaming.searchForTrack')}
        </h4>

        {/* Platform selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setSearchPlatform('spotify')}
            disabled={!status?.spotify}
            className={`btn btn-sm ${searchPlatform === 'spotify' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              opacity: status?.spotify ? 1 : 0.5,
            }}
          >
            <SpotifyIcon size={14} />
            Spotify
          </button>
          <button
            type="button"
            onClick={() => setSearchPlatform('apple')}
            disabled={!status?.appleMusic}
            className={`btn btn-sm ${searchPlatform === 'apple' ? 'btn-primary' : 'btn-outline'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              opacity: status?.appleMusic ? 1 : 0.5,
            }}
          >
            <AppleMusicIcon size={14} />
            Apple Music
          </button>
        </div>

        {/* Search input */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-control"
            placeholder={t('streaming.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, fontSize: '0.875rem' }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="btn btn-primary"
          >
            {isSearching ? t('common.loading') : t('common.search')}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: '0.5rem',
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '0.25rem',
            }}
          >
            {searchResults.map((track) => (
              <div
                key={track.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.5rem',
                  borderBottom: '1px solid var(--border)',
                  gap: '0.5rem',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--background)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {/* Album art */}
                {track.albumArt && (
                  <img
                    src={track.albumArt}
                    alt=""
                    style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
                  />
                )}

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track.name}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-light)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {track.artist} - {track.album}
                  </div>
                </div>

                {/* Duration */}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                  {formatDuration(track.durationMs)}
                </span>

                {/* Preview button */}
                {track.previewUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPreview(track.previewUrl!, track.id);
                    }}
                    className="btn btn-sm btn-outline"
                    style={{ padding: '0.25rem 0.5rem' }}
                  >
                    {playingPreview === track.id ? '⏹' : '▶'}
                  </button>
                )}

                {/* Select button */}
                <button type="button" onClick={() => handleSelectTrack(track)} className="btn btn-sm btn-primary">
                  {t('common.select')}
                </button>
              </div>
            ))}
          </div>
        )}

        {!status?.spotify && !status?.appleMusic && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic' }}>
            {t('streaming.noServicesConfigured')}
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
        <button type="button" className="btn btn-outline" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </div>
  );
}

/**
 * Een verwijzing naar de dienst, en alleen als het adres veilig is.
 *
 * Een onveilig adres kan al in de gegevens staan van voor de controle
 * hierboven; het als `href` neerzetten voert die code uit zodra iemand erop
 * klikt. Dan liever geen verwijzing: het kopje van de dienst en de
 * verwijderknop blijven staan, dus de gebruiker kan hem opruimen.
 */
function OpenLink({ href, label }: { href: string; label: string }) {
  if (!isVeiligeLink(href)) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}
    >
      {label}
    </a>
  );
}

// SVG Icons

function SpotifyIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

function AppleMusicIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.8-.335-2.22-1.076-.26-.46-.35-.96-.27-1.483.11-.723.49-1.244 1.13-1.57.34-.174.72-.263 1.1-.327.41-.07.82-.12 1.23-.18.32-.05.59-.17.76-.47.12-.21.15-.44.15-.68v-5.06c0-.3-.07-.53-.36-.65-.19-.08-.39-.08-.6-.04-.63.12-1.26.25-1.89.38l-3.39.69c-.38.08-.64.28-.73.68-.02.09-.04.19-.04.28v7.6c0 .43-.05.85-.25 1.24-.29.58-.76.96-1.39 1.14-.35.1-.7.16-1.06.17-.94.04-1.78-.33-2.19-1.06-.26-.47-.36-.97-.28-1.5.11-.72.49-1.24 1.13-1.57.34-.17.72-.26 1.1-.33l.84-.14c.31-.05.62-.11.89-.27.36-.21.5-.54.51-.94V7.41c0-.4.11-.73.45-.96.2-.14.44-.22.68-.27l5.19-1.06c.6-.12 1.21-.25 1.81-.36.4-.08.75.1.88.49.04.11.06.24.06.36v4.49l.01-.02z" />
    </svg>
  );
}

export default StreamingLinkEditor;
