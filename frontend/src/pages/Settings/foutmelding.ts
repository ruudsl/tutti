/**
 * Haalt de foutmelding uit een mislukte API-aanroep.
 *
 * Elke sectie op deze pagina deed hetzelfde: `error.response?.data?.error ||
 * t('...')`, met `catch (error: any)` erboven. Dat is negentien keer dezelfde
 * regel en negentien keer een `any`. Hier staat hij één keer, met `unknown` als
 * ingang, zodat de secties niets over de vorm van een axios-fout hoeven te
 * weten.
 */
export function foutmelding(fout: unknown, terugval: string): string {
  const respons = (fout as { response?: { data?: { error?: string } } } | null)?.response;
  return respons?.data?.error || terugval;
}
