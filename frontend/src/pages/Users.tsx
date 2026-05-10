import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller, type UseFormReturn } from 'react-hook-form';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { Icon } from '../components/Icon';
import { useInstruments } from '../hooks/useInstruments';
import { useOrchestras } from '../hooks/useOrchestras';
import { FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { CustomFieldFormSection } from '../components/CustomFields';
import type { User } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES, STORAGE_KEYS } from '../utils/constants';

// Helper to get photo URL with auth token for img src
const getPhotoUrl = (photoUrl: string | null | undefined): string | null => {
  if (!photoUrl) return null;
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  return token ? `${photoUrl}?token=${token}` : null;
};

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  instrumentIds: string[];
  orchestraIds: string[];
}

const defaultValues: UserFormData = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  role: 'member',
  instrumentIds: [],
  orchestraIds: [],
};

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
  const [viewMode, setViewMode] = useState<'table' | 'sections'>('table');

  // React Hook Form
  const form = useForm<UserFormData>({ defaultValues });

  // TanStack Query hooks
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: instruments = [], isLoading: instrumentsLoading } = useInstruments();
  const { data: orchestras = [], isLoading: orchestrasLoading } = useOrchestras();

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const isLoading = usersLoading || instrumentsLoading || orchestrasLoading;

  const handleCreate = (data: UserFormData) => {
    createMutation.mutate({
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      instrumentIds: data.instrumentIds,
      orchestraIds: data.orchestraIds,
    }, {
      onSuccess: () => {
        setShowAddModal(false);
        form.reset(defaultValues);
      },
    });
  };

  const handleUpdate = (data: UserFormData) => {
    if (!editingUser) return;

    updateMutation.mutate({
      id: editingUser.id,
      data: {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        password: data.password || undefined,
        instrumentIds: data.instrumentIds,
        orchestraIds: data.orchestraIds,
      },
    }, {
      onSuccess: () => {
        setEditingUser(null);
        form.reset(defaultValues);
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

  const openAddModal = () => {
    form.reset(defaultValues);
    setShowAddModal(true);
  };

  const openEditModal = (user: User) => {
    form.reset({
      email: user.email,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      instrumentIds: user.instruments?.map((i) => i.id) || [],
      orchestraIds: user.orchestras?.map((o) => o.id) || [],
    });
    setEditingUser(user);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case ROLES.ADMIN:
        return <span className="badge badge-danger">{t('roles.admin')}</span>;
      case ROLES.MUSIC_COMMITTEE:
        return <span className="badge badge-warning">{t('roles.music_committee')}</span>;
      case ROLES.EQUIPMENT_COMMITTEE:
        return <span className="badge badge-info">{t('roles.equipment_committee')}</span>;
      case ROLES.UNIFORMS_COMMITTEE:
        return <span className="badge badge-secondary">{t('roles.uniforms_committee')}</span>;
      case ROLES.CONDUCTOR:
        return <span className="badge badge-success">{t('roles.conductor')}</span>;
      default:
        return <span className="badge badge-primary">{t('roles.member')}</span>;
    }
  };

  // Filter users
  const filteredUsers = users.filter((user) => {
    if (filterSearch) {
      const searchLower = filterSearch.toLowerCase();
      const nameMatch = `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchLower);
      const emailMatch = user.email.toLowerCase().includes(searchLower);
      if (!nameMatch && !emailMatch) return false;
    }

    if (filterOrchestra) {
      const hasOrchestra = user.orchestras?.some((o) => o.id === filterOrchestra);
      if (!hasOrchestra) return false;
    }

    if (filterInstrument) {
      const hasInstrument = user.instruments?.some((i) => i.id === filterInstrument);
      if (!hasInstrument) return false;
    }

    return true;
  });

  // Group users by instrument section for section view
  const sectionGroups = (() => {
    if (viewMode !== 'sections') return [];
    const groups: Record<string, { instrument: string; users: typeof filteredUsers }> = {};
    const noSection: typeof filteredUsers = [];

    for (const user of filteredUsers) {
      if (!user.instruments || user.instruments.length === 0) {
        noSection.push(user);
      } else {
        // Group by first instrument name (base name without tuning/clef)
        const primaryInstrument = user.instruments[0].name;
        if (!groups[primaryInstrument]) {
          groups[primaryInstrument] = { instrument: primaryInstrument, users: [] };
        }
        groups[primaryInstrument].users.push(user);
      }
    }

    const sorted = Object.values(groups).sort((a, b) => a.instrument.localeCompare(b.instrument));
    if (noSection.length > 0) {
      sorted.push({ instrument: t('users.noInstrumentSection'), users: noSection });
    }
    return sorted;
  })();

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
          <span className="badge badge-primary badge-title-count">
            {filteredUsers.length === users.length
              ? users.length
              : `${filteredUsers.length} / ${users.length}`}
          </span>
        </h1>
        <div className="flex gap-1">
          <button
            className={`btn ${viewMode === 'table' ? 'btn-outline' : 'btn-primary'} btn-sm`}
            onClick={() => setViewMode(viewMode === 'table' ? 'sections' : 'table')}
            title={t('users.sectionView')}
          >
            {viewMode === 'table' ? t('users.sectionView') : t('users.tableView')}
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            + {t('users.newMember')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-2">
        <div className="card-body">
          <div className="filter-bar">
            <div className="form-group filter-search">
              <label className="form-label">{t('common.search')}</label>
              <input
                type="text"
                className="form-control"
                placeholder={t('users.searchPlaceholder')}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
            <div className="form-group">
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
            <div className="form-group">
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
              >
                {t('users.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="card">
          <div className="card-body flush">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th scope="col">{t('users.table.name')}</th>
                  <th scope="col">{t('users.table.email')}</th>
                  <th scope="col">{t('users.table.role')}</th>
                  <th scope="col">{t('users.table.instruments')}</th>
                  <th scope="col">{t('users.table.orchestras')}</th>
                  <th scope="col">{t('users.table.lastLogin')}</th>
                  <th scope="col"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            background: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPhotoUrl(user.photoUrl) ? (
                            <img
                              src={getPhotoUrl(user.photoUrl)!}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>
                              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                            </span>
                          )}
                        </div>
                        <strong>{user.firstName} {user.lastName}</strong>
                      </div>
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
                    <td className="text-light text-sm text-nowrap">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                        : '-'}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEditModal(user)}
                          aria-label={`${t('common.edit')}: ${user.firstName} ${user.lastName}`}
                          title={t('common.edit')}
                        >
                          <Icon name="pencil" size={16} />
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setDeletingUser(user)}
                          aria-label={`${t('common.delete')}: ${user.firstName} ${user.lastName}`}
                          title={t('common.delete')}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>
          {sectionGroups.map((group) => (
            <div key={group.instrument} className="card mb-2">
              <div className="card-header">
                <h2 className="card-title">
                  {group.instrument}
                  <span className="badge badge-primary" style={{ marginLeft: '0.5rem' }}>
                    {group.users.length}
                  </span>
                </h2>
              </div>
              <div className="card-body flush">
                <table className="table mb-0">
                  <tbody>
                    {group.users.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                background: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {user.photoUrl ? (
                                <img
                                  src={user.photoUrl}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>
                                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                                </span>
                              )}
                            </div>
                            <strong>{user.firstName} {user.lastName}</strong>
                          </div>
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
                              <Icon name="pencil" size={16} />
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => setDeletingUser(user)}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <FormModal
          onClose={() => {
            setShowAddModal(false);
            form.reset(defaultValues);
          }}
          onSubmit={form.handleSubmit(handleCreate)}
          title={t('users.newMember')}
          submitLabel={t('common.add')}
          isSubmitting={createMutation.isPending}
        >
          <UserForm
            form={form}
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
            form.reset(defaultValues);
          }}
          onSubmit={form.handleSubmit(handleUpdate)}
          title={t('users.edit')}
          submitLabel={t('common.save')}
          isSubmitting={updateMutation.isPending}
          size="large"
        >
          <UserForm
            form={form}
            instruments={instruments}
            orchestras={orchestras}
            isEditing={true}
          />
          <div className="divider my-4">{t('customFields.additionalFields')}</div>
          <CustomFieldFormSection
            entityType="user"
            entityId={editingUser.id}
            autoSave={true}
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

// Extracted form component using react-hook-form
interface UserFormProps {
  form: UseFormReturn<UserFormData>;
  instruments: { id: string; name: string; tuning?: string | null; clef?: string | null }[];
  orchestras: { id: string; name: string }[];
  isEditing: boolean;
}

function UserForm({ form, instruments, orchestras, isEditing }: UserFormProps) {
  const { t } = useTranslation();
  const { register, control, formState: { errors } } = form;

  return (
    <>
      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">{t('users.firstName')}</label>
          <input
            type="text"
            className={`form-control ${errors.firstName ? 'is-invalid' : ''}`}
            {...register('firstName', { required: true })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{t('users.lastName')}</label>
          <input
            type="text"
            className={`form-control ${errors.lastName ? 'is-invalid' : ''}`}
            {...register('lastName', { required: true })}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t('users.email')}</label>
        <input
          type="email"
          className={`form-control ${errors.email ? 'is-invalid' : ''}`}
          {...register('email', { required: true })}
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          {isEditing ? t('users.passwordHint') : t('users.password')}
        </label>
        <input
          type="password"
          className={`form-control ${errors.password ? 'is-invalid' : ''}`}
          {...register('password', {
            required: !isEditing,
            minLength: isEditing ? undefined : 6,
          })}
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t('users.role')}</label>
        <select
          className="form-control form-select"
          {...register('role')}
        >
          <option value="member">{t('roles.member')}</option>
          <option value="conductor">{t('roles.conductor')}</option>
          <option value="music_committee">{t('roles.music_committee')}</option>
          <option value="equipment_committee">{t('roles.equipment_committee')}</option>
          <option value="uniforms_committee">{t('roles.uniforms_committee')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
      </div>

      <Controller
        name="instrumentIds"
        control={control}
        render={({ field }) => (
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
                      checked={field.value.includes(instrument.id)}
                      onChange={() => {
                        const newValue = field.value.includes(instrument.id)
                          ? field.value.filter((id: string) => id !== instrument.id)
                          : [...field.value, instrument.id];
                        field.onChange(newValue);
                      }}
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
        )}
      />

      <Controller
        name="orchestraIds"
        control={control}
        render={({ field }) => (
          <div className="form-group">
            <label className="form-label">{t('users.orchestras')}</label>
            <div className="checkbox-group">
              {orchestras.map((orchestra) => (
                <label key={orchestra.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={field.value.includes(orchestra.id)}
                    onChange={() => {
                      const newValue = field.value.includes(orchestra.id)
                        ? field.value.filter((id: string) => id !== orchestra.id)
                        : [...field.value, orchestra.id];
                      field.onChange(newValue);
                    }}
                  />
                  <span>{orchestra.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      />
    </>
  );
}
