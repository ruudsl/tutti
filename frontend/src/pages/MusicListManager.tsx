import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getMusicLists,
  getMusicList,
  getMusicTitles,
  createMusicList,
  updateMusicList,
  deleteMusicList,
  addTitleToList,
  removeTitleFromList,
  reorderMusicLists,
  getOrchestras,
} from '../api';
import type { MusicList, MusicPiece, MusicTitle, Orchestra } from '../types';

export default function MusicListManager() {
  const { orchestraId, listId } = useParams();
  const navigate = useNavigate();

  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [selectedOrchestra, setSelectedOrchestra] = useState<string>(orchestraId || '');
  const [lists, setLists] = useState<MusicList[]>([]);
  const [selectedList, setSelectedList] = useState<(MusicList & { pieces: MusicPiece[] }) | null>(null);
  const [titles, setTitles] = useState<MusicTitle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [editingList, setEditingList] = useState<MusicList | null>(null);
  const [listFormName, setListFormName] = useState('');

  useEffect(() => {
    loadOrchestras();
  }, []);

  useEffect(() => {
    if (selectedOrchestra) {
      loadLists(selectedOrchestra);
    }
  }, [selectedOrchestra]);

  useEffect(() => {
    if (listId) {
      loadList(listId);
      loadTitles(listId);
    } else {
      setSelectedList(null);
    }
  }, [listId]);

  useEffect(() => {
    if (listId) {
      const timer = setTimeout(() => loadTitles(listId), 300);
      return () => clearTimeout(timer);
    }
  }, [search]);

  const loadOrchestras = async () => {
    try {
      const data = await getOrchestras();
      setOrchestras(data);
      if (data.length > 0 && !selectedOrchestra) {
        setSelectedOrchestra(data[0].id);
      }
    } catch (error) {
      console.error('Error loading orchestras:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLists = async (orchId: string) => {
    try {
      const data = await getMusicLists(orchId);
      setLists(data);
    } catch (error) {
      console.error('Error loading lists:', error);
    }
  };

  const loadList = async (id: string) => {
    try {
      const data = await getMusicList(id);
      setSelectedList(data);
    } catch (error) {
      console.error('Error loading list:', error);
    }
  };

  const loadTitles = async (id: string) => {
    try {
      const data = await getMusicTitles({ search: search || undefined, listId: id });
      setTitles(data);
    } catch (error) {
      console.error('Error loading titles:', error);
    }
  };

  const handleSelectOrchestra = (orchId: string) => {
    setSelectedOrchestra(orchId);
    navigate('/lists');
  };

  const handleSelectList = (list: MusicList) => {
    navigate(`/lists/${list.orchestraId}/${list.id}`);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestra) return;

    try {
      await createMusicList(listFormName, selectedOrchestra);
      await loadLists(selectedOrchestra);
      setShowAddListModal(false);
      setListFormName('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken lijst');
    }
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList) return;

    try {
      await updateMusicList(editingList.id, listFormName);
      await loadLists(selectedOrchestra);
      if (selectedList?.id === editingList.id) {
        await loadList(editingList.id);
      }
      setEditingList(null);
      setListFormName('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken lijst');
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze lijst wilt verwijderen?')) return;

    try {
      await deleteMusicList(id);
      await loadLists(selectedOrchestra);
      if (selectedList?.id === id) {
        navigate('/lists');
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen lijst');
    }
  };

  const handleAddTitle = async (title: string) => {
    if (!selectedList) return;

    try {
      const result = await addTitleToList(selectedList.id, title);
      await loadList(selectedList.id);
      await loadLists(selectedOrchestra);
      await loadTitles(selectedList.id);
      alert(`${result.added} van ${result.total} partijen toegevoegd.`);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij toevoegen titel');
    }
  };

  const handleRemoveTitle = async (title: string) => {
    if (!selectedList) return;
    if (!confirm(`Weet je zeker dat je "${title}" van de lijst wilt verwijderen?`)) return;

    try {
      await removeTitleFromList(selectedList.id, title);
      await loadList(selectedList.id);
      await loadLists(selectedOrchestra);
      await loadTitles(selectedList.id);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen titel');
    }
  };

  const handleMoveList = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= lists.length) return;

    const newLists = [...lists];
    [newLists[index], newLists[newIndex]] = [newLists[newIndex], newLists[index]];
    setLists(newLists);

    try {
      await reorderMusicLists(selectedOrchestra, newLists.map(l => l.id));
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij wijzigen volgorde');
      await loadLists(selectedOrchestra);
    }
  };

  const openEditModal = (list: MusicList) => {
    setEditingList(list);
    setListFormName(list.name);
  };

  // Group pieces by title for display
  const titlesOnList = selectedList?.pieces
    ? [...new Set(selectedList.pieces.map(p => p.title))]
    : [];

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3">Muzieklijsten beheren</h1>

      <div className="grid grid-3" style={{ gridTemplateColumns: '250px 250px 1fr' }}>
        {/* Orchestra selector */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Orkesten</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {orchestras.map((orch) => (
              <div
                key={orch.id}
                onClick={() => handleSelectOrchestra(orch.id)}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  background: selectedOrchestra === orch.id ? 'var(--primary)' : undefined,
                  color: selectedOrchestra === orch.id ? 'white' : undefined,
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {orch.name}
              </div>
            ))}
          </div>
        </div>

        {/* Lists */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Lijsten</h2>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddListModal(true)}>
              +
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {lists.length > 0 ? (
              lists.map((list, index) => (
                <div
                  key={list.id}
                  style={{
                    padding: '0.5rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    background: selectedList?.id === list.id ? 'var(--background)' : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => handleSelectList(list)}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      <strong>{list.name}</strong>
                      <div className="piece-meta">
                        {list.titleCount || 0} titels • {list.pieceCount || 0} partijen
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleMoveList(index, 'up')}
                        disabled={index === 0}
                        title="Omhoog"
                      >
                        ↑
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleMoveList(index, 'down')}
                        disabled={index === lists.length - 1}
                        title="Omlaag"
                      >
                        ↓
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(list)}
                        title="Hernoemen"
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteList(list.id)}
                        title="Verwijderen"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p>Geen lijsten</p>
              </div>
            )}
          </div>
        </div>

        {/* List content / Add titles */}
        {selectedList ? (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{selectedList.name}</h2>
            </div>
            <div className="card-body">
              {/* Search */}
              <div className="form-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Zoek muziekstukken..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Titles on list */}
              {titlesOnList.length > 0 && (
                <div className="mb-2">
                  <h3 className="mb-1">Op deze lijst ({titlesOnList.length} titels)</h3>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {titlesOnList.map((title) => {
                      const piecesForTitle = selectedList.pieces.filter(p => p.title === title);
                      return (
                        <div
                          key={title}
                          className="flex justify-between items-center"
                          style={{
                            padding: '0.5rem',
                            background: 'var(--background)',
                            borderRadius: '0.25rem',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <div>
                            <strong>{title}</strong>
                            <span className="piece-meta"> ({piecesForTitle.length} partijen)</span>
                            {piecesForTitle[0]?.youtubeUrl && (
                              <a
                                href={piecesForTitle[0].youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-sm"
                                style={{ marginLeft: '0.5rem' }}
                              >
                                ▶
                              </a>
                            )}
                          </div>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemoveTitle(title)}
                          >
                            Verwijderen
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available titles */}
              <h3 className="mb-1">Beschikbare muziekstukken</h3>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {titles.filter(t => !t.onList).length > 0 ? (
                  titles
                    .filter(t => !t.onList)
                    .map((title) => (
                      <div
                        key={title.title}
                        className="flex justify-between items-center"
                        style={{
                          padding: '0.5rem',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div>
                          <strong>{title.title}</strong>
                          {title.arranger && <span className="piece-meta"> - {title.arranger}</span>}
                          <div className="piece-meta">
                            {title.pieceCount} partijen • {title.instruments.join(', ')}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleAddTitle(title.title)}
                        >
                          Toevoegen
                        </button>
                      </div>
                    ))
                ) : (
                  <div className="empty-state" style={{ padding: '1rem' }}>
                    <p>{search ? 'Geen resultaten gevonden.' : 'Alle muziekstukken staan al op deze lijst.'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>Selecteer een lijst om muziekstukken toe te voegen.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add List Modal */}
      {showAddListModal && (
        <div className="modal-overlay" onClick={() => setShowAddListModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nieuwe muzieklijst</h3>
              <button className="modal-close" onClick={() => setShowAddListModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreateList}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Naam</label>
                  <input
                    type="text"
                    className="form-control"
                    value={listFormName}
                    onChange={(e) => setListFormName(e.target.value)}
                    required
                    autoFocus
                    placeholder="Bijv. Najaarsconcert 2024"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddListModal(false)}>
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

      {/* Edit List Modal */}
      {editingList && (
        <div className="modal-overlay" onClick={() => setEditingList(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Lijst hernoemen</h3>
              <button className="modal-close" onClick={() => setEditingList(null)}>×</button>
            </div>
            <form onSubmit={handleUpdateList}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Naam</label>
                  <input
                    type="text"
                    className="form-control"
                    value={listFormName}
                    onChange={(e) => setListFormName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingList(null)}>
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
