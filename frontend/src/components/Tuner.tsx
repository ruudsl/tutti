import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface TunerProps {
  compact?: boolean;
}

// Note frequencies for A4 = 440Hz
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQUENCY = 440;
const A4_MIDI_NUMBER = 69;

function frequencyToNote(frequency: number): { note: string; octave: number; cents: number } {
  // Convert frequency to MIDI note number
  const midiNote = 12 * Math.log2(frequency / A4_FREQUENCY) + A4_MIDI_NUMBER;
  const roundedMidi = Math.round(midiNote);

  // Calculate cents deviation (-50 to +50)
  const cents = Math.round((midiNote - roundedMidi) * 100);

  // Get note name and octave
  const noteIndex = ((roundedMidi % 12) + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;

  return {
    note: NOTE_NAMES[noteIndex],
    octave,
    cents,
  };
}

// Autocorrelation algorithm for pitch detection
function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  let bestOffset = -1;
  let bestCorrelation = 0;
  let rms = 0;
  let foundGoodCorrelation = false;

  // Check if there's enough signal
  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  if (rms < 0.01) {
    return -1; // Not enough signal
  }

  let lastCorrelation = 1;
  for (let offset = 0; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;

    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(buffer[i] - buffer[i + offset]);
    }

    correlation = 1 - correlation / MAX_SAMPLES;

    if (correlation > 0.9 && correlation > lastCorrelation) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      // We've found a good correlation, then a bad one, so we're done
      const shift = (buffer[bestOffset + 1] - buffer[bestOffset - 1]) / buffer[bestOffset];
      return sampleRate / (bestOffset + 8 * shift);
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01) {
    return sampleRate / bestOffset;
  }

  return -1;
}

export function Tuner({ compact = false }: TunerProps) {
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [octave, setOctave] = useState<number | null>(null);
  const [cents, setCents] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !bufferRef.current || !audioContextRef.current) return;

    analyserRef.current.getFloatTimeDomainData(bufferRef.current);
    const freq = autoCorrelate(bufferRef.current, audioContextRef.current.sampleRate);

    if (freq > 0 && freq < 2000) {
      setFrequency(Math.round(freq * 10) / 10);
      const noteInfo = frequencyToNote(freq);
      setNote(noteInfo.note);
      setOctave(noteInfo.octave);
      setCents(noteInfo.cents);
    } else {
      setFrequency(null);
      setNote(null);
      setOctave(null);
      setCents(0);
    }

    animationRef.current = requestAnimationFrame(analyze);
  }, []);

  const startListening = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Create analyser node
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;

      // Connect microphone to analyser
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      // Create buffer for analysis
      bufferRef.current = new Float32Array(analyserRef.current.fftSize);

      setIsListening(true);
      analyze();
    } catch (err: any) {
      setError(t('tools.tuner.micError'));
      console.error('Microphone error:', err);
    }
  }, [analyze, t]);

  const stopListening = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsListening(false);
    setFrequency(null);
    setNote(null);
    setOctave(null);
    setCents(0);
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  // Get tuning indicator color and position
  const getCentsColor = (c: number) => {
    const absCents = Math.abs(c);
    if (absCents <= 5) return 'var(--success)';
    if (absCents <= 10) return 'var(--warning)';
    return 'var(--danger)';
  };

  if (compact) {
    return (
      <div className="tuner-compact">
        <div className="flex gap-2 items-center">
          <button
            className={`btn ${isListening ? 'btn-danger' : 'btn-primary'} btn-sm`}
            onClick={toggleListening}
            title={isListening ? t('tools.tuner.stopTitle') : t('tools.tuner.startTitle')}
          >
            <Icon name={isListening ? 'square' : 'mic'} size={18} />
          </button>
          {isListening && note ? (
            <>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  minWidth: '40px',
                  textAlign: 'center',
                }}
              >
                {note}
                {octave}
              </span>
              <div
                style={{
                  width: '60px',
                  height: '8px',
                  background: 'var(--border)',
                  borderRadius: '4px',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '-2px',
                    width: '2px',
                    height: '12px',
                    background: 'var(--text-light)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: `${50 + cents}%`,
                    top: '-1px',
                    width: '8px',
                    height: '10px',
                    background: getCentsColor(cents),
                    borderRadius: '2px',
                    transform: 'translateX(-50%)',
                    transition: 'left 0.1s',
                  }}
                />
              </div>
            </>
          ) : isListening ? (
            <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>{t('tools.tuner.listening')}</span>
          ) : null}
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '0.25rem' }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="tuner card">
      <div className="card-body">
        <h4 style={{ marginBottom: '1rem' }}>{t('tools.tuner.title')}</h4>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div
          className="tuner-display"
          style={{
            textAlign: 'center',
            marginBottom: '1rem',
            padding: '1.5rem',
            background: 'var(--background)',
            borderRadius: '0.5rem',
          }}
        >
          {isListening && note ? (
            <>
              <div
                style={{
                  fontSize: '4rem',
                  fontWeight: 'bold',
                  fontFamily: 'monospace',
                  color: getCentsColor(cents),
                  lineHeight: 1,
                }}
              >
                {note}
                <span style={{ fontSize: '2rem' }}>{octave}</span>
              </div>
              <div
                style={{
                  fontSize: '1rem',
                  color: 'var(--text-light)',
                  marginTop: '0.5rem',
                }}
              >
                {frequency} Hz
              </div>

              {/* Cents meter */}
              <div
                style={{
                  marginTop: '1.5rem',
                  position: 'relative',
                  height: '30px',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: '10%',
                    right: '10%',
                    top: '10px',
                    height: '10px',
                    background:
                      'linear-gradient(to right, var(--danger), var(--warning), var(--success), var(--warning), var(--danger))',
                    borderRadius: '5px',
                  }}
                />
                {/* Center marker */}
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '0',
                    width: '2px',
                    height: '30px',
                    background: 'var(--text)',
                    transform: 'translateX(-50%)',
                  }}
                />
                {/* Current position indicator */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${50 + cents * 0.4}%`,
                    top: '5px',
                    width: '4px',
                    height: '20px',
                    background: 'white',
                    border: '2px solid var(--text)',
                    borderRadius: '2px',
                    transform: 'translateX(-50%)',
                    transition: 'left 0.1s ease-out',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-light)',
                }}
              >
                <span>-50</span>
                <span style={{ fontWeight: cents > -5 && cents < 5 ? 'bold' : 'normal' }}>
                  {cents > 0 ? '+' : ''}
                  {cents} cent
                </span>
                <span>+50</span>
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: '2rem',
                color: 'var(--text-light)',
                padding: '2rem 0',
              }}
            >
              {isListening ? t('tools.tuner.listening') : t('tools.tuner.clickToStart')}
            </div>
          )}
        </div>

        <button
          className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
          onClick={toggleListening}
          style={{ width: '100%' }}
        >
          <Icon name={isListening ? 'square' : 'mic'} size={18} />{' '}
          {isListening ? t('tools.tuner.stop') : t('tools.tuner.start')}
        </button>

        {isListening && (
          <p
            style={{
              marginTop: '1rem',
              fontSize: '0.875rem',
              color: 'var(--text-light)',
              textAlign: 'center',
            }}
          >
            {t('tools.tuner.tuningHelp')}
          </p>
        )}
      </div>
    </div>
  );
}
