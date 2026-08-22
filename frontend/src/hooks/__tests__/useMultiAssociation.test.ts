import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// De hele multi-association-api wordt vervangen. Association wordt door de
// hook alleen als type gebruikt, maar staat wel in dezelfde import-regel.
vi.mock('../../api/multi-association', () => ({
  checkIsSuperAdmin: vi.fn(),
  getSuperAdminAssociations: vi.fn(),
  createAssociationAsSuperAdmin: vi.fn(),
  updateAssociationAsSuperAdmin: vi.fn(),
  updateAssociationSubscription: vi.fn(),
  deleteAssociationAsSuperAdmin: vi.fn(),
  getSuperAdmins: vi.fn(),
  addSuperAdmin: vi.fn(),
  removeSuperAdmin: vi.fn(),
  getMyAssociations: vi.fn(),
  switchAssociation: vi.fn(),
  getInvitations: vi.fn(),
  createInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  getInvitationDetails: vi.fn(),
  acceptInvitation: vi.fn(),
  getPartnerships: vi.fn(),
  requestPartnership: vi.fn(),
  getPartnerMusic: vi.fn(),
  getPartnerEvents: vi.fn(),
  approvePartnership: vi.fn(),
  rejectPartnership: vi.fn(),
  endPartnership: vi.fn(),
  shareEvent: vi.fn(),
  unshareEvent: vi.fn(),
  getActivityLog: vi.fn(),
  getAssociationMembers: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  Association: {},
}));

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
  useMyAssociations,
  useSwitchAssociation,
  useInvitations,
  useCreateInvitation,
  useDeleteInvitation,
  useInvitationDetails,
  useAcceptInvitation,
  usePartnerships,
  usePartnerMusic,
  usePartnerEvents,
  useRequestPartnership,
  useApprovePartnership,
  useRejectPartnership,
  useEndPartnership,
  useShareEvent,
  useUnshareEvent,
  useActivityLog,
  useAssociationMembers,
  useUpdateMemberRole,
  useRemoveMember,
} from '../useMultiAssociation';
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
} from '../../api/multi-association';

/** De api is gemockt; TypeScript kent alleen nog de echte signatuur. */
const alsMock = (fn: unknown) => fn as Mock;

let queryClient: QueryClient;
/** Alle queryKeys die de hooks ongeldig hebben gemaakt, in volgorde. */
let ongeldigGemaakt: unknown[];

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: {
      // retry:false, anders wacht een faaltest op de herhaalpogingen.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  ongeldigGemaakt = [];
  const echteInvalidatie = queryClient.invalidateQueries.bind(queryClient);
  vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters?: unknown) => {
    ongeldigGemaakt.push((filters as { queryKey?: unknown })?.queryKey);
    return echteInvalidatie(filters as never);
  });
});

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

/** Controleert of precies deze queryKey ongeldig is gemaakt. */
const isOngeldigGemaakt = (key: unknown[]) => ongeldigGemaakt.some((k) => JSON.stringify(k) === JSON.stringify(key));

// ==================== SUPERBEHEER ====================

