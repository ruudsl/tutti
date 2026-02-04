import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMusicPieces,
  useUpdateMusicPiece,
  useDeleteMusicPiece,
  useRefreshInstrumentLinks,
} from '../hooks/useMusicPieces';
import { useInstruments } from '../hooks/useInstruments';
import { downloadMusicPiece, logActivity } from '../api';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { showError } from '../utils/toast';
import { useDebounce } from '../hooks/useDebounce';
import type { MusicPiece } from '../types';

export default function MusicPieces() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [editingPiece, setEditingPiece] = useState<MusicPiece | null>(null);
  const [deletingPiece, setDeletingPiece] = useState<MusicPiece | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Debounce search for API calls
  const debouncedSearch = useDebounce(search, 300);

  // Build filters object
  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    instrumentId: filterInstrument || undefined,
  }), [debouncedSearch, filterInstrument]);

  // TanStack Query hooks
  const { data: pieces = [], isLoading: piecesLoading } = useMusicPieces(filters);
  const { data: instruments = [], isLoading: instrumentsLoading } = useInstruments();

  const updateMutation = useUpdateMusicPiece();
  const deleteMutation = useDeleteMusicPiece();
  const refreshMutation = useRefreshInstrumentLinks();

  const isLoading = piecesLoading || instrumentsLoading;

  const handleDownload = async (pieceId: string) => {
    setDownloading(pieceId);
    try {
      await downloadMusicPiece(pieceId);
      // Log activity for statistics
      logActivity('download', 'music_piece', pieceId).catch(() => {});
    } catch (error) {
      showError(t('errors.generic'));
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = () => {
    if (!deletingPiece) return;

    deleteMutation.mutate(deletingPiece.id, {
      onSuccess: () => {
        setDeletingPiece(null);
      },
    });
  };

  const handleUpdatePiece = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPiece) return;

    updateMutation.mutate({
      id: editingPiece.id,
      data: {
        title: editingPiece.title,
        arranger: editingPiece.arranger || undefined,
        instrumentId: editingPiece.instrumentId || undefined,
        tuning: editingPiece.tuning || undefined,
        groupNumber: editingPiece.groupNumber || undefined,
        clef: editingPiece.clef || undefined,
        youtubeUrl: editingPiece.youtubeUrl || undefined,
      },
    }, {
      onSuccess: () => {
        setEditingPiece(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('musicPieces.title')}</h1>
        </div>
        <SkeletonTable rows={10} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('musicPieces.title')}</h1>
        <button
          className="btn btn-secondary"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          title={t('musicPieces.refreshLinks')}
        >
          {refreshMutation.isPending ? t('musicPieces.refreshing') : `🔄 ${t('musicPieces.refreshLinks')}`}
        </button>
      </div>

      <div className="card mb-2">
        <div className="card-body">
          <div className="flex gap-2 flex-wrap">
            <div className="form-group mb-0" style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                className="form-control"
                placeholder={t('musicPieces.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="form-group mb-0" style={{ minWidth: '200px' }}>
              <select
                className="form-control form-select"
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
              >
                <option value="">{t('musicPieces.allInstruments')}</option>
                <option value="__none__">{t('musicPieces.noInstrument')}</option>
                {instruments.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">{pieces.length} {t('musicPieces.count')}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {pieces.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>{t('myMusic.table.title')}</th>
                  <th>{t('myMusic.table.arranger')}</th>
                  <th>{t('myMusic.table.instrument')}</th>
                  <th>{t('myMusic.table.tuning')}</th>
                  <th>{t('myMusic.table.number')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((piece) => (
                  <tr key={piece.id}>
                    <td>
                      <strong>{piece.title}</strong>
                      <br />
                      <small style={{ color: 'var(--text-light)' }}>{piece.originalFilename}</small>
                    </td>
                    <td>{piece.arranger || '-'}</td>
                    <td>{piece.instrumentName || '-'}</td>
                    <td>{piece.tuning || '-'}</td>
                    <td>{piece.groupNumber || '-'}</td>
                    <td>
                      <div className="flex gap-1">
                        {piece.youtubeUrl && (
                          <a
                            href={piece.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-outline btn-sm"
                            title="YouTube preview"
                          >
                            ▶
                          </a>
                        )}
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDownload(piece.id)}
                          disabled={downloading === piece.id}
                          title={t('common.download')}
                        >
                          ⬇
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingPiece({ ...piece })}
                          title={t('common.edit')}
                        >
                          ✏
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingPiece(piece)}
                          title={t('common.delete')}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">🎵</div>
              <p>{t('musicPieces.noPieces')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingPiece && (
        <FormModal
          onClose={() => setEditingPiece(null)}
          onSubmit={handleUpdatePiece}
          title={t('musicPieces.edit.title')}
          submitLabel={t('common.save')}
          isSubmitting={updateMutation.isPending}
        >
          <>
            <div className="form-group">
              <label className="form-label">{t('musicPieces.edit.pieceTitle')}</label>
              <input
                type="text"
                className="form-control"
                value={editingPiece.title}
                onChange={(e) => setEditingPiece({ ...editingPiece, title: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('musicPieces.edit.arranger')}</label>
              <input
                type="text"
                className="form-control"
                value={editingPiece.arranger || ''}
                onChange={(e) => setEditingPiece({ ...editingPiece, arranger: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('musicPieces.edit.instrument')}</label>
              <select
                className="form-control form-select"
                value={editingPiece.instrumentId || ''}
                onChange={(e) => setEditingPiece({ ...editingPiece, instrumentId: e.target.value })}
              >
                <option value="">{t('musicPieces.edit.selectInstrument')}</option>
                {instruments.map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">{t('musicPieces.edit.tuning')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={editingPiece.tuning || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, tuning: e.target.value })}
                  placeholder={t('musicPieces.edit.tuningPlaceholder')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('musicPieces.edit.groupNumber')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={editingPiece.groupNumber || ''}
                  onChange={(e) => setEditingPiece({ ...editingPiece, groupNumber: e.target.value })}
                  placeholder={t('musicPieces.edit.groupPlaceholder')}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('musicPieces.edit.clef')}</label>
              <input
                type="text"
                className="form-control"
                value={editingPiece.clef || ''}
                onChange={(e) => setEditingPiece({ ...editingPiece, clef: e.target.value })}
                placeholder={t('musicPieces.edit.clefPlaceholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('musicPieces.edit.youtubeUrl')}</label>
              <input
                type="url"
                className="form-control"
                value={editingPiece.youtubeUrl || ''}
                onChange={(e) => setEditingPiece({ ...editingPiece, youtubeUrl: e.target.value })}
                placeholder={t('musicPieces.edit.youtubePlaceholder')}
              />
              <small className="text-light">
                {t('musicPieces.edit.youtubeNote')}
              </small>
            </div>
          </>
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingPiece && (
        <ConfirmDialog
          onCancel={() => setDeletingPiece(null)}
          onConfirm={handleDelete}
          title={t('musicPieces.delete.title')}
          message={t('musicPieces.delete.confirm', { title: deletingPiece.title })}
          confirmLabel={t('common.delete')}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
