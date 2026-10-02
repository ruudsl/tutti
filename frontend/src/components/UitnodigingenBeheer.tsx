import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInvitations, useCreateInvitation, useDeleteInvitation } from '../hooks/useMultiAssociation';
import type { Invitation } from '../api/multi-association';
import { Icon } from './Icon';
import { showError, showSuccess } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

type Uitnodigingsrol = 'member' | 'board' | 'admin';

/**
 * Uitnodigingen van de huidige vereniging: versturen, de link doorgeven en
 * intrekken. Voor de beheerder (pagina Uitnodigingen) en de superbeheerder
 * (tabblad op Verenigingen Beheer).
 *
 * Een uitnodiging is voor iemand die al een account in Tutti heeft, meestal
 * bij een andere vereniging op dezelfde installatie: aannemen vraagt inloggen
 * met het uitgenodigde e-mailadres. Een nieuw lid maak je aan onder Leden.
 */
export function UitnodigingenBeheer() {
  const { t } = useTranslation();
  const { data: invitations, isLoading } = useInvitations();
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();
  const veldId = useId();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newInvite, setNewInvite] = useState<{ email: string; role: Uitnodigingsrol }>({ email: '', role: 'member' });
  // De link van de laatst gemaakte uitnodiging, om zelf door te geven.
  const [laatste, setLaatste] = useState<{ email: string; link: string } | null>(null);

  const handleCreate = async () => {
    try {
      const resultaat = await createInvitation.mutateAsync(newInvite);
      setLaatste({ email: newInvite.email, link: resultaat.inviteUrl });
      setNewInvite({ email: '', role: 'member' });
      setShowAddForm(false);
    } catch (fout) {
      showError(getErrorMessage(fout));
    }
  };

  const kopieer = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      showSuccess(t('uitnodiging.gekopieerd'));
    } catch {
      showError(t('uitnodiging.kopierenMislukt'));
    }
  };

  if (isLoading) {
    return (
      <div role="status" className="text-center py-12 text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="text-lg font-semibold">{t('multiAssociation.invitations.title')}</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Icon name="plus" className="w-5 h-5" />
          {t('multiAssociation.invitations.invite')}
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4">{t('uitnodiging.uitleg')}</p>

      {laatste && (
        <div className="mb-4 p-4 border rounded-lg bg-green-50" role="status">
          <p className="mb-2">{t('uitnodiging.linkKlaar', { email: laatste.email })}</p>
          <div className="flex gap-2 items-center">
            <input
              readOnly
              value={laatste.link}
              aria-label={t('uitnodiging.link')}
              className="w-full px-3 py-2 border rounded-lg"
              onFocus={(e) => e.target.select()}
            />
            <button onClick={() => kopieer(laatste.link)} className="px-3 py-2 border rounded-lg whitespace-nowrap">
              {t('uitnodiging.kopieer')}
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="mb-4 p-4 border rounded-lg bg-gray-50">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2">
              <label htmlFor={`${veldId}-email`} className="sr-only">
                {t('multiAssociation.invitations.emailPlaceholder')}
              </label>
              <input
                id={`${veldId}-email`}
                type="email"
                placeholder={t('multiAssociation.invitations.emailPlaceholder')}
                value={newInvite.email}
                onChange={(e) => setNewInvite((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <select
              aria-label={t('multiAssociation.roleLabel')}
              value={newInvite.role}
              onChange={(e) => setNewInvite((prev) => ({ ...prev, role: e.target.value as Uitnodigingsrol }))}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="member">{t('multiAssociation.roles.member')}</option>
              <option value="board">{t('multiAssociation.roles.board')}</option>
              <option value="admin">{t('multiAssociation.roles.admin')}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newInvite.email || createInvitation.isPending}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {t('common.submit')}
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 border text-sm rounded-lg">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {!invitations || invitations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="envelope" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('multiAssociation.invitations.noInvitations')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invitations.map((invite: Invitation) => (
            <div key={invite.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
              <div>
                <div className="font-medium">{invite.email}</div>
                <div className="text-sm text-gray-500">
                  {`${t('multiAssociation.roleLabel')}: ${invite.role} | ${t('multiAssociation.invitations.invitedBy')}: ${invite.invitedBy}`}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    invite.status === 'accepted'
                      ? 'bg-green-100 text-green-800'
                      : invite.status === 'expired'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {invite.status === 'accepted'
                    ? t('multiAssociation.invitations.status.accepted')
                    : invite.status === 'expired'
                      ? t('multiAssociation.invitations.status.expired')
                      : t('multiAssociation.invitations.status.pending')}
                </span>
                {invite.status === 'pending' && (
                  <button
                    onClick={() => deleteInvitation.mutate(invite.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
