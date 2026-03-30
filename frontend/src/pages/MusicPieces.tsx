import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMusicPiecesPaginated,
  useUpdateMusicPiece,
  useDeleteMusicPiece,
  useDeleteMusicPiecesBulk,
  useBulkUpdatePieces,
  useRefreshInstrumentLinks,
} from '../hooks/useMusicPieces';
import { useMyMusicLists } from '../hooks/useMusicLists';
import { useInstruments } from '../hooks/useInstruments';
import { useAuth } from '../context/AuthContext';
import { downloadMusicPiece, logActivity } from '../api';
import { Modal } from '../components/Modal';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { Pagination } from '../components/Pagination';
import { showError } from '../utils/toast';
import { useDebounce } from '../hooks/useDebounce';
import type { MusicPiece } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';

const PAGE_SIZE = 50;

export default function MusicPieces() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle('pageTitle.musicPieces');
  const [search, setSearch] = useState('');
  const [filterInstrument, setFilterInstrument] = useState('');
  const [editingPiece, setEditingPiece] = useState<MusicPiece | null>(null);
  const [deletingPiece, setDeletingPiece] = useState<MusicPiece | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkInstrumentModal, setShowBulkInstrumentModal] = useState(false);
  const [showBulkAddToListModal, setShowBulkAddToListModal] = useState(false);
  const [showBulkRemoveFromListModal, setShowBulkRemoveFromListModal] = useState(false);
  const [bulkInstrumentId, setBulkInstrumentId] = useState<string>('');
  const [bulkListId, setBulkListId] = useState<string>('');
  const [showBulkActionsMenu, setShowBulkActionsMenu] = useState(false);
  const [page, setPage] = useState(1);

  const canManage = user && ([ROLES.ADMIN, ROLES.MUSIC_COMMITTEE] as string[]).includes(user.role);

  // Debounce search for API calls
  const debouncedSearch = useDebounce(search, 300);

  // Build filters object
  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    instrumentId: filterInstrument || undefined,
    page,
    pageSize: PAGE_SIZE,
  }), [debouncedSearch, filterInstrument, page]);

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (value: string) => {
    setFilterInstrument(value);
    setPage(1);
  };

  // TanStack Query hooks
  const { data: paginatedData, isLoading: piecesLoading } = useMusicPiecesPaginated(filters);
  const { data: instruments = [], isLoading: instrumentsLoading } = useInstruments();
  const { data: musicLists = [] } = useMyMusicLists();

  const pieces = paginatedData?.data ?? [];
  const totalPieces = paginatedData?.total ?? 0;
  const totalPages = paginatedData?.totalPages ?? 0;

  const updateMutation = useUpdateMusicPiece();
  const deleteMutation = useDeleteMusicPiece();
  const bulkDeleteMutation = useDeleteMusicPiecesBulk();
  const bulkUpdateMutation = useBulkUpdatePieces();
  const refreshMutation = useRefreshInstrumentLinks();

  const isLoading = piecesLoading || instrumentsLoading;

  const handleDownload = async (pieceId: string) => {
    setDownloading(pieceId);
    try {
      await downloadMusicPiece(pieceId);
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

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === pieces.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pieces.map(p => p.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    bulkDeleteMutation.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        setSelectedIds(new Set());
        setShowBulkDeleteConfirm(false);
      },
    });
  };

  const handleBulkInstrumentChange = () => {
    if (selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({
      pieceIds: Array.from(selectedIds),
      updates: { instrumentId: bulkInstrumentId || null },
    }, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setShowBulkInstrumentModal(false);
        setBulkInstrumentId('');
      },
    });
  };

  const handleBulkAddToList = () => {
    if (selectedIds.size === 0 || !bulkListId) return;
    bulkUpdateMutation.mutate({
      pieceIds: Array.from(selectedIds),
      updates: { addToListId: bulkListId },
    }, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setShowBulkAddToListModal(false);
        setBulkListId('');
      },
    });
  };

  const handleBulkRemoveFromList = () => {
    if (selectedIds.size === 0 || !bulkListId) return;
    bulkUpdateMutation.mutate({
      pieceIds: Array.from(selectedIds),
      updates: { removeFromListId: bulkListId },
    }, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setShowBulkRemoveFromListModal(false);
        setBulkListId('');
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
          <div className="filter-bar">
            <div className="form-group filter-search">
              <label htmlFor="pieces-search" className="sr-only">{t('common.search')}</label>
              <input
                id="pieces-search"
                type="text"
                className="form-control"
                placeholder={t('musicPieces.searchPlaceholder')}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="pieces-instrument-filter" className="sr-only">{t('myMusic.table.instrument')}</label>
              <select
                id="pieces-instrument-filter"
                className="form-control form-select"
                value={filterInstrument}
                onChange={(e) => handleFilterChange(e.target.value)}
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
        <div className="card-header flex justify-between items-center">
          <span className="card-title">{totalPieces} {t('musicPieces.count')}</span>
          {canManage && selectedIds.size > 0 && (
            <div className="flex gap-1 items-center">
              <span className="text-sm text-light">
                {t('musicPieces.bulk.selectedCount', { count: selectedIds.size })}
              </span>
              <div className="dropdown" style={{ position: 'relative' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowBulkActionsMenu(!showBulkActionsMenu)}
                  aria-expanded={showBulkActionsMenu}
                  aria-haspopup="true"
                >
                  {t('bulk.title')} ▾
                </button>
                {showBulkActionsMenu && (
                  <div
                    className="dropdown-menu show"
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '100%',
                      minWidth: '200px',
                      backgroundColor: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                    }}
                  >
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setShowBulkActionsMenu(false);
                        setShowBulkInstrumentModal(true);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 1rem',
                        textAlign: 'left',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {t('bulk.changeInstrument')}
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setShowBulkActionsMenu(false);
                        setShowBulkAddToListModal(true);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 1rem',
                        textAlign: 'left',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {t('bulk.addToList')}
                    </button>
                    <button
                      className="dropdown-item"
                      onClick={() => {
                        setShowBulkActionsMenu(false);
                        setShowBulkRemoveFromListModal(true);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 1rem',
                        textAlign: 'left',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {t('bulk.removeFromList')}
                    </button>
                    <hr style={{ margin: '0.25rem 0', borderColor: 'var(--border-color)' }} />
                    <button
                      className="dropdown-item text-danger"
                      onClick={() => {
                        setShowBulkActionsMenu(false);
                        setShowBulkDeleteConfirm(true);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.5rem 1rem',
                        textAlign: 'left',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                      }}
                    >
                      {t('bulk.delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="card-body flush">
          {pieces.length > 0 ? (
            <table className="table mb-0">
              <thead>
                <tr>
                  {canManage && (
                    <th scope="col" style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={pieces.length > 0 && selectedIds.size === pieces.length}
                        onChange={handleSelectAll}
                        aria-label={t('musicPieces.bulk.selectAll')}
                        title={t('musicPieces.bulk.selectAll')}
                      />
                    </th>
                  )}
                  <th scope="col">{t('myMusic.table.title')}</th>
                  <th scope="col">{t('myMusic.table.arranger')}</th>
                  <th scope="col">{t('myMusic.table.instrument')}</th>
                  <th scope="col">{t('myMusic.table.tuning')}</th>
                  <th scope="col">{t('myMusic.table.number')}</th>
                  <th scope="col"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {pieces.map((piece) => (
                  <tr key={piece.id} className={selectedIds.has(piece.id) ? 'table-row-selected' : ''}>
                    {canManage && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(piece.id)}
                          onChange={() => handleToggleSelect(piece.id)}
                          aria-label={`${t('common.select')} ${piece.title}`}
                        />
                      </td>
                    )}
                    <td>
                      <strong>{piece.title}</strong>
                      <br />
                      <small className="text-light">{piece.originalFilename}</small>
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
                            aria-label={`YouTube: ${piece.title}`}
                            title="YouTube preview"
                          >
                            <span aria-hidden="true">▶</span>
                          </a>
                        )}
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDownload(piece.id)}
                          disabled={downloading === piece.id}
                          aria-label={`${t('common.download')}: ${piece.title}`}
                          title={t('common.download')}
                        >
                          <span aria-hidden="true">⬇</span>
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditingPiece({ ...piece })}
                          aria-label={`${t('common.edit')}: ${piece.title}`}
                          title={t('common.edit')}
                        >
                          <span aria-hidden="true">✏</span>
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingPiece(piece)}
                          aria-label={`${t('common.delete')}: ${piece.title}`}
                          title={t('common.delete')}
                        >
                          <span aria-hidden="true">🗑</span>
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
        {totalPages > 1 && (
          <div className="card-footer">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              total={totalPieces}
              limit={PAGE_SIZE}
            />
          </div>
        )}
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

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <ConfirmDialog
          onCancel={() => setShowBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title={t('musicPieces.bulk.deleteTitle')}
          message={t('musicPieces.bulk.deleteConfirm', { count: selectedIds.size })}
          confirmLabel={t('common.delete')}
          isLoading={bulkDeleteMutation.isPending}
        />
      )}

      {/* Bulk Change Instrument Modal */}
      {showBulkInstrumentModal && (
        <Modal title={t('bulk.changeInstrument')} onClose={() => setShowBulkInstrumentModal(false)}>
          <p className="text-light mb-2">
            {t('musicPieces.bulk.selectedCount', { count: selectedIds.size })}
          </p>
          <div className="form-group">
            <label className="form-label">{t('musicPieces.edit.instrument')}</label>
            <select
              className="form-control form-select"
              value={bulkInstrumentId}
              onChange={(e) => setBulkInstrumentId(e.target.value)}
            >
              <option value="">{t('musicPieces.edit.selectInstrument')}</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
            </select>
            <small className="text-light">
              {t('bulk.instrumentHelp')}
            </small>
          </div>
          <div className="flex gap-1 justify-end mt-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowBulkInstrumentModal(false);
                setBulkInstrumentId('');
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleBulkInstrumentChange}
              disabled={bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Add to List Modal */}
      {showBulkAddToListModal && (
        <Modal title={t('bulk.addToList')} onClose={() => setShowBulkAddToListModal(false)}>
          <p className="text-light mb-2">
            {t('musicPieces.bulk.selectedCount', { count: selectedIds.size })}
          </p>
          <div className="form-group">
            <label className="form-label">{t('bulk.selectList')}</label>
            <select
              className="form-control form-select"
              value={bulkListId}
              onChange={(e) => setBulkListId(e.target.value)}
            >
              <option value="">{t('bulk.selectListPlaceholder')}</option>
              {musicLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} {list.orchestraName ? `(${list.orchestraName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1 justify-end mt-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowBulkAddToListModal(false);
                setBulkListId('');
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleBulkAddToList}
              disabled={!bulkListId || bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? t('common.loading') : t('common.add')}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Remove from List Modal */}
      {showBulkRemoveFromListModal && (
        <Modal title={t('bulk.removeFromList')} onClose={() => setShowBulkRemoveFromListModal(false)}>
          <p className="text-light mb-2">
            {t('musicPieces.bulk.selectedCount', { count: selectedIds.size })}
          </p>
          <div className="form-group">
            <label className="form-label">{t('bulk.selectList')}</label>
            <select
              className="form-control form-select"
              value={bulkListId}
              onChange={(e) => setBulkListId(e.target.value)}
            >
              <option value="">{t('bulk.selectListPlaceholder')}</option>
              {musicLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} {list.orchestraName ? `(${list.orchestraName})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1 justify-end mt-2">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowBulkRemoveFromListModal(false);
                setBulkListId('');
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-danger"
              onClick={handleBulkRemoveFromList}
              disabled={!bulkListId || bulkUpdateMutation.isPending}
            >
              {bulkUpdateMutation.isPending ? t('common.loading') : t('common.delete')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