describe('useMultiAssociation - superbeheer', () => {
  it('meldt of de gebruiker superbeheerder is', async () => {
    alsMock(checkIsSuperAdmin).mockResolvedValue({ isSuperAdmin: true, permissions: ['all'] });

    const { result } = renderHook(() => useIsSuperAdmin(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ isSuperAdmin: true, permissions: ['all'] });
  });

  it('geeft geen superbeheerdersrechten als de controle mislukt', async () => {
    // Belangrijk: bij een fout mag er geen data blijven staan waarop het
    // scherm per ongeluk het beheerpaneel opent.
    alsMock(checkIsSuperAdmin).mockRejectedValue(new Error('403'));

    const { result } = renderHook(() => useIsSuperAdmin(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('haalt alle verenigingen op voor de superbeheerder', async () => {
    alsMock(getSuperAdminAssociations).mockResolvedValue([{ id: 'v1', name: 'Harmonie' }]);

    const { result } = renderHook(() => useSuperAdminAssociations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSuperAdminAssociations).toHaveBeenCalledTimes(1);
  });

  it('maakt een vereniging aan en vernieuwt de verenigingenlijst', async () => {
    alsMock(createAssociationAsSuperAdmin).mockResolvedValue({ id: 'v9' });

    const { result } = renderHook(() => useCreateAssociationAsSuperAdmin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: 'Nieuwe vereniging' });
    });

    expect(createAssociationAsSuperAdmin).toHaveBeenCalledWith({ name: 'Nieuwe vereniging' });
    expect(isOngeldigGemaakt(['superAdminAssociations'])).toBe(true);
  });

  it('wijzigt een vereniging met id en velden gescheiden', async () => {
    alsMock(updateAssociationAsSuperAdmin).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateAssociationAsSuperAdmin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'v1', data: { name: 'Andere naam' } });
    });

    expect(updateAssociationAsSuperAdmin).toHaveBeenCalledWith('v1', { name: 'Andere naam' });
    expect(isOngeldigGemaakt(['superAdminAssociations'])).toBe(true);
  });

  it('past het abonnement aan en vernieuwt de verenigingenlijst', async () => {
    alsMock(updateAssociationSubscription).mockResolvedValue(undefined);
    const abonnement = { subscriptionTier: 'pro', maxMembers: 200 };

    const { result } = renderHook(() => useUpdateAssociationSubscription(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'v1', data: abonnement });
    });

    // De lijst toont het aantal leden met de grens erbij, dus die moet mee.
    expect(updateAssociationSubscription).toHaveBeenCalledWith('v1', abonnement);
    expect(isOngeldigGemaakt(['superAdminAssociations'])).toBe(true);
  });

  it('verwijdert een vereniging en vernieuwt de verenigingenlijst', async () => {
    alsMock(deleteAssociationAsSuperAdmin).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteAssociationAsSuperAdmin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('v1');
    });

    expect(deleteAssociationAsSuperAdmin).toHaveBeenCalledWith('v1');
    expect(isOngeldigGemaakt(['superAdminAssociations'])).toBe(true);
  });

  it('raakt de cache niet aan als het verwijderen van een vereniging mislukt', async () => {
    alsMock(deleteAssociationAsSuperAdmin).mockRejectedValue(new Error('Vereniging heeft nog leden'));

    const { result } = renderHook(() => useDeleteAssociationAsSuperAdmin(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('v1')).rejects.toThrow('Vereniging heeft nog leden');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });

  it('haalt de superbeheerders op', async () => {
    alsMock(getSuperAdmins).mockResolvedValue([]);

    const { result } = renderHook(() => useSuperAdmins(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('voegt een superbeheerder toe met gebruiker en rechten als losse argumenten', async () => {
    alsMock(addSuperAdmin).mockResolvedValue({ id: 's1' });

    const { result } = renderHook(() => useAddSuperAdmin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u1', permissions: ['associations'] });
    });

    expect(addSuperAdmin).toHaveBeenCalledWith('u1', ['associations']);
    expect(isOngeldigGemaakt(['superAdmins'])).toBe(true);
  });

  it('verwijdert een superbeheerder en vernieuwt de superbeheerderslijst', async () => {
    alsMock(removeSuperAdmin).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveSuperAdmin(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('s1');
    });

    expect(removeSuperAdmin).toHaveBeenCalledWith('s1');
    expect(isOngeldigGemaakt(['superAdmins'])).toBe(true);
  });
});

// ==================== EIGEN VERENIGINGEN EN WISSELEN ====================

describe('useMultiAssociation - eigen verenigingen', () => {
  it('haalt de eigen verenigingen op', async () => {
    alsMock(getMyAssociations).mockResolvedValue([{ id: 'v1', name: 'Harmonie' }]);

    const { result } = renderHook(() => useMyAssociations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMyAssociations).toHaveBeenCalledTimes(1);
  });

  it('gooit bij het wisselen van vereniging de hele cache leeg', async () => {
    // Na een wissel hoort geen enkel antwoord van de vorige vereniging meer
    // in beeld te komen. invalidateQueries zonder filter raakt alles; een
    // gerichte sleutel zou hier juist fout zijn.
    alsMock(switchAssociation).mockResolvedValue({ message: 'ok', associationId: 'v2', token: 'jwt' });

    const { result } = renderHook(() => useSwitchAssociation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('v2');
    });

    expect(switchAssociation).toHaveBeenCalledWith('v2');
    expect(ongeldigGemaakt).toEqual([undefined]);
  });

  it('haalt na een wissel een openstaande query daadwerkelijk opnieuw op', async () => {
    // Niet alleen dat invalidateQueries is aangeroepen: een query die op dat
    // moment op het scherm staat moet ook echt opnieuw ophalen, anders ziet
    // de gebruiker na het wisselen nog de gegevens van de vorige vereniging.
    alsMock(getMyAssociations).mockResolvedValue([{ id: 'v1', name: 'Harmonie' }]);
    alsMock(switchAssociation).mockResolvedValue({ message: 'ok', associationId: 'v2', token: 'jwt' });

    const { result } = renderHook(() => ({ lijst: useMyAssociations(), wissel: useSwitchAssociation() }), { wrapper });

    await waitFor(() => expect(result.current.lijst.isSuccess).toBe(true));
    expect(getMyAssociations).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.wissel.mutateAsync('v2');
    });

    await waitFor(() => expect(getMyAssociations).toHaveBeenCalledTimes(2));
  });
});

