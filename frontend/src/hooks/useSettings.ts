import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getSettings } from '../api';

/**
 * De verenigingsinstellingen: naam, logo en thema.
 *
 * Twee pagina's hadden hier hun eigen `useQuery` met sleutel `['settings']`
 * staan: `pages/Settings/index.tsx` en `pages/ThemeSettings.tsx`. Beide vroegen
 * dezelfde cachesleutel aan, elk met hun eigen opties eronder. React Query
 * bewaart per sleutel één query, en de opties die daarbij gelden zijn die van
 * de waarnemer die als eerste aanhaakt. Welke `staleTime` er dus gold, hing af
 * van welke pagina je het eerst opende - en dat is precies het soort verschil
 * dat pas opvalt als iemand zich afvraagt waarom een gewijzigd logo op de ene
 * pagina wel meteen ververst en op de andere niet.
 *
 * De twee opties-blokken bleken woord voor woord gelijk (`getSettings`,
 * `staleTime` van vijf minuten), dus er viel niets te kiezen: het waren twee
 * kopieën van dezelfde bedoeling. Ze staan nu hier, één keer. Wie ooit een
 * pagina wil die de instellingen vaker ververst, geeft die pagina een eigen
 * cachesleutel in plaats van dezelfde sleutel met andere opties - anders is het
 * probleem terug.
 */
export const SETTINGS_STALE_TIME = 5 * 60 * 1000;

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: getSettings,
    staleTime: SETTINGS_STALE_TIME,
  });
}

/**
 * Markeert de opgehaalde instellingen als verouderd, zodat elke pagina die ze
 * toont ze opnieuw ophaalt. Gebruikt door de secties die instellingen opslaan.
 */
export function useVerversSettings(): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
}
