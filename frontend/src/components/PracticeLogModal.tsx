import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormModal } from './Modal';
import { useLogPractice } from '../hooks/usePractice';

interface PracticeLogModalProps {
  musicTitleId: string;
  musicTitle: string;
  onClose: () => void;
}

export function PracticeLogModal({ musicTitleId, musicTitle, onClose }: PracticeLogModalProps) {
  const { t } = useTranslation();
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const logPractice = useLogPractice();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await logPractice.mutateAsync({
      musicTitleId,
      durationMinutes: duration,
      notes: notes || undefined,
    });
    onClose();
  };

  const presetDurations = [15, 30, 45, 60, 90];

  return (
    <FormModal
      title={`${t('practice.log')}: ${musicTitle}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('common.save')}
      isSubmitting={logPractice.isPending}
    >
      <div className="form-group">
        <label className="form-label">{t('practice.duration')}</label>
        <div className="flex gap-1 mb-1">
          {presetDurations.map((d) => (
            <button
              key={d}
              type="button"
              className={`btn btn-sm ${duration === d ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setDuration(d)}
            >
              {d} min
            </button>
          ))}
        </div>
        <input
          type="number"
          className="form-control"
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
          min={1}
          max={480}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">
          {t('practice.notes')} ({t('common.optional')})
        </label>
        <textarea
          className="form-control"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Wat heb je geoefend? Moeilijke passages, tempo, etc."
        />
      </div>
    </FormModal>
  );
}
