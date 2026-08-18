import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Modal, FormModal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  getPostCategories,
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  PostCategory,
  CreateCategoryData,
} from '../api/posts';
import { showSuccess, showError } from '../utils/toast';

interface PostCategoriesManagerProps {
  onClose: () => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
];

export function PostCategoriesManager({ onClose }: PostCategoriesManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PostCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<PostCategory | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateCategoryData>({
    name: '',
    slug: '',
    description: '',
    color: DEFAULT_COLORS[0],
  });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['post-categories'],
    queryFn: getPostCategories,
  });

  const createMutation = useMutation({
    mutationFn: createPostCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-categories'] });
      showSuccess(t('posts.categories.created'));
      setShowAddModal(false);
      resetForm();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.categories.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCategoryData> }) => updatePostCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-categories'] });
      showSuccess(t('posts.categories.updated'));
      setEditingCategory(null);
      resetForm();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.categories.errorUpdate'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePostCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post-categories'] });
      showSuccess(t('posts.categories.deleted'));
      setDeletingCategory(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.categories.errorDelete'));
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      color: DEFAULT_COLORS[0],
    });
  };

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: prev.slug || generateSlug(name),
    }));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...formData,
      slug: formData.slug || generateSlug(formData.name),
    };
    createMutation.mutate(data);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    updateMutation.mutate({ id: editingCategory.id, data: formData });
  };

  const handleDelete = () => {
    if (!deletingCategory) return;
    deleteMutation.mutate(deletingCategory.id);
  };

  const openEditModal = (category: PostCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      color: category.color || DEFAULT_COLORS[0],
    });
  };

  const canSubmit = formData.name.trim().length > 0;

  return (
    <Modal onClose={onClose} size="large" title={t('posts.categories.manage')}>
      <div className="space-y-4">
        {/* Header with add button */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-base-content/70">{t('posts.categories.description')}</p>
          <button className="btn btn-primary btn-sm gap-1" onClick={() => setShowAddModal(true)}>
            <Icon name="plus" size={14} aria-hidden={true} />
            {t('posts.categories.add')}
          </button>
        </div>

        {/* Categories list */}
        {isLoading ? (
          <div className="flex justify-center p-8">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center p-8 bg-base-200 rounded-lg">
            <Icon name="folder" size={48} className="mx-auto opacity-50 mb-4" aria-hidden={true} />
            <p className="text-base-content/70">{t('posts.categories.noCategories')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('posts.categories.color')}</th>
                  <th>{t('posts.categories.name')}</th>
                  <th>{t('posts.categories.slug')}</th>
                  <th>{t('posts.categories.postCount')}</th>
                  <th>
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <div
                        className="w-6 h-6 rounded-full border border-base-300"
                        style={{ backgroundColor: category.color || '#888' }}
                      />
                    </td>
                    <td className="font-medium">{category.name}</td>
                    <td className="text-sm text-base-content/60">{category.slug}</td>
                    <td>
                      <span className="badge badge-sm">{category.postCount}</span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditModal(category)}
                          aria-label={t('common.edit')}
                        >
                          <Icon name="pencil" size={14} aria-hidden={true} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm text-error"
                          onClick={() => setDeletingCategory(category)}
                          aria-label={t('common.delete')}
                          disabled={category.postCount > 0}
                        >
                          <Icon name="trash" size={14} aria-hidden={true} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info */}
        <p className="text-xs text-base-content/50">{t('posts.categories.deleteNote')}</p>
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <FormModal
          title={t('posts.categories.add')}
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
          onSubmit={handleCreate}
          submitLabel={t('common.add')}
          isSubmitting={createMutation.isPending}
          submitDisabled={!canSubmit}
        >
          <CategoryForm formData={formData} setFormData={setFormData} onNameChange={handleNameChange} />
        </FormModal>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <FormModal
          title={t('posts.categories.edit')}
          onClose={() => {
            setEditingCategory(null);
            resetForm();
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateMutation.isPending}
          submitDisabled={!canSubmit}
        >
          <CategoryForm formData={formData} setFormData={setFormData} onNameChange={handleNameChange} />
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingCategory && (
        <ConfirmDialog
          title={t('posts.categories.delete')}
          message={t('posts.categories.deleteConfirm', { name: deletingCategory.name })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingCategory(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </Modal>
  );
}

// Category Form Fields Component
function CategoryForm({
  formData,
  setFormData,
  onNameChange,
}: {
  formData: CreateCategoryData;
  setFormData: React.Dispatch<React.SetStateAction<CreateCategoryData>>;
  onNameChange: (name: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="form-control">
        <label className="label">
          <span className="label-text">{t('posts.categories.name')} *</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          value={formData.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('posts.categories.namePlaceholder')}
          required
          autoFocus
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">{t('posts.categories.slug')}</span>
        </label>
        <input
          type="text"
          className="input input-bordered"
          value={formData.slug}
          onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
          placeholder={t('posts.categories.slugPlaceholder')}
        />
        <label className="label">
          <span className="label-text-alt text-base-content/60">{t('posts.categories.slugHint')}</span>
        </label>
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">{t('posts.categories.descriptionLabel')}</span>
        </label>
        <textarea
          className="textarea textarea-bordered"
          value={formData.description}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder={t('posts.categories.descriptionPlaceholder')}
          rows={2}
        />
      </div>

      <div className="form-control">
        <label className="label">
          <span className="label-text">{t('posts.categories.color')}</span>
        </label>
        <div className="flex items-center gap-3">
          <div className="flex gap-2" role="radiogroup" aria-label={t('posts.categories.color')}>
            {DEFAULT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  formData.color === color ? 'border-primary scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setFormData((prev) => ({ ...prev, color }))}
                aria-label={t('posts.categories.selectColor', { color })}
                role="radio"
                aria-checked={formData.color === color}
              />
            ))}
          </div>
          <input
            type="color"
            className="w-8 h-8 rounded cursor-pointer"
            value={formData.color || DEFAULT_COLORS[0]}
            onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
            aria-label={t('posts.categories.customColor')}
          />
        </div>
      </div>
    </div>
  );
}

export default PostCategoriesManager;
