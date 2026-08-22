import { useTranslation } from 'react-i18next';
import type { Contact } from '../../api/contacts';
import { Icon } from '../../components/Icon';
import { CONTACT_TYPE_COLORS, CONTACT_TYPE_ICONS } from './constants';

export function ContactRow({
  contact,
  canEdit,
  isAdmin,
  onSelect,
  onToggleActive,
  onPromote,
  onDelete,
}: {
  contact: Contact;
  canEdit: boolean;
  isAdmin: boolean;
  onSelect: () => void;
  onToggleActive: () => void;
  onPromote: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <tr className={!contact.isActive ? 'row-inactive' : ''}>
      <td>
        <button className="btn-link" onClick={onSelect}>
          {contact.name}
        </button>
        {contact.contactPerson && <div className="text-muted small">{contact.contactPerson}</div>}
      </td>
      <td>
        <span className={`badge ${CONTACT_TYPE_COLORS[contact.contactType]}`}>
          <Icon name={CONTACT_TYPE_ICONS[contact.contactType]} /> {t(`contacts.type.${contact.contactType}`)}
        </span>
      </td>
      <td>{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}</td>
      <td>{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}</td>
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
            <button className="btn btn-sm btn-outline" onClick={onSelect} title={t('common.edit')}>
              <Icon name="pencil" />
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={onToggleActive}
              title={contact.isActive ? t('contacts.deactivate') : t('contacts.activate')}
            >
              <Icon name={contact.isActive ? 'eye' : 'eyeOff'} />
            </button>
            {isAdmin && contact.contactType === 'person' && !contact.promotedToUserId && contact.email && (
              <button className="btn btn-sm btn-outline" onClick={onPromote} title={t('contacts.promoteToUser')}>
                <Icon name="user" />
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-sm btn-danger-outline" onClick={onDelete} title={t('common.delete')}>
                <Icon name="trash" />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}
