import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { Modal, FormModal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { useInstruments } from '../hooks/useInstruments';
import {
  useExternalMusicians,
  useExternalMusician,
  useCreateExternalMusician,
  useUpdateExternalMusician,
  useDeleteExternalMusician,
} from '../hooks/useExternalMusicians';
import type { ExternalMusician, CreateExternalMusicianData, ExternalMusicianDetail } from '../api/external-musicians';

const MUSICIAN_TYPE_LABELS: Record<string, string> = {
  alumni: 'Alumni',
  guest: 'Gast',
  substitute: 'Invaller',
  friend: 'Vriend',
};

const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Gevorderd',
  advanced: 'Vergevorderd',
  professional: 'Professioneel',
};

function StarRating({ rating, onChange, readOnly = false }: { rating: number | null; onChange?: (r: number) => void; readOnly?: boolean }) {
  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex gap-1">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          className={`${readOnly ? '' : 'cursor-pointer hover:scale-110'} transition-transform`}
          onClick={() => onChange?.(star)}
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          <Icon
            name="star"
            size={20}
            className={star <= (rating || 0) ? 'text-warning' : 'text-muted'}
            style={{ fill: star <= (rating || 0) ? 'currentColor' : 'none' }}
          />
        </button>
      ))}
    </div>
  );
}

interface MusicianFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  musicianType: 'alumni' | 'guest' | 'substitute' | 'friend';
  notes: string;
  rating: number | null;
  instruments: {
    instrumentId: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional' | null;
    isPrimary: boolean;
  }[];
}

const emptyFormData: MusicianFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  musicianType: 'guest',
  notes: '',
  rating: null,
  instruments: [],
};

