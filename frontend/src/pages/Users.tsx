import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { useInstruments } from '../hooks/useInstruments';
import { useOrchestras } from '../hooks/useOrchestras';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import type { User } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function Users() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.users');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Filter state
  const [filterOrchestra, setFilterOrchestra] = useState<string>('');
  const [filterInstrument, setFilterInstrument] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formRole, setFormRole] = useState('member');
  const [formInstruments, setFormInstruments] = useState<string[]>([]);
  const [formOrchestras, setFormOrchestras] = useState<string[]>([]);

  // TanStack Query hooks
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: instruments = [], isLoading: instrumentsLoading } = useInstruments();
  const { data: orchestras = [], isLoading: orchestrasLoading } = useOrchestras();

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const isLoading = usersLoading || instrumentsLoading || orchestrasLoading;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    createMutation.mutate({
      email: formEmail,
      password: formPassword,
      firstName: formFirstName,
      lastName: formLastName,
      role: formRole,
      instrumentIds: formInstruments,
      orchestraIds: formOrchestras,
    }, {
      onSuccess: () => {
        setShowAddModal(false);
        resetForm();
      },
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    updateMutation.mutate({
      id: editingUser.id,
      data: {
        email: formEmail,
        firstName: formFirstName,
        lastName: formLastName,
        role: formRole,
        password: formPassword || undefined,
        instrumentIds: formInstruments,
        orchestraIds: formOrchestras,
      },
    }, {
      onSuccess: () => {
        setEditingUser(null);
        resetForm();
      },
    });
  };

  const handleDelete = () => {
    if (!deletingUser) return;

    deleteMutation.mutate(deletingUser.id, {
      onSuccess: () => {
        setDeletingUser(null);
      },
    });
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
        return <span className="badge badge-danger">{t('roles.admin')}</span>;
      case 'music_committee':
        return <span className="badge badge-warning">{t('roles.music_committee')}</span>;
      case 'conductor':
        return <span className="badge badge-success">{t('roles.conductor')}</span>;
      default:
        return <span className="badge badge-primary">{t('roles.member')}</span>;
    }
  };

  // Filter users
  const filteredUsers = users.filter((user) => {
    // Search filter
    if (filterSearch) {
      const searchLower = filterSearch.toLowerCase();
      const nameMatch = `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchLower);
      const emailMatch = user.email.toLowerCase().includes(searchLower);
      if (!nameMatch && !emailMatch) return false;
    }

    // Orchestra filter
    if (filterOrchestra) {
      const hasOrchestra = user.orchestras?.some((o) => o.id === filterOrchestra);
      if (!hasOrchestra) return false;
    }

    // Instrument filter
    if (filterInstrument) {
      const hasInstrument = user.instruments?.some((i) => i.id === filterInstrument);
      if (!hasInstrument) return false;
    }

    return true;
  });

  if (isLoading) {
    return (
      <div>
        <div className="flex justify-between items-center mb-3">
          <h1>{t('users.title')}</h1>
        </div>
        <SkeletonTable rows={8} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('users.title')}
          <span className="badge badge-primary" style={{ marginLeft: '0.75rem', fontSize: '1rem', verticalAlign: 'middle' }}>
            {filteredUsers.length === users.length
              ? users.length
              : `${filteredUsers.length} / ${users.length}`}
          </span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + {t('users.newMember')}
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-2">
        <div className="card-body">
          <div className="flex gap-2 items-end" style={{ flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '200px', flex: 1 }}>
              <label className="form-label">{t('common.search')}</label>
              <input
                type="text"
                className="form-control"
                placeholder={t('users.searchPlaceholder')}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '180px' }}>
              <label className="form-label">{t('orchestras.title')}</label>
              <select
                className="form-control"
                value={filterOrchestra}
                onChange={(e) => setFilterOrchestra(e.target.value)}
              >
                <option value="">{t('users.allOrchestras')}</option>
                {orchestras.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
              <label className="form-label">{t('instruments.title')}</label>
              <select
                className="form-control"
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
              >
                <option value="">{t('users.allInstruments')}</option>
                {instruments.map((i) => {
                  const details = [i.tuning, i.clef === 'fa' ? 'fa' : i.clef === 'ut' ? 'ut' : 'sol'].filter(Boolean).join(', ');
                  return (
                    <option key={i.id} value={i.id}>
                      {i.name}{details ? ` (${details})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            {(filterSearch || filterOrchestra || filterInstrument) && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setFilterSearch('');
                  setFilterOrchestra('');
                  setFilterInstrument('');
                }}
                style={{ marginBottom: 0 }}
              >
                {t('users.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table className="table mb-0">
            <thead>
              <tr>
                <th>{t('users.table.name')}</th>
                <th>{t('users.table.email')}</th>
                <th>{t('users.table.role')}</th>
                <th>{t('users.table.instruments')}</th>
                <th>{t('users.table.orchestras')}</th>
                <th>{t('users.table.lastLogin')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
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
                  <td className="text-light" style={{ whiteSpace: 'nowrap', fontSize: '0.85em' }}>
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                      : '-'}
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
                        onClick={() => setDeletingUser(user)}
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

      {/* Add User Modal */}
      {showAddModal && (
        <FormModal
          onClose={() => {
            setShowAddModal(false);
            resetForm();
          }}
          onSubmit={handleCreate}
          title={t('users.newMember')}
          submitLabel={t('common.add')}
          isSubmitting={createMutation.isPending}
        >
          <UserForm
            formEmail={formEmail}
            setFormEmail={setFormEmail}
            formPassword={formPassword}
            setFormPassword={setFormPassword}
            formFirstName={formFirstName}
            setFormFirstName={setFormFirstName}
            formLastName={formLastName}
            setFormLastName={setFormLastName}
            formRole={formRole}
            setFormRole={setFormRole}
            formInstruments={formInstruments}
            toggleInstrument={toggleInstrument}
            formOrchestras={formOrchestras}
            toggleOrchestra={toggleOrchestra}
            instruments={instruments}
            orchestras={orchestras}
            isEditing={false}
          />
        </FormModal>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <FormModal
          onClose={() => {
            setEditingUser(null);
            resetForm();
          }}
          onSubmit={handleUpdate}
          title={t('users.edit')}
          submitLabel={t('common.save')}
          isSubmitting={updateMutation.isPending}
        >
          <UserForm
            formEmail={formEmail}
            setFormEmail={setFormEmail}
            formPassword={formPassword}
            setFormPassword={setFormPassword}
            formFirstName={formFirstName}
            setFormFirstName={setFormFirstName}
            formLastName={formLastName}
            setFormLastName={setFormLastName}
            formRole={formRole}
            setFormRole={setFormRole}
            formInstruments={formInstruments}
            toggleInstrument={toggleInstrument}
            formOrchestras={formOrchestras}
            toggleOrchestra={toggleOrchestra}
            instruments={instruments}
            orchestras={orchestras}
            isEditing={true}
          />
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingUser && (
        <ConfirmDialog
          onCancel={() => setDeletingUser(null)}
          onConfirm={handleDelete}
          title={t('users.delete.title')}
          message={t('users.delete.confirm', { name: `${deletingUser.firstName} ${deletingUser.lastName}` })}
          confirmLabel={t('common.delete')}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// Extracted form component for reuse
interface UserFormProps {
  formEmail: string;
  setFormEmail: (value: string) => void;
  formPassword: string;
  setFormPassword: (value: string) => void;
  formFirstName: string;
  setFormFirstName: (value: string) => void;
  formLastName: string;
  setFormLastName: (value: string) => void;
  formRole: string;
  setFormRole: (value: string) => void;
  formInstruments: string[];
  toggleInstrument: (id: string) => void;
  formOrchestras: string[];
  toggleOrchestra: (id: string) => void;
  instruments: { id: string; name: string; tuning?: string | null; clef?: string | null }[];
  orchestras: { id: string; name: string }[];
  isEditing: boolean;
}

function UserForm({
  formEmail,
  setFormEmail,
  formPassword,
  setFormPassword,
  formFirstName,
  setFormFirstName,
  formLastName,
  setFormLastName,
  formRole,
  setFormRole,
  formInstruments,
  toggleInstrument,
  formOrchestras,
  toggleOrchestra,
  instruments,
  orchestras,
  isEditing,
}: UserFormProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">{t('users.firstName')}</label>
          <input
            type="text"
            className="form-control"
            value={formFirstName}
            onChange={(e) => setFormFirstName(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('users.lastName')}</label>
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
        <label className="form-label">{t('users.email')}</label>
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
          {isEditing ? t('users.passwordHint') : t('users.password')}
        </label>
        <input
          type="password"
          className="form-control"
          value={formPassword}
          onChange={(e) => setFormPassword(e.target.value)}
          required={!isEditing}
          minLength={6}
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t('users.role')}</label>
        <select
          className="form-control form-select"
          value={formRole}
          onChange={(e) => setFormRole(e.target.value)}
        >
          <option value="member">{t('roles.member')}</option>
          <option value="conductor">{t('roles.conductor')}</option>
          <option value="music_committee">{t('roles.music_committee')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">{t('users.instruments')}</label>
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
        <label className="form-label">{t('users.orchestras')}</label>
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
    </>
  );
}
