import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../../components/Icon';
import {
  getContacts,
  getContact,
  deleteContact,
  activateContact,
  deactivateContact,
  promoteContactToUser,
  getContactCategories,
  Contact,
  ContactType,
} from '../../api/contacts';
import { showSuccess, showError } from '../../utils/toast';
import { useDebounce } from '../../hooks/useDebounce';
import { SkeletonTable } from '../../components/Skeleton';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROLES } from '../../utils/constants';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ContactFormModal } from './ContactFormModal';
import { ContactDetailModal } from './ContactDetailModal';
import { CategoriesModal } from './CategoriesModal';
import { ContactRow } from './ContactRow';
import { PromoteContactModal } from './PromoteContactModal';

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
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);

  const isAdmin = user?.role === ROLES.ADMIN;
  const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE;

  // Debounce search input so we don't fire an API request per keystroke
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', filterType, filterCategory, filterActive, debouncedSearchTerm],
    queryFn: () =>
      getContacts({
        type: filterType || undefined,
        category: filterCategory || undefined,
        active: filterActive,
        search: debouncedSearchTerm || undefined,
      }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['contact-categories'],
    queryFn: getContactCategories,
  });

  const { data: contactDetail } = useQuery({
    queryKey: ['contact', selectedContact?.id],
    queryFn: () => (selectedContact ? getContact(selectedContact.id) : null),
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
    setDeletingContact(contact);
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
      <div className="page-header">
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
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
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
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    canEdit={canEdit}
                    isAdmin={isAdmin}
                    onSelect={() => setSelectedContact(contact)}
                    onToggleActive={() => handleToggleActive(contact)}
                    onPromote={() => handlePromote(contact)}
                    onDelete={() => handleDelete(contact)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && <ContactFormModal onClose={() => setShowCreateModal(false)} categories={categories} />}

      {selectedContact && !showPromoteModal && (
        <ContactDetailModal
          contact={contactDetail || selectedContact}
          onClose={() => setSelectedContact(null)}
          categories={categories}
          canEdit={canEdit}
        />
      )}

      {showCategoriesModal && (
        <CategoriesModal categories={categories} onClose={() => setShowCategoriesModal(false)} isAdmin={isAdmin} />
      )}

      {showPromoteModal && selectedContact && (
        <PromoteContactModal
          contact={selectedContact}
          result={promoteResult}
          isPending={promoteMutation.isPending}
          onConfirm={confirmPromote}
          onClose={() => {
            setShowPromoteModal(false);
            setPromoteResult(null);
            setSelectedContact(null);
          }}
          onCancel={() => {
            setShowPromoteModal(false);
            setSelectedContact(null);
          }}
        />
      )}

      {/* Delete Contact Confirmation */}
      {deletingContact && (
        <ConfirmDialog
          title={t('contacts.deleteTitle')}
          message={t('contacts.confirmDelete', { name: deletingContact.name })}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(deletingContact.id, {
              onSuccess: () => setDeletingContact(null),
            });
          }}
          onCancel={() => setDeletingContact(null)}
        />
      )}
    </div>
  );
}