export default function ExternalMusicians() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('externalMusicians.title');

  // Filters
  const [filterType, setFilterType] = useState<string>('');
  const [filterInstrument, setFilterInstrument] = useState<string>('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMusician, setEditingMusician] = useState<ExternalMusician | null>(null);
  const [viewingMusician, setViewingMusician] = useState<ExternalMusician | null>(null);
  const [deletingMusician, setDeletingMusician] = useState<ExternalMusician | null>(null);

  // Form state
  const [formData, setFormData] = useState<MusicianFormData>(emptyFormData);

  const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE || user?.role === ROLES.CONDUCTOR;

  // Queries
  const { data: musicians = [], isLoading } = useExternalMusicians({
    type: filterType || undefined,
    instrumentId: filterInstrument || undefined,
    isActive: filterActive,
    search: searchTerm || undefined,
  });

  const { data: musicianDetail } = useExternalMusician(viewingMusician?.id || editingMusician?.id || null);
  const { data: instruments = [] } = useInstruments();

  // Mutations
  const createMutation = useCreateExternalMusician();
  const updateMutation = useUpdateExternalMusician();
  const deleteMutation = useDeleteExternalMusician();

  const handleOpenCreate = () => {
    setFormData(emptyFormData);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (musician: ExternalMusician) => {
    setEditingMusician(musician);
    // Form will be populated when musicianDetail loads
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: CreateExternalMusicianData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || null,
      phone: formData.phone || null,
      musicianType: formData.musicianType,
      notes: formData.notes || null,
      rating: formData.rating,
      instruments: formData.instruments.length > 0 ? formData.instruments : undefined,
    };

    await createMutation.mutateAsync(data);
    setShowCreateModal(false);
    setFormData(emptyFormData);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMusician) return;

    await updateMutation.mutateAsync({
      id: editingMusician.id,
      data: {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email || null,
        phone: formData.phone || null,
        musicianType: formData.musicianType,
        notes: formData.notes || null,
        rating: formData.rating,
        instruments: formData.instruments,
      },
    });
    setEditingMusician(null);
    setFormData(emptyFormData);
  };

  const handleDelete = async () => {
    if (!deletingMusician) return;
    await deleteMutation.mutateAsync(deletingMusician.id);
    setDeletingMusician(null);
  };

  // Populate form when editing
  const populateForm = (detail: ExternalMusicianDetail) => {
    setFormData({
      firstName: detail.firstName,
      lastName: detail.lastName,
      email: detail.email || '',
      phone: detail.phone || '',
      musicianType: detail.musicianType,
      notes: detail.notes || '',
      rating: detail.rating,
      instruments: detail.instruments.map((i) => ({
        instrumentId: i.instrumentId,
        skillLevel: i.skillLevel,
        isPrimary: i.isPrimary,
      })),
    });
  };

  // Effect to populate form when detail loads
  if (editingMusician && musicianDetail && musicianDetail.id === editingMusician.id && formData.firstName === '') {
    populateForm(musicianDetail);
  }

  const addInstrument = () => {
    setFormData({
      ...formData,
      instruments: [
        ...formData.instruments,
        { instrumentId: '', skillLevel: null, isPrimary: false },
      ],
    });
  };

  const removeInstrument = (index: number) => {
    setFormData({
      ...formData,
      instruments: formData.instruments.filter((_, i) => i !== index),
    });
  };

  const updateInstrument = (index: number, field: string, value: any) => {
    const newInstruments = [...formData.instruments];
    newInstruments[index] = { ...newInstruments[index], [field]: value };
    setFormData({ ...formData, instruments: newInstruments });
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('externalMusicians.title')}</h1>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('externalMusicians.title')}
          <span className="badge badge-primary ml-2">{musicians.length}</span>
        </h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={handleOpenCreate}>
            <Icon name="plus" size={16} className="mr-1" />
            {t('externalMusicians.addMusician')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="grid grid-cols-4 gap-2">
            <div className="form-group mb-0">
              <input
                type="text"
                className="form-control"
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="form-group mb-0">
              <select
                className="form-control"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">{t('externalMusicians.allTypes')}</option>
                <option value="alumni">{MUSICIAN_TYPE_LABELS.alumni}</option>
                <option value="guest">{MUSICIAN_TYPE_LABELS.guest}</option>
                <option value="substitute">{MUSICIAN_TYPE_LABELS.substitute}</option>
                <option value="friend">{MUSICIAN_TYPE_LABELS.friend}</option>
              </select>
            </div>
            <div className="form-group mb-0">
              <select
                className="form-control"
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
              >
                <option value="">{t('externalMusicians.allInstruments')}</option>
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} {i.tuning ? `(${i.tuning})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <select
                className="form-control"
                value={filterActive === undefined ? '' : filterActive ? 'true' : 'false'}
                onChange={(e) => {
                  if (e.target.value === '') setFilterActive(undefined);
                  else setFilterActive(e.target.value === 'true');
                }}
              >
                <option value="">{t('externalMusicians.allStatus')}</option>
                <option value="true">{t('externalMusicians.activeOnly')}</option>
                <option value="false">{t('externalMusicians.inactiveOnly')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Musicians List */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {musicians.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('externalMusicians.type')}</th>
                  <th>{t('externalMusicians.instruments')}</th>
                  <th>{t('externalMusicians.rating')}</th>
                  <th>{t('externalMusicians.performances')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {musicians.map((musician) => (
                  <tr key={musician.id}>
                    <td>
                      <button
                        className="btn-link text-primary"
                        onClick={() => setViewingMusician(musician)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        {musician.firstName} {musician.lastName}
                      </button>
                      {musician.email && (
                        <div className="text-muted text-sm">{musician.email}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {MUSICIAN_TYPE_LABELS[musician.musicianType]}
                      </span>
                    </td>
                    <td>{musician.instrumentNames || '-'}</td>
                    <td>
                      <StarRating rating={musician.rating} readOnly />
                    </td>
                    <td>{musician.totalPerformances}</td>
                    <td>
                      <span className={`badge ${musician.isActive ? 'badge-success' : 'badge-secondary'}`}>
                        {musician.isActive ? t('externalMusicians.active') : t('externalMusicians.inactive')}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setViewingMusician(musician)}
                          title={t('common.details')}
                        >
                          <Icon name="eye" size={16} />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleOpenEdit(musician)}
                              title={t('common.edit')}
                            >
                              <Icon name="pencil" size={16} />
                            </button>
                            {musician.isActive && (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => setDeletingMusician(musician)}
                                title={t('externalMusicians.deactivate')}
                              >
                                <Icon name="userMinus" size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state p-4">
              <Icon name="users" size={48} className="text-muted mb-2" />
              <p>{t('externalMusicians.noMusicians')}</p>
            </div>
          )}
        </div>
      </div>

      {/* View Modal */}
      {viewingMusician && musicianDetail && (
        <Modal
          title={`${musicianDetail.firstName} ${musicianDetail.lastName}`}
          onClose={() => setViewingMusician(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-muted">{t('externalMusicians.type')}</label>
                <p>
                  <span className="badge badge-info">
                    {MUSICIAN_TYPE_LABELS[musicianDetail.musicianType]}
                  </span>
                </p>
              </div>
              <div>
                <label className="form-label text-muted">{t('common.status')}</label>
                <p>
                  <span className={`badge ${musicianDetail.isActive ? 'badge-success' : 'badge-secondary'}`}>
                    {musicianDetail.isActive ? t('externalMusicians.active') : t('externalMusicians.inactive')}
                  </span>
                </p>
              </div>
            </div>

            {(musicianDetail.email || musicianDetail.phone) && (
              <div className="grid grid-cols-2 gap-3">
                {musicianDetail.email && (
                  <div>
                    <label className="form-label text-muted">{t('common.email')}</label>
                    <p>
                      <a href={`mailto:${musicianDetail.email}`}>{musicianDetail.email}</a>
                    </p>
                  </div>
                )}
                {musicianDetail.phone && (
                  <div>
                    <label className="form-label text-muted">{t('common.phone')}</label>
                    <p>
                      <a href={`tel:${musicianDetail.phone}`}>{musicianDetail.phone}</a>
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-muted">{t('externalMusicians.rating')}</label>
                <StarRating rating={musicianDetail.rating} readOnly />
              </div>
              <div>
                <label className="form-label text-muted">{t('externalMusicians.performances')}</label>
                <p>{musicianDetail.totalPerformances} {t('externalMusicians.total')}</p>
              </div>
            </div>

            {musicianDetail.lastPlayedDate && (
              <div>
                <label className="form-label text-muted">{t('externalMusicians.lastPlayed')}</label>
                <p>{new Date(musicianDetail.lastPlayedDate).toLocaleDateString()}</p>
              </div>
            )}

            {musicianDetail.instruments.length > 0 && (
              <div>
                <label className="form-label text-muted">{t('externalMusicians.instruments')}</label>
                <div className="flex flex-wrap gap-2">
                  {musicianDetail.instruments.map((i) => (
                    <span key={i.id} className={`badge ${i.isPrimary ? 'badge-primary' : 'badge-secondary'}`}>
                      {i.instrumentName}
                      {i.instrumentTuning && ` (${i.instrumentTuning})`}
                      {i.skillLevel && ` - ${SKILL_LEVEL_LABELS[i.skillLevel]}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {musicianDetail.notes && (
              <div>
                <label className="form-label text-muted">{t('common.notes')}</label>
                <p style={{ whiteSpace: 'pre-wrap' }}>{musicianDetail.notes}</p>
              </div>
            )}

            {musicianDetail.recentAssignments.length > 0 && (
              <div>
                <label className="form-label text-muted">{t('externalMusicians.recentAssignments')}</label>
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t('common.date')}</th>
                      <th>{t('externalMusicians.event')}</th>
                      <th>{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {musicianDetail.recentAssignments.map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.eventDate).toLocaleDateString()}</td>
                        <td>
                          {a.eventName || a.eventType} - {a.instrumentName}
                        </td>
                        <td>
                          <span className={`badge badge-${
                            a.status === 'completed' ? 'success' :
                            a.status === 'confirmed' ? 'primary' :
                            a.status === 'declined' ? 'danger' :
                            a.status === 'no_show' ? 'warning' : 'secondary'
                          }`}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingMusician) && (
        <FormModal
          title={editingMusician ? t('externalMusicians.editMusician') : t('externalMusicians.addMusician')}
          onClose={() => {
            setShowCreateModal(false);
            setEditingMusician(null);
            setFormData(emptyFormData);
          }}
          onSubmit={editingMusician ? handleUpdate : handleCreate}
          submitLabel={editingMusician ? t('common.save') : t('common.add')}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">{t('externalMusicians.firstName')} *</label>
              <input
                type="text"
                className="form-control"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('externalMusicians.lastName')} *</label>
              <input
                type="text"
                className="form-control"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">{t('common.email')}</label>
              <input
                type="email"
                className="form-control"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('common.phone')}</label>
              <input
                type="tel"
                className="form-control"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">{t('externalMusicians.type')} *</label>
              <select
                className="form-control"
                value={formData.musicianType}
                onChange={(e) => setFormData({ ...formData, musicianType: e.target.value as any })}
                required
              >
                <option value="alumni">{MUSICIAN_TYPE_LABELS.alumni}</option>
                <option value="guest">{MUSICIAN_TYPE_LABELS.guest}</option>
                <option value="substitute">{MUSICIAN_TYPE_LABELS.substitute}</option>
                <option value="friend">{MUSICIAN_TYPE_LABELS.friend}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('externalMusicians.rating')}</label>
              <StarRating
                rating={formData.rating}
                onChange={(r) => setFormData({ ...formData, rating: r })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('externalMusicians.instruments')}</label>
            {formData.instruments.map((inst, index) => (
              <div key={index} className="flex gap-2 mb-2 items-center">
                <select
                  className="form-control"
                  value={inst.instrumentId}
                  onChange={(e) => updateInstrument(index, 'instrumentId', e.target.value)}
                  style={{ flex: 2 }}
                >
                  <option value="">{t('externalMusicians.selectInstrument')}</option>
                  {instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} {i.tuning ? `(${i.tuning})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="form-control"
                  value={inst.skillLevel || ''}
                  onChange={(e) => updateInstrument(index, 'skillLevel', e.target.value || null)}
                  style={{ flex: 1 }}
                >
                  <option value="">{t('externalMusicians.skillLevel')}</option>
                  <option value="beginner">{SKILL_LEVEL_LABELS.beginner}</option>
                  <option value="intermediate">{SKILL_LEVEL_LABELS.intermediate}</option>
                  <option value="advanced">{SKILL_LEVEL_LABELS.advanced}</option>
                  <option value="professional">{SKILL_LEVEL_LABELS.professional}</option>
                </select>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={inst.isPrimary}
                    onChange={(e) => updateInstrument(index, 'isPrimary', e.target.checked)}
                  />
                  {t('externalMusicians.primary')}
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeInstrument(index)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={addInstrument}>
              <Icon name="plus" size={16} className="mr-1" />
              {t('externalMusicians.addInstrument')}
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">{t('common.notes')}</label>
            <textarea
              className="form-control"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>
        </FormModal>
      )}

      {/* Delete Confirmation */}
      {deletingMusician && (
        <ConfirmDialog
          title={t('externalMusicians.deactivate')}
          message={t('externalMusicians.deactivateConfirm', {
            name: `${deletingMusician.firstName} ${deletingMusician.lastName}`,
          })}
          confirmLabel={t('externalMusicians.deactivate')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMusician(null)}
          isLoading={deleteMutation.isPending}
          variant="danger"
        />
      )}
    </div>
  );
}
