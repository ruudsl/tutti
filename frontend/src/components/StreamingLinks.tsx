import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { StreamingLinks as StreamingLinksType } from '../types';

interface StreamingLinksProps {
  links: StreamingLinksType | null | undefined;
  compact?: boolean;
  showPreview?: boolean;
}

/**
 * Component to display streaming platform links and inline player
 */
export function StreamingLinks({ links, compact = false, showPreview = true }: StreamingLinksProps) {
  const { t } = useTranslation();
  const [playingPreview, setPlayingPreview] = useState<'spotify' | 'apple' | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!links) {
    return null;
  }

  const hasSpotify = !!links.spotify_url;
  const hasAppleMusic = !!links.apple_music_url;
  const hasYouTubeMusic = !!links.youtube_music_url;

  if (!hasSpotify && !hasAppleMusic && !hasYouTubeMusic) {
    return null;
  }

  const handlePlayPreview = (platform: 'spotify' | 'apple') => {
    const previewUrl = platform === 'spotify' ? links.spotify_preview_url : links.apple_music_preview_url;

    if (!previewUrl) return;

    if (playingPreview === platform) {
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
      setPlayingPreview(platform);
    }
  };

  if (compact) {
    return (
      <div className="streaming-links streaming-links-compact" style={{ display: 'flex', gap: '0.5rem' }}>
        {hasSpotify && (
          <a
            href={links.spotify_url!}
            target="_blank"
            rel="noopener noreferrer"
            title={t('streaming.openInSpotify')}
            className="streaming-link streaming-link-spotify"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#1DB954',
              color: 'white',
              textDecoration: 'none',
            }}
          >
            <SpotifyIcon size={16} />
          </a>
        )}
        {hasAppleMusic && (
          <a
            href={links.apple_music_url!}
            target="_blank"
            rel="noopener noreferrer"
            title={t('streaming.openInAppleMusic')}
            className="streaming-link streaming-link-apple"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#FA243C',
              color: 'white',
              textDecoration: 'none',
            }}
          >
            <AppleMusicIcon size={16} />
          </a>
        )}
        {hasYouTubeMusic && (
          <a
            href={links.youtube_music_url!}
            target="_blank"
            rel="noopener noreferrer"
            title={t('streaming.openInYouTubeMusic')}
            className="streaming-link streaming-link-youtube"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#FF0000',
              color: 'white',
              textDecoration: 'none',
            }}
          >
            <YouTubeMusicIcon size={16} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="streaming-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {hasSpotify && (
          <a
            href={links.spotify_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#1DB954',
              color: 'white',
              border: 'none',
              textDecoration: 'none',
            }}
          >
            <SpotifyIcon size={16} />
            <span>Spotify</span>
          </a>
        )}
        {hasAppleMusic && (
          <a
            href={links.apple_music_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#FA243C',
              color: 'white',
              border: 'none',
              textDecoration: 'none',
            }}
          >
            <AppleMusicIcon size={16} />
            <span>Apple Music</span>
          </a>
        )}
        {hasYouTubeMusic && (
          <a
            href={links.youtube_music_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#FF0000',
              color: 'white',
              border: 'none',
              textDecoration: 'none',
            }}
          >
            <YouTubeMusicIcon size={16} />
            <span>YouTube Music</span>
          </a>
        )}
      </div>

      {/* Preview buttons */}
      {showPreview && (links.spotify_preview_url || links.apple_music_preview_url) && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{t('streaming.preview')}:</span>
          {links.spotify_preview_url && (
            <button
              type="button"
              onClick={() => handlePlayPreview('spotify')}
              className="btn btn-outline btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
              }}
              title={playingPreview === 'spotify' ? t('streaming.stopPreview') : t('streaming.playPreview')}
            >
              {playingPreview === 'spotify' ? <StopIcon size={12} /> : <PlayIcon size={12} />}
              <SpotifyIcon size={12} />
            </button>
          )}
          {links.apple_music_preview_url && (
            <button
              type="button"
              onClick={() => handlePlayPreview('apple')}
              className="btn btn-outline btn-sm"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
              }}
              title={playingPreview === 'apple' ? t('streaming.stopPreview') : t('streaming.playPreview')}
            >
              {playingPreview === 'apple' ? <StopIcon size={12} /> : <PlayIcon size={12} />}
              <AppleMusicIcon size={12} />
            </button>
          )}
        </div>
      )}
    </div>
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

function YouTubeMusicIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z" />
    </svg>
  );
}

function PlayIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function StopIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <rect x="6" y="6" width="12" height="12" />
    </svg>
  );
}

export default StreamingLinks;
