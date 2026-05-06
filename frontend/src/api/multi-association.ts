import api from './client';

// Types
export interface Association {
    id: string;
    name: string;
    displayName?: string;
    slug?: string;
    logoPath?: string;
    website?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    billingEmail?: string;
    kvkNumber?: string;
    iban?: string;
    parentId?: string;
    parentName?: string;
    subscriptionTier?: string;
    subscriptionExpires?: string;
    maxMembers?: number;
    maxOrchestras?: number;
    maxStorageMb?: number;
    isActive: boolean;
    memberCount?: number;
    orchestraCount?: number;
    createdAt: string;
}

export interface MyAssociation {
    id: string;
    name: string;
    displayName?: string;
    slug?: string;
    myRole: string;
    isPrimary: boolean;
    joinedAt?: string;
}

export interface Invitation {
    id: string;
    email: string;
    role: string;
    invitedBy: string;
    expiresAt: string;
    acceptedAt?: string;
    createdAt: string;
    status: 'pending' | 'accepted' | 'expired';
}

export interface InvitationDetails {
    email: string;
    associationName: string;
    role: string;
    expiresAt: string;
}

export interface Partnership {
    id: string;
    partnerAssociationId: string;
    partnerAssociationName: string;
    partnershipType: string;
    shareMusic: boolean;
    shareEvents: boolean;
    shareMembers: boolean;
    status: 'pending' | 'active' | 'rejected';
    requestedByName: string;
    approvedByName?: string;
    approvedAt?: string;
    notes?: string;
    isOutgoing: boolean;
    createdAt: string;
}

export interface AssociationMember {
    userId: string;
    email: string;
    name: string;
    role: string;
    isPrimary: boolean;
    status: string;
    userStatus: string;
    invitedByName?: string;
    joinedAt: string;
}

export interface SuperAdmin {
    id: string;
    userId: string;
    email: string;
    name: string;
    permissions: string[];
    createdAt: string;
}

export interface ActivityLogEntry {
    id: string;
    userId?: string;
    userName?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    createdAt: string;
}

// ===========================================
// SUPER ADMIN ROUTES
// ===========================================

export async function getSuperAdminAssociations(): Promise<Association[]> {
    const response = await api.get('/multi-association/super-admin/associations');
    return response.data;
}

export async function createAssociationAsSuperAdmin(data: Partial<Association>): Promise<{ id: string; slug: string }> {
    const response = await api.post('/multi-association/super-admin/associations', data);
    return response.data;
}

export async function updateAssociationAsSuperAdmin(id: string, data: Partial<Association>): Promise<void> {
    await api.put(`/multi-association/super-admin/associations/${id}`, data);
}

export async function updateAssociationSubscription(id: string, data: {
    subscriptionTier?: string;
    subscriptionExpires?: string;
    maxMembers?: number;
    maxOrchestras?: number;
    maxStorageMb?: number;
    isActive?: boolean;
}): Promise<void> {
    await api.put(`/multi-association/super-admin/associations/${id}/subscription`, data);
}

export async function deleteAssociationAsSuperAdmin(id: string): Promise<void> {
    await api.delete(`/multi-association/super-admin/associations/${id}`);
}

export async function getSuperAdmins(): Promise<SuperAdmin[]> {
    const response = await api.get('/multi-association/super-admin/super-admins');
    return response.data;
}

export async function addSuperAdmin(userId: string, permissions?: string[]): Promise<{ id: string }> {
    const response = await api.post('/multi-association/super-admin/super-admins', { userId, permissions });
    return response.data;
}

export async function removeSuperAdmin(id: string): Promise<void> {
    await api.delete(`/multi-association/super-admin/super-admins/${id}`);
}

// ===========================================
// USER MULTI-ASSOCIATION
// ===========================================

export async function getMyAssociations(): Promise<MyAssociation[]> {
    const response = await api.get('/multi-association/my-associations');
    return response.data;
}

export async function switchAssociation(associationId: string): Promise<{ message: string; associationId: string }> {
    const response = await api.post('/multi-association/switch-association', { associationId });
    return response.data;
}

// ===========================================
// INVITATIONS
// ===========================================

export async function getInvitations(): Promise<Invitation[]> {
    const response = await api.get('/multi-association/invitations');
    return response.data;
}

export async function createInvitation(email: string, role: 'member' | 'board' | 'admin' = 'member'): Promise<{ id: string; inviteUrl: string }> {
    const response = await api.post('/multi-association/invitations', { email, role });
    return response.data;
}

export async function deleteInvitation(id: string): Promise<void> {
    await api.delete(`/multi-association/invitations/${id}`);
}

export async function getInvitationDetails(token: string): Promise<InvitationDetails> {
    const response = await api.get(`/multi-association/invitations/accept/${token}`);
    return response.data;
}

export async function acceptInvitation(token: string): Promise<void> {
    await api.post(`/multi-association/invitations/accept/${token}`);
}

// ===========================================
// PARTNERSHIPS
// ===========================================

export async function getPartnerships(): Promise<Partnership[]> {
    const response = await api.get('/multi-association/partnerships');
    return response.data;
}

export async function requestPartnership(data: {
    targetAssociationId: string;
    shareMusic?: boolean;
    shareEvents?: boolean;
    shareMembers?: boolean;
    notes?: string;
}): Promise<{ id: string }> {
    const response = await api.post('/multi-association/partnerships', data);
    return response.data;
}

export async function approvePartnership(id: string): Promise<void> {
    await api.put(`/multi-association/partnerships/${id}/approve`);
}

export async function rejectPartnership(id: string): Promise<void> {
    await api.put(`/multi-association/partnerships/${id}/reject`);
}

export async function endPartnership(id: string): Promise<void> {
    await api.delete(`/multi-association/partnerships/${id}`);
}

// ===========================================
// SHARED EVENTS
// ===========================================

export async function shareEvent(eventId: string, targetAssociationId: string, options?: {
    canEdit?: boolean;
    canAddMembers?: boolean;
}): Promise<void> {
    await api.post(`/multi-association/events/${eventId}/share`, {
        targetAssociationId,
        ...options,
    });
}

export async function unshareEvent(eventId: string, associationId: string): Promise<void> {
    await api.delete(`/multi-association/events/${eventId}/share/${associationId}`);
}

// ===========================================
// ACTIVITY LOG
// ===========================================

export async function getActivityLog(params?: { limit?: number; offset?: number }): Promise<ActivityLogEntry[]> {
    const response = await api.get('/multi-association/activity-log', { params });
    return response.data;
}

// ===========================================
// MEMBERS
// ===========================================

export async function getAssociationMembers(): Promise<AssociationMember[]> {
    const response = await api.get('/multi-association/members');
    return response.data;
}

export async function updateMemberRole(userId: string, role: 'member' | 'board' | 'admin'): Promise<void> {
    await api.put(`/multi-association/members/${userId}/role`, { role });
}

export async function removeMember(userId: string): Promise<void> {
    await api.delete(`/multi-association/members/${userId}`);
}
