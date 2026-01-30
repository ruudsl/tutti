import { useState, useEffect } from 'react';
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getInstruments,
  getOrchestras,
} from '../api';
import type { User, Instrument, Orchestra } from '../types';

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formRole, setFormRole] = useState('member');
  const [formInstruments, setFormInstruments] = useState<string[]>([]);
  const [formOrchestras, setFormOrchestras] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersData, instrumentsData, orchestrasData] = await Promise.all([
        getUsers(),
        getInstruments(),
        getOrchestras(),
      ]);
      setUsers(usersData);
      setInstruments(instrumentsData);
      setOrchestras(orchestrasData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createUser({
        email: formEmail,
        password: formPassword,
        firstName: formFirstName,
        lastName: formLastName,
        role: formRole,
        instrumentIds: formInstruments,
        orchestraIds: formOrchestras,
      });
      await loadData();
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij aanmaken gebruiker');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      await updateUser(editingUser.id, {
        email: formEmail,
        firstName: formFirstName,
        lastName: formLastName,
        role: formRole,
        password: formPassword || undefined,
        instrumentIds: formInstruments,
        orchestraIds: formOrchestras,
      });
      await loadData();
      setEditingUser(null);
      resetForm();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij bijwerken gebruiker');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Weet je zeker dat je deze gebruiker wilt verwijderen?')) return;

    try {
      await deleteUser(id);
      await loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Fout bij verwijderen gebruiker');
    }
  };

  const resetForm = () => {
    setFormEmail('');
    setFormPassword('');
    setFormFirstName('');
    setFormLastName('');
    setFormRole('member');
    setFormInstruments([]);
    setFormOrchestras([]);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormEmail(user.email);
    setFormPassword('');
    setFormFirstName(user.firstName);
    setFormLastName(user.lastName);
    setFormRole(user.role);
    setFormInstruments(user.instruments?.map((i) => i.id) || []);
    setFormOrchestras(user.orchestras?.map((o) => o.id) || []);
  };

  const toggleInstrument = (id: string) => {
    setFormInstruments((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleOrchestra = (id: string) => {
    setFormOrchestras((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id]
    );
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="badge badge-danger">Beheerder</span>;
      case 'music_committee':
        return <span className="badge badge-warning">Muziekcommissie</span>;
      default:
        return <span className="badge badge-primary">Lid</span>;
    }
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
        <h1>Leden</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Nieuw lid
        </button>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Instrumenten</th>
                <th>Orkesten</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.firstName} {user.lastName}</strong>
                  </td>
                  <td>{user.email}</td>
                  <td>{getRoleBadge(user.role)}</td>
                  <td>
                    <div className="tags">
                      {user.instruments?.map((i) => {
                        const clefLabel = i.clef === 'fa' ? 'fa' : i.clef === 'ut' ? 'ut' : 'sol';
                        const details = [i.tuning, clefLabel].filter(Boolean).join(', ');
                        return (
                          <span key={i.id} className="tag">
                            {i.name}{details && ` (${details})`}
                          </span>
                        );
                      }) || '-'}
                    </div>
                  </td>
                  <td>
                    <div className="tags">
                      {user.orchestras?.map((o) => (
                        <span key={o.id} className="tag">{o.name}</span>
                      )) || '-'}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openEditModal(user)}
                      >
                        ✏
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(user.id)}
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

      {/* Add/Edit User Modal */}
      {(showAddModal || editingUser) && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowAddModal(false);
            setEditingUser(null);
            resetForm();
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingUser ? 'Lid bewerken' : 'Nieuw lid'}</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingUser(null);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={editingUser ? handleUpdate : handleCreate}>
              <div className="modal-body">
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Voornaam</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formFirstName}
                      onChange={(e) => setFormFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Achternaam</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formLastName}
                      onChange={(e) => setFormLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Wachtwoord {editingUser && '(laat leeg om niet te wijzigen)'}
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    required={!editingUser}
                    minLength={6}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select
                    className="form-control form-select"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                  >
                    <option value="member">Lid</option>
                    <option value="music_committee">Muziekcommissie</option>
                    <option value="admin">Beheerder</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Instrumenten</label>
                  <div className="checkbox-group">
                    {instruments.map((instrument) => {
                      const clefLabel = instrument.clef === 'fa' ? 'fa' : instrument.clef === 'ut' ? 'ut' : 'sol';
                      const details = [
                        instrument.tuning,
                        clefLabel
                      ].filter(Boolean).join(', ');
                      return (
                        <label key={instrument.id} className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={formInstruments.includes(instrument.id)}
                            onChange={() => toggleInstrument(instrument.id)}
                          />
                          <span>
                            {instrument.name}
                            {details && <span className="text-light"> ({details})</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Orkesten</label>
                  <div className="checkbox-group">
                    {orchestras.map((orchestra) => (
                      <label key={orchestra.id} className="checkbox-item">
                        <input
                          type="checkbox"
                          checked={formOrchestras.includes(orchestra.id)}
                          onChange={() => toggleOrchestra(orchestra.id)}
                        />
                        <span>{orchestra.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingUser(null);
                    resetForm();
                  }}
                >
                  Annuleren
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Opslaan' : 'Toevoegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
