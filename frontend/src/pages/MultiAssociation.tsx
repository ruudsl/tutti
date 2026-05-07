import { useState } from 'react';
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
    { value: 'free', label: 'Gratis', color: 'bg-gray-100 text-gray-800' },
    { value: 'basic', label: 'Basis', color: 'bg-blue-100 text-blue-800' },
    { value: 'pro', label: 'Pro', color: 'bg-purple-100 text-purple-800' },
    { value: 'enterprise', label: 'Enterprise', color: 'bg-gold-100 text-yellow-800' },
];

export default function MultiAssociation() {
    const [activeTab, setActiveTab] = useState<'associations' | 'invitations' | 'partnerships' | 'members' | 'superadmins' | 'activity'>('associations');
    const { data: superAdminStatus, isLoading: checkingAccess } = useIsSuperAdmin();

    if (checkingAccess) {
        return (
            <div className="p-6">
                <div className="text-center py-12 text-gray-500">Toegang controleren...</div>
            </div>
        );
    }

    if (!superAdminStatus?.isSuperAdmin) {
        return (
            <div className="p-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                    <Icon name="shield" className="w-12 h-12 mx-auto mb-4 text-yellow-600" />
                    <h2 className="text-xl font-semibold mb-2">Super Admin Rechten Vereist</h2>
                    <p className="text-gray-600">
                        Je hebt super admin rechten nodig om verenigingen te beheren.
                        Neem contact op met een bestaande super admin om toegang te krijgen.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Verenigingen Beheer</h1>
                <p className="text-gray-600 mt-1">Beheer meerdere verenigingen en hun instellingen</p>
            </div>

            <div className="border-b mb-6">
                <nav className="flex gap-4">
                    {[
                        { id: 'associations', label: 'Verenigingen', icon: 'building' },
                        { id: 'invitations', label: 'Uitnodigingen', icon: 'envelope' },
                        { id: 'partnerships', label: 'Partnerschappen', icon: 'link' },
                        { id: 'members', label: 'Leden', icon: 'users' },
                        { id: 'superadmins', label: 'Super Admins', icon: 'shield' },
                        { id: 'activity', label: 'Activiteit', icon: 'clock' },
                    ].map(tab => (
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

function AssociationsTab() {
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
        const t = SUBSCRIPTION_TIERS.find(s => s.value === tier) || SUBSCRIPTION_TIERS[0];
        return <span className={`px-2 py-1 text-xs font-medium rounded-full ${t.color}`}>{t.label}</span>;
    };

    if (isLoading) {
        return <div className="text-center py-12 text-gray-500">Laden...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Alle Verenigingen</h2>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Icon name="plus" className="w-5 h-5" />
                    Nieuwe Vereniging
                </button>
            </div>

            {!associations || associations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="building" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen verenigingen gevonden</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Naam</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Slug</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Abonnement</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Leden</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Orkesten</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Acties</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {associations.map((assoc: Association) => (
                                <tr key={assoc.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{assoc.name}</div>
                                        {assoc.city && <div className="text-sm text-gray-500">{assoc.city}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{assoc.slug}</td>
                                    <td className="px-4 py-3">{getTierBadge(assoc.subscriptionTier)}</td>
                                    <td className="px-4 py-3 text-sm">
                                        {assoc.memberCount} / {assoc.maxMembers}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {assoc.orchestraCount} / {assoc.maxOrchestras}
                                    </td>
                                    <td className="px-4 py-3">
                                        {assoc.isActive ? (
                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Actief</span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">Inactief</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setEditingAssociation(assoc)}
                                                className="p-1.5 hover:bg-gray-100 rounded"
                                                title="Bewerken"
                                            >
                                                <Icon name="pencil" className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingSubscription(assoc)}
                                                className="p-1.5 hover:bg-gray-100 rounded"
                                                title="Abonnement"
                                            >
                                                <Icon name="creditCard" className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeletingAssociation(assoc)}
                                                className="p-1.5 hover:bg-gray-100 rounded text-red-600"
                                                title="Verwijderen"
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
                    title="Nieuwe Vereniging"
                    onSubmit={handleCreate}
                    onClose={() => setShowCreateModal(false)}
                    isLoading={createAssociation.isPending}
                />
            )}

            {editingAssociation && (
                <AssociationFormModal
                    title="Vereniging Bewerken"
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
                    title="Vereniging verwijderen"
                    message={`Weet je zeker dat je "${deletingAssociation.name}" wilt verwijderen? Alle leden moeten eerst verwijderd zijn.`}
                    confirmLabel="Verwijderen"
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
            submitLabel={association ? 'Opslaan' : 'Aanmaken'}
        >
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Naam *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                        <input
                            type="text"
                            value={formData.slug}
                            onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="mijn-vereniging"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weergavenaam</label>
                    <input
                        type="text"
                        value={formData.displayName}
                        onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                        <input
                            type="url"
                            value={formData.website}
                            onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Telefoon</label>
                        <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Factuur E-mail</label>
                        <input
                            type="email"
                            value={formData.billingEmail}
                            onChange={(e) => setFormData(prev => ({ ...prev, billingEmail: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
                    <input
                        type="text"
                        value={formData.address}
                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                        <input
                            type="text"
                            value={formData.postalCode}
                            onChange={(e) => setFormData(prev => ({ ...prev, postalCode: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Stad</label>
                        <input
                            type="text"
                            value={formData.city}
                            onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
                        <input
                            type="text"
                            value={formData.country}
                            onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">KvK Nummer</label>
                        <input
                            type="text"
                            value={formData.kvkNumber}
                            onChange={(e) => setFormData(prev => ({ ...prev, kvkNumber: e.target.value }))}
                            className="w-full px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
                        <input
                            type="text"
                            value={formData.iban}
                            onChange={(e) => setFormData(prev => ({ ...prev, iban: e.target.value }))}
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
            title={`Abonnement: ${association.name}`}
            onClose={onClose}
            onSubmit={() => onSubmit(formData)}
            isLoading={isLoading}
            submitLabel="Opslaan"
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Abonnement Tier</label>
                    <select
                        value={formData.subscriptionTier}
                        onChange={(e) => setFormData(prev => ({ ...prev, subscriptionTier: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                    >
                        {SUBSCRIPTION_TIERS.map(tier => (
                            <option key={tier.value} value={tier.value}>{tier.label}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Verloopt Op</label>
                    <input
                        type="date"
                        value={formData.subscriptionExpires}
                        onChange={(e) => setFormData(prev => ({ ...prev, subscriptionExpires: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Leden</label>
                        <input
                            type="number"
                            value={formData.maxMembers}
                            onChange={(e) => setFormData(prev => ({ ...prev, maxMembers: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            min="1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Orkesten</label>
                        <input
                            type="number"
                            value={formData.maxOrchestras}
                            onChange={(e) => setFormData(prev => ({ ...prev, maxOrchestras: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            min="1"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Opslag (MB)</label>
                        <input
                            type="number"
                            value={formData.maxStorageMb}
                            onChange={(e) => setFormData(prev => ({ ...prev, maxStorageMb: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 border rounded-lg"
                            min="100"
                        />
                    </div>
                </div>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    />
                    <span className="text-sm">Vereniging is actief</span>
                </label>
            </div>
        </FormModal>
    );
}

function InvitationsTab() {
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
        return <div className="text-center py-12 text-gray-500">Laden...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Uitnodigingen</h2>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <Icon name="plus" className="w-5 h-5" />
                    Uitnodigen
                </button>
            </div>

            {showAddForm && (
                <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="col-span-2">
                            <input
                                type="email"
                                placeholder="E-mailadres"
                                value={newInvite.email}
                                onChange={(e) => setNewInvite(prev => ({ ...prev, email: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <select
                            value={newInvite.role}
                            onChange={(e) => setNewInvite(prev => ({ ...prev, role: e.target.value as any }))}
                            className="px-3 py-2 border rounded-lg"
                        >
                            <option value="member">Lid</option>
                            <option value="board">Bestuur</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleCreate}
                            disabled={!newInvite.email || createInvitation.isPending}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
                        >
                            Versturen
                        </button>
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-3 py-1.5 border text-sm rounded-lg"
                        >
                            Annuleren
                        </button>
                    </div>
                </div>
            )}

            {!invitations || invitations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="envelope" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen uitnodigingen</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {invitations.map((invite: Invitation) => (
                        <div key={invite.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                            <div>
                                <div className="font-medium">{invite.email}</div>
                                <div className="text-sm text-gray-500">
                                    Rol: {invite.role} | Uitgenodigd door: {invite.invitedBy}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    invite.status === 'accepted' ? 'bg-green-100 text-green-800' :
                                    invite.status === 'expired' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                }`}>
                                    {invite.status === 'accepted' ? 'Geaccepteerd' :
                                     invite.status === 'expired' ? 'Verlopen' : 'Openstaand'}
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

function PartnershipsTab() {
    const { data: partnerships, isLoading } = usePartnerships();
    const approvePartnership = useApprovePartnership();
    const rejectPartnership = useRejectPartnership();
    const endPartnership = useEndPartnership();

    if (isLoading) {
        return <div className="text-center py-12 text-gray-500">Laden...</div>;
    }

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4">Partnerschappen</h2>

            {!partnerships || partnerships.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="link" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen partnerschappen</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {partnerships.map((partnership: Partnership) => (
                        <div key={partnership.id} className="border rounded-lg p-4 bg-white">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-medium text-lg">{partnership.partnerAssociationName}</div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {partnership.isOutgoing ? 'Uitgaand verzoek' : 'Binnenkomend verzoek'}
                                    </div>
                                    <div className="flex gap-4 mt-2 text-sm">
                                        {partnership.shareMusic && <span className="text-blue-600">Muziek delen</span>}
                                        {partnership.shareEvents && <span className="text-green-600">Events delen</span>}
                                        {partnership.shareMembers && <span className="text-purple-600">Leden delen</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        partnership.status === 'active' ? 'bg-green-100 text-green-800' :
                                        partnership.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {partnership.status === 'active' ? 'Actief' :
                                         partnership.status === 'rejected' ? 'Afgewezen' : 'In afwachting'}
                                    </span>

                                    {partnership.status === 'pending' && !partnership.isOutgoing && (
                                        <>
                                            <button
                                                onClick={() => approvePartnership.mutate(partnership.id)}
                                                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                            >
                                                Goedkeuren
                                            </button>
                                            <button
                                                onClick={() => rejectPartnership.mutate(partnership.id)}
                                                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                            >
                                                Afwijzen
                                            </button>
                                        </>
                                    )}

                                    {partnership.status === 'active' && (
                                        <button
                                            onClick={() => endPartnership.mutate(partnership.id)}
                                            className="px-3 py-1 border border-red-600 text-red-600 text-sm rounded hover:bg-red-50"
                                        >
                                            Beëindigen
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function MembersTab() {
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
        return <div className="text-center py-12 text-gray-500">Laden...</div>;
    }

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4">Leden</h2>

            {!members || members.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="users" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen leden gevonden</p>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Naam</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">E-mail</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Rol</th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Acties</th>
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
                                            onChange={(e) => updateRole.mutate({
                                                userId: member.userId,
                                                role: e.target.value as any,
                                            })}
                                            className="text-sm border rounded px-2 py-1"
                                        >
                                            <option value="member">Lid</option>
                                            <option value="board">Bestuur</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {member.status === 'active' ? 'Actief' : 'Inactief'}
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
                    title="Lid verwijderen"
                    message={`Weet je zeker dat je ${deletingMember.name} wilt verwijderen uit de vereniging?`}
                    confirmLabel="Verwijderen"
                    onConfirm={handleDelete}
                    onCancel={() => setDeletingMember(null)}
                    variant="danger"
                />
            )}
        </div>
    );
}

function SuperAdminsTab() {
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
        return <div className="text-center py-12 text-gray-500">Laden...</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Super Administrators</h2>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                    <Icon name="warning" className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                        <strong>Let op:</strong> Super admins hebben volledige toegang tot alle verenigingen en hun data.
                        Wees voorzichtig met wie je deze rechten geeft.
                    </div>
                </div>
            </div>

            {!superAdmins || superAdmins.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="shield" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen super admins gevonden</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {superAdmins.map((admin: SuperAdmin) => (
                        <div key={admin.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                            <div>
                                <div className="font-medium">{admin.name}</div>
                                <div className="text-sm text-gray-500">{admin.email}</div>
                            </div>
                            <button
                                onClick={() => setDeletingAdmin(admin)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded"
                            >
                                <Icon name="trash" className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {deletingAdmin && (
                <ConfirmDialog
                    title="Super Admin verwijderen"
                    message={`Weet je zeker dat je ${deletingAdmin.name} als super admin wilt verwijderen?`}
                    confirmLabel="Verwijderen"
                    onConfirm={handleDelete}
                    onCancel={() => setDeletingAdmin(null)}
                    variant="danger"
                />
            )}
        </div>
    );
}

function ActivityTab() {
    const { data: activityLog, isLoading } = useActivityLog({ limit: 50 });

    if (isLoading) {
        return <div className="text-center py-12 text-gray-500">Laden...</div>;
    }

    const getActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            association_created: 'Vereniging aangemaakt',
            subscription_updated: 'Abonnement bijgewerkt',
            invitation_sent: 'Uitnodiging verstuurd',
            invitation_accepted: 'Uitnodiging geaccepteerd',
            partnership_requested: 'Partnerschap aangevraagd',
            partnership_approved: 'Partnerschap goedgekeurd',
            partnership_rejected: 'Partnerschap afgewezen',
            member_role_changed: 'Rol gewijzigd',
            member_removed: 'Lid verwijderd',
        };
        return labels[action] || action;
    };

    return (
        <div>
            <h2 className="text-lg font-semibold mb-4">Activiteitenlog</h2>

            {!activityLog || activityLog.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Icon name="clock" className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Geen activiteiten gevonden</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {activityLog.map((entry: any) => (
                        <div key={entry.id} className="flex items-start gap-4 p-4 border rounded-lg bg-white">
                            <div className="flex-1">
                                <div className="font-medium">{getActionLabel(entry.action)}</div>
                                {entry.userName && (
                                    <div className="text-sm text-gray-600">Door: {entry.userName}</div>
                                )}
                                {entry.details && Object.keys(entry.details).length > 0 && (
                                    <div className="text-sm text-gray-500 mt-1">
                                        {Object.entries(entry.details).map(([key, value]) => (
                                            <span key={key} className="mr-4">{key}: {String(value)}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="text-sm text-gray-500">
                                {new Date(entry.createdAt).toLocaleString('nl-NL')}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
