import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOrchestra,
  createMusicList,
  updateMusicList,
  deleteMusicList,
} from '../api';
import {
  useOrchestras,
  useCreateOrchestra,
  useUpdateOrchestra,
  useDeleteOrchestra,
} from '../hooks/useOrchestras';
import { queryKeys } from '../lib/queryClient';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Skeleton, SkeletonListItem } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import type { Orchestra, MusicList } from '../types';

export default function Orchestras() {
  const queryClient = useQueryClient();
  const [selectedOrchestraId, setSelectedOrchestraId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingOrchestra, setEditingOrchestra] = useState<Orchestra | null>(null);
  const [deletingOrchestra, setDeletingOrchestra] = useState<Orchestra | null>(null);
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [editingList, setEditingList] = useState<MusicList | null>(null);
  const [deletingList, setDeletingList] = useState<MusicList | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [listFormName, setListFormName] = useState('');

  // TanStack Query hooks
  const { data: orchestras = [], isLoading } = useOrchestras();
  const createMutation = useCreateOrchestra();
  const updateMutation = useUpdateOrchestra();
  const deleteMutation = useDeleteOrchestra();

  // Query for selected orchestra details
  const { data: selectedOrchestra, isLoading: loadingDetails } = useQuery({
    queryKey: queryKeys.orchestra(selectedOrchestraId || ''),
    queryFn: () => getOrchestra(selectedOrchestraId!),
    enabled: !!selectedOrchestraId,
  });

  // Music list mutations
  const createListMutation = useMutation({
    mutationFn: ({ name, orchestraId }: { name: string; orchestraId: string }) =>
      createMusicList(name, orchestraId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestra(selectedOrchestraId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Muzieklijst aangemaakt');
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateListMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateMusicList(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestra(selectedOrchestraId!) });
      showSuccess('Muzieklijst bijgewerkt');
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => deleteMusicList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestra(selectedOrchestraId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess('Muzieklijst verwijderd');
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync(formName);
    setShowAddModal(false);
    setFormName('');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrchestra) return;

    await updateMutation.mutateAsync({ id: editingOrchestra.id, name: formName });

    // Refresh selected orchestra if it was updated
    if (selectedOrchestraId === editingOrchestra.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestra(editingOrchestra.id) });
    }

    setEditingOrchestra(null);
    setFormName('');
  };

  const handleDelete = async () => {
    if (!deletingOrchestra) return;

    await deleteMutation.mutateAsync(deletingOrchestra.id);

    if (selectedOrchestraId === deletingOrchestra.id) {
      setSelectedOrchestraId(null);
    }

    setDeletingOrchestra(null);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrchestraId) return;

    await createListMutation.mutateAsync({
      name: listFormName,
      orchestraId: selectedOrchestraId,
    });

    setShowAddListModal(false);
    setListFormName('');
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingList) return;

    await updateListMutation.mutateAsync({ id: editingList.id, name: listFormName });
    setEditingList(null);
    setListFormName('');
  };

  const handleDeleteList = async () => {
    if (!deletingList) return;
    await deleteListMutation.mutateAsync(deletingList.id);
    setDeletingList(null);
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
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>Orkesten</h1>
        </div>
        <div className="grid grid-cols-2">
          <div className="card">
            <div className="card-body">
              {[1, 2, 3].map((i) => (
                <SkeletonListItem key={i} />
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <Skeleton height="2rem" width="60%" style={{ marginBottom: '1rem' }} />
              <Skeleton height="1rem" width="80%" />
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
          Orkesten
          <span className="badge badge-primary ml-2">{orchestras.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Nieuw orkest
        </button>
      </div>

      <div className="grid grid-cols-2">
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
                      background: selectedOrchestraId === orchestra.id ? 'var(--background)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedOrchestraId(orchestra.id)}
                  >
                    <div>
                      <strong>{orchestra.name}</strong>
                      <div className="piece-meta">
                        {orchestra.memberCount} leden • {orchestra.listCount} lijsten
                      </div>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(orchestra)}
                        title="Bewerken"
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeletingOrchestra(orchestra)}
                        title="Verwijderen"
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

        {selectedOrchestraId ? (
          <div className="card">
            {loadingDetails ? (
              <div className="card-body">
                <Skeleton height="2rem" width="60%" style={{ marginBottom: '1rem' }} />
                <Skeleton height="1rem" width="80%" style={{ marginBottom: '0.5rem' }} />
                <Skeleton height="1rem" width="60%" />
              </div>
            ) : selectedOrchestra ? (
              <>
                <div className="card-header">
                  <h2 className="card-title">{selectedOrchestra.name}</h2>
                </div>
                <div className="card-body">
                  <h3 className="mb-1">Leden ({selectedOrchestra.members?.length || 0})</h3>
                  {selectedOrchestra.members?.length > 0 ? (
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
                    <h3>Muzieklijsten ({selectedOrchestra.lists?.length || 0})</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddListModal(true)}>
                      + Lijst
                    </button>
                  </div>

                  {selectedOrchestra.lists?.length > 0 ? (
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
                              title="Bewerken"
                            >
                              ✏
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingList(list)}
                              title="Verwijderen"
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
              </>
            ) : null}
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
        <FormModal
          title="Nieuw orkest"
          size="small"
          onClose={() => {
            setShowAddModal(false);
            setFormName('');
          }}
          onSubmit={handleCreate}
          submitLabel="Toevoegen"
          isSubmitting={createMutation.isPending}
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

      {/* Edit Orchestra Modal */}
      {editingOrchestra && (
        <FormModal
          title="Orkest bewerken"
          size="small"
          onClose={() => {
            setEditingOrchestra(null);
            setFormName('');
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateMutation.isPending}
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

      {/* Delete Orchestra Confirmation */}
      {deletingOrchestra && (
        <ConfirmDialog
          title="Orkest verwijderen"
          message={`Weet je zeker dat je "${deletingOrchestra.name}" wilt verwijderen? Alle muzieklijsten worden ook verwijderd.`}
          confirmLabel="Verwijderen"
          onConfirm={handleDelete}
          onCancel={() => setDeletingOrchestra(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}

      {/* Add List Modal */}
      {showAddListModal && (
        <FormModal
          title="Nieuwe muzieklijst"
          size="small"
          onClose={() => {
            setShowAddListModal(false);
            setListFormName('');
          }}
          onSubmit={handleCreateList}
          submitLabel="Toevoegen"
          isSubmitting={createListMutation.isPending}
        >
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
        </FormModal>
      )}

      {/* Edit List Modal */}
      {editingList && (
        <FormModal
          title="Muzieklijst bewerken"
          size="small"
          onClose={() => {
            setEditingList(null);
            setListFormName('');
          }}
          onSubmit={handleUpdateList}
          isSubmitting={updateListMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">Naam</label>
            <input
              type="text"
              className="form-control"
              value={listFormName}
              onChange={(e) => setListFormName(e.target.value)}
              required
              autoFocus
            />
          </div>
        </FormModal>
      )}

      {/* Delete List Confirmation */}
      {deletingList && (
        <ConfirmDialog
          title="Muzieklijst verwijderen"
          message={`Weet je zeker dat je "${deletingList.name}" wilt verwijderen?`}
          confirmLabel="Verwijderen"
          onConfirm={handleDeleteList}
          onCancel={() => setDeletingList(null)}
          isLoading={deleteListMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
