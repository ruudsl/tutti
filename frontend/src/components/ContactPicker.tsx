import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getContacts, Contact, ContactType } from '../api/contacts';
import { Icon } from './Icon';

interface ContactPickerProps {
  value?: string | null;
  onChange: (contactId: string | null, contact: Contact | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  contactTypes?: ContactType[];
  allowClear?: boolean;
  label?: string;
  required?: boolean;
}

export function ContactPicker({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  contactTypes,
  allowClear = true,
  label,
  required = false,
}: ContactPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', 'picker', contactTypes],
    queryFn: () => getContacts({ active: true }),
  });

  const selectedContact = contacts.find((c) => c.id === value);

  const filteredContacts = contacts.filter((contact) => {
    if (contactTypes && !contactTypes.includes(contact.contactType)) {
      return false;
    }
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      contact.name.toLowerCase().includes(searchLower) ||
      contact.email?.toLowerCase().includes(searchLower) ||
      contact.city?.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (contact: Contact) => {
    onChange(contact.id, contact);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
    setSearch('');
  };

  const getContactTypeIcon = (type: ContactType) => {
    switch (type) {
      case 'organization':
        return 'users';
      case 'person':
        return 'user';
      case 'venue':
        return 'mapPin';
      case 'vendor':
        return 'package';
      default:
        return 'book';
    }
  };

  const getContactTypeLabel = (type: ContactType) => {
    return t(`contacts.type.${type}`);
  };

  return (
    <div className={`form-control ${className}`} ref={dropdownRef}>
      {label && (
        <label className="label">
          <span className="label-text">
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </span>
        </label>
      )}

      <div className="relative">
        <div
          className={`input input-bordered w-full flex items-center gap-2 cursor-pointer ${disabled ? 'input-disabled' : ''}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {selectedContact ? (
            <>
              <Icon
                name={getContactTypeIcon(selectedContact.contactType) as any}
                size={16}
                className="text-base-content/60"
              />
              <span className="flex-1 truncate">{selectedContact.name}</span>
              {selectedContact.city && <span className="text-base-content/60 text-sm">{selectedContact.city}</span>}
              {allowClear && !disabled && (
                <button type="button" className="btn btn-ghost btn-xs btn-circle" onClick={handleClear}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </>
          ) : (
            <span className="text-base-content/40 flex-1">{placeholder || t('contacts.selectContact')}</span>
          )}
          <Icon name="chevronDown" size={16} className="text-base-content/60" />
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-80 overflow-hidden">
            <div className="p-2 border-b border-base-300">
              <input
                ref={inputRef}
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className="overflow-y-auto max-h-60">
              {isLoading ? (
                <div className="p-4 text-center text-base-content/60">{t('common.loading')}</div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-4 text-center text-base-content/60">
                  {search ? t('contacts.noResults') : t('contacts.noContacts')}
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className={`flex items-center gap-3 p-3 hover:bg-base-200 cursor-pointer ${contact.id === value ? 'bg-primary/10' : ''}`}
                    onClick={() => handleSelect(contact)}
                  >
                    <Icon
                      name={getContactTypeIcon(contact.contactType) as any}
                      size={18}
                      className="text-base-content/60"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{contact.name}</div>
                      <div className="text-sm text-base-content/60 truncate">
                        {[getContactTypeLabel(contact.contactType), contact.city].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {contact.categories.length > 0 && (
                      <div className="flex gap-1">
                        {contact.categories.slice(0, 2).map((cat) => (
                          <span
                            key={cat.id}
                            className="badge badge-sm"
                            style={{ backgroundColor: cat.color || undefined }}
                          >
                            {cat.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MultiContactPickerProps {
  value: string[];
  onChange: (contactIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  contactTypes?: ContactType[];
  label?: string;
  required?: boolean;
  max?: number;
}

export function MultiContactPicker({
  value = [],
  onChange,
  placeholder,
  disabled = false,
  className = '',
  contactTypes,
  label,
  required = false,
  max,
}: MultiContactPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts', 'picker', contactTypes],
    queryFn: () => getContacts({ active: true }),
  });

  const selectedContacts = contacts.filter((c) => value.includes(c.id));

  const filteredContacts = contacts.filter((contact) => {
    if (value.includes(contact.id)) return false;
    if (contactTypes && !contactTypes.includes(contact.contactType)) {
      return false;
    }
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      contact.name.toLowerCase().includes(searchLower) ||
      contact.email?.toLowerCase().includes(searchLower) ||
      contact.city?.toLowerCase().includes(searchLower)
    );
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (contact: Contact) => {
    if (max && value.length >= max) return;
    onChange([...value, contact.id]);
    setSearch('');
  };

  const handleRemove = (contactId: string) => {
    onChange(value.filter((id) => id !== contactId));
  };

  const getContactTypeIcon = (type: ContactType) => {
    switch (type) {
      case 'organization':
        return 'users';
      case 'person':
        return 'user';
      case 'venue':
        return 'mapPin';
      case 'vendor':
        return 'package';
      default:
        return 'book';
    }
  };

  const canAddMore = !max || value.length < max;

  return (
    <div className={`form-control ${className}`} ref={dropdownRef}>
      {label && (
        <label className="label">
          <span className="label-text">
            {label}
            {required && <span className="text-error ml-1">*</span>}
          </span>
          {max && (
            <span className="label-text-alt">
              {value.length}/{max}
            </span>
          )}
        </label>
      )}

      <div className="relative">
        {selectedContacts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedContacts.map((contact) => (
              <div key={contact.id} className="badge badge-lg gap-2">
                <Icon name={getContactTypeIcon(contact.contactType) as any} size={14} />
                {contact.name}
                {!disabled && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-circle"
                    onClick={() => handleRemove(contact.id)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canAddMore && (
          <div
            className={`input input-bordered w-full flex items-center gap-2 cursor-pointer ${disabled ? 'input-disabled' : ''}`}
            onClick={() => !disabled && setIsOpen(!isOpen)}
          >
            <Icon name="plus" size={16} className="text-base-content/60" />
            <span className="text-base-content/40 flex-1">{placeholder || t('contacts.addContact')}</span>
          </div>
        )}

        {isOpen && canAddMore && (
          <div className="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-80 overflow-hidden">
            <div className="p-2 border-b border-base-300">
              <input
                type="text"
                className="input input-bordered input-sm w-full"
                placeholder={t('common.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>

            <div className="overflow-y-auto max-h-60">
              {isLoading ? (
                <div className="p-4 text-center text-base-content/60">{t('common.loading')}</div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-4 text-center text-base-content/60">
                  {search ? t('contacts.noResults') : t('contacts.allSelected')}
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-3 hover:bg-base-200 cursor-pointer"
                    onClick={() => handleSelect(contact)}
                  >
                    <Icon
                      name={getContactTypeIcon(contact.contactType) as any}
                      size={18}
                      className="text-base-content/60"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{contact.name}</div>
                      <div className="text-sm text-base-content/60 truncate">
                        {contact.city || contact.email || '-'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ContactPicker;
