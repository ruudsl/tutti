import type { IconName } from '../../components/Icon';
import type { ContactType } from '../../api/contacts';

export const CONTACT_TYPE_ICONS: Record<ContactType, IconName> = {
  organization: 'building',
  person: 'user',
  venue: 'mapPin',
  vendor: 'package',
};

export const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
  organization: 'badge-primary',
  person: 'badge-info',
  venue: 'badge-success',
  vendor: 'badge-warning',
};
