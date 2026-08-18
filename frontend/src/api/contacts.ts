import api from './client';

export type ContactType = 'organization' | 'person' | 'venue' | 'vendor';

export interface ContactCategory {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  createdAt: string;
}

export interface ContactPerson {
  id: string;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
  notes?: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  contactType: ContactType;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  iban?: string;
  ibanHolderName?: string;
  bic?: string;
  vatNumber?: string;
  chamberOfCommerce?: string;
  website?: string;
  notes?: string;
  isActive: boolean;
  promotedToUserId?: string;
  categories: { id: string; name: string; color?: string; icon?: string }[];
  contactPersons?: ContactPerson[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactData {
  contactType: ContactType;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  iban?: string;
  ibanHolderName?: string;
  bic?: string;
  vatNumber?: string;
  chamberOfCommerce?: string;
  website?: string;
  notes?: string;
  categoryIds?: string[];
}

export interface ContactFilters {
  type?: ContactType;
  category?: string;
  search?: string;
  active?: boolean;
}

// Categories
export const getContactCategories = async (): Promise<ContactCategory[]> => {
  const { data } = await api.get('/contacts/categories');
  return data;
};

export const createContactCategory = async (category: {
  name: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}): Promise<ContactCategory> => {
  const { data } = await api.post('/contacts/categories', category);
  return data;
};

export const updateContactCategory = async (
  id: string,
  category: { name?: string; color?: string; icon?: string; sortOrder?: number },
): Promise<void> => {
  await api.put(`/contacts/categories/${id}`, category);
};

export const deleteContactCategory = async (id: string): Promise<void> => {
  await api.delete(`/contacts/categories/${id}`);
};

// Contacts
export const getContacts = async (filters?: ContactFilters): Promise<Contact[]> => {
  const { data } = await api.get('/contacts', { params: filters });
  return data;
};

export const getContact = async (id: string): Promise<Contact> => {
  const { data } = await api.get(`/contacts/${id}`);
  return data;
};

export const createContact = async (
  contact: CreateContactData,
): Promise<{ id: string; name: string; message: string }> => {
  const { data } = await api.post('/contacts', contact);
  return data;
};

export const updateContact = async (id: string, contact: Partial<CreateContactData>): Promise<void> => {
  await api.patch(`/contacts/${id}`, contact);
};

export const deleteContact = async (id: string): Promise<void> => {
  await api.delete(`/contacts/${id}`);
};

export const activateContact = async (id: string): Promise<void> => {
  await api.post(`/contacts/${id}/activate`);
};

export const deactivateContact = async (id: string): Promise<void> => {
  await api.post(`/contacts/${id}/deactivate`);
};

export const promoteContactToUser = async (
  id: string,
): Promise<{ userId: string; email: string; tempPassword: string; message: string }> => {
  const { data } = await api.post(`/contacts/${id}/promote`);
  return data;
};

// Contact persons
export const getContactPersons = async (contactId: string): Promise<ContactPerson[]> => {
  const { data } = await api.get(`/contacts/${contactId}/persons`);
  return data;
};

export const addContactPerson = async (
  contactId: string,
  person: { name: string; role?: string; email?: string; phone?: string; isPrimary?: boolean; notes?: string },
): Promise<{ id: string; name: string; message: string }> => {
  const { data } = await api.post(`/contacts/${contactId}/persons`, person);
  return data;
};

export const updateContactPerson = async (
  contactId: string,
  personId: string,
  person: { name?: string; role?: string; email?: string; phone?: string; isPrimary?: boolean; notes?: string },
): Promise<void> => {
  await api.put(`/contacts/${contactId}/persons/${personId}`, person);
};

export const deleteContactPerson = async (contactId: string, personId: string): Promise<void> => {
  await api.delete(`/contacts/${contactId}/persons/${personId}`);
};
