import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { triggerHaptic, isHapticSupported } from '../hooks/useHapticFeedback';

interface PracticeGoal {
  id: string;
  name: string;
  targetMinutes: number;
  completedMinutes: number;
}

interface PracticeTimerProps {
  /** ID of the music piece being practiced (reserved for future use) */
  _musicPieceId?: string;
  /** Name of the music piece */
  musicPieceName?: string;
  /** Callback when practice session ends */
  onSessionEnd?: (durationMinutes: number) => void;
  /** Compact mode */
  compact?: boolean;
}

/**
 * Practice timer with goals tracking.
 * Helps musicians track their practice time with preset or custom goals.
 */
export function PracticeTimer({ musicPieceName, onSessionEnd, compact = false }: PracticeTimerProps) {
  const { t } = useTranslation();
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [goalMinutes, setGoalMinutes] = useState(30);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  // Goals state reserved for future feature expansion
  const [_goals, _setGoals] = useState<PracticeGoal[]>([]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const notifiedRef = useRef(false);

  // Load goals from localStorage
  useEffect(() => {
    const savedGoals = localStorage.getItem('practiceGoals');
    if (savedGoals) {
      _setGoals(JSON.parse(savedGoals));
    }
  }, []);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - elapsedSeconds * 1000;
      }

      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - (startTimeRef.current || now)) / 1000);
        setElapsedSeconds(elapsed);

        // Notify when goal is reached
        if (!notifiedRef.current && elapsed >= goalMinutes * 60) {
          notifiedRef.current = true;
          if (isHapticSupported()) {
            triggerHaptic('success');
          }
          // Play a notification sound if available
          try {
            const audio = new Audio(
              'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR0JNYvL06RkFQQynNrUhUcN',
            );
            audio.volume = 0.3;
            audio.play().catch(() => {});
          } catch {
            // Notification sound is best-effort; ignore playback errors
          }
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, goalMinutes]);

  const handleStart = useCallback(() => {
    setIsRunning(true);
    notifiedRef.current = false;
    if (isHapticSupported()) {
      triggerHaptic('light');
    }
  }, []);

  const handlePause = useCallback(() => {
    setIsRunning(false);
    // Het starttijdstip moet los, anders telt de pauze straks mee: het effect
    // hierboven laat `startTimeRef` met rust zolang het gevuld is, en berekent
    // de verstreken tijd bij het hervatten weer vanaf dat oude tijdstip. Bij
    // het hervatten wordt het opnieuw gezet, met de tot nu toe geoefende tijd
    // erin verrekend.
    startTimeRef.current = null;
    if (isHapticSupported()) {
      triggerHaptic('light');
    }
  }, []);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    const durationMinutes = Math.round(elapsedSeconds / 60);

    if (durationMinutes > 0 && onSessionEnd) {
      onSessionEnd(durationMinutes);
    }

    // Reset
    setElapsedSeconds(0);
    startTimeRef.current = null;
    notifiedRef.current = false;

    if (isHapticSupported()) {
      triggerHaptic('medium');
    }
  }, [elapsedSeconds, onSessionEnd]);

  const handleSetGoal = useCallback((minutes: number) => {
    setGoalMinutes(minutes);
    setShowGoalPicker(false);
    setCustomGoal('');
  }, []);

  const handleCustomGoal = useCallback(() => {
    const minutes = parseInt(customGoal);
    if (!isNaN(minutes) && minutes > 0 && minutes <= 480) {
      handleSetGoal(minutes);
    }
  }, [customGoal, handleSetGoal]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress
  const progress = Math.min((elapsedSeconds / (goalMinutes * 60)) * 100, 100);
  const isGoalReached = elapsedSeconds >= goalMinutes * 60;

  if (compact) {
    return (
      <div className="practice-timer-compact">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              color: isGoalReached ? 'var(--success)' : 'var(--text)',
            }}
          >
            {formatTime(elapsedSeconds)}
          </span>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>/ {goalMinutes}min</span>
          <button
            className={`btn ${isRunning ? 'btn-warning' : 'btn-primary'} btn-sm`}
            onClick={isRunning ? handlePause : handleStart}
          >
            {isRunning ? '⏸' : '▶'}
          </button>
          {(isRunning || elapsedSeconds > 0) && (
            <button className="btn btn-danger btn-sm" onClick={handleStop}>
              ⏹
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="practice-timer card">
      <div className="card-body">
        <h4 style={{ marginBottom: '1rem' }}>{t('tools.practiceTimer.title', 'Oefentimer')}</h4>

        {/* Current piece info */}
        {musicPieceName && (
          <div
            style={{
              backgroundColor: 'var(--background)',
              padding: '8px 12px',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem',
            }}
          >
            <span style={{ color: 'var(--text-light)' }}>{t('tools.practiceTimer.practicing', 'Oefenen')}:</span>{' '}
            <span style={{ fontWeight: 500 }}>{musicPieceName}</span>
          </div>
        )}

        {/* Timer display */}
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            backgroundColor: 'var(--background)',
            borderRadius: '12px',
            marginBottom: '1rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Progress bar background */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: `${progress}%`,
              height: '100%',
              backgroundColor: isGoalReached ? 'var(--success-light)' : 'var(--primary-light)',
              transition: 'width 1s linear, background-color 0.3s',
            }}
          />

          {/* Timer text */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                fontSize: '3.5rem',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                color: isGoalReached ? 'var(--success)' : isRunning ? 'var(--primary)' : 'var(--text)',
                lineHeight: 1,
              }}
            >
              {formatTime(elapsedSeconds)}
            </div>
            <div
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-light)',
                marginTop: '0.5rem',
              }}
            >
              {t('tools.practiceTimer.goal', 'Doel')}: {goalMinutes} {t('tools.practiceTimer.minutes', 'minuten')}
            </div>
            {isGoalReached && (
              <div
                style={{
                  marginTop: '0.5rem',
                  color: 'var(--success)',
                  fontWeight: 500,
                }}
              >
                {t('tools.practiceTimer.goalReached', 'Doel bereikt!')}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '1rem' }}>
          {!isRunning && elapsedSeconds === 0 && (
            <button className="btn btn-primary" onClick={handleStart} style={{ minWidth: '120px' }}>
              <Icon name="play" size={18} style={{ marginRight: '8px' }} />
              {t('tools.practiceTimer.start', 'Start')}
            </button>
          )}

          {isRunning && (
            <button className="btn btn-warning" onClick={handlePause} style={{ minWidth: '100px' }}>
              <Icon name="pause" size={18} style={{ marginRight: '8px' }} />
              {t('tools.practiceTimer.pause', 'Pauze')}
            </button>
          )}

          {!isRunning && elapsedSeconds > 0 && (
            <button className="btn btn-primary" onClick={handleStart} style={{ minWidth: '100px' }}>
              <Icon name="play" size={18} style={{ marginRight: '8px' }} />
              {t('tools.practiceTimer.resume', 'Verder')}
            </button>
          )}

          {(isRunning || elapsedSeconds > 0) && (
            <button className="btn btn-danger" onClick={handleStop} style={{ minWidth: '100px' }}>
              <Icon name="stop" size={18} style={{ marginRight: '8px' }} />
              {t('tools.practiceTimer.stop', 'Stop')}
            </button>
          )}
        </div>

        {/* Goal picker */}
        <div>
          <button className="btn btn-link" onClick={() => setShowGoalPicker(!showGoalPicker)}>
            {t('tools.practiceTimer.changeGoal', 'Doel wijzigen')}
          </button>

          {showGoalPicker && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {[15, 20, 30, 45, 60, 90].map((mins) => (
                  <button
                    key={mins}
                    className={`btn ${goalMinutes === mins ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => handleSetGoal(mins)}
                  >
                    {mins}min
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  className="form-control"
                  placeholder={t('tools.practiceTimer.customGoal', 'Aangepast (min)')}
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  min={1}
                  max={480}
                  style={{ width: '120px' }}
                />
                <button className="btn btn-outline btn-sm" onClick={handleCustomGoal} disabled={!customGoal}>
                  {t('common.apply', 'Toepassen')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PracticeTimer;
