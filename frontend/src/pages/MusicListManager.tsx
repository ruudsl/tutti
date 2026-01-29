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
  toggleMusicListActive,
  updateTitleMeta,
} from '../api';
import type { MusicList, MusicPiece, MusicTitle, Orchestra } from '../types';

// Format duration from seconds to mm:ss or h:mm:ss
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Parse duration string (mm:ss or h:mm:ss) to seconds
function parseDuration(str: string): number {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

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

  // Title metadata modal
  const [editingTitle, setEditingTitle] = useState<MusicTitle | null>(null);
  const [titleMetaForm, setTitleMetaForm] = useState({
    youtubeUrl: '',
    description: '',
    durationStr: '',
  });

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

  const handleToggleActive = async (list: MusicList) => {
    try {
      await toggleMusicListActive(list.id);
      await loadLists(selectedOrchestra);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij wijzigen status');
    }
  };

  const openTitleMetaModal = (title: MusicTitle) => {
    setEditingTitle(title);
    setTitleMetaForm({
      youtubeUrl: title.youtubeUrl || '',
      description: title.description || '',
      durationStr: title.durationSeconds ? formatDuration(title.durationSeconds).replace(/^0:/, '') : '',
    });
  };

  const handleSaveTitleMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTitle) return;

    try {
      await updateTitleMeta({
        title: editingTitle.title,
        arranger: editingTitle.arranger,
        youtubeUrl: titleMetaForm.youtubeUrl || null,
        description: titleMetaForm.description || null,
        durationSeconds: parseDuration(titleMetaForm.durationStr),
      });
      setEditingTitle(null);
      if (listId) {
        await loadTitles(listId);
        await loadLists(selectedOrchestra);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij opslaan metadata');
    }
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
                    opacity: list.isActive === false ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => handleSelectList(list)}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      <strong>{list.name}</strong>
                      {list.isActive === false && (
                        <span className="badge badge-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                          Inactief
                        </span>
                      )}
                      <div className="piece-meta">
                        {list.titleCount || 0} titels • {formatDuration(list.totalDuration || 0)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className={`btn btn-sm ${list.isActive !== false ? 'btn-success' : 'btn-outline'}`}
                        onClick={() => handleToggleActive(list)}
                        title={list.isActive !== false ? 'Actief - klik om te deactiveren' : 'Inactief - klik om te activeren'}
                        style={{ minWidth: '2rem' }}
                      >
                        {list.isActive !== false ? '✓' : '○'}
                      </button>
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
                    {titlesOnList.map((titleName) => {
                      const piecesForTitle = selectedList.pieces.filter(p => p.title === titleName);
                      const titleData = titles.find(t => t.title === titleName);
                      return (
                        <div
                          key={titleName}
                          className="flex justify-between items-center"
                          style={{
                            padding: '0.5rem',
                            background: 'var(--background)',
                            borderRadius: '0.25rem',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <strong>{titleName}</strong>
                            <span className="piece-meta">
                              {' '}({piecesForTitle.length} partijen)
                              {titleData?.durationSeconds ? ` • ${formatDuration(titleData.durationSeconds)}` : ''}
                            </span>
                            {titleData?.youtubeUrl && (
                              <a
                                href={titleData.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-sm"
                                style={{ marginLeft: '0.5rem' }}
                              >
                                ▶
                              </a>
                            )}
                            {titleData?.description && (
                              <div className="piece-meta" style={{ fontStyle: 'italic' }}>
                                {titleData.description}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {titleData && (
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => openTitleMetaModal(titleData)}
                                title="Bewerk metadata"
                              >
                                ✏
                              </button>
                            )}
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRemoveTitle(titleName)}
                            >
                              Verwijderen
                            </button>
                          </div>
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
                        <div style={{ flex: 1 }}>
                          <strong>{title.title}</strong>
                          {title.arranger && <span className="piece-meta"> - {title.arranger}</span>}
                          {title.durationSeconds > 0 && (
                            <span className="piece-meta"> • {formatDuration(title.durationSeconds)}</span>
                          )}
                          {title.youtubeUrl && (
                            <a
                              href={title.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-outline btn-sm"
                              style={{ marginLeft: '0.5rem' }}
                            >
                              ▶
                            </a>
                          )}
                          <div className="piece-meta">
                            {title.pieceCount} partijen • {title.instruments.join(', ')}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => openTitleMetaModal(title)}
                            title="Bewerk metadata"
                          >
                            ✏
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAddTitle(title.title)}
                          >
                            Toevoegen
                          </button>
                        </div>
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

      {/* Title Metadata Modal */}
      {editingTitle && (
        <div className="modal-overlay" onClick={() => setEditingTitle(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Titel metadata bewerken</h3>
              <button className="modal-close" onClick={() => setEditingTitle(null)}>×</button>
            </div>
            <form onSubmit={handleSaveTitleMeta}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Titel</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingTitle.title}
                    disabled
                  />
                </div>
                {editingTitle.arranger && (
                  <div className="form-group">
                    <label className="form-label">Arrangeur</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editingTitle.arranger}
                      disabled
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">YouTube URL</label>
                  <input
                    type="url"
                    className="form-control"
                    value={titleMetaForm.youtubeUrl}
                    onChange={(e) => setTitleMetaForm(f => ({ ...f, youtubeUrl: e.target.value }))}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Speelduur (mm:ss)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={titleMetaForm.durationStr}
                    onChange={(e) => setTitleMetaForm(f => ({ ...f, durationStr: e.target.value }))}
                    placeholder="3:45"
                    pattern="[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Omschrijving</label>
                  <textarea
                    className="form-control"
                    value={titleMetaForm.description}
                    onChange={(e) => setTitleMetaForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Optionele omschrijving of notities..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingTitle(null)}>
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
