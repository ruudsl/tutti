import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      showSuccess(t('orchestras.listCreated'));
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const updateListMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateMusicList(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestra(selectedOrchestraId!) });
      showSuccess(t('orchestras.listUpdated'));
    },
    onError: (error) => showError(getErrorMessage(error)),
  });

  const deleteListMutation = useMutation({
    mutationFn: (id: string) => deleteMusicList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestra(selectedOrchestraId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.orchestras });
      showSuccess(t('orchestras.listDeleted'));
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
          <h1>{t('orchestras.title')}</h1>
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
          {t('orchestras.title')}
          <span className="badge badge-primary ml-2">{orchestras.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + {t('orchestras.newOrchestra')}
        </button>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t('orchestras.title')}</h2>
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
                        {orchestra.memberCount} {t('orchestras.membersCount')} • {orchestra.listCount} {t('orchestras.listsCount')}
                      </div>
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(orchestra)}
                        title={t('common.edit')}
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeletingOrchestra(orchestra)}
                        title={t('common.delete')}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>{t('orchestras.noOrchestras')}</p>
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
                  <h3 className="mb-1">{t('orchestras.members')} ({selectedOrchestra.members?.length || 0})</h3>
                  {selectedOrchestra.members?.length > 0 ? (
                    <div className="tags mb-2">
                      {selectedOrchestra.members.map((member: any) => (
                        <span key={member.id} className="tag">
                          {member.firstName} {member.lastName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="piece-meta mb-2">{t('orchestras.noMembersAssigned')}</p>
                  )}

                  <div className="flex justify-between items-center mb-1">
                    <h3>{t('orchestras.musicLists')} ({selectedOrchestra.lists?.length || 0})</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddListModal(true)}>
                      {t('orchestras.addList')}
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
                            <span className="piece-meta"> ({list.pieceCount} {t('orchestras.pieces')})</span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => openEditListModal(list)}
                              title={t('common.edit')}
                            >
                              ✏
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingList(list)}
                              title={t('common.delete')}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="piece-meta">{t('orchestras.noMusicLists')}</p>
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
                <p>{t('orchestras.selectToView')}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Orchestra Modal */}
      {showAddModal && (
        <FormModal
          title={t('orchestras.newOrchestra')}
          size="small"
          onClose={() => {
            setShowAddModal(false);
            setFormName('');
          }}
          onSubmit={handleCreate}
          submitLabel={t('common.add')}
          isSubmitting={createMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('orchestras.name')}</label>
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
          title={t('orchestras.edit')}
          size="small"
          onClose={() => {
            setEditingOrchestra(null);
            setFormName('');
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('orchestras.name')}</label>
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
          title={t('common.delete')}
          message={t('orchestras.deleteConfirm', { name: deletingOrchestra.name })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingOrchestra(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}

      {/* Add List Modal */}
      {showAddListModal && (
        <FormModal
          title={t('orchestras.newMusicList')}
          size="small"
          onClose={() => {
            setShowAddListModal(false);
            setListFormName('');
          }}
          onSubmit={handleCreateList}
          submitLabel={t('common.add')}
          isSubmitting={createListMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('orchestras.name')}</label>
            <input
              type="text"
              className="form-control"
              value={listFormName}
              onChange={(e) => setListFormName(e.target.value)}
              required
              autoFocus
              placeholder={t('orchestras.listNamePlaceholder')}
            />
          </div>
        </FormModal>
      )}

      {/* Edit List Modal */}
      {editingList && (
        <FormModal
          title={t('orchestras.editMusicList')}
          size="small"
          onClose={() => {
            setEditingList(null);
            setListFormName('');
          }}
          onSubmit={handleUpdateList}
          isSubmitting={updateListMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('orchestras.name')}</label>
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
          title={t('orchestras.deleteMusicList')}
          message={t('orchestras.deleteMusicListConfirm', { name: deletingList.name })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDeleteList}
          onCancel={() => setDeletingList(null)}
          isLoading={deleteListMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
