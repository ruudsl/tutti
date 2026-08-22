/** De repertoirekaart van het detailscherm. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';
import type { RehearsalDetail } from '../../types';

export function PiecesCard({
  selectedRehearsal,
  isManager,
  editingPieces,
  setEditingPieces,
  handleStartEditPieces,
  pieces,
  setPieces,
  handleSavePieces,
}: {
  selectedRehearsal: RehearsalDetail;
  isManager: boolean | null;
  editingPieces: boolean;
  setEditingPieces: (waarde: boolean) => void;
  handleStartEditPieces: () => void;
  pieces: { title: string; notes: string }[];
  setPieces: (waarde: { title: string; notes: string }[]) => void;
  handleSavePieces: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.pieces')}</h2>
        {isManager && !editingPieces && (
          <button className="btn btn-primary btn-sm" onClick={handleStartEditPieces}>
            {t('common.edit')}
          </button>
        )}
      </div>
      <div className="card-body">
        {editingPieces ? (
          <div>
            {pieces.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'start' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('rehearsals.pieceTitle')}
                  value={p.title}
                  onChange={(e) => {
                    const next = [...pieces];
                    next[i].title = e.target.value;
                    setPieces(next);
                  }}
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  className="form-control"
                  placeholder={t('rehearsals.pieceNotesPlaceholder')}
                  value={p.notes}
                  onChange={(e) => {
                    const next = [...pieces];
                    next[i].notes = e.target.value;
                    setPieces(next);
                  }}
                  style={{ flex: 2 }}
                />
                <button className="btn btn-outline btn-sm" onClick={() => setPieces(pieces.filter((_, j) => j !== i))}>
                  &times;
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setPieces([...pieces, { title: '', notes: '' }])}
              >
                + {t('rehearsals.addPiece')}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSavePieces}>
                {t('rehearsals.savePieces')}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setEditingPieces(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : selectedRehearsal.pieces.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t('rehearsals.pieceTitle')}</th>
                <th scope="col">{t('rehearsals.pieceNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {selectedRehearsal.pieces.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{p.title}</strong>
                  </td>
                  <td style={{ color: 'var(--text-light)' }}>{p.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="piece-meta">{t('rehearsals.noPieces')}</p>
        )}
      </div>
    </div>
  );
}
