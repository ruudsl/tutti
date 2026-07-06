import { currentLocale } from '../utils/locale';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { triggerHaptic } from '../hooks/useHapticFeedback';

interface SetlistPiece {
  id: string;
  title: string;
  composer?: string;
  duration?: number; // in seconds
  notes?: string;
}

interface SetlistModeProps {
  /** List of pieces to perform */
  pieces: SetlistPiece[];
  /** Title of the concert/performance */
  title?: string;
  /** Callback when a piece is selected */
  onPieceSelect?: (piece: SetlistPiece, index: number) => void;
  /** Callback when setlist mode is exited */
  onExit?: () => void;
  /** Starting piece index */
  initialIndex?: number;
  /** Show clock */
  showClock?: boolean;
}

/**
 * Setlist/Performance mode component.
 * Full-screen display optimized for live performance with large, readable text.
 */
export function SetlistMode({
  pieces,
  title = 'Concert',
  onPieceSelect,
  onExit,
  initialIndex = 0,
  showClock = true,
}: SetlistModeProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const currentPiece = pieces[currentIndex];
  const prevPiece = currentIndex > 0 ? pieces[currentIndex - 1] : null;
  const nextPiece = currentIndex < pieces.length - 1 ? pieces[currentIndex + 1] : null;

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Navigation handlers (defined before useEffect that uses them)
  const goToNext = useCallback(() => {
    if (currentIndex < pieces.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      onPieceSelect?.(pieces[newIndex], newIndex);
      triggerHaptic('light');
    }
  }, [currentIndex, pieces, onPieceSelect]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      onPieceSelect?.(pieces[newIndex], newIndex);
      triggerHaptic('light');
    }
  }, [currentIndex, pieces, onPieceSelect]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < pieces.length) {
        setCurrentIndex(index);
        onPieceSelect?.(pieces[index], index);
        triggerHaptic('selection');
      }
    },
    [pieces, onPieceSelect],
  );

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setIsFullscreen(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      exitFullscreen();
    }
  }, [exitFullscreen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goToNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goToPrevious();
          break;
        case 'Home':
          e.preventDefault();
          goToIndex(0);
          break;
        case 'End':
          e.preventDefault();
          goToIndex(pieces.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          if (isFullscreen) {
            exitFullscreen();
          } else {
            onExit?.();
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          setShowNotes((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, goToIndex, toggleFullscreen, exitFullscreen, pieces.length, isFullscreen, onExit]);

  // Format duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="setlist-mode"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0f172a',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        fontFamily: 'var(--font-family)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onExit}
            style={{
              background: 'none',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Icon name="chevronLeft" size={18} />
            {t('common.back', 'Terug')}
          </button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {showClock && (
            <div style={{ fontSize: '1.5rem', fontFamily: 'monospace', opacity: 0.8 }}>
              {currentTime.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div style={{ fontSize: '1rem', opacity: 0.7 }}>
            {currentIndex + 1} / {pieces.length}
          </div>
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'none',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px',
              color: 'white',
              cursor: 'pointer',
            }}
            title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          >
            <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={20} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          textAlign: 'center',
        }}
      >
        {/* Previous piece (faded) */}
        {prevPiece && (
          <div
            style={{
              opacity: 0.3,
              marginBottom: '24px',
              cursor: 'pointer',
            }}
            onClick={goToPrevious}
          >
            <div style={{ fontSize: '1rem', color: '#94a3b8' }}>
              <Icon name="chevronUp" size={16} style={{ marginRight: '8px' }} />
              {prevPiece.title}
            </div>
          </div>
        )}

        {/* Current piece */}
        {currentPiece && (
          <div>
            <div
              style={{
                fontSize: 'clamp(2rem, 8vw, 5rem)',
                fontWeight: 700,
                lineHeight: 1.1,
                marginBottom: '16px',
              }}
            >
              {currentPiece.title}
            </div>
            {currentPiece.composer && (
              <div
                style={{
                  fontSize: 'clamp(1rem, 3vw, 2rem)',
                  color: '#94a3b8',
                  marginBottom: '8px',
                }}
              >
                {currentPiece.composer}
              </div>
            )}
            {currentPiece.duration && (
              <div
                style={{
                  fontSize: '1.25rem',
                  color: '#64748b',
                  fontFamily: 'monospace',
                }}
              >
                {formatDuration(currentPiece.duration)}
              </div>
            )}

            {/* Notes */}
            {showNotes && currentPiece.notes && (
              <div
                style={{
                  marginTop: '24px',
                  padding: '16px 24px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  fontSize: '1.125rem',
                  maxWidth: '600px',
                  lineHeight: 1.6,
                }}
              >
                {currentPiece.notes}
              </div>
            )}
          </div>
        )}

        {/* Next piece (faded) */}
        {nextPiece && (
          <div
            style={{
              opacity: 0.3,
              marginTop: '32px',
              cursor: 'pointer',
            }}
            onClick={goToNext}
          >
            <div style={{ fontSize: '1rem', color: '#94a3b8' }}>
              {nextPiece.title}
              <Icon name="chevronDown" size={16} style={{ marginLeft: '8px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 40px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <button
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          style={{
            padding: '16px 32px',
            fontSize: '1.125rem',
            background: currentIndex === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            color: currentIndex === 0 ? 'rgba(255, 255, 255, 0.3)' : 'white',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Icon name="chevronLeft" size={20} />
          {t('common.previous', 'Vorige')}
        </button>

        <button
          onClick={() => setShowNotes((prev) => !prev)}
          style={{
            padding: '12px 20px',
            background: showNotes ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
          title="Toggle notes (N)"
        >
          <Icon name="fileText" size={18} />
        </button>

        <button
          onClick={goToNext}
          disabled={currentIndex === pieces.length - 1}
          style={{
            padding: '16px 32px',
            fontSize: '1.125rem',
            background: currentIndex === pieces.length - 1 ? 'transparent' : 'var(--primary)',
            border: 'none',
            borderRadius: '12px',
            color: currentIndex === pieces.length - 1 ? 'rgba(255, 255, 255, 0.3)' : 'white',
            cursor: currentIndex === pieces.length - 1 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {t('common.next', 'Volgende')}
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      {/* Piece list sidebar (mini) */}
      <div
        style={{
          position: 'absolute',
          right: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {pieces.map((piece, index) => (
          <button
            key={piece.id}
            onClick={() => goToIndex(index)}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: index === currentIndex ? 'var(--primary)' : 'rgba(255, 255, 255, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title={piece.title}
          />
        ))}
      </div>
    </div>
  );
}

export default SetlistMode;
