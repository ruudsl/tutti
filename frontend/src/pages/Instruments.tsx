import { useState, useEffect } from 'react';
import {
  getInstruments,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  addInstrumentAlias,
  deleteInstrumentAlias,
} from '../api';
import type { Instrument } from '../types';

export default function Instruments() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [newAlias, setNewAlias] = useState<{ instrumentId: string; alias: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTuning, setFormTuning] = useState('');
  const [formClef, setFormClef] = useState('sol');
  const [formAliases, setFormAliases] = useState('');

  useEffect(() => {
    loadInstruments();
  }, []);

  const loadInstruments = async () => {
    try {
      const data = await getInstruments();
      setInstruments(data);
    } catch (error) {
      console.error('Error loading instruments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const aliases = formAliases
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a);

      await createInstrument(formName, formTuning || undefined, formClef, aliases);
      await loadInstruments();
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken instrument');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstrument) return;

    try {
      await updateInstrument(editingInstrument.id, formName, formTuning || undefined, formClef);
      await loadInstruments();
      setEditingInstrument(null);
      resetForm();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken instrument');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je dit instrument wilt verwijderen?')) return;

    try {
      await deleteInstrument(id);
      await loadInstruments();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen instrument');
    }
  };

  const handleAddAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlias) return;

    try {
      await addInstrumentAlias(newAlias.instrumentId, newAlias.alias);
      await loadInstruments();
      setNewAlias(null);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij toevoegen alias');
    }
  };

  const handleDeleteAlias = async (instrumentId: string, aliasId: string) => {
    try {
      await deleteInstrumentAlias(instrumentId, aliasId);
      await loadInstruments();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen alias');
    }
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
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>Instrumenten</h1>
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
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(instrument.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Instrument Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nieuw instrument</h3>
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
                    placeholder="Bijv. Alto Saxophone"
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

      {/* Edit Instrument Modal */}
      {editingInstrument && (
        <div className="modal-overlay" onClick={() => setEditingInstrument(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Instrument bewerken</h3>
              <button className="modal-close" onClick={() => setEditingInstrument(null)}>×</button>
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingInstrument(null)}>
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

      {/* Add Alias Modal */}
      {newAlias && (
        <div className="modal-overlay" onClick={() => setNewAlias(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Alias toevoegen</h3>
              <button className="modal-close" onClick={() => setNewAlias(null)}>×</button>
            </div>
            <form onSubmit={handleAddAlias}>
              <div className="modal-body">
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
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setNewAlias(null)}>
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
    </div>
  );
}
