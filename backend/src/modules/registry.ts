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

/**
 * De groepen waarin het beheerscherm de modules toont.
 *
 * Negentien schakelaars onder elkaar zijn niet te overzien; gegroepeerd wel.
 * De groep zegt niets over gedrag - hij bepaalt alleen onder welk kopje de
 * module op het scherm staat. De namen van de kopjes staan in de vertalingen
 * van de frontend, onder modules.categories.
 */
export type ModuleCategory = 'music' | 'planning' | 'communication' | 'assets' | 'finance';

export interface ModuleDefinition {
  /** Sleutel in de database en in de API. Verandert niet meer na uitlevering. */
  key: string;
  /** Onder welk kopje de module in het beheerscherm staat. */
  category: ModuleCategory;
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
    category: 'finance',
    title: 'Boekhouding',
    description:
      'Grootboek, facturen, bankafschriften, SEPA-incasso en contributie. Zet dit uit als de vereniging de boekhouding buiten Tutti doet.',
    defaultEnabled: false,
    apiPrefixes: ['/accounting'],
    navPaths: ['/accounting'],
  },
  {
    key: 'ticketing',
    category: 'finance',
    title: 'Kaartverkoop',
    description:
      'Kaartverkoop voor concerten, met betaalinstellingen, verkoopoverzicht en de scanner bij de deur. Zet dit uit als er geen kaarten via Tutti worden verkocht.',
    defaultEnabled: false,
    apiPrefixes: ['/tickets', '/payment-settings'],
    navPaths: ['/my-tickets', '/ticket-sales', '/ticket-scanner', '/payment-settings'],
  },
  {
    key: 'stage',
    category: 'music',
    title: 'Podium en opstelling',
    description:
      'Podiumindeling, stoelindeling, partijverdeling, bezetting en buurvoorkeuren. Zet dit uit als de opstelling op papier of in het hoofd van de dirigent zit.',
    defaultEnabled: false,
    apiPrefixes: ['/stage-layouts', '/seating', '/seating-notifications'],
    navPaths: ['/seating', '/voice-parts', '/occupancy', '/neighbor-preferences', '/stage-designer'],
  },
  {
    key: 'polls',
    category: 'communication',
    title: 'Peilingen',
    description:
      'Peilingen onder de leden, inclusief het prikken van een repetitiedatum. Zet dit uit als besluiten in de app-groep of op de repetitie vallen.',
    defaultEnabled: false,
    apiPrefixes: ['/polls'],
    navPaths: ['/polls'],
  },
  {
    key: 'tasks',
    category: 'planning',
    title: 'Taken',
    description:
      'Taken toewijzen en afvinken, met sjablonen voor terugkerend werk. Zet dit uit als afspraken mondeling of per mail gaan.',
    defaultEnabled: false,
    apiPrefixes: ['/tasks'],
    navPaths: ['/tasks'],
  },
  {
    key: 'posts',
    category: 'communication',
    title: 'Nieuwsberichten',
    description:
      'Berichten voor de leden, met vastgezette mededelingen op het infoscherm. Zet dit uit als nieuws via de website of een app-groep gaat.',
    defaultEnabled: false,
    apiPrefixes: ['/posts'],
    navPaths: ['/posts'],
  },
  {
    key: 'mailings',
    category: 'communication',
    title: 'Mailings',
    description:
      'Bulkmail aan een selectie leden, met bijlagen en verzendstatus. Zet dit uit als er via een externe mailinglijst wordt gemaild.',
    defaultEnabled: false,
    apiPrefixes: ['/email-campaigns'],
    navPaths: ['/email-campaigns'],
  },
  {
    key: 'contacts',
    category: 'communication',
    title: 'Externe contacten',
    description:
      'Adresboek voor mensen buiten de vereniging: zalen, sponsoren, dirigenten van buiten. Zet dit uit als dat elders wordt bijgehouden.',
    defaultEnabled: false,
    apiPrefixes: ['/contacts'],
    navPaths: ['/contacts'],
  },
  {
    key: 'issues',
    category: 'assets',
    title: 'Meldingen',
    description:
      'Leden melden problemen met bladmuziek, instrumenten of de zaal. Zet dit uit als dat via de bestuurstafel loopt.',
    defaultEnabled: false,
    apiPrefixes: ['/issues'],
    navPaths: ['/issues'],
  },
  {
    key: 'practice',
    category: 'music',
    title: 'Thuis oefenen',
    description:
      "Oefensessies bijhouden, doelen stellen en oefenschema's maken. Zet dit uit als de vereniging niets van het thuiswerk van leden wil bijhouden.",
    defaultEnabled: false,
    apiPrefixes: ['/practice', '/practice-schedules'],
    navPaths: ['/practice', '/practice-schedules'],
  },
  {
    key: 'externals',
    category: 'music',
    title: 'Invallers en vervangers',
    description:
      'Musici van buiten uitnodigen en vervangingsverzoeken beheren. Zet dit uit als invallers via een telefoontje geregeld worden.',
    defaultEnabled: false,
    apiPrefixes: ['/external-musicians', '/replacement-requests'],
    navPaths: ['/external-musicians', '/replacement-requests'],
  },
  {
    key: 'inventory',
    category: 'assets',
    title: 'Inventaris',
    description:
      'Instrumenten, uniformen, apparatuur en concertkleding: wie heeft wat, in welke staat, en wanneer terug. Zet dit uit als de vereniging geen eigen bezit uitleent.',
    defaultEnabled: false,
    apiPrefixes: ['/instrument-assets', '/instrument-insurance', '/uniforms', '/equipment', '/outfits', '/maintenance'],
    navPaths: ['/instrument-assets', '/uniforms', '/equipment', '/outfits'],
  },
  {
    key: 'projects',
    category: 'planning',
    title: 'Projecten en reizen',
    description:
      'Meerdaagse projecten en concertreizen, met deelnemers, vervoer en kosten. Zet dit uit als het bij losse concerten blijft.',
    defaultEnabled: false,
    apiPrefixes: ['/projects', '/tours'],
    navPaths: ['/projects', '/tours'],
  },
  {
    key: 'resources',
    category: 'planning',
    title: 'Ruimtes reserveren',
    description:
      'Repetitieruimtes en materiaal reserveren met een bezettingsoverzicht. Zet dit uit als er maar een zaal is en die altijd vrij is.',
    defaultEnabled: false,
    apiPrefixes: ['/resources'],
    navPaths: ['/resources'],
  },
  {
    key: 'wiki',
    category: 'communication',
    title: 'Wiki',
    description:
      "Interne kennisbank met pagina's, versies en bijlagen. Zet dit uit als afspraken in een gedeelde map staan.",
    defaultEnabled: false,
    apiPrefixes: ['/wiki'],
    navPaths: ['/wiki'],
  },
  {
    key: 'performances',
    category: 'music',
    title: 'Uitvoeringshistorie',
    description: 'Bijhouden welk stuk wanneer en waar is gespeeld. Zet dit uit als dat niet wordt bijgehouden.',
    defaultEnabled: false,
    apiPrefixes: ['/performances'],
    navPaths: ['/performances'],
  },
  {
    key: 'workflows',
    category: 'planning',
    title: 'Workflow-automatisering',
    description:
      'Automatisch acties uitvoeren bij gebeurtenissen, bijvoorbeeld een herinnering sturen voor een concert. Zet dit uit als niemand die regels beheert.',
    defaultEnabled: false,
    apiPrefixes: ['/workflows'],
    navPaths: ['/workflows'],
  },
  {
    key: 'seasons',
    category: 'planning',
    title: 'Seizoensplanning',
    description:
      'Een heel seizoen vooruit plannen met sjablonen, begroting en terugkerende repetities. Zet dit uit als de planning per maand gaat.',
    defaultEnabled: false,
    apiPrefixes: ['/seasons'],
    navPaths: ['/season-planner'],
  },
  {
    key: 'spond',
    category: 'planning',
    title: 'Spond-koppeling',
    description:
      'Repetities en aanwezigheid uitwisselen met Spond, inclusief het koppelen van leden aan hun Spond-account. Zet dit uit als de vereniging geen Spond gebruikt; wat al is opgehaald blijft gewoon staan.',
    defaultEnabled: false,
    apiPrefixes: ['/spond'],
    // Spond heeft geen eigen pagina - de koppeling staat als kaart op het
    // repetitiescherm. Er is dus geen navigatiepad om te verbergen; de
    // frontend haalt de kaart weg op de modulestand. Zie MODULES_ZONDER_PAGINA
    // in __tests__/modules/registry.test.ts.
    navPaths: [],
  },
  {
    key: 'attendance',
    category: 'music',
    title: 'Aanwezigheidsanalyse',
    description:
      'Overzichten en trends van aanwezigheid per lid en per sectie. Zet dit uit als aanwezigheid alleen per repetitie wordt afgetekend.',
    defaultEnabled: false,
    apiPrefixes: ['/analytics/attendance'],
    navPaths: ['/attendance-analytics'],
  },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function getModule(key: string): ModuleDefinition | undefined {
  return BY_KEY.get(key);
}

export function isKnownModule(key: string): boolean {
  return BY_KEY.has(key);
}
