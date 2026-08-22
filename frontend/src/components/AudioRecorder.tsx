import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FormModal } from './Modal';
import { Icon } from './Icon';
import { FormField } from './FormField';
import { useCreateRecording } from '../hooks/useAudioRecordings';
import { useOrchestras } from '../hooks/useOrchestras';
import { useMusicTitles } from '../hooks/useMusicTitles';

interface AudioRecorderProps {
  onClose: () => void;
  rehearsalId?: string;
  defaultMusicTitleId?: string;
  defaultOrchestraId?: string;
}

export function AudioRecorder({ onClose, rehearsalId, defaultMusicTitleId, defaultOrchestraId }: AudioRecorderProps) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orchestraId, setOrchestraId] = useState(defaultOrchestraId || '');
  const [musicTitleId, setMusicTitleId] = useState(defaultMusicTitleId || '');
  const [isPublic, setIsPublic] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const createRecording = useCreateRecording();
  const { data: orchestras } = useOrchestras();
  const { data: musicTitles } = useMusicTitles();

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert(t('audio.microphoneError'));
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        timerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      } else {
        mediaRecorderRef.current.pause();
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
      setIsPaused(!isPaused);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const resetRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioBlob || !title.trim()) return;

    await createRecording.mutateAsync({
      audio: audioBlob,
      title: title.trim(),
      description: description.trim() || undefined,
      orchestraId: orchestraId || undefined,
      rehearsalId,
      musicTitleId: musicTitleId || undefined,
      durationSeconds: recordingTime,
      isPublic,
    });
    onClose();
  };

  return (
    <FormModal
      title={t('audio.newRecording')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('common.save')}
      isSubmitting={createRecording.isPending}
      submitDisabled={!audioBlob || !title.trim()}
    >
      <div className="space-y-4">
        {/* Recording Controls */}
        <div className="card bg-base-200 p-4">
          <div className="text-center mb-4">
            <div className="text-4xl font-mono font-bold">{formatTime(recordingTime)}</div>
            {isRecording && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: isPaused ? '#eab308' : '#ef4444',
                    animation: isPaused ? 'none' : 'pulse 1.5s infinite',
                  }}
                />
                <span className="text-sm">{isPaused ? t('audio.paused') : t('audio.recording')}</span>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-2">
            {!isRecording && !audioBlob && (
              <button type="button" className="btn btn-primary btn-lg" onClick={startRecording}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="6" />
                </svg>
                {t('audio.start')}
              </button>
            )}

            {isRecording && (
              <>
                <button type="button" className="btn btn-warning" onClick={pauseRecording}>
                  <Icon name={isPaused ? 'play' : 'pause'} size={20} />
                  {isPaused ? t('audio.resume') : t('audio.pause')}
                </button>
                <button type="button" className="btn btn-error" onClick={stopRecording}>
                  <Icon name="square" size={20} />
                  {t('audio.stop')}
                </button>
              </>
            )}

            {audioBlob && !isRecording && (
              <button type="button" className="btn btn-outline" onClick={resetRecording}>
                {t('audio.reRecord')}
              </button>
            )}
          </div>
        </div>

        {/* Audio Preview */}
        {audioUrl && (
          <div className="form-group">
            {/* Bijschrift, geen veldlabel: een <audio> is geen bedienbaar
                formulierveld, dus er valt niets te koppelen. */}
            <span className="form-label">{t('audio.preview')}</span>
            <audio src={audioUrl} controls className="w-full" />
          </div>
        )}

        {/* Metadata Form */}
        {audioBlob && (
          <>
            <FormField label={`${t('common.title')} *`}>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('audio.titlePlaceholder')}
                required
              />
            </FormField>

            <FormField label={t('common.description')}>
              <textarea
                className="form-control"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={t('audio.descriptionPlaceholder')}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('common.orchestra')}>
                <select className="form-control" value={orchestraId} onChange={(e) => setOrchestraId(e.target.value)}>
                  <option value="">{t('common.selectOptional')}</option>
                  {orchestras?.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label={t('music.title')}>
                <select className="form-control" value={musicTitleId} onChange={(e) => setMusicTitleId(e.target.value)}>
                  <option value="">{t('common.selectOptional')}</option>
                  {musicTitles?.map((mt) => (
                    <option key={mt.id} value={mt.id}>
                      {mt.title}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="form-group">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span>{t('audio.makePublic')}</span>
              </label>
              <p className="text-sm text-base-content/60 mt-1">{t('audio.publicDescription')}</p>
            </div>
          </>
        )}
      </div>
    </FormModal>
  );
}
