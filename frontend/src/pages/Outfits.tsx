import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import {
  getOutfits,
  getOutfit,
  createOutfit,
  updateOutfit,
  deleteOutfit,
  Outfit,
  CreateOutfitData,
} from '../api/outfits';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';

export default function Outfits() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.outfits');
  const queryClient = useQueryClient();

  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [formData, setFormData] = useState<CreateOutfitData>({
    name: '',
    description: '',
    colorCode: '',
    items: [],
    isDefault: false,
  });
  const [itemInput, setItemInput] = useState('');

  const canManage = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE;

  const { data: outfits = [], isLoading } = useQuery({
    queryKey: ['outfits'],
    queryFn: getOutfits,
  });

  const { data: outfitDetail } = useQuery({
    queryKey: ['outfit', selectedOutfit?.id],
    queryFn: () => selectedOutfit ? getOutfit(selectedOutfit.id) : null,
    enabled: !!selectedOutfit,
  });

  const createMutation = useMutation({
    mutationFn: createOutfit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outfits'] });
      showSuccess(t('outfits.created'));
      setShowCreateModal(false);
      resetForm();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('outfits.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateOutfitData> }) => updateOutfit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outfits'] });
      queryClient.invalidateQueries({ queryKey: ['outfit', selectedOutfit?.id] });
      showSuccess(t('outfits.updated'));
      setShowEditModal(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('outfits.errorUpdate'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOutfit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outfits'] });
      showSuccess(t('outfits.deleted'));
      setSelectedOutfit(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('outfits.errorDelete'));
    },
  });

  const resetForm = () => {
    setFormData({ name: '', description: '', colorCode: '', items: [], isDefault: false });
    setItemInput('');
  };

  const handleAddItem = () => {
    if (itemInput.trim()) {
      setFormData(prev => ({ ...prev, items: [...(prev.items || []), itemInput.trim()] }));
      setItemInput('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setFormData(prev => ({ ...prev, items: prev.items?.filter((_, i) => i !== index) || [] }));
  };

  const openEditModal = (outfit: Outfit) => {
    setFormData({
      name: outfit.name,
      description: outfit.description || '',
      colorCode: outfit.colorCode || '',
      items: outfit.items || [],
      isDefault: outfit.isDefault,
    });
    setSelectedOutfit(outfit);
    setShowEditModal(true);
  };

  if (isLoading) {
    return (
      <div className="page-container">
        <h1>{t('outfits.title')}</h1>
        <SkeletonTable rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header flex justify-between items-center mb-4">
        <h1>{t('outfits.title')}</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" className="w-4 h-4 mr-2" />
            {t('outfits.add')}
          </button>
        )}
      </div>

      {outfits.length === 0 ? (
        <div className="card p-8 text-center">
          <Icon name="package" className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
          <p className="text-base-content/60">{t('outfits.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {outfits.map((outfit) => (
            <div
              key={outfit.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedOutfit(outfit)}
            >
              <div className="card-body">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {outfit.colorCode && (
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: outfit.colorCode }}
                      />
                    )}
                    <h3 className="card-title text-lg">{outfit.name}</h3>
                  </div>
                  {outfit.isDefault && (
                    <span className="badge badge-primary badge-sm">{t('outfits.default')}</span>
                  )}
                </div>
                {outfit.description && (
                  <p className="text-sm text-base-content/70 line-clamp-2">{outfit.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {outfit.items.slice(0, 3).map((item, idx) => (
                    <span key={idx} className="badge badge-outline badge-sm">{item}</span>
                  ))}
                  {outfit.items.length > 3 && (
                    <span className="badge badge-ghost badge-sm">+{outfit.items.length - 3}</span>
                  )}
                </div>
                <div className="card-actions justify-end mt-2 text-sm text-base-content/50">
                  <span>{t('outfits.usedIn', { count: outfit.usageCount })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOutfit && outfitDetail && !showEditModal && (
        <Modal onClose={() => setSelectedOutfit(null)} title={outfitDetail.name} size="large">
          <div className="space-y-4">
            {outfitDetail.description && <p>{outfitDetail.description}</p>}

            {outfitDetail.colorCode && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('outfits.color')}:</span>
                <div
                  className="w-6 h-6 rounded border"
                  style={{ backgroundColor: outfitDetail.colorCode }}
                />
                <span className="text-sm">{outfitDetail.colorCode}</span>
              </div>
            )}

            {outfitDetail.items.length > 0 && (
              <div>
                <span className="font-medium">{t('outfits.items')}:</span>
                <ul className="list-disc list-inside mt-1">
                  {outfitDetail.items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {outfitDetail.recentConcerts.length > 0 && (
              <div>
                <span className="font-medium">{t('outfits.recentConcerts')}:</span>
                <ul className="mt-1 space-y-1">
                  {outfitDetail.recentConcerts.map((concert) => (
                    <li key={concert.id} className="text-sm">
                      {concert.name} - {new Date(concert.date).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {canManage && (
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button className="btn btn-outline btn-sm" onClick={() => openEditModal(selectedOutfit)}>
                  <Icon name="pencil" className="w-4 h-4 mr-1" />
                  {t('common.edit')}
                </button>
                <button
                  className="btn btn-error btn-outline btn-sm"
                  onClick={() => {
                    if (confirm(t('outfits.confirmDelete'))) {
                      deleteMutation.mutate(selectedOutfit.id);
                    }
                  }}
                >
                  <Icon name="trash" className="w-4 h-4 mr-1" />
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <Modal onClose={() => { setShowCreateModal(false); resetForm(); }} title={t('outfits.add')} size="large">
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.name')} *</span></label>
              <input
                type="text"
                className="input input-bordered"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.description')}</span></label>
              <textarea
                className="textarea textarea-bordered"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.color')}</span></label>
              <input
                type="color"
                className="w-20 h-10"
                value={formData.colorCode || '#000000'}
                onChange={(e) => setFormData(prev => ({ ...prev, colorCode: e.target.value }))}
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.items')}</span></label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-bordered flex-1"
                  value={itemInput}
                  onChange={(e) => setItemInput(e.target.value)}
                  placeholder={t('outfits.itemPlaceholder')}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                />
                <button type="button" className="btn btn-outline" onClick={handleAddItem}>
                  <Icon name="plus" className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.items?.map((item, idx) => (
                  <span key={idx} className="badge badge-outline gap-1">
                    {item}
                    <button type="button" onClick={() => handleRemoveItem(idx)}>
                      <Icon name="close" className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                />
                <span className="label-text">{t('outfits.setAsDefault')}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <Modal onClose={() => { setShowEditModal(false); resetForm(); }} title={t('outfits.edit')} size="large">
          <form onSubmit={(e) => { e.preventDefault(); selectedOutfit && updateMutation.mutate({ id: selectedOutfit.id, data: formData }); }} className="space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.name')} *</span></label>
              <input
                type="text"
                className="input input-bordered"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.description')}</span></label>
              <textarea
                className="textarea textarea-bordered"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.color')}</span></label>
              <input
                type="color"
                className="w-20 h-10"
                value={formData.colorCode || '#000000'}
                onChange={(e) => setFormData(prev => ({ ...prev, colorCode: e.target.value }))}
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">{t('outfits.items')}</span></label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-bordered flex-1"
                  value={itemInput}
                  onChange={(e) => setItemInput(e.target.value)}
                  placeholder={t('outfits.itemPlaceholder')}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                />
                <button type="button" className="btn btn-outline" onClick={handleAddItem}>
                  <Icon name="plus" className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.items?.map((item, idx) => (
                  <span key={idx} className="badge badge-outline gap-1">
                    {item}
                    <button type="button" onClick={() => handleRemoveItem(idx)}>
                      <Icon name="close" className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                />
                <span className="label-text">{t('outfits.setAsDefault')}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowEditModal(false); resetForm(); }}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
