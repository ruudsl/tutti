import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createContact, updateContact } from '../../api/contacts';
import type { Contact, ContactCategory, ContactType, CreateContactData } from '../../api/contacts';
import { Modal } from '../../components/Modal';
import { showSuccess, showError } from '../../utils/toast';

export function ContactFormModal({
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
