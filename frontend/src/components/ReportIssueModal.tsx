import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createIssue } from '../api';
import { showSuccess, showError } from '../utils/toast';

interface ReportIssueModalProps {
  pieceId: string;
  pieceTitle: string;
  onClose: () => void;
}

export function ReportIssueModal({ pieceId, pieceTitle, onClose }: ReportIssueModalProps) {
  const queryClient = useQueryClient();
  const [pageNumber, setPageNumber] = useState('');
  const [measureNumber, setMeasureNumber] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: createIssue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      showSuccess('Melding verstuurd naar de muziekcommissie');
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || 'Fout bij versturen melding');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      showError('Beschrijving is verplicht');
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Fout melden</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
              Meld een fout in: <strong>{pieceTitle}</strong>
            </p>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Paginanummer (optioneel)</label>
                <input
                  type="number"
                  className="form-control"
                  value={pageNumber}
                  onChange={(e) => setPageNumber(e.target.value)}
                  min={1}
                  placeholder="Bijv. 2"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Maat (optioneel)</label>
                <input
                  type="text"
                  className="form-control"
                  value={measureNumber}
                  onChange={(e) => setMeasureNumber(e.target.value)}
                  placeholder="Bijv. 42 of 42-45"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Beschrijving van de fout *</label>
              <textarea
                className="form-control"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Beschrijf de fout zo duidelijk mogelijk. Bijv: 'Maat 42: Bes moet een B zijn' of 'Pauze ontbreekt na de hele noot'"
                required
              />
            </div>

            <div style={{
              padding: '0.75rem',
              background: 'var(--background)',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: 'var(--text-light)'
            }}>
              <strong>Tip:</strong> Wees zo specifiek mogelijk. Vermeld het paginanummer,
              maatnummer en welke noot/rust het betreft.
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Annuleren
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Versturen...' : 'Melding versturen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
