import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon, IconName } from '../components/Icon';
import {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  activateContact,
  deactivateContact,
  promoteContactToUser,
  getContactCategories,
  createContactCategory,
  updateContactCategory,
  deleteContactCategory,
  addContactPerson,
  updateContactPerson,
  deleteContactPerson,
  Contact,
  ContactType,
  ContactCategory,
  ContactPerson,
  CreateContactData,
} from '../api/contacts';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';
import { CustomFieldFormSection, CustomFieldRenderer } from '../components/CustomFields';

const CONTACT_TYPE_ICONS: Record<ContactType, IconName> = {
  organization: 'building',
  person: 'user',
  venue: 'mapPin',
  vendor: 'package',
};

const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  organization: 'badge-primary',
  person: 'badge-info',
  venue: 'badge-success',
  vendor: 'badge-warning',
};

export default function Contacts() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.contacts');
  const queryClient = useQueryClient();

  const [filterType, setFilterType] = useState<ContactType | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const isAdmin = user?.role === ROLES.ADMIN;
  const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE;

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', filterType, filterCategory, filterActive, searchTerm],
    queryFn: () => getContacts({
      type: filterType || undefined,
      category: filterCategory || undefined,
      active: filterActive,
      search: searchTerm || undefined,
    }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['contact-categories'],
    queryFn: getContactCategories,
  });

  const { data: contactDetail } = useQuery({
    queryKey: ['contact', selectedContact?.id],
    queryFn: () => selectedContact ? getContact(selectedContact.id) : null,
    enabled: !!selectedContact,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      showSuccess(t('contacts.deleted'));
      setSelectedContact(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorDelete'));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? activateContact(id) : deactivateContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      showSuccess(t('contacts.statusUpdated'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorUpdateStatus'));
    },
  });

  const promoteMutation = useMutation({
    mutationFn: promoteContactToUser,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setPromoteResult({ email: data.email, tempPassword: data.tempPassword });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorPromote'));
    },
  });

  const handleDelete = (contact: Contact) => {
    if (confirm(t('contacts.confirmDelete', { name: contact.name }))) {
      deleteMutation.mutate(contact.id);
    }
  };

  const handleToggleActive = (contact: Contact) => {
    toggleActiveMutation.mutate({ id: contact.id, active: !contact.isActive });
  };

  const handlePromote = (contact: Contact) => {
    setShowPromoteModal(true);
    setSelectedContact(contact);
  };

  const confirmPromote = () => {
    if (selectedContact) {
      promoteMutation.mutate(selectedContact.id);
    }
  };

  if (isLoading) {
    return (
      <div>
        <h1>{t('contacts.title')}</h1>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>
          {t('contacts.title')}
          <span className="badge badge-primary badge-title-count">{contacts.length}</span>
        </h1>
        <div className="button-group">
          {canEdit && (
            <>
              <button className="btn btn-outline" onClick={() => setShowCategoriesModal(true)}>
                <Icon name="bookmark" /> {t('contacts.manageCategories')}
              </button>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <Icon name="plus" /> {t('contacts.addContact')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-body">
          <div className="filter-row">
            <div className="form-group">
              <label>{t('contacts.filterType')}</label>
              <select
                className="form-control"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as ContactType | '')}
              >
                <option value="">{t('common.all')}</option>
                <option value="organization">{t('contacts.type.organization')}</option>
                <option value="person">{t('contacts.type.person')}</option>
                <option value="venue">{t('contacts.type.venue')}</option>
                <option value="vendor">{t('contacts.type.vendor')}</option>
              </select>
            </div>

            <div className="form-group">
              <label>{t('contacts.filterCategory')}</label>
              <select
                className="form-control"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>{t('contacts.filterStatus')}</label>
              <select
                className="form-control"
                value={filterActive === undefined ? '' : filterActive.toString()}
                onChange={(e) => setFilterActive(e.target.value === '' ? undefined : e.target.value === 'true')}
              >
                <option value="">{t('common.all')}</option>
                <option value="true">{t('contacts.active')}</option>
                <option value="false">{t('contacts.inactive')}</option>
              </select>
            </div>

            <div className="form-group flex-grow">
              <label>{t('common.search')}</label>
              <input
                type="text"
                className="form-control"
                placeholder={t('contacts.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>{t('contacts.name')}</th>
                <th>{t('contacts.type.label')}</th>
                <th>{t('contacts.email')}</th>
                <th>{t('contacts.phone')}</th>
                <th>{t('contacts.city')}</th>
                <th>{t('contacts.categories')}</th>
                <th>{t('common.status')}</th>
                {canEdit && <th className="actions-column">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="text-center text-muted">
                    {t('contacts.noContacts')}
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className={!contact.isActive ? 'row-inactive' : ''}>
                    <td>
                      <button
                        className="btn-link"
                        onClick={() => setSelectedContact(contact)}
                      >
                        {contact.name}
                      </button>
                      {contact.contactPerson && (
                        <div className="text-muted small">{contact.contactPerson}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${CONTACT_TYPE_COLORS[contact.contactType]}`}>
                        <Icon name={CONTACT_TYPE_ICONS[contact.contactType]} />{' '}
                        {t(`contacts.type.${contact.contactType}`)}
                      </span>
                    </td>
                    <td>
                      {contact.email && (
                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                      )}
                    </td>
                    <td>
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                      )}
                    </td>
                    <td>{contact.city}</td>
                    <td>
                      {contact.categories.map((cat) => (
                        <span
                          key={cat.id}
                          className="badge badge-outline mr-1"
                          style={cat.color ? { borderColor: cat.color, color: cat.color } : {}}
                        >
                          {cat.name}
                        </span>
                      ))}
                    </td>
                    <td>
                      <span className={`badge ${contact.isActive ? 'badge-success' : 'badge-secondary'}`}>
                        {contact.isActive ? t('contacts.active') : t('contacts.inactive')}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <div className="button-group">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => setSelectedContact(contact)}
                            title={t('common.edit')}
                          >
                            <Icon name="pencil" />
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleToggleActive(contact)}
                            title={contact.isActive ? t('contacts.deactivate') : t('contacts.activate')}
                          >
                            <Icon name={contact.isActive ? 'eye' : 'eyeOff'} />
                          </button>
                          {isAdmin && contact.contactType === 'person' && !contact.promotedToUserId && contact.email && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => handlePromote(contact)}
                              title={t('contacts.promoteToUser')}
                            >
                              <Icon name="user" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              className="btn btn-sm btn-danger-outline"
                              onClick={() => handleDelete(contact)}
                              title={t('common.delete')}
                            >
                              <Icon name="trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <ContactFormModal
          onClose={() => setShowCreateModal(false)}
          categories={categories}
        />
      )}

      {selectedContact && !showPromoteModal && (
        <ContactDetailModal
          contact={contactDetail || selectedContact}
          onClose={() => setSelectedContact(null)}
          categories={categories}
          canEdit={canEdit}
        />
      )}

      {showCategoriesModal && (
        <CategoriesModal
          categories={categories}
          onClose={() => setShowCategoriesModal(false)}
          isAdmin={isAdmin}
        />
      )}

      {showPromoteModal && selectedContact && (
        <Modal onClose={() => { setShowPromoteModal(false); setPromoteResult(null); setSelectedContact(null); }} title={t('contacts.promoteToUser')}>
          {promoteResult ? (
            <div>
              <div className="alert alert-success mb-2">
                <Icon name="checkCircle" /> {t('contacts.promoteSuccess')}
              </div>
              <div className="form-group">
                <label>{t('common.email')}</label>
                <input type="text" className="form-control" value={promoteResult.email} readOnly />
              </div>
              <div className="form-group">
                <label>{t('contacts.tempPassword')}</label>
                <input type="text" className="form-control" value={promoteResult.tempPassword} readOnly />
              </div>
              <p className="text-muted small">{t('contacts.sendCredentials')}</p>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => { setShowPromoteModal(false); setPromoteResult(null); setSelectedContact(null); }}>
                  {t('common.close')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p>{t('contacts.confirmPromote', { name: selectedContact.name, email: selectedContact.email })}</p>
              <div className="modal-footer">
                <button className="btn btn-outline" onClick={() => { setShowPromoteModal(false); setSelectedContact(null); }}>
                  {t('common.cancel')}
                </button>
                <button className="btn btn-primary" onClick={confirmPromote} disabled={promoteMutation.isPending}>
                  {promoteMutation.isPending ? t('common.loading') : t('contacts.promoteToUser')}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function ContactFormModal({
  contact,
  onClose,
  categories,
}: {
  contact?: Contact;
  onClose: () => void;
  categories: ContactCategory[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateContactData>({
    contactType: contact?.contactType || 'organization',
    name: contact?.name || '',
    contactPerson: contact?.contactPerson || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    mobile: contact?.mobile || '',
    addressLine: contact?.addressLine || '',
    postalCode: contact?.postalCode || '',
    city: contact?.city || '',
    country: contact?.country || 'NL',
    iban: contact?.iban || '',
    ibanHolderName: contact?.ibanHolderName || '',
    bic: contact?.bic || '',
    vatNumber: contact?.vatNumber || '',
    chamberOfCommerce: contact?.chamberOfCommerce || '',
    website: contact?.website || '',
    notes: contact?.notes || '',
    categoryIds: contact?.categories.map((c) => c.id) || [],
  });

  const createMutation = useMutation({
    mutationFn: createContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      showSuccess(t('contacts.created'));
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateContactData>) => updateContact(contact!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contact', contact!.id] });
      showSuccess(t('contacts.updated'));
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorUpdate'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (contact) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setFormData((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds?.includes(categoryId)
        ? prev.categoryIds.filter((id) => id !== categoryId)
        : [...(prev.categoryIds || []), categoryId],
    }));
  };

  return (
    <Modal onClose={onClose} title={contact ? t('contacts.editContact') : t('contacts.addContact')} size="large">
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label>{t('contacts.type.label')} *</label>
              <select
                className="form-control"
                value={formData.contactType}
                onChange={(e) => setFormData({ ...formData, contactType: e.target.value as ContactType })}
                required
              >
                <option value="organization">{t('contacts.type.organization')}</option>
                <option value="person">{t('contacts.type.person')}</option>
                <option value="venue">{t('contacts.type.venue')}</option>
                <option value="vendor">{t('contacts.type.vendor')}</option>
              </select>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label>{t('contacts.name')} *</label>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          </div>
        </div>

        {formData.contactType === 'organization' && (
          <div className="form-group">
            <label>{t('contacts.contactPerson')}</label>
            <input
              type="text"
              className="form-control"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            />
          </div>
        )}

        <div className="row">
          <div className="col-md-4">
            <div className="form-group">
              <label>{t('contacts.email')}</label>
              <input
                type="email"
                className="form-control"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-group">
              <label>{t('contacts.phone')}</label>
              <input
                type="tel"
                className="form-control"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-group">
              <label>{t('contacts.mobile')}</label>
              <input
                type="tel"
                className="form-control"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>{t('contacts.address')}</label>
          <input
            type="text"
            className="form-control"
            value={formData.addressLine}
            onChange={(e) => setFormData({ ...formData, addressLine: e.target.value })}
          />
        </div>

        <div className="row">
          <div className="col-md-4">
            <div className="form-group">
              <label>{t('contacts.postalCode')}</label>
              <input
                type="text"
                className="form-control"
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
              />
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-group">
              <label>{t('contacts.city')}</label>
              <input
                type="text"
                className="form-control"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
          </div>
          <div className="col-md-4">
            <div className="form-group">
              <label>{t('contacts.country')}</label>
              <input
                type="text"
                className="form-control"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>{t('contacts.website')}</label>
          <input
            type="url"
            className="form-control"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            placeholder="https://"
          />
        </div>

        <div className="form-group">
          <label>{t('contacts.categories')}</label>
          <div className="checkbox-group">
            {categories.map((cat) => (
              <label key={cat.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.categoryIds?.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                />
                <span style={cat.color ? { color: cat.color } : {}}>{cat.name}</span>
              </label>
            ))}
          </div>
        </div>

        <details className="mb-2">
          <summary>{t('contacts.financialDetails')}</summary>
          <div className="row mt-2">
            <div className="col-md-6">
              <div className="form-group">
                <label>{t('contacts.iban')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                />
              </div>
            </div>
            <div className="col-md-6">
              <div className="form-group">
                <label>{t('contacts.ibanHolderName')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.ibanHolderName}
                  onChange={(e) => setFormData({ ...formData, ibanHolderName: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-md-4">
              <div className="form-group">
                <label>{t('contacts.bic')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.bic}
                  onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                />
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-group">
                <label>{t('contacts.vatNumber')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.vatNumber}
                  onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-group">
                <label>{t('contacts.chamberOfCommerce')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.chamberOfCommerce}
                  onChange={(e) => setFormData({ ...formData, chamberOfCommerce: e.target.value })}
                />
              </div>
            </div>
          </div>
        </details>

        <div className="form-group">
          <label>{t('contacts.notes')}</label>
          <textarea
            className="form-control"
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ContactDetailModal({
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
    return <ContactFormModal contact={contact} onClose={() => { setIsEditing(false); onClose(); }} categories={categories} />;
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
              <a href={contact.website} target="_blank" rel="noopener noreferrer">{contact.website}</a>
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
                  <div>{contact.postalCode} {contact.city}</div>
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
                  <span key={cat.id} className="badge badge-outline mr-1" style={cat.color ? { borderColor: cat.color, color: cat.color } : {}}>
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
                          {person.email && <a href={`mailto:${person.email}`} className="mr-2">{person.email}</a>}
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
                            onClick={() => {
                              if (confirm(t('contacts.confirmDeletePerson'))) {
                                deletePersonMutation.mutate(person.id);
                              }
                            }}
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
          <CustomFieldFormSection
            entityType="contact"
            entityId={contact.id}
            autoSave={true}
          />
        ) : (
          <CustomFieldRenderer
            entityType="contact"
            entityId={contact.id}
            layout="horizontal"
          />
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
    </Modal>
  );
}

function CategoriesModal({
  categories,
  onClose,
  isAdmin,
}: {
  categories: ContactCategory[];
  onClose: () => void;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState({ name: '', color: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', color: '' });

  const createMutation = useMutation({
    mutationFn: createContactCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-categories'] });
      showSuccess(t('contacts.categoryCreated'));
      setNewCategory({ name: '', color: '' });
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorCreateCategory'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      updateContactCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-categories'] });
      showSuccess(t('contacts.categoryUpdated'));
      setEditingId(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorUpdateCategory'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteContactCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-categories'] });
      showSuccess(t('contacts.categoryDeleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('contacts.errorDeleteCategory'));
    },
  });

  return (
    <Modal onClose={onClose} title={t('contacts.manageCategories')}>
      <div className="mb-3">
        <div className="row">
          <div className="col-8">
            <input
              type="text"
              className="form-control"
              placeholder={t('contacts.categoryName')}
              value={newCategory.name}
              onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
            />
          </div>
          <div className="col-2">
            <input
              type="color"
              className="form-control"
              value={newCategory.color || '#6366f1'}
              onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
            />
          </div>
          <div className="col-2">
            <button
              className="btn btn-primary w-100"
              onClick={() => createMutation.mutate(newCategory)}
              disabled={!newCategory.name || createMutation.isPending}
            >
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </div>

      <div className="list-group">
        {categories.map((cat) => (
          <div key={cat.id} className="list-group-item">
            {editingId === cat.id ? (
              <div className="row">
                <div className="col-7">
                  <input
                    type="text"
                    className="form-control"
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  />
                </div>
                <div className="col-2">
                  <input
                    type="color"
                    className="form-control"
                    value={editData.color || '#6366f1'}
                    onChange={(e) => setEditData({ ...editData, color: e.target.value })}
                  />
                </div>
                <div className="col-3">
                  <div className="button-group">
                    <button className="btn btn-sm btn-outline" onClick={() => setEditingId(null)}>
                      <Icon name="close" />
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => updateMutation.mutate({ id: cat.id, data: editData })}
                      disabled={updateMutation.isPending}
                    >
                      <Icon name="check" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span style={{ color: cat.color }}>{cat.name}</span>
                <div className="button-group">
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setEditingId(cat.id);
                      setEditData({ name: cat.name, color: cat.color || '' });
                    }}
                  >
                    <Icon name="pencil" />
                  </button>
                  {isAdmin && (
                    <button
                      className="btn btn-sm btn-danger-outline"
                      onClick={() => {
                        if (confirm(t('contacts.confirmDeleteCategory'))) {
                          deleteMutation.mutate(cat.id);
                        }
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-muted text-center p-2">{t('contacts.noCategories')}</p>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn-primary" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}
