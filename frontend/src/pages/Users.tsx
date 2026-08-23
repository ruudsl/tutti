import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller, type UseFormReturn, type FieldErrors } from 'react-hook-form';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';
import { Icon } from '../components/Icon';
import { useInstruments } from '../hooks/useInstruments';
import { useOrchestras } from '../hooks/useOrchestras';
import { FormModal } from '../components/Modal';
import { FormField } from '../components/FormField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { CustomFieldFormSection } from '../components/CustomFields';
import type { User } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormValidation, veldKenmerken, type ValidationError } from '../hooks/useFormValidation';
import { ROLES } from '../utils/constants';
import { useDownloadToken } from '../utils/downloadUrl';

// Helper to get photo URL with a short-lived download token for img src
const getPhotoUrl = (photoUrl: string | null | undefined, downloadToken: string | null): string | null => {
  if (!photoUrl || !downloadToken) return null;
  return `${photoUrl}?token=${encodeURIComponent(downloadToken)}`;
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

/**
 * De velden in de volgorde waarin ze op het scherm staan.
 *
 * react-hook-form geeft zijn fouten in registratievolgorde terug, en die hoeft
 * niet gelijk te lopen met de leesvolgorde. De cursor hoort naar de bovenste
 * fout te springen, niet naar de eerst geregistreerde - vandaar dat de volgorde
 * hier expliciet staat in plaats van uit Object.keys te komen.
 */
const veldVolgorde: (keyof UserFormData)[] = ['firstName', 'lastName', 'email', 'password'];

function naarFoutenlijst(fouten: FieldErrors<UserFormData>): ValidationError[] {
  return veldVolgorde
    .filter((veld) => fouten[veld])
    .map((veld) => ({ field: veld, message: String(fouten[veld]?.message ?? '') }));
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
  const downloadToken = useDownloadToken();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Filter state
  const [filterOrchestra, setFilterOrchestra] = useState<string>('');
  const [filterInstrument, setFilterInstrument] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'sections'>('table');

  // React Hook Form with validation rules
  //
  // shouldFocusError staat uit omdat focusFirstError het springen overneemt:
  // die zet de cursor in het bovenste foute veld én meldt de fout dringend aan
  // de schermlezer. Lieten we react-hook-form het daarnaast zelf doen, dan
  // verplaatsen twee partijen de cursor in dezelfde tel.
  const form = useForm<UserFormData>({ defaultValues, shouldFocusError: false });
  const { focusFirstError } = useFormValidation();
  const naarEersteFout = (fouten: FieldErrors<UserFormData>) => focusFirstError(naarFoutenlijst(fouten));

  // TanStack Query hooks
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: instruments = [], isLoading: instrumentsLoading } = useInstruments();
  const { data: orchestras = [], isLoading: orchestrasLoading } = useOrchestras();

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const isLoading = usersLoading || instrumentsLoading || orchestrasLoading;

  const handleCreate = (data: UserFormData) => {
    createMutation.mutate(
      {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        instrumentIds: data.instrumentIds,
        orchestraIds: data.orchestraIds,
      },
      {
        onSuccess: () => {
          setShowAddModal(false);
          form.reset(defaultValues);
        },
      },
    );
  };

  const handleUpdate = (data: UserFormData) => {
    if (!editingUser) return;

    updateMutation.mutate(
      {
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
      },
      {
        onSuccess: () => {
          setEditingUser(null);
          form.reset(defaultValues);
        },
      },
    );
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
      role: user.role as UserFormData['role'],
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
        <div className="page-header">
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
            {filteredUsers.length === users.length ? users.length : `${filteredUsers.length} / ${users.length}`}
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
            <FormField label={t('common.search')} className="form-group filter-search">
              <input
                type="text"
                className="form-control"
                placeholder={t('users.searchPlaceholder')}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </FormField>
            <FormField label={t('orchestras.title')}>
              <select
                className="form-control"
                value={filterOrchestra}
                onChange={(e) => setFilterOrchestra(e.target.value)}
              >
                <option value="">{t('users.allOrchestras')}</option>
                {orchestras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t('instruments.title')}>
              <select
                className="form-control"
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
              >
                <option value="">{t('users.allInstruments')}</option>
                {instruments.map((i) => {
                  const details = [i.tuning, i.clef === 'fa' ? 'fa' : i.clef === 'ut' ? 'ut' : 'sol']
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {details ? ` (${details})` : ''}
                    </option>
                  );
                })}
              </select>
            </FormField>
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
                  <th scope="col">
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
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
                          {getPhotoUrl(user.photoUrl, downloadToken) ? (
                            <img
                              src={getPhotoUrl(user.photoUrl, downloadToken)!}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>
                              {user.firstName.charAt(0)}
                              {user.lastName.charAt(0)}
                            </span>
                          )}
                        </div>
                        <strong>
                          {user.firstName} {user.lastName}
                        </strong>
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
                              {i.name}
                              {details && ` (${details})`}
                            </span>
                          );
                        }) || '-'}
                      </div>
                    </td>
                    <td>
                      <div className="tags">
                        {user.orchestras?.map((o) => (
                          <span key={o.id} className="tag">
                            {o.name}
                          </span>
                        )) || '-'}
                      </div>
                    </td>
                    <td className="text-light text-sm text-nowrap">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
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
                                  loading="lazy"
                                  decoding="async"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>
                                  {user.firstName.charAt(0)}
                                  {user.lastName.charAt(0)}
                                </span>
                              )}
                            </div>
                            <strong>
                              {user.firstName} {user.lastName}
                            </strong>
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
                                  {i.name}
                                  {details && ` (${details})`}
                                </span>
                              );
                            }) || '-'}
                          </div>
                        </td>
                        <td>
                          <div className="tags">
                            {user.orchestras?.map((o) => (
                              <span key={o.id} className="tag">
                                {o.name}
                              </span>
                            )) || '-'}
                          </div>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn btn-outline btn-sm" onClick={() => openEditModal(user)}>
                              <Icon name="pencil" size={16} />
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeletingUser(user)}>
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
          onSubmit={form.handleSubmit(handleCreate, naarEersteFout)}
          title={t('users.newMember')}
          submitLabel={t('common.add')}
          isSubmitting={createMutation.isPending}
        >
          <UserForm form={form} instruments={instruments} orchestras={orchestras} isEditing={false} />
        </FormModal>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <FormModal
          onClose={() => {
            setEditingUser(null);
            form.reset(defaultValues);
          }}
          onSubmit={form.handleSubmit(handleUpdate, naarEersteFout)}
          title={t('users.edit')}
          submitLabel={t('common.save')}
          isSubmitting={updateMutation.isPending}
          size="large"
        >
          <UserForm form={form} instruments={instruments} orchestras={orchestras} isEditing={true} />
          <div className="divider my-4">{t('customFields.additionalFields')}</div>
          <CustomFieldFormSection entityType="user" entityId={editingUser.id} autoSave={true} />
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

