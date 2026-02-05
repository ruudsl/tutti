import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getMusicTitles } from '../api';
import { useGenres, useCreateGenre, useUpdateGenre, useDeleteGenre } from '../hooks/useGenres';
import { queryKeys } from '../lib/queryClient';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { formatDuration } from '../utils/format';
import type { Genre } from '../types';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Genres() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.genres');
  const { user } = useAuth();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGenre, setEditingGenre] = useState<Genre | null>(null);
  const [deletingGenre, setDeletingGenre] = useState<Genre | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [formName, setFormName] = useState('');

  const isAdmin = user?.role === 'admin';

  // TanStack Query hooks
  const { data: genres = [], isLoading } = useGenres();
  const createGenreMutation = useCreateGenre();
  const updateGenreMutation = useUpdateGenre();
  const deleteGenreMutation = useDeleteGenre();

  // Query for titles of selected genre
  const { data: titlesForGenre = [], isLoading: loadingTitles } = useQuery({
    queryKey: queryKeys.musicTitles({ genreId: selectedGenre?.id || '' }),
    queryFn: () => getMusicTitles({ genreId: selectedGenre!.id }),
    enabled: !!selectedGenre,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createGenreMutation.mutateAsync(formName);
    setShowAddModal(false);
    setFormName('');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGenre) return;

    await updateGenreMutation.mutateAsync({ id: editingGenre.id, name: formName });

    // Update selected genre name if it was edited
    if (selectedGenre?.id === editingGenre.id) {
      setSelectedGenre({ ...selectedGenre, name: formName });
    }

    setEditingGenre(null);
    setFormName('');
  };

  const handleDelete = async () => {
    if (!deletingGenre) return;

    await deleteGenreMutation.mutateAsync(deletingGenre.id);

    if (selectedGenre?.id === deletingGenre.id) {
      setSelectedGenre(null);
    }

    setDeletingGenre(null);
  };

  const openEditModal = (genre: Genre) => {
    setEditingGenre(genre);
    setFormName(genre.name);
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('genres.title')}</h1>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <div className="card-body">
              <SkeletonTable rows={5} columns={2} />
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <SkeletonTable rows={5} columns={4} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('genres.title')}
          <span className="badge badge-primary ml-2">{genres.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + {t('genres.newGenre')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Genre List */}
        <div className="card">
          <div className="card-header">
            <h3>{t('genres.allGenres')}</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>{t('genres.genre')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {genres.map((genre) => (
                  <tr
                    key={genre.id}
                    className={selectedGenre?.id === genre.id ? 'table-row-selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedGenre(selectedGenre?.id === genre.id ? null : genre)}
                  >
                    <td>
                      <strong>{genre.name}</strong>
                    </td>
                    <td>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEditModal(genre)}
                          title={t('common.edit')}
                        >
                          ✏
                        </button>
                        {isAdmin && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeletingGenre(genre)}
                            title={t('common.delete')}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {genres.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'center', color: '#666' }}>
                      {t('genres.noGenres')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Titles for Selected Genre */}
        <div className="card">
          <div className="card-header">
            <h3>
              {selectedGenre ? t('genres.titlesIn', { name: selectedGenre.name }) : t('genres.selectGenre')}
              {selectedGenre && (
                <span className="badge badge-secondary ml-2">{titlesForGenre.length}</span>
              )}
            </h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!selectedGenre ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                {t('genres.selectGenreHint')}
              </div>
            ) : loadingTitles ? (
              <div style={{ padding: '1rem' }}>
                <SkeletonTable rows={3} columns={4} />
              </div>
            ) : titlesForGenre.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                {t('genres.noTitlesForGenre')}
              </div>
            ) : (
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('genres.table.title')}</th>
                    <th>{t('genres.table.arranger')}</th>
                    <th>{t('genres.table.duration')}</th>
                    <th>{t('genres.table.parts')}</th>
                  </tr>
                </thead>
                <tbody>
                  {titlesForGenre.map((title, index) => (
                    <tr key={`${title.title}-${title.arranger}-${index}`}>
                      <td>
                        <strong>{title.title}</strong>
                        {title.youtubeUrl && (
                          <a
                            href={title.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1"
                            title={t('genres.viewOnYoutube')}
                          >
                            ▶
                          </a>
                        )}
                      </td>
                      <td>{title.arranger || '-'}</td>
                      <td>{formatDuration(title.durationSeconds)}</td>
                      <td>{title.pieceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add Genre Modal */}
      {showAddModal && (
        <FormModal
          title={t('genres.newGenre')}
          onClose={() => {
            setShowAddModal(false);
            setFormName('');
          }}
          onSubmit={handleCreate}
          submitLabel={t('common.add')}
          isSubmitting={createGenreMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('genres.name')}</label>
            <input
              type="text"
              className="form-control"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              placeholder={t('genres.namePlaceholder')}
              autoFocus
            />
          </div>
        </FormModal>
      )}

      {/* Edit Genre Modal */}
      {editingGenre && (
        <FormModal
          title={t('genres.edit')}
          onClose={() => {
            setEditingGenre(null);
            setFormName('');
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateGenreMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('genres.name')}</label>
            <input
              type="text"
              className="form-control"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
            />
          </div>
        </FormModal>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingGenre && (
        <ConfirmDialog
          title={t('genres.deleteGenre')}
          message={t('genres.deleteConfirm', { name: deletingGenre.name })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingGenre(null)}
          isLoading={deleteGenreMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
