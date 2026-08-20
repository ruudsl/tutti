/**
 * Hooks voor het delen van muziek tussen verenigingen.
 *
 * Eén plek waar de sleutels van de cache staan, zodat een wijziging aan de ene
 * kant het scherm aan de andere kant meeneemt: een deling intrekken verandert
 * ook het overzicht, en een verzoek goedkeuren verandert de catalogus.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/music-sharing';

const SLEUTELS = {
  partners: ['muziek-delen', 'partners'] as const,
  catalogus: (zoekterm: string) => ['muziek-delen', 'catalogus', zoekterm] as const,
  catalogusTitel: (id: string) => ['muziek-delen', 'catalogus', 'titel', id] as const,
  titelDeling: (id: string) => ['muziek-delen', 'titel', id] as const,
  binnengekomen: ['muziek-delen', 'verzoeken', 'binnen'] as const,
  eigenVerzoeken: ['muziek-delen', 'verzoeken', 'eigen'] as const,
  oproepen: (status: string) => ['muziek-delen', 'oproepen', status] as const,
  antwoorden: (id: string) => ['muziek-delen', 'oproepen', id, 'antwoorden'] as const,
  overzicht: ['muziek-delen', 'overzicht'] as const,
};

/** Alles wat van een koppeling afhangt. */
function vernieuwAlles(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: ['muziek-delen'] });
}

export function usePartners() {
  return useQuery({ queryKey: SLEUTELS.partners, queryFn: api.haalPartners });
}

export function useMaakKoppelcode() {
  return useMutation({ mutationFn: api.maakKoppelcode });
}

export function useWisselKoppelcodeIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.wisselKoppelcodeIn,
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useBeeindigKoppeling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.beeindigKoppeling,
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useTitelDeling(titleId: string | null) {
  return useQuery({
    queryKey: SLEUTELS.titelDeling(titleId ?? ''),
    queryFn: () => api.haalTitelDeling(titleId as string),
    enabled: !!titleId,
  });
}

export function useZetTitelDeling() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ titleId, partnerIds }: { titleId: string; partnerIds: string[] }) =>
      api.zetTitelDeling(titleId, partnerIds),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useSluitPartijUit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pieceId, reason }: { pieceId: string; reason?: string }) => api.sluitPartijUit(pieceId, reason),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useDeelPartijWeer() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.deelPartijWeer, onSuccess: () => vernieuwAlles(queryClient) });
}

export function useCatalogus(zoekterm: string) {
  return useQuery({
    queryKey: SLEUTELS.catalogus(zoekterm),
    queryFn: () => api.haalCatalogus(zoekterm || undefined),
  });
}

export function useCatalogusTitel(titleId: string | null) {
  return useQuery({
    queryKey: SLEUTELS.catalogusTitel(titleId ?? ''),
    queryFn: () => api.haalCatalogusTitel(titleId as string),
    enabled: !!titleId,
  });
}

export function useVraagPartijAan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pieceId, message }: { pieceId: string; message?: string }) => api.vraagPartijAan(pieceId, message),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useBinnengekomenVerzoeken() {
  return useQuery({ queryKey: SLEUTELS.binnengekomen, queryFn: api.haalBinnengekomenVerzoeken });
}

export function useEigenVerzoeken() {
  return useQuery({ queryKey: SLEUTELS.eigenVerzoeken, queryFn: api.haalEigenVerzoeken });
}

export function useKeurVerzoekGoed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, dagen }: { id: string; note?: string; dagen?: number }) =>
      api.keurVerzoekGoed(id, { note, dagen }),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useWijsVerzoekAf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => api.wijsVerzoekAf(id, note),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useTrekVerzoekIn() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.trekVerzoekIn, onSuccess: () => vernieuwAlles(queryClient) });
}

export function useOproepen(status: string) {
  return useQuery({ queryKey: SLEUTELS.oproepen(status), queryFn: () => api.haalOproepen(status || undefined) });
}

export function usePlaatsOproep() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.plaatsOproep, onSuccess: () => vernieuwAlles(queryClient) });
}

export function useWerkOproepBij() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...wijziging
    }: { id: string } & Partial<api.NieuweOproep> & { status?: api.Oproep['status'] }) =>
      api.werkOproepBij(id, wijziging),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useVerwijderOproep() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: api.verwijderOproep, onSuccess: () => vernieuwAlles(queryClient) });
}

export function useAntwoorden(oproepId: string | null) {
  return useQuery({
    queryKey: SLEUTELS.antwoorden(oproepId ?? ''),
    queryFn: () => api.haalAntwoorden(oproepId as string),
    enabled: !!oproepId,
  });
}

export function useAntwoordOpOproep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ oproepId, body, musicTitleId }: { oproepId: string; body: string; musicTitleId?: string }) =>
      api.antwoordOpOproep(oproepId, body, musicTitleId),
    onSuccess: () => vernieuwAlles(queryClient),
  });
}

export function useOverzicht() {
  return useQuery({ queryKey: SLEUTELS.overzicht, queryFn: api.haalOverzicht });
}
