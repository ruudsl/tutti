import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from './Icon';
import { Modal } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  getResourceCategories,
  createResourceCategory,
  deleteResourceCategory,
  updateResourceCategory,
  reorderResourceCategories,
  ResourceCategory,
} from '../api/resources';
import { showSuccess, showError } from '../utils/toast';

const AVAILABLE_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#78716c', '#71717a', '#64748b',
];

const AVAILABLE_ICONS: IconName[] = [
  'building', 'truck', 'package', 'music', 'wrench', 'users',
  'calendar', 'clock', 'mapPin', 'home', 'shield', 'settings',
];

interface ResourceCategoriesManagerProps {
  onClose: () => void;
}

export function ResourceCategoriesManager({ onClose }: ResourceCategoriesManagerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ResourceCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ResourceCategory | null>(null);
  const [draggedItem, setDraggedItem] = useState<ResourceCategory | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['resource-categories'],
    queryFn: getResourceCategories,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteResourceCategory,
    onSuccess: () => {
      showSuccess(t('resources.categories.deleted'));
      queryClient.invalidateQueries({ queryKey: ['resource-categories'] });
      setDeletingCategory(null);
    },
    onError: () => showError(t('resources.categories.errorDelete')),
  });

  const reorderMutation = useMutation({
    mutationFn: reorderResourceCategories,
    onSuccess: () => {
      showSuccess(t('resources.categories.reordered'));
      queryClient.invalidateQueries({ queryKey: ['resource-categories'] });
    },
    onError: () => showError(t('resources.categories.errorReorder')),
  });

  // Drag and drop handlers
  const handleDragStart = useCallback((category: ResourceCategory) => {
    setDraggedItem(category);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedItem && dragOverIndex !== null) {
      const currentIndex = categories.findIndex(c => c.id === draggedItem.id);
      if (currentIndex !== dragOverIndex && currentIndex !== -1) {
        // Create new order
        const newOrder = [...categories];
        newOrder.splice(currentIndex, 1);
        newOrder.splice(dragOverIndex, 0, draggedItem);
        const categoryIds = newOrder.map(c => c.id);
        reorderMutation.mutate(categoryIds);
      }
    }
    setDraggedItem(null);
    setDragOverIndex(null);
  }, [draggedItem, dragOverIndex, categories, reorderMutation]);

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Modal onClose={onClose} title={t('resources.categories.manage')} size="large">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-base-content/70">
            {t('resources.categories.description')}
          </p>
          <button
            className="btn btn-sm btn-primary gap-1"
            onClick={() => setShowAddModal(true)}
          >
            <Icon name="plus" size={14} aria-hidden={true} />
            {t('resources.categories.add')}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : sortedCategories.length === 0 ? (
          <div className="text-center py-8 bg-base-200 rounded-lg">
            <Icon name="folder" size={32} className="mx-auto mb-2 opacity-50" aria-hidden={true} />
            <p className="text-base-content/60">{t('resources.categories.noCategories')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedCategories.map((category, index) => (
              <div
                key={category.id}
                draggable
                onDragStart={() => handleDragStart(category)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleDragStart(category);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${t('common.dragToReorder')} ${category.name}`}
                className={`
                  flex items-center justify-between p-3 bg-base-200 rounded-lg cursor-move
                  ${dragOverIndex === index ? 'ring-2 ring-primary' : ''}
                  ${draggedItem?.id === category.id ? 'opacity-50' : ''}
                `}
              >
                <div className="flex items-center gap-3">
                  <Icon name="menu" size={16} className="text-base-content/40" aria-hidden={true} />
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: category.color || '#6366f1' }}
                    aria-hidden={true}
                  />
                  {category.icon && (
                    <Icon name={category.icon as IconName} size={18} aria-hidden={true} />
                  )}
                  <div>
                    <div className="font-medium">{category.name}</div>
                    {category.description && (
                      <div className="text-xs text-base-content/60">{category.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-sm">{category.resourceCount} {t('resources.title').toLowerCase()}</span>
                  <button
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => setEditingCategory(category)}
                    aria-label={t('common.edit')}
                  >
                    <Icon name="pencil" size={14} aria-hidden={true} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm btn-square text-error"
                    onClick={() => setDeletingCategory(category)}
                    aria-label={t('common.delete')}
                    disabled={category.resourceCount > 0}
                  >
                    <Icon name="trash" size={14} aria-hidden={true} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-base-content/50">
          {t('resources.categories.dragHint')}
        </div>
      </div>

      {showAddModal && (
        <CategoryFormModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['resource-categories'] });
            setShowAddModal(false);
          }}
        />
      )}

      {editingCategory && (
        <CategoryFormModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['resource-categories'] });
            setEditingCategory(null);
          }}
        />
      )}

      {deletingCategory && (
        <ConfirmDialog
          title={t('resources.categories.delete')}
          message={t('resources.categories.deleteConfirm', { name: deletingCategory.name })}
          confirmLabel={t('common.delete')}
          onConfirm={() => deleteMutation.mutate(deletingCategory.id)}
          onCancel={() => setDeletingCategory(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </Modal>
  );
}

interface CategoryFormModalProps {
  category?: ResourceCategory;
  onClose: () => void;
  onSuccess: () => void;
}

function CategoryFormModal({ category, onClose, onSuccess }: CategoryFormModalProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: category?.name || '',
    description: category?.description || '',
    color: category?.color || '#6366f1',
    icon: category?.icon || '',
  });

  const createMutation = useMutation({
    mutationFn: createResourceCategory,
    onSuccess: () => {
      showSuccess(t('resources.categories.created'));
      onSuccess();
    },
    onError: () => showError(t('resources.categories.errorCreate')),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; color?: string; icon?: string }) =>
      updateResourceCategory(category!.id, data),
    onSuccess: () => {
      showSuccess(t('resources.categories.updated'));
      onSuccess();
    },
    onError: () => showError(t('resources.categories.errorUpdate')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (category) {
      updateMutation.mutate({
        name: formData.name,
        color: formData.color,
        icon: formData.icon || undefined,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        description: formData.description || undefined,
        color: formData.color,
        icon: formData.icon || undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = formData.name.trim().length > 0;

  return (
    <Modal
      onClose={onClose}
      title={category ? t('resources.categories.edit') : t('resources.categories.add')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.name')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        {!category && (
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('common.description')}</span>
            </label>
            <textarea
              className="textarea textarea-bordered"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>
        )}

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.categories.color')}</span>
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('resources.categories.color')}>
            {AVAILABLE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`w-8 h-8 rounded-lg transition-transform ${
                  formData.color === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''
                }`}
                style={{ backgroundColor: color }}
                onClick={() => setFormData({ ...formData, color })}
                aria-label={t('resources.categories.selectColor', { color })}
                aria-pressed={formData.color === color}
                role="radio"
                aria-checked={formData.color === color}
              />
            ))}
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('resources.categories.icon')}</span>
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('resources.categories.icon')}>
            <button
              type="button"
              className={`btn btn-sm ${!formData.icon ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFormData({ ...formData, icon: '' })}
              role="radio"
              aria-checked={!formData.icon}
            >
              {t('common.none')}
            </button>
            {AVAILABLE_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className={`btn btn-sm btn-square ${formData.icon === icon ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFormData({ ...formData, icon })}
                aria-label={t('resources.categories.selectIcon', { icon })}
                role="radio"
                aria-checked={formData.icon === icon}
              >
                <Icon name={icon} size={16} aria-hidden={true} />
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('common.preview')}</span>
          </label>
          <div className="p-3 bg-base-200 rounded-lg" aria-live="polite">
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: formData.color }}
                aria-hidden={true}
              />
              {formData.icon && (
                <Icon name={formData.icon as IconName} size={18} aria-hidden={true} />
              )}
              <span className="font-medium">{formData.name || t('resources.categories.untitled')}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit || isPending}
          >
            {isPending ? <span className="loading loading-spinner loading-sm" /> : null}
            {category ? t('common.save') : t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ResourceCategoriesManager;
