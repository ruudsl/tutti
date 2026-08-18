import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface Note {
  name: string;
  frequency: number;
  octave: number;
}

// Standard tuning notes for orchestra
const NOTES: Note[] = [
  { name: 'A', frequency: 440.0, octave: 4 },
  { name: 'Bb', frequency: 466.16, octave: 4 },
  { name: 'B', frequency: 493.88, octave: 4 },
  { name: 'C', frequency: 523.25, octave: 5 },
  { name: 'C#', frequency: 554.37, octave: 5 },
  { name: 'D', frequency: 587.33, octave: 5 },
  { name: 'Eb', frequency: 622.25, octave: 5 },
  { name: 'E', frequency: 659.25, octave: 5 },
  { name: 'F', frequency: 698.46, octave: 5 },
  { name: 'F#', frequency: 739.99, octave: 5 },
  { name: 'G', frequency: 783.99, octave: 5 },
  { name: 'G#', frequency: 830.61, octave: 5 },
];

// Common tuning pitches for different instruments
const COMMON_PITCHES = [
  { name: 'A 440Hz', frequency: 440, description: 'Standaard stemtoon' },
  { name: 'A 442Hz', frequency: 442, description: 'Europese orkesten' },
  { name: 'A 443Hz', frequency: 443, description: 'Europese orkesten (hoog)' },
  { name: 'Bb', frequency: 466.16, description: 'Klarinet, trompet (Bb)' },
  { name: 'F', frequency: 349.23, description: 'Hoorn (F)' },
  { name: 'Eb', frequency: 311.13, description: 'Altsax, bariton (Eb)' },
];

interface PitchPipeProps {
  /** Compact mode for toolbar */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Pitch pipe component for tuning instruments.
 * Generates reference tones at standard tuning frequencies.
 */
export function PitchPipe({ compact = false, className = '' }: PitchPipeProps) {
  const { t } = useTranslation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [tuningPitch, setTuningPitch] = useState(440);
  const [showAllNotes, setShowAllNotes] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTone();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const playTone = useCallback(
    (frequency: number, noteName: string) => {
      const ctx = getAudioContext();

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Stop existing tone
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      }

      // Create oscillator and gain nodes
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Smooth envelope for pleasant sound
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime + 0.1);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();

      oscillatorRef.current = oscillator;
      gainNodeRef.current = gainNode;
      setIsPlaying(true);
      setActiveNote(noteName);
    },
    [getAudioContext],
  );

  const stopTone = useCallback(() => {
    if (oscillatorRef.current && gainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;

      // Fade out smoothly
      gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, ctx.currentTime);
      gainNodeRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);

      setTimeout(() => {
        if (oscillatorRef.current) {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
          oscillatorRef.current = null;
        }
      }, 100);
    }

    setIsPlaying(false);
    setActiveNote(null);
  }, []);

  const toggleTone = useCallback(
    (frequency: number, noteName: string) => {
      if (isPlaying && activeNote === noteName) {
        stopTone();
      } else {
        playTone(frequency, noteName);
      }
    },
    [isPlaying, activeNote, playTone, stopTone],
  );

  // Adjust frequency based on tuning pitch (A4 reference)
  const adjustFrequency = (baseFreq: number): number => {
    const ratio = tuningPitch / 440;
    return baseFreq * ratio;
  };

  if (compact) {
    return (
      <div className={`pitch-pipe-compact ${className}`}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className={`btn ${isPlaying ? 'btn-danger' : 'btn-primary'} btn-sm`}
            onClick={() => (isPlaying ? stopTone() : playTone(tuningPitch, `A${tuningPitch}`))}
            title={isPlaying ? t('tools.pitchPipe.stop', 'Stop') : t('tools.pitchPipe.play', 'Speel stemtoon')}
          >
            {isPlaying ? '⏹' : '🎵'} A {tuningPitch}Hz
          </button>
          <select
            className="form-control"
            value={tuningPitch}
            onChange={(e) => {
              const newPitch = parseInt(e.target.value);
              setTuningPitch(newPitch);
              if (isPlaying) {
                playTone(newPitch, `A${newPitch}`);
              }
            }}
            style={{ width: '90px' }}
          >
            <option value={440}>A 440Hz</option>
            <option value={442}>A 442Hz</option>
            <option value={443}>A 443Hz</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className={`pitch-pipe card ${className}`}>
      <div className="card-body">
        <h4 style={{ marginBottom: '1rem' }}>{t('tools.pitchPipe.title', 'Stemfluit')}</h4>

        {/* Tuning pitch selector */}
        <div className="form-group" style={{ marginBottom: '1rem' }}>
          <label className="form-label">{t('tools.pitchPipe.referencePitch', 'Referentietoon')}</label>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {[440, 442, 443].map((pitch) => (
              <button
                key={pitch}
                className={`btn ${tuningPitch === pitch ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => setTuningPitch(pitch)}
              >
                A {pitch}Hz
              </button>
            ))}
          </div>
        </div>

        {/* Common pitches */}
        <div style={{ marginBottom: '1rem' }}>
          <label className="form-label">{t('tools.pitchPipe.commonPitches', 'Veelgebruikte tonen')}</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '8px',
            }}
          >
            {COMMON_PITCHES.map((pitch) => (
              <button
                key={pitch.name}
                className={`btn ${activeNote === pitch.name ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => toggleTone(adjustFrequency(pitch.frequency), pitch.name)}
                title={pitch.description}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px 8px',
                }}
              >
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{pitch.name}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                  {Math.round(adjustFrequency(pitch.frequency))}Hz
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* All notes toggle */}
        <button
          className="btn btn-link"
          onClick={() => setShowAllNotes(!showAllNotes)}
          style={{ marginBottom: showAllNotes ? '1rem' : 0 }}
        >
          {showAllNotes
            ? t('tools.pitchPipe.hideAllNotes', 'Verberg alle noten')
            : t('tools.pitchPipe.showAllNotes', 'Toon alle noten')}
        </button>

        {/* All chromatic notes */}
        {showAllNotes && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: '6px',
            }}
          >
            {NOTES.map((note) => (
              <button
                key={`${note.name}${note.octave}`}
                className={`btn ${activeNote === `${note.name}${note.octave}` ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => toggleTone(adjustFrequency(note.frequency), `${note.name}${note.octave}`)}
                style={{ padding: '8px 4px' }}
              >
                <span style={{ fontWeight: 'bold' }}>{note.name}</span>
                <sub style={{ fontSize: '0.6em' }}>{note.octave}</sub>
              </button>
            ))}
          </div>
        )}

        {/* Stop button */}
        {isPlaying && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button className="btn btn-danger" onClick={stopTone} style={{ minWidth: '120px' }}>
              {t('tools.pitchPipe.stop', 'Stop')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PitchPipe;
