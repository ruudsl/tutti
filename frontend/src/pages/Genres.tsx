import { useState } from 'react';
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

export default function Genres() {
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
          <h1>Genres</h1>
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
          Genres
          <span className="badge badge-primary ml-2">{genres.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Nieuw genre
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Genre List */}
        <div className="card">
          <div className="card-header">
            <h3>Alle genres</h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Genre</th>
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
                          title="Bewerken"
                        >
                          ✏
                        </button>
                        {isAdmin && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setDeletingGenre(genre)}
                            title="Verwijderen"
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
                      Geen genres gevonden
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
              {selectedGenre ? `Titels in "${selectedGenre.name}"` : 'Selecteer een genre'}
              {selectedGenre && (
                <span className="badge badge-secondary ml-2">{titlesForGenre.length}</span>
              )}
            </h3>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {!selectedGenre ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                Klik op een genre om de bijbehorende titels te zien
              </div>
            ) : loadingTitles ? (
              <div style={{ padding: '1rem' }}>
                <SkeletonTable rows={3} columns={4} />
              </div>
            ) : titlesForGenre.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                Geen titels gevonden voor dit genre
              </div>
            ) : (
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Arrangeur</th>
                    <th>Duur</th>
                    <th>Partijen</th>
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
                            title="Bekijk op YouTube"
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
          title="Nieuw genre"
          onClose={() => {
            setShowAddModal(false);
            setFormName('');
          }}
          onSubmit={handleCreate}
          submitLabel="Toevoegen"
          isSubmitting={createGenreMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">Naam</label>
            <input
              type="text"
              className="form-control"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              placeholder="Bijv. Pop, Rock, Klassiek"
              autoFocus
            />
          </div>
        </FormModal>
      )}

      {/* Edit Genre Modal */}
      {editingGenre && (
        <FormModal
          title="Genre bewerken"
          onClose={() => {
            setEditingGenre(null);
            setFormName('');
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateGenreMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">Naam</label>
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
          title="Genre verwijderen"
          message={`Weet je zeker dat je "${deletingGenre.name}" wilt verwijderen? De koppelingen met muziekstukken worden ook verwijderd.`}
          confirmLabel="Verwijderen"
          onConfirm={handleDelete}
          onCancel={() => setDeletingGenre(null)}
          isLoading={deleteGenreMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
