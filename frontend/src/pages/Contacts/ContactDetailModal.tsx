import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { addContactPerson, updateContactPerson, deleteContactPerson } from '../../api/contacts';
import type { Contact, ContactCategory, ContactPerson } from '../../api/contacts';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CustomFieldFormSection, CustomFieldRenderer } from '../../components/CustomFields';
import { showSuccess, showError } from '../../utils/toast';
import { CONTACT_TYPE_COLORS, CONTACT_TYPE_ICONS } from './constants';
import { ContactFormModal } from './ContactFormModal';

export function ContactDetailModal({
  contact,
  onClose,
  categories,
  canEdit,
}: {
  contact: Contact;
  onClose: () => void;
  categories: ContactCategory[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: '', role: '', email: '', phone: '', isPrimary: false });
  const [editingPerson, setEditingPerson] = useState<ContactPerson | null>(null);
  const [editPersonData, setEditPersonData] = useState({ name: '', role: '', email: '', phone: '', isPrimary: false });
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);

  const addPersonMutation = useMutation({
    mutationFn: (data: typeof newPerson) => addContactPerson(contact.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', contact.id] });
      showSuccess(t('contacts.personAdded'));
      setShowAddPerson(false);
      setNewPerson({ name: '', role: '', email: '', phone: '', isPrimary: false });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorAddPerson'));
    },
  });

  const updatePersonMutation = useMutation({
    mutationFn: (data: { personId: string; updates: typeof editPersonData }) =>
      updateContactPerson(contact.id, data.personId, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', contact.id] });
      showSuccess(t('contacts.personUpdated'));
      setEditingPerson(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorUpdatePerson'));
    },
  });

  const deletePersonMutation = useMutation({
    mutationFn: (personId: string) => deleteContactPerson(contact.id, personId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', contact.id] });
      showSuccess(t('contacts.personDeleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorDeletePerson'));
    },
  });

  if (isEditing) {
    return (
      <ContactFormModal
        contact={contact}
        onClose={() => {
          setIsEditing(false);
          onClose();
        }}
        categories={categories}
      />
    );
  }

  return (
    <Modal onClose={onClose} title={contact.name} size="large">
      <div className="row">
        <div className="col-md-6">
          <div className="detail-group">
            <span className="detail-label">{t('contacts.type.label')}</span>
            <span className={`badge ${CONTACT_TYPE_COLORS[contact.contactType]}`}>
              <Icon name={CONTACT_TYPE_ICONS[contact.contactType]} /> {t(`contacts.type.${contact.contactType}`)}
            </span>
          </div>

          {contact.email && (
            <div className="detail-group">
              <span className="detail-label">{t('contacts.email')}</span>
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            </div>
          )}

          {contact.phone && (
            <div className="detail-group">
              <span className="detail-label">{t('contacts.phone')}</span>
              <a href={`tel:${contact.phone}`}>{contact.phone}</a>
            </div>
          )}

          {contact.mobile && (
            <div className="detail-group">
              <span className="detail-label">{t('contacts.mobile')}</span>
              <a href={`tel:${contact.mobile}`}>{contact.mobile}</a>
            </div>
          )}

          {contact.website && (
            <div className="detail-group">
              <span className="detail-label">{t('contacts.website')}</span>
              <a href={contact.website} target="_blank" rel="noopener noreferrer">
                {contact.website}
              </a>
            </div>
          )}
        </div>

        <div className="col-md-6">
          {(contact.addressLine || contact.city) && (
            <div className="detail-group">
              <span className="detail-label">{t('contacts.address')}</span>
              <div>
                {contact.addressLine && <div>{contact.addressLine}</div>}
                {(contact.postalCode || contact.city) && (
                  <div>
                    {contact.postalCode} {contact.city}
                  </div>
                )}
                {contact.country && contact.country !== 'NL' && <div>{contact.country}</div>}
              </div>
            </div>
          )}

          {contact.categories.length > 0 && (
            <div className="detail-group">
              <span className="detail-label">{t('contacts.categories')}</span>
              <div>
                {contact.categories.map((cat) => (
                  <span
                    key={cat.id}
                    className="badge badge-outline mr-1"
                    style={cat.color ? { borderColor: cat.color, color: cat.color } : {}}
                  >
                    {cat.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {contact.notes && (
        <div className="detail-group">
          <span className="detail-label">{t('contacts.notes')}</span>
          <div className="text-pre-wrap">{contact.notes}</div>
        </div>
      )}

      {contact.contactType === 'organization' && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-2">
            <h4>{t('contacts.contactPersons')}</h4>
            {canEdit && (
              <button className="btn btn-sm btn-outline" onClick={() => setShowAddPerson(true)}>
                <Icon name="plus" /> {t('contacts.addPerson')}
              </button>
            )}
          </div>

          {showAddPerson && (
            <div className="card mb-2">
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>{t('contacts.name')} *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newPerson.name}
                        onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>{t('contacts.role')}</label>
                      <input
                        type="text"
                        className="form-control"
                        value={newPerson.role}
                        onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>{t('contacts.email')}</label>
                      <input
                        type="email"
                        className="form-control"
                        value={newPerson.email}
                        onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-group">
                      <label>{t('contacts.phone')}</label>
                      <input
                        type="tel"
                        className="form-control"
                        value={newPerson.phone}
                        onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newPerson.isPrimary}
                      onChange={(e) => setNewPerson({ ...newPerson, isPrimary: e.target.checked })}
                    />
                    {t('contacts.isPrimary')}
                  </label>
                </div>
                <div className="button-group">
                  <button className="btn btn-outline" onClick={() => setShowAddPerson(false)}>
                    {t('common.cancel')}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => addPersonMutation.mutate(newPerson)}
                    disabled={!newPerson.name || addPersonMutation.isPending}
                  >
                    {addPersonMutation.isPending ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {contact.contactPersons && contact.contactPersons.length > 0 ? (
            <div className="list-group">
              {contact.contactPersons.map((person) => (
                <div key={person.id} className="list-group-item">
                  {editingPerson?.id === person.id ? (
                    <div>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>{t('contacts.name')} *</label>
                            <input
                              type="text"
                              className="form-control"
                              value={editPersonData.name}
                              onChange={(e) => setEditPersonData({ ...editPersonData, name: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>{t('contacts.role')}</label>
                            <input
                              type="text"
                              className="form-control"
                              value={editPersonData.role}
                              onChange={(e) => setEditPersonData({ ...editPersonData, role: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>{t('contacts.email')}</label>
                            <input
                              type="email"
                              className="form-control"
                              value={editPersonData.email}
                              onChange={(e) => setEditPersonData({ ...editPersonData, email: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label>{t('contacts.phone')}</label>
                            <input
                              type="tel"
                              className="form-control"
                              value={editPersonData.phone}
                              onChange={(e) => setEditPersonData({ ...editPersonData, phone: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={editPersonData.isPrimary}
                            onChange={(e) => setEditPersonData({ ...editPersonData, isPrimary: e.target.checked })}
                          />
                          {t('contacts.isPrimary')}
                        </label>
                      </div>
                      <div className="button-group">
                        <button className="btn btn-outline" onClick={() => setEditingPerson(null)}>
                          {t('common.cancel')}
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => updatePersonMutation.mutate({ personId: person.id, updates: editPersonData })}
                          disabled={!editPersonData.name || updatePersonMutation.isPending}
                        >
                          {updatePersonMutation.isPending ? t('common.saving') : t('common.save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div>
                        <strong>{person.name}</strong>
                        {person.isPrimary && <span className="badge badge-info ml-1">{t('contacts.primary')}</span>}
                        {person.role && <span className="text-muted ml-2">({person.role})</span>}
                        <div className="small">
                          {person.email && (
                            <a href={`mailto:${person.email}`} className="mr-2">
                              {person.email}
                            </a>
                          )}
                          {person.phone && <a href={`tel:${person.phone}`}>{person.phone}</a>}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="button-group">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => {
                              setEditingPerson(person);
                              setEditPersonData({
                                name: person.name,
                                role: person.role || '',
                                email: person.email || '',
                                phone: person.phone || '',
                                isPrimary: person.isPrimary,
                              });
                            }}
                            title={t('common.edit')}
                          >
                            <Icon name="pencil" />
                          </button>
                          <button
                            className="btn btn-sm btn-danger-outline"
                            onClick={() => setDeletingPersonId(person.id)}
                            title={t('common.delete')}
                          >
                            <Icon name="trash" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">{t('contacts.noPersons')}</p>
          )}
        </div>
      )}

      {/* Custom Fields Section */}
      <div className="mt-3">
        {canEdit ? (
          <CustomFieldFormSection entityType="contact" entityId={contact.id} autoSave={true} />
        ) : (
          <CustomFieldRenderer entityType="contact" entityId={contact.id} layout="horizontal" />
        )}
      </div>

      <div className="modal-footer">
        {canEdit && (
          <button className="btn btn-outline" onClick={() => setIsEditing(true)}>
            <Icon name="pencil" /> {t('common.edit')}
          </button>
        )}
        <button className="btn btn-primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      {/* Delete Contact Person Confirmation */}
      {deletingPersonId && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('contacts.confirmDeletePerson')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deletePersonMutation.isPending}
          onConfirm={() => {
            deletePersonMutation.mutate(deletingPersonId, {
              onSuccess: () => setDeletingPersonId(null),
            });
          }}
          onCancel={() => setDeletingPersonId(null)}
        />
      )}
    </Modal>
  );
}
