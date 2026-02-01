import { useState } from 'react';
import {
  useInstruments,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
  useAddInstrumentAlias,
  useDeleteInstrumentAlias,
} from '../hooks/useInstruments';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import type { Instrument } from '../types';

export default function Instruments() {
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
          <h1>Instrumenten</h1>
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
          Instrumenten
          <span className="badge badge-primary ml-2">{instruments.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Nieuw instrument
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Stemming</th>
                <th>Sleutel</th>
                <th>Aliassen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((instrument) => (
                <tr key={instrument.id}>
                  <td>
                    <strong>{instrument.name}</strong>
                  </td>
                  <td>{instrument.tuning || '-'}</td>
                  <td>{instrument.clef === 'fa' ? 'Fa (bas)' : instrument.clef === 'ut' ? 'Ut (alt)' : 'Sol (viool)'}</td>
                  <td>
                    <div className="tags">
                      {instrument.aliases?.map((alias) => (
                        <span key={alias.id} className="tag">
                          {alias.name}
                          <button
                            className="tag-remove"
                            onClick={() => handleDeleteAlias(instrument.id, alias.id)}
                            title="Verwijder alias"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => setNewAlias({ instrumentId: instrument.id, alias: '' })}
                      >
                        + Alias
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(instrument)}
                        title="Bewerken"
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeletingInstrument(instrument)}
                        title="Verwijderen"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {instruments.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#666' }}>
                    Geen instrumenten gevonden
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
          title="Nieuw instrument"
          onClose={() => {
            setShowAddModal(false);
            resetForm();
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
              placeholder="Bijv. Alto Saxophone"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Stemming</label>
            <input
              type="text"
              className="form-control"
              value={formTuning}
              onChange={(e) => setFormTuning(e.target.value)}
              placeholder="Bijv. Bb, Eb, C"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sleutel</label>
            <select
              className="form-control"
              value={formClef}
              onChange={(e) => setFormClef(e.target.value)}
            >
              <option value="sol">Sol (vioolsleutel)</option>
              <option value="fa">Fa (bassleutel)</option>
              <option value="ut">Ut (altsleutel)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Aliassen (komma gescheiden)</label>
            <input
              type="text"
              className="form-control"
              value={formAliases}
              onChange={(e) => setFormAliases(e.target.value)}
              placeholder="Bijv. Altsax, altsax, Alt Sax"
            />
          </div>
        </FormModal>
      )}

      {/* Edit Instrument Modal */}
      {editingInstrument && (
        <FormModal
          title="Instrument bewerken"
          onClose={() => {
            setEditingInstrument(null);
            resetForm();
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
          <div className="form-group">
            <label className="form-label">Stemming</label>
            <input
              type="text"
              className="form-control"
              value={formTuning}
              onChange={(e) => setFormTuning(e.target.value)}
              placeholder="Bijv. Bb, Eb, C"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sleutel</label>
            <select
              className="form-control"
              value={formClef}
              onChange={(e) => setFormClef(e.target.value)}
            >
              <option value="sol">Sol (vioolsleutel)</option>
              <option value="fa">Fa (bassleutel)</option>
              <option value="ut">Ut (altsleutel)</option>
            </select>
          </div>
        </FormModal>
      )}

      {/* Add Alias Modal */}
      {newAlias && (
        <FormModal
          title="Alias toevoegen"
          size="small"
          onClose={() => setNewAlias(null)}
          onSubmit={handleAddAlias}
          submitLabel="Toevoegen"
          isSubmitting={addAliasMutation.isPending}
        >
          <div className="form-group">
            <label className="form-label">Alias</label>
            <input
              type="text"
              className="form-control"
              value={newAlias.alias}
              onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })}
              required
              placeholder="Bijv. Altsax"
              autoFocus
            />
          </div>
        </FormModal>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingInstrument && (
        <ConfirmDialog
          title="Instrument verwijderen"
          message={`Weet je zeker dat je "${deletingInstrument.name}" wilt verwijderen?`}
          confirmLabel="Verwijderen"
          onConfirm={handleDelete}
          onCancel={() => setDeletingInstrument(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