// ==================== UITNODIGINGEN ====================

describe('useMultiAssociation - uitnodigingen', () => {
  it('haalt de openstaande uitnodigingen op', async () => {
    alsMock(getInvitations).mockResolvedValue([]);

    const { result } = renderHook(() => useInvitations(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('verstuurt een uitnodiging met e-mail en rol als losse argumenten', async () => {
    alsMock(createInvitation).mockResolvedValue({ id: 'i1', inviteUrl: 'https://x/y' });

    const { result } = renderHook(() => useCreateInvitation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: 'jan@example.org', role: 'board' });
    });

    expect(createInvitation).toHaveBeenCalledWith('jan@example.org', 'board');
    expect(isOngeldigGemaakt(['invitations'])).toBe(true);
  });

  it('vernieuwt na het versturen van een uitnodiging ook het activiteitenlogboek', async () => {
    // De backend schrijft 'invitation_sent' in het logboek
    // (routes/multi-association.ts: logActivity(..., 'invitation_sent', ...)).
    // Het logboek staat als tabblad op dezelfde pagina als de uitnodigingen,
    // en de app hanteert een staleTime van vijf minuten
    // (lib/queryClient.ts), dus zonder invalidatie ontbreekt de zojuist
    // verstuurde uitnodiging minutenlang in het logboek.
    alsMock(createInvitation).mockResolvedValue({ id: 'i1', inviteUrl: 'https://x/y' });

    const { result } = renderHook(() => useCreateInvitation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: 'jan@example.org' });
    });

    expect(isOngeldigGemaakt(['activityLog'])).toBe(true);
  });

  it('trekt een uitnodiging in en vernieuwt de uitnodigingenlijst', async () => {
    alsMock(deleteInvitation).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteInvitation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('i1');
    });

    expect(deleteInvitation).toHaveBeenCalledWith('i1');
    expect(isOngeldigGemaakt(['invitations'])).toBe(true);
  });

  it('vraagt de uitnodigingsgegevens pas op als er een token in de link staat', async () => {
    const { result, rerender } = renderHook(({ token }: { token: string | undefined }) => useInvitationDetails(token), {
      wrapper,
      initialProps: { token: undefined as string | undefined },
    });

    expect(getInvitationDetails).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');

    alsMock(getInvitationDetails).mockResolvedValue({ associationName: 'Harmonie', email: 'jan@example.org' });
    rerender({ token: 'abc123' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getInvitationDetails).toHaveBeenCalledWith('abc123');
  });

  it('accepteert een uitnodiging en vernieuwt de eigen verenigingen', async () => {
    // Na het accepteren hoort de nieuwe vereniging in de verenigingskiezer
    // te staan.
    alsMock(acceptInvitation).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAcceptInvitation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('abc123');
    });

    expect(acceptInvitation).toHaveBeenCalledWith('abc123');
    expect(isOngeldigGemaakt(['myAssociations'])).toBe(true);
  });

  it('voegt niets aan de eigen verenigingen toe als de uitnodiging verlopen is', async () => {
    alsMock(acceptInvitation).mockRejectedValue(new Error('Uitnodiging is verlopen'));

    const { result } = renderHook(() => useAcceptInvitation(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('abc123')).rejects.toThrow('Uitnodiging is verlopen');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== SAMENWERKINGEN ====================

describe('useMultiAssociation - samenwerkingen', () => {
  it('haalt de samenwerkingen op', async () => {
    alsMock(getPartnerships).mockResolvedValue([]);

    const { result } = renderHook(() => usePartnerships(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPartnerships).toHaveBeenCalledTimes(1);
  });

  it('haalt de gedeelde muziek en concerten van partners op onder eigen sleutels', async () => {
    alsMock(getPartnerMusic).mockResolvedValue([{ id: 'm1' }]);
    alsMock(getPartnerEvents).mockResolvedValue([{ id: 'c1' }]);

    const { result } = renderHook(() => ({ muziek: usePartnerMusic(), concerten: usePartnerEvents() }), { wrapper });

    await waitFor(() => expect(result.current.muziek.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.concerten.isSuccess).toBe(true));
    expect(result.current.muziek.data).toEqual([{ id: 'm1' }]);
    expect(result.current.concerten.data).toEqual([{ id: 'c1' }]);
  });

  it('vraagt een samenwerking aan en vernieuwt samenwerkingen, muziek en concerten', async () => {
    alsMock(requestPartnership).mockResolvedValue({ id: 'p1' });
    const aanvraag = { targetAssociationId: 'v2', shareMusic: true, shareEvents: true };

    const { result } = renderHook(() => useRequestPartnership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(aanvraag);
    });

    expect(requestPartnership).toHaveBeenCalledWith(aanvraag);
    expect(isOngeldigGemaakt(['partnerships'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-music'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-events'])).toBe(true);
  });

  it('keurt een samenwerking goed en vernieuwt wat er gedeeld wordt', async () => {
    // Zodra de samenwerking loopt, komt er muziek en komen er concerten bij.
    // Blijven die sleutels staan, dan blijft het scherm "geen gedeelde
    // muziek" tonen terwijl de samenwerking wel actief is.
    alsMock(approvePartnership).mockResolvedValue(undefined);

    const { result } = renderHook(() => useApprovePartnership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(approvePartnership).toHaveBeenCalledWith('p1');
    expect(isOngeldigGemaakt(['partnerships'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-music'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-events'])).toBe(true);
  });

  it('wijst een samenwerking af en vernieuwt wat er gedeeld wordt', async () => {
    alsMock(rejectPartnership).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRejectPartnership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(rejectPartnership).toHaveBeenCalledWith('p1');
    expect(isOngeldigGemaakt(['partnerships'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-music'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-events'])).toBe(true);
  });

  it('beeindigt een samenwerking en haalt de gedeelde muziek en concerten weg', async () => {
    alsMock(endPartnership).mockResolvedValue(undefined);

    const { result } = renderHook(() => useEndPartnership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(endPartnership).toHaveBeenCalledWith('p1');
    expect(isOngeldigGemaakt(['partnerships'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-music'])).toBe(true);
    expect(isOngeldigGemaakt(['partner-events'])).toBe(true);
  });

  it('vernieuwt na een goedgekeurde samenwerking ook het activiteitenlogboek', async () => {
    // De backend logt 'partnership_approved'; het logboek staat als tabblad
    // op dezelfde pagina.
    alsMock(approvePartnership).mockResolvedValue(undefined);

    const { result } = renderHook(() => useApprovePartnership(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('p1');
    });

    expect(isOngeldigGemaakt(['activityLog'])).toBe(true);
  });

  it('raakt de cache niet aan als het goedkeuren mislukt', async () => {
    alsMock(approvePartnership).mockRejectedValue(new Error('Samenwerking is al beëindigd'));

    const { result } = renderHook(() => useApprovePartnership(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('p1')).rejects.toThrow('Samenwerking is al beëindigd');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });
});

// ==================== GEDEELDE EVENEMENTEN ====================

describe('useMultiAssociation - gedeelde evenementen', () => {
  it('deelt een evenement met vereniging en opties en vernieuwt de evenementen', async () => {
    alsMock(shareEvent).mockResolvedValue(undefined);

    const { result } = renderHook(() => useShareEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        eventId: 'e1',
        targetAssociationId: 'v2',
        options: { canEdit: true },
      });
    });

    expect(shareEvent).toHaveBeenCalledWith('e1', 'v2', { canEdit: true });
    expect(isOngeldigGemaakt(['events'])).toBe(true);
  });

  it('deelt zonder opties als de gebruiker niets aanvinkt', async () => {
    alsMock(shareEvent).mockResolvedValue(undefined);

    const { result } = renderHook(() => useShareEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', targetAssociationId: 'v2' });
    });

    expect(shareEvent).toHaveBeenCalledWith('e1', 'v2', undefined);
  });

  it('haalt een evenement weer bij een vereniging weg en vernieuwt de evenementen', async () => {
    alsMock(unshareEvent).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUnshareEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ eventId: 'e1', associationId: 'v2' });
    });

    expect(unshareEvent).toHaveBeenCalledWith('e1', 'v2');
    expect(isOngeldigGemaakt(['events'])).toBe(true);
  });
});

// ==================== ACTIVITEITENLOGBOEK ====================

describe('useMultiAssociation - activiteitenlogboek', () => {
  it('geeft de paginering door aan de api', async () => {
    alsMock(getActivityLog).mockResolvedValue([]);

    const { result } = renderHook(() => useActivityLog({ limit: 50 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getActivityLog).toHaveBeenCalledWith({ limit: 50 });
  });

  it('haalt bij een andere offset daadwerkelijk opnieuw op', async () => {
    // De paginering zit in de queryKey; anders levert "volgende" dezelfde
    // regels op uit de cache.
    alsMock(getActivityLog).mockResolvedValue([]);

    const { result, rerender } = renderHook(({ offset }: { offset: number }) => useActivityLog({ limit: 50, offset }), {
      wrapper,
      initialProps: { offset: 0 },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ offset: 50 });

    await waitFor(() => expect(getActivityLog).toHaveBeenCalledTimes(2));
    expect(getActivityLog).toHaveBeenLastCalledWith({ limit: 50, offset: 50 });
  });
});

// ==================== LEDEN ====================

describe('useMultiAssociation - leden', () => {
  it('haalt de leden van de vereniging op', async () => {
    alsMock(getAssociationMembers).mockResolvedValue([{ id: 'u1', role: 'member' }]);

    const { result } = renderHook(() => useAssociationMembers(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'u1', role: 'member' }]);
  });

  it('wijzigt een rol met gebruiker en rol als losse argumenten', async () => {
    alsMock(updateMemberRole).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateMemberRole(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u1', role: 'admin' });
    });

    expect(updateMemberRole).toHaveBeenCalledWith('u1', 'admin');
    expect(isOngeldigGemaakt(['associationMembers'])).toBe(true);
  });

  it('vernieuwt na een rolwijziging ook het activiteitenlogboek', async () => {
    // De backend logt 'member_role_changed'.
    alsMock(updateMemberRole).mockResolvedValue(undefined);

    const { result } = renderHook(() => useUpdateMemberRole(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u1', role: 'admin' });
    });

    expect(isOngeldigGemaakt(['activityLog'])).toBe(true);
  });

  it('verwijdert een lid en vernieuwt de ledenlijst', async () => {
    alsMock(removeMember).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveMember(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('u1');
    });

    expect(removeMember).toHaveBeenCalledWith('u1');
    expect(isOngeldigGemaakt(['associationMembers'])).toBe(true);
  });

  it('vernieuwt na het verwijderen van een lid ook het activiteitenlogboek', async () => {
    // De backend logt 'member_removed'.
    alsMock(removeMember).mockResolvedValue(undefined);

    const { result } = renderHook(() => useRemoveMember(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('u1');
    });

    expect(isOngeldigGemaakt(['activityLog'])).toBe(true);
  });

  it('laat de ledenlijst met rust als het verwijderen mislukt', async () => {
    alsMock(removeMember).mockRejectedValue(new Error('Laatste beheerder kan niet verwijderd worden'));

    const { result } = renderHook(() => useRemoveMember(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('u1')).rejects.toThrow('Laatste beheerder kan niet verwijderd worden');
    });

    expect(ongeldigGemaakt).toHaveLength(0);
  });
});
