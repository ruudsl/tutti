import { useState, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createIssue } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { Modal } from './Modal';

interface ReportIssueModalProps {
  pieceId: string;
  pieceTitle: string;
  onClose: () => void;
}

export function ReportIssueModal({ pieceId, pieceTitle, onClose }: ReportIssueModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pageNumber, setPageNumber] = useState('');
  const [measureNumber, setMeasureNumber] = useState('');
  const [description, setDescription] = useState('');
  const pageInputId = useId();
  const measureInputId = useId();
  const descriptionId = useId();

  const createMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      showSuccess(t('myMusic.reportIssue.success'));
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('errors.generic'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      showError(t('myMusic.reportIssue.description'));
      return;
    }
    createMutation.mutate({
      musicPieceId: pieceId,
      pageNumber: pageNumber ? parseInt(pageNumber) : undefined,
      measureNumber: measureNumber || undefined,
      description: description.trim(),
    });
  };

  return (
    <Modal
      title={t('myMusic.reportIssue.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="report-issue-form"
            className="btn btn-primary"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? t('myMusic.reportIssue.submitting') : t('myMusic.reportIssue.submit')}
          </button>
        </>
      }
    >
      <form id="report-issue-form" onSubmit={handleSubmit}>
        <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
          {t('myMusic.reportIssue.piece')}: <strong>{pieceTitle}</strong>
        </p>

        <div className="grid grid-2" style={{ gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor={pageInputId} className="form-label">
              {t('myMusic.reportIssue.pageNumber')} ({t('common.optional')})
            </label>
            <input
              type="number"
              id={pageInputId}
              className="form-control"
              value={pageNumber}
              onChange={(e) => setPageNumber(e.target.value)}
              min={1}
              placeholder="Bijv. 2"
            />
          </div>
          <div className="form-group">
            <label htmlFor={measureInputId} className="form-label">
              {t('myMusic.reportIssue.measureNumber')} ({t('common.optional')})
            </label>
            <input
              type="text"
              id={measureInputId}
              className="form-control"
              value={measureNumber}
              onChange={(e) => setMeasureNumber(e.target.value)}
              placeholder="Bijv. 42 of 42-45"
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor={descriptionId} className="form-label">
            {t('myMusic.reportIssue.description')} *
          </label>
          <textarea
            id={descriptionId}
            className="form-control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={t('myMusic.reportIssue.descriptionPlaceholder')}
            required
            aria-required="true"
          />
        </div>
      </form>
    </Modal>
  );
}
