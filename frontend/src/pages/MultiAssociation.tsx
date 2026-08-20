import { currentLocale } from '../utils/locale';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useIsSuperAdmin,
  useSuperAdminAssociations,
  useCreateAssociationAsSuperAdmin,
  useUpdateAssociationAsSuperAdmin,
  useUpdateAssociationSubscription,
  useDeleteAssociationAsSuperAdmin,
  useSuperAdmins,
  useAddSuperAdmin,
  useRemoveSuperAdmin,
  useInvitations,
  useCreateInvitation,
  useDeleteInvitation,
  usePartnerships,
  usePartnerMusic,
  usePartnerEvents,
  useApprovePartnership,
  useRejectPartnership,
  useEndPartnership,
  useAssociationMembers,
  useUpdateMemberRole,
  useRemoveMember,
  useActivityLog,
} from '../hooks/useMultiAssociation';
import { Icon } from '../components/Icon';
import { FormModal } from '../components/FormModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Association, Invitation, Partnership, AssociationMember, SuperAdmin } from '../api/multi-association';

const SUBSCRIPTION_TIERS = [
  { value: 'free', color: 'bg-gray-100 text-gray-800' },
  { value: 'basic', color: 'bg-blue-100 text-blue-800' },
  { value: 'pro', color: 'bg-purple-100 text-purple-800' },
  { value: 'enterprise', color: 'bg-gold-100 text-yellow-800' },
];

