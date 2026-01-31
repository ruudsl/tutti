import { useState, useEffect } from 'react';
import {
  getGenres,
  createGenre,
  updateGenre,
  deleteGenre,
  getMusicTitles,
} from '../api';
import type { Genre, MusicTitle } from '../types';
import { useAuth } from '../context/AuthContext';

export default function Genres() {
  const { user } = useAuth();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGenre, setEditingGenre] = useState<Genre | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [titlesForGenre, setTitlesForGenre] = useState<MusicTitle[]>([]);
  const [loadingTitles, setLoadingTitles] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadGenres();
  }, []);

  useEffect(() => {
    if (selectedGenre) {
      loadTitlesForGenre(selectedGenre.id);
    } else {
      setTitlesForGenre([]);
    }
  }, [selectedGenre]);

  const loadGenres = async () => {
    try {
      const data = await getGenres();
      setGenres(data);
    } catch (error) {
      console.error('Error loading genres:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTitlesForGenre = async (genreId: string) => {
    setLoadingTitles(true);
    try {
      const data = await getMusicTitles({ genreId });
      setTitlesForGenre(data);
    } catch (error) {
      console.error('Error loading titles for genre:', error);
    } finally {
      setLoadingTitles(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createGenre(formName);
      await loadGenres();
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken genre');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGenre) return;

    try {
      await updateGenre(editingGenre.id, formName);
      await loadGenres();
      setEditingGenre(null);
      resetForm();
      // Update selected genre if it was edited
      if (selectedGenre?.id === editingGenre.id) {
        setSelectedGenre({ ...selectedGenre, name: formName });
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken genre');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit genre wilt verwijderen? De koppelingen met muziekstukken worden ook verwijderd.')) return;

    try {
      await deleteGenre(id);
      await loadGenres();
      if (selectedGenre?.id === id) {
        setSelectedGenre(null);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen genre');
    }
  };

  const resetForm = () => {
    setFormName('');
  };

  const openEditModal = (genre: Genre) => {
    setEditingGenre(genre);
    setFormName(genre.name);
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
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
                            onClick={() => handleDelete(genre.id)}
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
              <div className="loading" style={{ padding: '2rem' }}>
                <div className="spinner"></div>
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
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nieuw genre</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>
                  Annuleren
                </button>
                <button type="submit" className="btn btn-primary">
                  Toevoegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Genre Modal */}
      {editingGenre && (
        <div className="modal-overlay" onClick={() => setEditingGenre(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Genre bewerken</h3>
              <button className="modal-close" onClick={() => setEditingGenre(null)}>×</button>
            </div>
            <form onSubmit={handleUpdate}>
              <div className="modal-body">
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingGenre(null)}>
                  Annuleren
                </button>
                <button type="submit" className="btn btn-primary">
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