// Extracted form component using react-hook-form with validation
interface UserFormProps {
  form: UseFormReturn<UserFormData>;
  instruments: { id: string; name: string; tuning?: string | null; clef?: string | null }[];
  orchestras: { id: string; name: string }[];
  isEditing: boolean;
}

function UserForm({ form, instruments, orchestras, isEditing }: UserFormProps) {
  const { t } = useTranslation();
  const {
    register,
    control,
    formState: { errors },
  } = form;

  // Deze vier velden lopen niet via FormField: in dezelfde form-group staat naast
  // label en veld ook nog een foutmelding (en bij het wachtwoord een hulptekst).
  // FormField neemt één kindelement, en die melding buiten de form-group zetten
  // zou hem onder de ondermarge van 1rem laten wegzakken - los van het veld waar
  // hij bij hoort. Vandaar met de hand, mét aria-describedby zodat een
  // schermlezer de melding ook echt bij het veld voorleest.
  //
  // aria-invalid en die aria-describedby komen uit veldKenmerken. Ze staan in de
  // JSX en niet via setAttribute, omdat React alleen kenmerken terugdraait die
  // het zelf getekend heeft: een aria-invalid dat er los omheen op gezet wordt,
  // blijft staan nadat de gebruiker het veld verbeterd heeft.
  const veldId = useId();
  const voornaamId = `${veldId}-voornaam`;
  const achternaamId = `${veldId}-achternaam`;
  const emailId = `${veldId}-email`;
  const wachtwoordId = `${veldId}-wachtwoord`;

  // De groepskoppen van de aankruisvakjes labelen geen veld maar een groep; zie
  // de opmerking daar.
  const instrumentenLabelId = `${veldId}-instrumenten`;
  const orkestenLabelId = `${veldId}-orkesten`;

  return (
    <>
      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label" htmlFor={voornaamId}>
            {t('users.firstName')} *
          </label>
          <input
            id={voornaamId}
            {...veldKenmerken('firstName', errors.firstName?.message, `${voornaamId}-fout`)}
            type="text"
            className={`form-control ${errors.firstName ? 'has-error' : ''}`}
            {...register('firstName', {
              required: t('errors.required'),
              minLength: { value: 1, message: t('errors.required') },
              maxLength: { value: 100, message: t('errors.maxLength', { max: 100 }) },
            })}
          />
          {errors.firstName && (
            <span id={`${voornaamId}-fout`} className="form-error">
              {errors.firstName.message}
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={achternaamId}>
            {t('users.lastName')} *
          </label>
          <input
            id={achternaamId}
            {...veldKenmerken('lastName', errors.lastName?.message, `${achternaamId}-fout`)}
            type="text"
            className={`form-control ${errors.lastName ? 'has-error' : ''}`}
            {...register('lastName', {
              required: t('errors.required'),
              minLength: { value: 1, message: t('errors.required') },
              maxLength: { value: 100, message: t('errors.maxLength', { max: 100 }) },
            })}
          />
          {errors.lastName && (
            <span id={`${achternaamId}-fout`} className="form-error">
              {errors.lastName.message}
            </span>
          )}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={emailId}>
          {t('users.email')} *
        </label>
        <input
          id={emailId}
          {...veldKenmerken('email', errors.email?.message, `${emailId}-fout`)}
          type="email"
          className={`form-control ${errors.email ? 'has-error' : ''}`}
          {...register('email', {
            required: t('errors.required'),
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: t('errors.invalidEmail'),
            },
          })}
        />
        {errors.email && (
          <span id={`${emailId}-fout`} className="form-error">
            {errors.email.message}
          </span>
        )}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={wachtwoordId}>
          {isEditing ? t('users.passwordHint') : `${t('users.password')} *`}
        </label>
        <input
          id={wachtwoordId}
          {...veldKenmerken(
            'password',
            errors.password?.message,
            `${wachtwoordId}-fout`,
            !isEditing ? `${wachtwoordId}-hulp` : undefined,
          )}
          type="password"
          className={`form-control ${errors.password ? 'has-error' : ''}`}
          {...register('password', {
            required: !isEditing ? t('errors.required') : false,
            minLength: !isEditing ? { value: 8, message: t('errors.passwordTooShort', { min: 8 }) } : undefined,
          })}
        />
        {errors.password && (
          <span id={`${wachtwoordId}-fout`} className="form-error">
            {errors.password.message}
          </span>
        )}
        {!isEditing && !errors.password && (
          <span id={`${wachtwoordId}-hulp`} className="form-hint">
            {t('errors.passwordTooShort', { min: 8 })}
          </span>
        )}
      </div>

      <FormField label={t('users.role')}>
        <select className="form-control form-select" {...register('role')}>
          <option value="member">{t('roles.member')}</option>
          <option value="conductor">{t('roles.conductor')}</option>
          <option value="music_committee">{t('roles.music_committee')}</option>
          <option value="equipment_committee">{t('roles.equipment_committee')}</option>
          <option value="uniforms_committee">{t('roles.uniforms_committee')}</option>
          <option value="admin">{t('roles.admin')}</option>
        </select>
      </FormField>

      {/* Geen FormField hieronder: daar staat geen veld maar een groep aankruisvakjes,
          die elk hun eigen label om zich heen hebben. Een <label> die naar niets wijst
          is voor een schermlezer een lege belofte; het is een groepskop. Daarom een
          <span> met dezelfde klasse, en de groep verwijst ernaar. */}
      <Controller
        name="instrumentIds"
        control={control}
        render={({ field }) => (
          <div className="form-group" role="group" aria-labelledby={instrumentenLabelId}>
            <span id={instrumentenLabelId} className="form-label">
              {t('users.instruments')}
            </span>
            <div className="checkbox-group">
              {instruments.map((instrument) => {
                const clefLabel = instrument.clef === 'fa' ? 'fa' : instrument.clef === 'ut' ? 'ut' : 'sol';
                const details = [instrument.tuning, clefLabel].filter(Boolean).join(', ');
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

      {/* Zie de opmerking bij de instrumenten: groepskop, geen veldlabel. */}
      <Controller
        name="orchestraIds"
        control={control}
        render={({ field }) => (
          <div className="form-group" role="group" aria-labelledby={orkestenLabelId}>
            <span id={orkestenLabelId} className="form-label">
              {t('users.orchestras')}
            </span>
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
