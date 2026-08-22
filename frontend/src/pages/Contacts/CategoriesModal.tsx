import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createContactCategory, updateContactCategory, deleteContactCategory } from '../../api/contacts';
import type { ContactCategory } from '../../api/contacts';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { showSuccess, showError } from '../../utils/toast';

export function CategoriesModal({
  categories,
  onClose,
  isAdmin,
}: {
  categories: ContactCategory[];
  onClose: () => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: '', color: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', color: '' });
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createContactCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-categories'] });
      showSuccess(t('contacts.categoryCreated'));
      setNewCategory({ name: '', color: '' });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorCreateCategory'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      updateContactCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-categories'] });
      showSuccess(t('contacts.categoryUpdated'));
      setEditingId(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorUpdateCategory'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContactCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-categories'] });
      showSuccess(t('contacts.categoryDeleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorDeleteCategory'));
    },
  });

  return (
    <Modal onClose={onClose} title={t('contacts.manageCategories')}>
      <div className="mb-3">
        <div className="row">
          <div className="col-8">
            <input
              type="text"
              className="form-control"
              placeholder={t('contacts.categoryName')}
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            />
          </div>
          <div className="col-2">
            <input
              type="color"
              className="form-control"
              value={newCategory.color || '#6366f1'}
              onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
            />
          </div>
          <div className="col-2">
            <button
              className="btn btn-primary w-100"
              onClick={() => createMutation.mutate(newCategory)}
              disabled={!newCategory.name || createMutation.isPending}
            >
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </div>

      <div className="list-group">
        {categories.map((cat) => (
          <div key={cat.id} className="list-group-item">
            {editingId === cat.id ? (
              <div className="row">
                <div className="col-7">
                  <input
                    type="text"
                    className="form-control"
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  />
                </div>
                <div className="col-2">
                  <input
                    type="color"
                    className="form-control"
                    value={editData.color || '#6366f1'}
                    onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                  />
                </div>
                <div className="col-3">
                  <div className="button-group">
                    <button className="btn btn-sm btn-outline" onClick={() => setEditingId(null)}>
                      <Icon name="close" />
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => updateMutation.mutate({ id: cat.id, data: editData })}
                      disabled={updateMutation.isPending}
                    >
                      <Icon name="check" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span style={{ color: cat.color }}>{cat.name}</span>
                <div className="button-group">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditData({ name: cat.name, color: cat.color || '' });
                    }}
                  >
                    <Icon name="pencil" />
                  </button>
                  {isAdmin && (
                    <button className="btn btn-sm btn-danger-outline" onClick={() => setDeletingCategoryId(cat.id)}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && <p className="text-muted text-center p-2">{t('contacts.noCategories')}</p>}
      </div>

      <div className="modal-footer">
        <button className="btn btn-primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      {/* Delete Category Confirmation */}
      {deletingCategoryId && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('contacts.confirmDeleteCategory')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(deletingCategoryId, {
              onSuccess: () => setDeletingCategoryId(null),
            });
          }}
          onCancel={() => setDeletingCategoryId(null)}
        />
      )}
    </Modal>
  );
}