export default function MultiAssociation() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<
    'associations' | 'invitations' | 'partnerships' | 'members' | 'superadmins' | 'activity'
  >('associations');
  const { data: superAdminStatus, isLoading: checkingAccess } = useIsSuperAdmin();

  if (checkingAccess) {
    return (
      <div className="page">
        <div role="status" className="text-center py-12 text-gray-500">
          {t('multiAssociation.checkingAccess')}
        </div>
      </div>
    );
  }

  if (!superAdminStatus?.isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <Icon name="shield" className="w-12 h-12 mx-auto mb-4 text-yellow-600" />
          <h2 className="text-xl font-semibold mb-2">{t('multiAssociation.accessRequiredTitle')}</h2>
          <p className="text-gray-600">{t('multiAssociation.accessRequiredMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('multiAssociation.title')}</h1>
        <p className="text-gray-600 mt-1">{t('multiAssociation.subtitle')}</p>
      </div>

      <div className="border-b mb-6">
        <nav className="flex gap-4">
          {[
            { id: 'associations', label: t('multiAssociation.tabs.associations'), icon: 'building' },
            { id: 'invitations', label: t('multiAssociation.tabs.invitations'), icon: 'envelope' },
            { id: 'partnerships', label: t('multiAssociation.tabs.partnerships'), icon: 'link' },
            { id: 'members', label: t('multiAssociation.tabs.members'), icon: 'users' },
            { id: 'superadmins', label: t('multiAssociation.tabs.superadmins'), icon: 'shield' },
            { id: 'activity', label: t('multiAssociation.tabs.activity'), icon: 'clock' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon name={tab.icon as any} className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'associations' && <AssociationsTab />}
      {activeTab === 'invitations' && <InvitationsTab />}
      {activeTab === 'partnerships' && <PartnershipsTab />}
      {activeTab === 'members' && <MembersTab />}
      {activeTab === 'superadmins' && <SuperAdminsTab />}
      {activeTab === 'activity' && <ActivityTab />}
    </div>
  );
}

/**
 * "3 / 100" als er een grens is, anders alleen het aantal.
 *
 * Een lege grens betekent geen grens; "3 / null" op het scherm zetten zou
 * suggereren dat er iets misging.
 */
function metGrens(aantal: number | undefined, grens: number | null | undefined): string {
  const gebruikt = aantal ?? 0;
  return typeof grens === 'number' && grens > 0 ? `${gebruikt} / ${grens}` : `${gebruikt}`;
}

function AssociationsTab() {
  const { t } = useTranslation();
  const { data: associations, isLoading } = useSuperAdminAssociations();
  const createAssociation = useCreateAssociationAsSuperAdmin();
  const updateAssociation = useUpdateAssociationAsSuperAdmin();
  const updateSubscription = useUpdateAssociationSubscription();
  const deleteAssociation = useDeleteAssociationAsSuperAdmin();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAssociation, setEditingAssociation] = useState<Association | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<Association | null>(null);
  const [deletingAssociation, setDeletingAssociation] = useState<Association | null>(null);

  const handleCreate = async (data: Partial<Association>) => {
    await createAssociation.mutateAsync(data);
    setShowCreateModal(false);
  };

  const handleUpdate = async (data: Partial<Association>) => {
    if (!editingAssociation) return;
    await updateAssociation.mutateAsync({ id: editingAssociation.id, data });
    setEditingAssociation(null);
  };

  const handleUpdateSubscription = async (data: any) => {
    if (!editingSubscription) return;
    await updateSubscription.mutateAsync({ id: editingSubscription.id, data });
    setEditingSubscription(null);
  };

  const handleDelete = async () => {
    if (!deletingAssociation) return;
    await deleteAssociation.mutateAsync(deletingAssociation.id);
    setDeletingAssociation(null);
  };

  const getTierBadge = (tier?: string) => {
    const found = SUBSCRIPTION_TIERS.find((s) => s.value === tier) || SUBSCRIPTION_TIERS[0];
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${found.color}`}>
        {t(`multiAssociation.subscription.tiers.${found.value}`)}
      </span>
    );
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
        <h2 className="text-lg font-semibold">{t('multiAssociation.associations.title')}</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Icon name="plus" className="w-5 h-5" />
          {t('multiAssociation.associations.newAssociation')}
        </button>
      </div>

      {!associations || associations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="building" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('multiAssociation.associations.noAssociations')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('common.name')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {t('multiAssociation.form.slug')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {t('multiAssociation.associations.subscription')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {t('multiAssociation.associations.memberCount')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {t('multiAssociation.associations.orchestraCount')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {associations.map((assoc: Association) => (
                <tr key={assoc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{assoc.name}</div>
                    {assoc.city && <div className="text-sm text-gray-500">{assoc.city}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {/* De slug is de inloglink van deze vereniging: dat scherm
                        toont dan haar naam en logo in plaats van de neutrale. */}
                    {assoc.slug ? (
                      <Link to={`/login/${assoc.slug}`} className="text-blue-600 hover:underline">
                        /login/{assoc.slug}
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{getTierBadge(assoc.subscriptionTier)}</td>
                  <td className="px-4 py-3 text-sm">{metGrens(assoc.memberCount, assoc.maxMembers)}</td>
                  <td className="px-4 py-3 text-sm">{metGrens(assoc.orchestraCount, assoc.maxOrchestras)}</td>
                  <td className="px-4 py-3">
                    {assoc.isActive ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        {t('multiAssociation.associations.status.active')}
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                        {t('multiAssociation.associations.status.inactive')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingAssociation(assoc)}
                        className="p-1.5 hover:bg-gray-100 rounded"
                        title={t('common.edit')}
                      >
                        <Icon name="pencil" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingSubscription(assoc)}
                        className="p-1.5 hover:bg-gray-100 rounded"
                        title={t('multiAssociation.associations.subscription')}
                      >
                        <Icon name="creditCard" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingAssociation(assoc)}
                        className="p-1.5 hover:bg-gray-100 rounded text-red-600"
                        title={t('common.delete')}
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <AssociationFormModal
          title={t('multiAssociation.associations.newAssociation')}
          onSubmit={handleCreate}
          onClose={() => setShowCreateModal(false)}
          isLoading={createAssociation.isPending}
        />
      )}

      {editingAssociation && (
        <AssociationFormModal
          title={t('multiAssociation.associations.editAssociation')}
          association={editingAssociation}
          onSubmit={handleUpdate}
          onClose={() => setEditingAssociation(null)}
          isLoading={updateAssociation.isPending}
        />
      )}

      {editingSubscription && (
        <SubscriptionModal
          association={editingSubscription}
          onSubmit={handleUpdateSubscription}
          onClose={() => setEditingSubscription(null)}
          isLoading={updateSubscription.isPending}
        />
      )}

      {deletingAssociation && (
        <ConfirmDialog
          title={t('multiAssociation.associations.deleteAssociation')}
          message={t('multiAssociation.associations.deleteConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingAssociation(null)}
          variant="danger"
        />
      )}
    </div>
  );
}

function AssociationFormModal({
  title,
  association,
  onSubmit,
  onClose,
  isLoading,
}: {
  title: string;
  association?: Association;
  onSubmit: (data: Partial<Association>) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: association?.name || '',
    displayName: association?.displayName || '',
    slug: association?.slug || '',
    website: association?.website || '',
    phone: association?.phone || '',
    email: association?.email || '',
    address: association?.address || '',
    city: association?.city || '',
    postalCode: association?.postalCode || '',
    country: association?.country || 'Nederland',
    billingEmail: association?.billingEmail || '',
    kvkNumber: association?.kvkNumber || '',
    iban: association?.iban || '',
  });

  return (
    <FormModal
      title={title}
      onClose={onClose}
      onSubmit={() => onSubmit(formData)}
      isLoading={isLoading}
      submitLabel={association ? t('common.save') : t('common.create')}
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.name')} *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.slug')}</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))
              }
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={t('multiAssociation.form.slugPlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('multiAssociation.form.displayName')}
          </label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.website')}</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData((prev) => ({ ...prev, website: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.phone')}</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.email')}</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('multiAssociation.form.billingEmail')}
            </label>
            <input
              type="email"
              value={formData.billingEmail}
              onChange={(e) => setFormData((prev) => ({ ...prev, billingEmail: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.address')}</label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('multiAssociation.form.postalCode')}
            </label>
            <input
              type="text"
              value={formData.postalCode}
              onChange={(e) => setFormData((prev) => ({ ...prev, postalCode: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.city')}</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.country')}</label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData((prev) => ({ ...prev, country: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('multiAssociation.form.kvkNumber')}
            </label>
            <input
              type="text"
              value={formData.kvkNumber}
              onChange={(e) => setFormData((prev) => ({ ...prev, kvkNumber: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('multiAssociation.form.iban')}</label>
            <input
              type="text"
              value={formData.iban}
              onChange={(e) => setFormData((prev) => ({ ...prev, iban: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
        </div>
      </div>
    </FormModal>
  );
}

function SubscriptionModal({
  association,
  onSubmit,
  onClose,
  isLoading,
}: {
  association: Association;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    subscriptionTier: association.subscriptionTier || 'free',
    subscriptionExpires: association.subscriptionExpires?.slice(0, 10) || '',
    maxMembers: association.maxMembers || 100,
    maxOrchestras: association.maxOrchestras || 5,
    maxStorageMb: association.maxStorageMb || 5000,
    isActive: association.isActive,
  });

  return (
    <FormModal
      title={`${t('multiAssociation.subscription.title')}: ${association.name}`}
      onClose={onClose}
      onSubmit={() => onSubmit(formData)}
      isLoading={isLoading}
      submitLabel={t('common.save')}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('multiAssociation.subscription.tier')}
          </label>
          <select
            value={formData.subscriptionTier}
            onChange={(e) => setFormData((prev) => ({ ...prev, subscriptionTier: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
          >
            {SUBSCRIPTION_TIERS.map((tier) => (
              <option key={tier.value} value={tier.value}>
                {t(`multiAssociation.subscription.tiers.${tier.value}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('multiAssociation.subscription.expires')}
          </label>
          <input
            type="date"
            value={formData.subscriptionExpires}
            onChange={(e) => setFormData((prev) => ({ ...prev, subscriptionExpires: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('multiAssociation.subscription.maxMembers')}
            </label>
            <input
              type="number"
              value={formData.maxMembers}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxMembers: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border rounded-lg"
              min="1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('multiAssociation.subscription.maxOrchestras')}
            </label>
            <input
              type="number"
              value={formData.maxOrchestras}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxOrchestras: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border rounded-lg"
              min="1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('multiAssociation.subscription.maxStorage')}
            </label>
            <input
              type="number"
              value={formData.maxStorageMb}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxStorageMb: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border rounded-lg"
              min="100"
            />
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
          />
          <span className="text-sm">{t('multiAssociation.subscription.isActive')}</span>
        </label>
      </div>
    </FormModal>
  );
}

function InvitationsTab() {
  const { t } = useTranslation();
  const { data: invitations, isLoading } = useInvitations();
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: '', role: 'member' as const });

  const handleCreate = async () => {
    await createInvitation.mutateAsync(newInvite);
    setNewInvite({ email: '', role: 'member' });
    setShowAddForm(false);
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

      {showAddForm && (
        <div className="mb-4 p-4 border rounded-lg bg-gray-50">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2">
              <input
                type="email"
                placeholder={t('multiAssociation.invitations.emailPlaceholder')}
                value={newInvite.email}
                onChange={(e) => setNewInvite((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <select
              value={newInvite.role}
              onChange={(e) => setNewInvite((prev) => ({ ...prev, role: e.target.value as any }))}
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

function GedeeldDoorPartners() {
  const { t } = useTranslation();
  const { data: muziek } = usePartnerMusic();
  const { data: concerten } = usePartnerEvents();

  if ((muziek ?? []).length === 0 && (concerten ?? []).length === 0) return null;

  return (
    <div className="mt-8 space-y-6">
      {(muziek ?? []).length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">{t('multiAssociation.partnerships.sharedMusic')}</h3>
          <ul className="space-y-1 text-sm">
            {(muziek ?? []).map((titel) => (
              <li key={titel.id} className="flex justify-between border-b py-1">
                <span>
                  {titel.title}
                  {titel.arranger && <span className="text-gray-500"> - {titel.arranger}</span>}
                </span>
                <span className="text-gray-500">{titel.associationName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(concerten ?? []).length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">{t('multiAssociation.partnerships.sharedEvents')}</h3>
          <ul className="space-y-1 text-sm">
            {(concerten ?? []).map((concert) => (
              <li key={concert.id} className="flex justify-between border-b py-1">
                <span>
                  {concert.date} - {concert.name}
                  {concert.location && <span className="text-gray-500"> ({concert.location})</span>}
                </span>
                <span className="text-gray-500">{concert.associationName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PartnershipsTab() {
  const { t } = useTranslation();
  const { data: partnerships, isLoading } = usePartnerships();
  const approvePartnership = useApprovePartnership();
  const rejectPartnership = useRejectPartnership();
  const endPartnership = useEndPartnership();

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
        <h2 className="text-lg font-semibold">{t('multiAssociation.partnerships.title')}</h2>
      </div>

      {/*
        Aanvragen gebeurde hier met een keuzelijst van alle verenigingen. Die
        lijst is weg: koppelen gaat via een code die je buiten Tutti om
        doorgeeft. Dit tabblad toont nog wat er loopt; het koppelen zelf staat
        onder Muziek delen.
      */}
      <div className="alert alert-info mb-4">
        <Icon name="info" className="w-5 h-5" />{' '}
        <span>
          {t('multiAssociation.partnerships.linkViaCode')}{' '}
          <Link to="/music-sharing" className="underline">
            {t('nav.musicSharing')}
          </Link>
        </span>
      </div>

      {!partnerships || partnerships.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="link" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('multiAssociation.partnerships.noPartnerships')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {partnerships.map((partnership: Partnership) => (
            <div key={partnership.id} className="border rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-lg">{partnership.partnerAssociationName}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {partnership.isOutgoing
                      ? t('multiAssociation.partnerships.outgoing')
                      : t('multiAssociation.partnerships.incoming')}
                  </div>
                  <div className="flex gap-4 mt-2 text-sm">
                    {partnership.shareMusic && (
                      <span className="text-blue-600">{t('multiAssociation.partnerships.shareMusic')}</span>
                    )}
                    {partnership.shareEvents && (
                      <span className="text-green-600">{t('multiAssociation.partnerships.shareEvents')}</span>
                    )}
                    {partnership.shareMembers && (
                      <span className="text-purple-600">{t('multiAssociation.partnerships.shareMembers')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      partnership.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : partnership.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {partnership.status === 'active'
                      ? t('multiAssociation.partnerships.status.active')
                      : partnership.status === 'rejected'
                        ? t('multiAssociation.partnerships.status.rejected')
                        : t('multiAssociation.partnerships.status.pending')}
                  </span>

                  {partnership.status === 'pending' && !partnership.isOutgoing && (
                    <>
                      <button
                        onClick={() => approvePartnership.mutate(partnership.id)}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      >
                        {t('multiAssociation.partnerships.approve')}
                      </button>
                      <button
                        onClick={() => rejectPartnership.mutate(partnership.id)}
                        className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                      >
                        {t('multiAssociation.partnerships.reject')}
                      </button>
                    </>
                  )}

                  {partnership.status === 'active' && (
                    <button
                      onClick={() => endPartnership.mutate(partnership.id)}
                      className="px-3 py-1 border border-red-600 text-red-600 text-sm rounded hover:bg-red-50"
                    >
                      {t('multiAssociation.partnerships.end')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <GedeeldDoorPartners />
    </div>
  );
}

function MembersTab() {
  const { t } = useTranslation();
  const { data: members, isLoading } = useAssociationMembers();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const [deletingMember, setDeletingMember] = useState<AssociationMember | null>(null);

  const handleDelete = async () => {
    if (!deletingMember) return;
    await removeMember.mutateAsync(deletingMember.userId);
    setDeletingMember(null);
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
      <h2 className="text-lg font-semibold mb-4">{t('multiAssociation.members.title')}</h2>

      {!members || members.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="users" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('multiAssociation.members.noMembers')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('common.name')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('common.email')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                  {t('multiAssociation.roleLabel')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('common.status')}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {members.map((member: AssociationMember) => (
                <tr key={member.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{member.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{member.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        updateRole.mutate({
                          userId: member.userId,
                          role: e.target.value as any,
                        })
                      }
                      className="text-sm border rounded px-2 py-1"
                    >
                      <option value="member">{t('multiAssociation.roles.member')}</option>
                      <option value="board">{t('multiAssociation.roles.board')}</option>
                      <option value="admin">{t('multiAssociation.roles.admin')}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {member.status === 'active'
                        ? t('multiAssociation.associations.status.active')
                        : t('multiAssociation.associations.status.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeletingMember(member)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deletingMember && (
        <ConfirmDialog
          title={t('multiAssociation.members.removeTitle')}
          message={t('multiAssociation.members.removeConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingMember(null)}
          variant="danger"
        />
      )}
    </div>
  );
}

function SuperAdminsTab() {
  const { t } = useTranslation();
  const { data: superAdmins, isLoading } = useSuperAdmins();
  useAddSuperAdmin(); // Available for future "Add Super Admin" feature
  const removeSuperAdmin = useRemoveSuperAdmin();

  const [deletingAdmin, setDeletingAdmin] = useState<SuperAdmin | null>(null);

  const handleDelete = async () => {
    if (!deletingAdmin) return;
    await removeSuperAdmin.mutateAsync(deletingAdmin.id);
    setDeletingAdmin(null);
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
        <h2 className="text-lg font-semibold">{t('multiAssociation.superAdmins.title')}</h2>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Icon name="warning" className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <strong>{t('multiAssociation.superAdmins.warningLabel')}</strong>{' '}
            {t('multiAssociation.superAdmins.warning')}
          </div>
        </div>
      </div>

      {!superAdmins || superAdmins.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="shield" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('multiAssociation.superAdmins.noAdmins')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {superAdmins.map((admin: SuperAdmin) => (
            <div key={admin.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
              <div>
                <div className="font-medium">{admin.name}</div>
                <div className="text-sm text-gray-500">{admin.email}</div>
              </div>
              <button onClick={() => setDeletingAdmin(admin)} className="p-2 text-red-600 hover:bg-red-50 rounded">
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {deletingAdmin && (
        <ConfirmDialog
          title={t('multiAssociation.superAdmins.removeTitle')}
          message={t('multiAssociation.superAdmins.removeConfirm')}
          confirmLabel={t('common.delete')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingAdmin(null)}
          variant="danger"
        />
      )}
    </div>
  );
}

function ActivityTab() {
  const { t } = useTranslation();
  const { data: activityLog, isLoading } = useActivityLog({ limit: 50 });

  if (isLoading) {
    return (
      <div role="status" className="text-center py-12 text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  const getActionLabel = (action: string) => t(`multiAssociation.activity.actions.${action}`, { defaultValue: action });

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{t('multiAssociation.activity.title')}</h2>

      {!activityLog || activityLog.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Icon name="clock" className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('multiAssociation.activity.noActivity')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activityLog.map((entry: any) => (
            <div key={entry.id} className="flex items-start gap-4 p-4 border rounded-lg bg-white">
              <div className="flex-1">
                <div className="font-medium">{getActionLabel(entry.action)}</div>
                {entry.userName && (
                  <div className="text-sm text-gray-600">
                    {t('multiAssociation.activity.by', { name: entry.userName })}
                  </div>
                )}
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <div className="text-sm text-gray-500 mt-1">
                    {Object.entries(entry.details).map(([key, value]) => (
                      <span key={key} className="mr-4">
                        {key}: {String(value)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-sm text-gray-500">{new Date(entry.createdAt).toLocaleString(currentLocale())}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
