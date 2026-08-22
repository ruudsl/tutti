import { useTranslation } from 'react-i18next';
import type { Contact } from '../../api/contacts';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';

export function PromoteContactModal({
  contact,
  result,
  isPending,
  onConfirm,
  onClose,
  onCancel,
}: {
  contact: Contact;
  result: { email: string; tempPassword: string } | null;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal onClose={onClose} title={t('contacts.promoteToUser')}>
      {result ? (
        <div>
          <div className="alert alert-success mb-2">
            <Icon name="checkCircle" /> {t('contacts.promoteSuccess')}
          </div>
          <div className="form-group">
            <label>{t('common.email')}</label>
            <input type="text" className="form-control" value={result.email} readOnly />
          </div>
          <div className="form-group">
            <label>{t('contacts.tempPassword')}</label>
            <input type="text" className="form-control" value={result.tempPassword} readOnly />
          </div>
          <p className="text-muted small">{t('contacts.sendCredentials')}</p>
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p>{t('contacts.confirmPromote', { name: contact.name, email: contact.email })}</p>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={onConfirm} disabled={isPending}>
              {isPending ? t('common.loading') : t('contacts.promoteToUser')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
