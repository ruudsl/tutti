/**
 * Modules die een beheerder aan of uit kan zetten.
 *
 * Het inlogscherm toont voor elke vereniging alles wat de applicatie kan, ook
 * wat die vereniging nooit gebruikt. Een module bundelt een samenhangend stuk
 * functionaliteit zodat een beheerder het in een keer uit het zicht kan halen.
 *
 * Uitzetten verbergt, het verwijdert niets. Zie docs/MODULES.md.
 *
 * Wat niet in deze lijst staat, is kern: leden, repetities, concerten,
 * bladmuziek, instellingen. Dat kan niet uit, want zonder die onderdelen is
 * er geen applicatie meer.
 */

export interface ModuleDefinition {
  /** Sleutel in de database en in de API. Verandert niet meer na uitlevering. */
  key: string;
  /** Naam zoals de beheerder die ziet. */
  title: string;
  /** Een zin die uitlegt wat er verdwijnt als de module uit gaat. */
  description: string;
  /** Staat de module aan voor een vereniging die er nooit iets over heeft gezegd? */
  defaultEnabled: boolean;
  /**
   * API-paden die bij deze module horen, zonder /api-voorvoegsel.
   * Verzoeken hiernaartoe krijgen een 404 zodra de module uit staat.
   */
  apiPrefixes: string[];
  /** Frontend-paden die uit de navigatie verdwijnen en niet meer bereikbaar zijn. */
  navPaths: string[];
}

export const MODULES: ModuleDefinition[] = [
  {
    key: 'accounting',
    title: 'Boekhouding',
    description:
      'Grootboek, facturen, bankafschriften, SEPA-incasso en contributie. Zet dit uit als de vereniging de boekhouding buiten Tutti doet.',
    defaultEnabled: false,
    apiPrefixes: ['/accounting'],
    navPaths: ['/accounting'],
  },
  {
    key: 'ticketing',
    title: 'Kaartverkoop',
    description:
      'Kaartverkoop voor concerten, met betaalinstellingen, verkoopoverzicht en de scanner bij de deur. Zet dit uit als er geen kaarten via Tutti worden verkocht.',
    defaultEnabled: false,
    apiPrefixes: ['/tickets', '/payment-settings'],
    navPaths: ['/my-tickets', '/ticket-sales', '/ticket-scanner', '/payment-settings'],
  },
  {
    key: 'stage',
    title: 'Podium en opstelling',
    description:
      'Podiumindeling, stoelindeling, partijverdeling, bezetting en buurvoorkeuren. Zet dit uit als de opstelling op papier of in het hoofd van de dirigent zit.',
    defaultEnabled: false,
    apiPrefixes: ['/stage-layouts', '/seating', '/seating-notifications'],
    navPaths: ['/seating', '/voice-parts', '/occupancy', '/neighbor-preferences', '/stage-designer'],
  },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDefinition | undefined {
  return BY_KEY.get(key);
}

export function isKnownModule(key: string): boolean {
  return BY_KEY.has(key);
}
