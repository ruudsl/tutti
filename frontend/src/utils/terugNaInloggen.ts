/**
 * Waar iemand na het inloggen heen gaat.
 *
 * Een pagina die inloggen vraagt (zoals de deel-actie, ShareTarget) stuurt
 * naar /login met `state: { terug: '/pad' }`. Alleen een pad binnen Tutti
 * telt: iets dat met `//` of `/\` begint, is voor de browser een ander
 * domein, en dan zou deze functie een doorverwijzing naar buiten worden.
 */
export function terugNaInloggen(state: unknown): string {
  const terug = (state as { terug?: unknown } | null | undefined)?.terug;
  if (typeof terug === 'string' && /^\/(?![/\\])/.test(terug)) return terug;
  return '/';
}
