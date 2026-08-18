import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface MetronomeProps {
  compact?: boolean;
}

export function Metronome({ compact = false }: MetronomeProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [currentBeat, setCurrentBeat] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const bpmRef = useRef(bpm);
  const beatsPerMeasureRef = useRef(beatsPerMeasure);

  // Keep refs in sync with state
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsPerMeasureRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);

  // Audio scheduling constants
  const scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)
  const lookahead = 25; // How frequently to call scheduling function (ms)

  const createClick = useCallback((time: number, isAccent: boolean) => {
    if (!audioContextRef.current) return;

    const osc = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    // Accent on first beat of measure
    osc.frequency.value = isAccent ? 1000 : 800;
    gainNode.gain.setValueAtTime(isAccent ? 1 : 0.5, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
  }, []);

  const scheduleNote = useCallback(
    (beatNumber: number, time: number) => {
      const isAccent = beatNumber === 0;
      createClick(time, isAccent);
      setCurrentBeat(beatNumber);
    },
    [createClick],
  );

  const scheduler = useCallback(() => {
    if (!audioContextRef.current || !isPlayingRef.current) return;

    // Use refs to always get current values
    const secondsPerBeat = 60.0 / bpmRef.current;

    while (nextNoteTimeRef.current < audioContextRef.current.currentTime + scheduleAheadTime) {
      scheduleNote(currentBeatRef.current, nextNoteTimeRef.current);
      nextNoteTimeRef.current += secondsPerBeat;
      currentBeatRef.current = (currentBeatRef.current + 1) % beatsPerMeasureRef.current;
    }
  }, [scheduleNote]);

  const startMetronome = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    isPlayingRef.current = true;
    setIsPlaying(true);
    currentBeatRef.current = 0;
    nextNoteTimeRef.current = audioContextRef.current.currentTime;

    const scheduleLoop = () => {
      if (isPlayingRef.current) {
        scheduler();
        timerIdRef.current = window.setTimeout(scheduleLoop, lookahead);
      }
    };
    scheduleLoop();
  }, [scheduler]);

  const stopMetronome = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    setCurrentBeat(0);

    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  const toggleMetronome = () => {
    if (isPlaying) {
      stopMetronome();
    } else {
      startMetronome();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMetronome();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopMetronome]);

  // Tap tempo feature
  const tapTimesRef = useRef<number[]>([]);
  const handleTapTempo = () => {
    const now = Date.now();
    tapTimesRef.current.push(now);

    // Keep only taps within last 3 seconds
    tapTimesRef.current = tapTimesRef.current.filter((t) => now - t < 3000);

    if (tapTimesRef.current.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(60000 / avgInterval);
      if (newBpm >= 30 && newBpm <= 300) {
        setBpm(newBpm);
      }
    }
  };

  if (compact) {
    return (
      <div className="metronome-compact">
        <div className="flex gap-2 items-center">
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'} btn-sm`}
            onClick={toggleMetronome}
            title={isPlaying ? t('tools.metronome.stopTitle') : t('tools.metronome.startTitle')}
          >
            {isPlaying ? '⏹' : '▶'}
          </button>
          <input
            type="number"
            className="form-control"
            value={bpm}
            onChange={(e) => setBpm(Math.max(30, Math.min(300, parseInt(e.target.value) || 120)))}
            min={30}
            max={300}
            style={{ width: '70px', textAlign: 'center' }}
          />
          <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{t('tools.metronome.bpm')}</span>
          <div className="beat-indicators" style={{ display: 'flex', gap: '4px', marginLeft: '0.5rem' }}>
            {Array.from({ length: beatsPerMeasure }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor:
                    isPlaying && currentBeat === i ? (i === 0 ? 'var(--danger)' : 'var(--primary)') : 'var(--border)',
                  transition: 'background-color 0.05s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="metronome card">
      <div className="card-body">
        <h4 style={{ marginBottom: '1rem' }}>{t('tools.metronome.title')}</h4>

        <div
          className="beat-display"
          style={{
            textAlign: 'center',
            marginBottom: '1rem',
            padding: '1rem',
            background: 'var(--background)',
            borderRadius: '0.5rem',
          }}
        >
          <div
            style={{
              fontSize: '3rem',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              color: isPlaying ? 'var(--primary)' : 'var(--text-light)',
            }}
          >
            {bpm}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>{t('tools.metronome.bpm')}</div>

          <div
            className="beat-indicators"
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '1rem',
            }}
          >
            {Array.from({ length: beatsPerMeasure }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: i === 0 ? '20px' : '16px',
                  height: i === 0 ? '20px' : '16px',
                  borderRadius: '50%',
                  backgroundColor:
                    isPlaying && currentBeat === i ? (i === 0 ? 'var(--danger)' : 'var(--primary)') : 'var(--border)',
                  transition: 'background-color 0.05s',
                }}
              />
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('tools.metronome.tempoLabel', { bpm })}</label>
          <input
            type="range"
            className="form-control"
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            min={30}
            max={300}
            style={{ width: '100%' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t('tools.metronome.timeSignature')}</label>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6].map((beats) => (
              <button
                key={beats}
                className={`btn ${beatsPerMeasure === beats ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => setBeatsPerMeasure(beats)}
              >
                {beats}/4
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2" style={{ marginTop: '1rem' }}>
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'}`}
            onClick={toggleMetronome}
            style={{ flex: 1 }}
          >
            {isPlaying ? `⏹ ${t('tools.metronome.stop')}` : `▶ ${t('tools.metronome.start')}`}
          </button>
          <button className="btn btn-outline" onClick={handleTapTempo} title={t('tools.metronome.tapTitle')}>
            {t('tools.metronome.tap')}
          </button>
        </div>
      </div>
    </div>
  );
}
