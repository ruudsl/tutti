import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  checkIsSuperAdmin,
  getSuperAdminAssociations,
  createAssociationAsSuperAdmin,
  updateAssociationAsSuperAdmin,
  updateAssociationSubscription,
  deleteAssociationAsSuperAdmin,
  getSuperAdmins,
  addSuperAdmin,
  removeSuperAdmin,
  getMyAssociations,
  switchAssociation,
  getInvitations,
  createInvitation,
  deleteInvitation,
  getInvitationDetails,
  acceptInvitation,
  getPartnerships,
  requestPartnership,
  getPartnerMusic,
  getPartnerEvents,
  approvePartnership,
  rejectPartnership,
  endPartnership,
  shareEvent,
  unshareEvent,
  getActivityLog,
  getAssociationMembers,
  updateMemberRole,
  removeMember,
  Association,
} from '../api/multi-association';

// ===========================================
// SUPER ADMIN
// ===========================================

export function useIsSuperAdmin() {
  return useQuery({
    queryKey: ['isSuperAdmin'],
    queryFn: checkIsSuperAdmin,
  });
}

export function useSuperAdminAssociations() {
  return useQuery({
    queryKey: ['superAdminAssociations'],
    queryFn: getSuperAdminAssociations,
  });
}

export function useCreateAssociationAsSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Association>) => createAssociationAsSuperAdmin(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminAssociations'] });
    },
  });
}

export function useUpdateAssociationAsSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Association> }) => updateAssociationAsSuperAdmin(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminAssociations'] });
    },
  });
}

export function useUpdateAssociationSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        subscriptionTier?: string;
        subscriptionExpires?: string;
        maxMembers?: number;
        maxOrchestras?: number;
        maxStorageMb?: number;
        isActive?: boolean;
      };
    }) => updateAssociationSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminAssociations'] });
    },
  });
}

export function useDeleteAssociationAsSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAssociationAsSuperAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdminAssociations'] });
    },
  });
}

export function useSuperAdmins() {
  return useQuery({
    queryKey: ['superAdmins'],
    queryFn: getSuperAdmins,
  });
}

export function useAddSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions?: string[] }) =>
      addSuperAdmin(userId, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdmins'] });
    },
  });
}

export function useRemoveSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => removeSuperAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superAdmins'] });
    },
  });
}

// ===========================================
// MY ASSOCIATIONS
// ===========================================

export function useMyAssociations() {
  return useQuery({
    queryKey: ['myAssociations'],
    queryFn: getMyAssociations,
  });
}

export function useSwitchAssociation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (associationId: string) => switchAssociation(associationId),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

// ===========================================
// INVITATIONS
// ===========================================

export function useInvitations() {
  return useQuery({
    queryKey: ['invitations'],
    queryFn: getInvitations,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, role }: { email: string; role?: 'member' | 'board' | 'admin' }) =>
      createInvitation(email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

export function useInvitationDetails(token: string | undefined) {
  return useQuery({
    queryKey: ['invitationDetails', token],
    queryFn: () => getInvitationDetails(token!),
    enabled: !!token,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => acceptInvitation(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myAssociations'] });
    },
  });
}

// ===========================================
// PARTNERSHIPS
// ===========================================

export function usePartnerships() {
  return useQuery({
    queryKey: ['partnerships'],
    queryFn: getPartnerships,
  });
}

/** De muziektitels die partners hebben opengesteld. */
export function usePartnerMusic() {
  return useQuery({
    queryKey: ['partner-music'],
    queryFn: getPartnerMusic,
  });
}

/** De aankomende concerten van partners. */
export function usePartnerEvents() {
  return useQuery({
    queryKey: ['partner-events'],
    queryFn: getPartnerEvents,
  });
}

export function useRequestPartnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      targetAssociationId: string;
      shareMusic?: boolean;
      shareEvents?: boolean;
      shareMembers?: boolean;
      notes?: string;
    }) => requestPartnership(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      // Goedkeuren, afwijzen en beeindigen veranderen ook wat er gedeeld wordt.
      queryClient.invalidateQueries({ queryKey: ['partner-music'] });
      queryClient.invalidateQueries({ queryKey: ['partner-events'] });
    },
  });
}

export function useApprovePartnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => approvePartnership(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      // Goedkeuren, afwijzen en beeindigen veranderen ook wat er gedeeld wordt.
      queryClient.invalidateQueries({ queryKey: ['partner-music'] });
      queryClient.invalidateQueries({ queryKey: ['partner-events'] });
    },
  });
}

export function useRejectPartnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rejectPartnership(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      // Goedkeuren, afwijzen en beeindigen veranderen ook wat er gedeeld wordt.
      queryClient.invalidateQueries({ queryKey: ['partner-music'] });
      queryClient.invalidateQueries({ queryKey: ['partner-events'] });
    },
  });
}

export function useEndPartnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => endPartnership(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerships'] });
      // Goedkeuren, afwijzen en beeindigen veranderen ook wat er gedeeld wordt.
      queryClient.invalidateQueries({ queryKey: ['partner-music'] });
      queryClient.invalidateQueries({ queryKey: ['partner-events'] });
    },
  });
}

// ===========================================
// SHARED EVENTS
// ===========================================

export function useShareEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      targetAssociationId,
      options,
    }: {
      eventId: string;
      targetAssociationId: string;
      options?: { canEdit?: boolean; canAddMembers?: boolean };
    }) => shareEvent(eventId, targetAssociationId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useUnshareEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, associationId }: { eventId: string; associationId: string }) =>
      unshareEvent(eventId, associationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

// ===========================================
// ACTIVITY LOG
// ===========================================

export function useActivityLog(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['activityLog', params],
    queryFn: () => getActivityLog(params),
  });
}

// ===========================================
// MEMBERS
// ===========================================

export function useAssociationMembers() {
  return useQuery({
    queryKey: ['associationMembers'],
    queryFn: getAssociationMembers,
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'member' | 'board' | 'admin' }) =>
      updateMemberRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['associationMembers'] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['associationMembers'] });
    },
  });
}
