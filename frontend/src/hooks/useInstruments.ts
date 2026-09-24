import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import {
  getInstruments,
  zetInstrumentVerborgen,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  addInstrumentAlias,
  deleteInstrumentAlias,
} from '../api';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

/**
 * Hook to fetch all instruments
 */
export function useInstruments(alles = false) {
  return useQuery({
    // Het beheerscherm vraagt ook de verborgen standaarditems; een eigen
    // sleutel onder dezelfde voorvoegsel, zodat invalideren beide raakt.
    queryKey: alles ? ([...queryKeys.instruments, 'beheer'] as const) : queryKeys.instruments,
    queryFn: () => getInstruments(alles),
  });
}

/**
 * Hook to create a new instrument
 */
export function useCreateInstrument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; tuning?: string; clef?: string; aliases?: string[] }) =>
      createInstrument(data.name, data.tuning, data.clef, data.aliases),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instruments });
      showSuccess('Instrument aangemaakt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to update an instrument
 */
export function useUpdateInstrument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; tuning?: string; clef?: string } }) =>
      updateInstrument(id, data.name, data.tuning, data.clef),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instruments });
      // De stukkenlijst joint op instruments en toont de instrumentnaam per
      // partij, dus die is na een hernoeming verouderd.
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      showSuccess('Instrument bijgewerkt');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete an instrument
 */
export function useDeleteInstrument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteInstrument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instruments });
      // music_pieces.instrument_id verwijst naar instruments met ON DELETE
      // SET NULL, dus elke partij die eraan hing raakt zijn koppeling kwijt.
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      showSuccess('Instrument verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to add an alias to an instrument
 */
export function useAddInstrumentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ instrumentId, alias }: { instrumentId: string; alias: string }) =>
      addInstrumentAlias(instrumentId, alias),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instruments });
      showSuccess('Alias toegevoegd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Hook to delete an alias from an instrument
 */
export function useDeleteInstrumentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ instrumentId, aliasId }: { instrumentId: string; aliasId: string }) =>
      deleteInstrumentAlias(instrumentId, aliasId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instruments });
      showSuccess('Alias verwijderd');
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}

/**
 * Een standaardinstrument verbergen of weer tonen voor de eigen vereniging.
 * De melding geeft het scherm zelf, in de taal van de gebruiker.
 */
export function useZetInstrumentVerborgen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, verborgen }: { id: string; verborgen: boolean }) => zetInstrumentVerborgen(id, verborgen),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instruments });
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });
}
