import { useState, useEffect } from 'react';
import {
  getOrchestras,
  getOrchestra,
  createOrchestra,
  updateOrchestra,
  deleteOrchestra,
  createMusicList,
  updateMusicList,
  deleteMusicList,
} from '../api';
import type { Orchestra, MusicList, User } from '../types';

export default function Orchestras() {
  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [selectedOrchestra, setSelectedOrchestra] = useState<
    (Orchestra & { members: User[]; lists: MusicList[] }) | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingOrchestra, setEditingOrchestra] = useState<Orchestra | null>(null);
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [editingList, setEditingList] = useState<MusicList | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [listFormName, setListFormName] = useState('');

  useEffect(() => {
    loadOrchestras();
  }, []);

  const loadOrchestras = async () => {
    try {
      const data = await getOrchestras();
      setOrchestras(data);
    } catch (error) {
      console.error('Error loading orchestras:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrchestra = async (id: string) => {
    try {
      const data = await getOrchestra(id);
      setSelectedOrchestra(data);
    } catch (error) {
      console.error('Error loading orchestra:', error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createOrchestra(formName);
      await loadOrchestras();
      setShowAddModal(false);
      setFormName('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken orkest');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrchestra) return;

    try {
      await updateOrchestra(editingOrchestra.id, formName);
      await loadOrchestras();
      if (selectedOrchestra?.id === editingOrchestra.id) {
        await loadOrchestra(editingOrchestra.id);
      }
      setEditingOrchestra(null);
      setFormName('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken orkest');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit orkest wilt verwijderen? Alle muzieklijsten worden ook verwijderd.')) return;

    try {
      await deleteOrchestra(id);
      await loadOrchestras();
      if (selectedOrchestra?.id === id) {
        setSelectedOrchestra(null);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen orkest');
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestra) return;

    try {
      await createMusicList(listFormName, selectedOrchestra.id);
      await loadOrchestra(selectedOrchestra.id);
      await loadOrchestras();
      setShowAddListModal(false);
      setListFormName('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken lijst');
    }
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList || !selectedOrchestra) return;

    try {
      await updateMusicList(editingList.id, listFormName);
      await loadOrchestra(selectedOrchestra.id);
      setEditingList(null);
      setListFormName('');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken lijst');
    }
  };

  const handleDeleteList = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze lijst wilt verwijderen?')) return;
    if (!selectedOrchestra) return;

    try {
      await deleteMusicList(id);
      await loadOrchestra(selectedOrchestra.id);
      await loadOrchestras();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen lijst');
    }
  };

  const openEditModal = (orchestra: Orchestra) => {
    setEditingOrchestra(orchestra);
    setFormName(orchestra.name);
  };

  const openEditListModal = (list: MusicList) => {
    setEditingList(list);
    setListFormName(list.name);
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
        <h1>Orkesten</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Nieuw orkest
        </button>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Orkesten</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {orchestras.length > 0 ? (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {orchestras.map((orchestra) => (
                  <div
                    key={orchestra.id}
                    className="flex justify-between items-center"
                    style={{
                      padding: '1rem',
                      borderBottom: '1px solid var(--border)',
                      background: selectedOrchestra?.id === orchestra.id ? 'var(--background)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => loadOrchestra(orchestra.id)}
                  >
                    <div>
                      <strong>{orchestra.name}</strong>
                      <div className="piece-meta">
                        {orchestra.memberCount} leden • {orchestra.listCount} lijsten
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(orchestra);
                        }}
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(orchestra.id);
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>Geen orkesten aangemaakt.</p>
              </div>
            )}
          </div>
        </div>

        {selectedOrchestra ? (
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{selectedOrchestra.name}</h2>
            </div>
            <div className="card-body">
              <h3 className="mb-1">Leden ({selectedOrchestra.members.length})</h3>
              {selectedOrchestra.members.length > 0 ? (
                <div className="tags mb-2">
                  {selectedOrchestra.members.map((member: any) => (
                    <span key={member.id} className="tag">
                      {member.firstName} {member.lastName}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="piece-meta mb-2">Geen leden toegewezen.</p>
              )}

              <div className="flex justify-between items-center mb-1">
                <h3>Muzieklijsten ({selectedOrchestra.lists.length})</h3>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddListModal(true)}>
                  + Lijst
                </button>
              </div>

              {selectedOrchestra.lists.length > 0 ? (
                <div>
                  {selectedOrchestra.lists.map((list: any) => (
                    <div
                      key={list.id}
                      className="flex justify-between items-center"
                      style={{
                        padding: '0.5rem',
                        background: 'var(--background)',
                        borderRadius: '0.25rem',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div>
                        <strong>{list.name}</strong>
                        <span className="piece-meta"> ({list.pieceCount} stukken)</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEditListModal(list)}
                        >
                          ✏
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteList(list.id)}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="piece-meta">Geen muzieklijsten.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                <div className="empty-icon">🎺</div>
                <p>Selecteer een orkest om details te bekijken.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Orchestra Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nieuw orkest</h3>
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

      {/* Edit Orchestra Modal */}
      {editingOrchestra && (
        <div className="modal-overlay" onClick={() => setEditingOrchestra(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Orkest bewerken</h3>
              <button className="modal-close" onClick={() => setEditingOrchestra(null)}>×</button>
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
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingOrchestra(null)}>
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
              <h3 className="modal-title">Muzieklijst bewerken</h3>
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
