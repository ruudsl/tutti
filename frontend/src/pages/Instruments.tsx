import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useInstruments,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
  useAddInstrumentAlias,
  useDeleteInstrumentAlias,
} from '../hooks/useInstruments';
import { FormModal } from '../components/Modal';
import { Icon } from '../components/Icon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import type { Instrument } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Instruments() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.instruments');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [deletingInstrument, setDeletingInstrument] = useState<Instrument | null>(null);
  const [newAlias, setNewAlias] = useState<{ instrumentId: string; alias: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTuning, setFormTuning] = useState('');
  const [formClef, setFormClef] = useState('sol');
  const [formAliases, setFormAliases] = useState('');

  // TanStack Query hooks
  const { data: instruments = [], isLoading } = useInstruments();
  const createMutation = useCreateInstrument();
  const updateMutation = useUpdateInstrument();
  const deleteMutation = useDeleteInstrument();
  const addAliasMutation = useAddInstrumentAlias();
  const deleteAliasMutation = useDeleteInstrumentAlias();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const aliases = formAliases
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a);

    await createMutation.mutateAsync({
      name: formName,
      tuning: formTuning || undefined,
      clef: formClef,
      aliases: aliases.length > 0 ? aliases : undefined,
    });

    setShowAddModal(false);
    resetForm();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstrument) return;

    await updateMutation.mutateAsync({
      id: editingInstrument.id,
      data: {
        name: formName,
        tuning: formTuning || undefined,
        clef: formClef,
      },
    });

    setEditingInstrument(null);
    resetForm();
  };

  const handleDelete = async () => {
    if (!deletingInstrument) return;
    await deleteMutation.mutateAsync(deletingInstrument.id);
    setDeletingInstrument(null);
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlias) return;

    await addAliasMutation.mutateAsync({
      instrumentId: newAlias.instrumentId,
      alias: newAlias.alias,
    });

    setNewAlias(null);
  };

  const handleDeleteAlias = async (instrumentId: string, aliasId: string) => {
    await deleteAliasMutation.mutateAsync({ instrumentId, aliasId });
  };

  const resetForm = () => {
    setFormName('');
    setFormTuning('');
    setFormClef('sol');
    setFormAliases('');
  };

  const openEditModal = (instrument: Instrument) => {
    setEditingInstrument(instrument);
    setFormName(instrument.name);
    setFormTuning(instrument.tuning || '');
    setFormClef(instrument.clef || 'sol');
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('instruments.title')}</h1>
        </div>
        <div className="card">
          <div className="card-body">
            <SkeletonTable rows={8} columns={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('instruments.title')}
          <span className="badge badge-primary ml-2">{instruments.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + {t('instruments.newInstrument')}
        </button>
      </div>

      <div className="card">
        <div className="card-body flush">
          <table className="table mb-0">
            <thead>
              <tr>
                <th scope="col">{t('instruments.name')}</th>
                <th scope="col">{t('instruments.tuning')}</th>
                <th scope="col">{t('instruments.clef')}</th>
                <th scope="col">{t('instruments.aliases')}</th>
                <th scope="col"><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((instrument) => (
                <tr key={instrument.id}>
                  <td>
                    <strong>{instrument.name}</strong>
                  </td>
                  <td>{instrument.tuning || '-'}</td>
                  <td>{t(`instruments.clefLabels.${instrument.clef || 'sol'}`)}</td>
                  <td>
                    <div className="tags">
                      {instrument.aliases?.map((alias) => (
                        <span key={alias.id} className="tag">
                          {alias.name}
                          <button
                            className="tag-remove"
                            onClick={() => handleDeleteAlias(instrument.id, alias.id)}
                            aria-label={`${t('instruments.removeAlias')}: ${alias.name}`}
                            title={t('instruments.removeAlias')}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </span>
                      ))}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setNewAlias({ instrumentId: instrument.id, alias: '' })}
                      >
                        {t('instruments.addAlias')}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(instrument)}
                        aria-label={`${t('common.edit')}: ${instrument.name}`}
                        title={t('common.edit')}
                      >
                        <Icon name="pencil" size={16} />
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeletingInstrument(instrument)}
                        aria-label={`${t('common.delete')}: ${instrument.name}`}
                        title={t('common.delete')}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>
                    {t('instruments.noInstruments')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Instrument Modal */}
      {showAddModal && (
        <FormModal
          title={t('instruments.newInstrument')}
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
          onSubmit={handleCreate}
          submitLabel={t('common.add')}
          isSubmitting={createMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('instruments.name')}</label>
            <input
              type="text"
              className="form-control"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              placeholder={t('instruments.namePlaceholder')}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('instruments.tuning')}</label>
            <input
              type="text"
              className="form-control"
              value={formTuning}
              onChange={(e) => setFormTuning(e.target.value)}
              placeholder={t('instruments.tuningPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('instruments.clef')}</label>
            <select
              className="form-control"
              value={formClef}
              onChange={(e) => setFormClef(e.target.value)}
            >
              <option value="sol">{t('instruments.clefOptions.sol')}</option>
              <option value="fa">{t('instruments.clefOptions.fa')}</option>
              <option value="ut">{t('instruments.clefOptions.ut')}</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('instruments.aliasesSeparated')}</label>
            <input
              type="text"
              className="form-control"
              value={formAliases}
              onChange={(e) => setFormAliases(e.target.value)}
              placeholder={t('instruments.aliasesPlaceholder')}
            />
          </div>
        </FormModal>
      )}

      {/* Edit Instrument Modal */}
      {editingInstrument && (
        <FormModal
          title={t('instruments.edit')}
          onClose={() => {
            setEditingInstrument(null);
            resetForm();
          }}
          onSubmit={handleUpdate}
          isSubmitting={updateMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('instruments.name')}</label>
            <input
              type="text"
              className="form-control"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('instruments.tuning')}</label>
            <input
              type="text"
              className="form-control"
              value={formTuning}
              onChange={(e) => setFormTuning(e.target.value)}
              placeholder={t('instruments.tuningPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('instruments.clef')}</label>
            <select
              className="form-control"
              value={formClef}
              onChange={(e) => setFormClef(e.target.value)}
            >
              <option value="sol">{t('instruments.clefOptions.sol')}</option>
              <option value="fa">{t('instruments.clefOptions.fa')}</option>
              <option value="ut">{t('instruments.clefOptions.ut')}</option>
            </select>
          </div>
        </FormModal>
      )}

      {/* Add Alias Modal */}
      {newAlias && (
        <FormModal
          title={t('instruments.addAlias')}
          size="small"
          onClose={() => setNewAlias(null)}
          onSubmit={handleAddAlias}
          submitLabel={t('common.add')}
          isSubmitting={addAliasMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">{t('instruments.aliases')}</label>
            <input
              type="text"
              className="form-control"
              value={newAlias.alias}
              onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })}
              required
              placeholder={t('instruments.aliasPlaceholder')}
              autoFocus
            />
          </div>
        </FormModal>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingInstrument && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('instruments.deleteConfirm', { name: deletingInstrument.name })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingInstrument(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
