# Modules

Een beheerder kan onderdelen van Tutti uitzetten voor zijn vereniging. Wat uit
staat verdwijnt uit het menu en is niet meer op te vragen — ook niet via een
bewaarde link.

**Uitzetten verbergt. Het verwijdert niets.**

Dat is de belangrijkste afspraak in dit ontwerp en de reden dat er nergens een
`DELETE` of een `deleted_at` aan te pas komt. Een beheerder die de boekhouding
uitzet omdat de vereniging die buiten Tutti doet, mag daarmee niet ongemerkt
drie jaar facturen weggooien. Zet hij de module een jaar later weer aan, dan
staat alles er precies zo bij als op het moment van uitzetten.

## Waarom

Het inlogscherm toont elke vereniging alles wat de applicatie kan: 59
navigatie-items in twaalf groepen. Voor een fanfare van veertig leden die
alleen repetities, bladmuziek en concerten bijhoudt, is dat overweldigend. De
rollenfilter helpt daar niet bij: die bepaalt wie wát mag, niet of de
vereniging het onderdeel überhaupt gebruikt.

## Wat is kern en wat is module

Kern kan niet uit. Zonder leden, repetities, concerten, bladmuziek en
instellingen is er geen applicatie meer. Alles wat een vereniging redelijkerwijs
niet gebruikt, kan een module zijn.

De modules staan in `backend/src/modules/registry.ts`. Dat bestand is de enige
plek waar een module wordt gedefinieerd: sleutel, naam, omschrijving,
standaardstand, de API-paden die erbij horen en de frontend-paden die
verdwijnen.

## Waar het uit gaat: vier lagen

Verbergen op één plek is niet genoeg. Een module die uit staat maar via de API
nog antwoordt, is niet verborgen maar alleen minder vindbaar.

| Laag      | Wat er gebeurt                                                                                             | Waar                                      |
| --------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Navigatie | Het item verdwijnt uit de zijbalk en het mobiele menu. Een groep waarvan alles wegvalt verdwijnt zelf ook. | `frontend/src/components/Layout.tsx`      |
| Route     | Wie het pad toch intikt, komt op het dashboard.                                                            | `PrivateRoute` in `frontend/src/App.tsx`  |
| API       | Elk verzoek naar de module geeft 404.                                                                      | `backend/src/middleware/requireModule.ts` |
| Gegevens  | Niets. Die blijven staan.                                                                                  | —                                         |

### Waarom 404 en niet 403

Een 403 zegt: dit bestaat, maar jij mag er niet bij. Dat is precies wat een
uitgezette module níet is. Voor deze vereniging bestaat het onderdeel niet, dus
is 404 het eerlijke antwoord. Het scheelt ook een categorie verwarrende
foutmeldingen in de frontend, die 403 als "vraag je beheerder om rechten"
presenteert.

## Hoe de stand wordt opgeslagen

```sql
CREATE TABLE association_modules (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL,
    module_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(association_id, module_key)
);
```

De tabel bevat **alleen afwijkingen van de standaard**. Een vereniging die nooit
iets heeft ingesteld heeft geen enkele rij en volgt `defaultEnabled` uit de
registry. Daardoor hoeft er bij het toevoegen van een module niets te worden
bijgewerkt voor bestaande verenigingen, en is de betekenis van "geen rij"
ondubbelzinnig.

De stand wordt op vrijwel elk verzoek gelezen en daarom in het geheugen
gehouden, per vereniging. De cache wordt leeggegooid bij elke wijziging; er is
geen tijdslimiet, want wijzigen kan alleen via `setModuleEnabled`.

## De modules

Alle modules staan standaard uit. Een vereniging die niets instelt houdt het
kleine menu; wie een onderdeel gebruikt, zet het in twee klikken aan onder
**Beheer → Modules**.

| Groep           | Sleutel        | Naam                    | Verbergt                                                                             |
| --------------- | -------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `music`         | `stage`        | Podium en opstelling    | `/seating`, `/voice-parts`, `/occupancy`, `/neighbor-preferences`, `/stage-designer` |
|                 | `practice`     | Thuis oefenen           | `/practice`, `/practice-schedules`                                                   |
|                 | `externals`    | Invallers en vervangers | `/external-musicians`, `/replacement-requests`                                       |
|                 | `performances` | Uitvoeringshistorie     | `/performances`                                                                      |
|                 | `attendance`   | Aanwezigheidsanalyse    | `/attendance-analytics`                                                              |
| `planning`      | `seasons`      | Seizoensplanning        | `/season-planner`                                                                    |
|                 | `projects`     | Projecten en reizen     | `/projects`, `/tours`                                                                |
|                 | `resources`    | Ruimtes reserveren      | `/resources`                                                                         |
|                 | `tasks`        | Taken                   | `/tasks`                                                                             |
|                 | `workflows`    | Workflow-automatisering | `/workflows`                                                                         |
|                 | `spond`        | Spond-koppeling         | _geen menu-item_ — de kaart op het repetitiescherm                                   |
| `communication` | `posts`        | Nieuwsberichten         | `/posts`                                                                             |
|                 | `mailings`     | Mailings                | `/email-campaigns`                                                                   |
|                 | `polls`        | Peilingen               | `/polls`                                                                             |
|                 | `wiki`         | Wiki                    | `/wiki`                                                                              |
|                 | `contacts`     | Externe contacten       | `/contacts`                                                                          |
| `assets`        | `inventory`    | Inventaris              | `/instrument-assets`, `/uniforms`, `/equipment`, `/outfits`                          |
|                 | `issues`       | Meldingen               | `/issues`                                                                            |
| `finance`       | `accounting`   | Boekhouding             | `/accounting`                                                                        |
|                 | `ticketing`    | Kaartverkoop            | `/my-tickets`, `/ticket-sales`, `/ticket-scanner`, `/payment-settings`               |

### Spond is de uitzondering

Elke module hierboven verbergt een of meer menu-items. Spond niet: die
koppeling heeft geen eigen pagina maar staat als kaart op het repetitiescherm,
zichtbaar voor beheerders. Uitzetten haalt die kaart weg en sluit `/api/spond`
af; er valt niets uit de navigatie te halen.

Twee routes in `backend/src/routes/spond.ts` blijven bewust open, ook als de
module uit staat:

| Route                                          | Wat het is                          |
| ---------------------------------------------- | ----------------------------------- |
| `PUT /spond/attendance/:rehearsalId`           | Een lid zet zichzelf op aanwezig    |
| `GET /spond/attendance/:rehearsalId/my-status` | Een lid vraagt zijn eigen status op |

Die heten wel `/spond/...`, maar het is kernfunctionaliteit die daar alleen
staat omdat ze ooit samen met de synchronisatie is geschreven. Zou de module ze
meenemen, dan raakt elk lid zijn eigen aanwezigheid kwijt zodra een beheerder
Spond uitzet. Wat wél van de module afhangt is het knopje "ook naar Spond
sturen": staat de module uit, dan is er geen koppeling om naartoe te sturen.

Bij verenigingen die Spond al gebruikten staat de module aan. De migratie
`20260824000001_spond_module_aanzetten` zet daarvoor een expliciete rij; zonder
die stap zou de koppeling verdwijnen bij iedereen die hem vandaag gebruikt,
want een module zonder rij krijgt de standaard, en die is uit.

Het beheerscherm zet de modules onder deze groepen, in de volgorde hierboven:
van wat een vereniging wekelijks aanraakt naar wat er een paar keer per jaar bij
komt. De groep bepaalt alleen de plek op het scherm en verder niets. De namen
van de kopjes staan in de vertalingen van de frontend onder
`modules.categories`; welke module bij welke groep hoort staat in de registry.

Samen halen die 32 navigatie-items weg voor een vereniging die er niets van
gebruikt.

### Wat kern blijft

Kern is wat een vereniging altijd nodig heeft: dashboard, eigen bladmuziek,
repetities, beschikbaarheid, concerten, leden, de bladmuziekbibliotheek en het
beheer zelf. Die staan bewust niet in de tabel, want zonder die onderdelen is er
geen applicatie meer.

De globale zoekfunctie doorzoekt alleen kern — bladmuziek, leden, orkesten,
lijsten, repetities — en hoeft dus niet mee te kijken met de modulestand.

### Waarom standaard uit

Voor bestaande verenigingen is dit een gedragsverandering, maar wel de juiste:
het inlogscherm toonde iedere vereniging alles wat de applicatie kan, en dat was
de aanleiding voor dit hele ontwerp. Wie een onderdeel gebruikt, zet het aan; de
gegevens staan er dan nog gewoon.

## Een module toevoegen

1. Voeg de definitie toe aan `backend/src/modules/registry.ts`.
2. Zet de guard op de mount in `backend/src/index.ts`:
   `app.use('/api/x', optionalAuth, requireModule('x'), xRoutes)`.
   `optionalAuth` moet ervoor, anders kent de guard de vereniging niet.
3. Voeg de paden toe aan `MODULE_BY_PATH` in `frontend/src/utils/modules.ts`.

De definitie in stap 1 heeft een `category` nodig; zonder geldige groep valt de
module in het beheerscherm onder "Overig". Een test in
`backend/src/__tests__/modules/registry.test.ts` slaat daarop aan.

Meer is het niet: de navigatie, de routeguard en het beheerscherm lezen alle
drie uit die twee lijsten.

### Een router met publieke en afgeschermde routes

`routes/tickets.ts` hangt aan `/api` en bedient paden onder zowel `/tickets` als
`/concerts/:id/tickets`. Een prefix-guard bij de mount zou de helft missen,
dus staat de guard daar bovenin de router zelf:

```ts
router.use(optionalAuth, requireModule('ticketing'));
```

Verzoeken zonder token gaan er ongehinderd doorheen: de betaal-webhook en een
bezoeker op de publieke bestelpagina moeten blijven werken. Een lopende betaling
mag niet stukgaan doordat een beheerder op dat moment de module uitzet.

## Doorsnijdende weergaven

Een module verbergen op alleen zijn eigen pagina's is niet genoeg zodra andere
onderdelen zijn gegevens tonen. Dan is "verborgen" cosmetisch: het menu-item is
weg, maar de takenlijst staat nog op het dashboard.

Wat er is nagelopen en wat eruit kwam:

| Plek                                     | Leest van                    | Aangepast                                                                         |
| ---------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| Dashboard-widgets                        | `tasks`, `practice`, `posts` | ja — widgets van een uitgezette module vallen weg, ook uit het instellingenscherm |
| Infoscherm (`/api/calendar/info-screen`) | `posts`                      | ja — geen vastgezet bericht op het scherm in de hal                               |
| Wekelijkse e-mail-digest                 | `practice`                   | ja — geen oefenoverzicht in de mail                                               |
| Workflow-uitvoering                      | `workflows`                  | ja — in `executeWorkflow`, het knooppunt waar alle triggers langskomen            |
| Opstellingsmeldingen                     | `stage`                      | ja — `scheduler/seating-notifications`                                            |
| Globale zoekfunctie                      | alleen kern                  | niet nodig                                                                        |
| Snelle acties                            | alleen kern                  | niet nodig                                                                        |

De widgetvoorkeuren van een gebruiker blijven gewoon opgeslagen; de indeling
komt terug zoals hij was zodra de module weer aan gaat. Ook hier: verbergen,
niet verwijderen.

De guard op workflows staat bewust in `executeWorkflow` en niet in de scheduler.
Handmatig, gepland en op gebeurtenis komen daar allemaal langs, dus één controle
dekt ze alle drie. De regels zelf blijven staan en doen het weer zodra de module
aan gaat.

## Wat nog aandacht vraagt

- **Verwijzingen tussen modules.** Zodra een tabel van module A naar module B
  wijst, is uitzetten van B niet meer vrijblijvend. Dat speelt bij de huidige
  set niet, maar het is de eerste vraag bij elke volgende module.
- **Notificatiecentrum.** Meldingen die uit een uitgezette module voortkomen
  blijven in de lijst staan tot ze zijn gelezen. Nieuwe komen er niet bij, want
  de bron is afgesloten, maar oude worden niet opgeruimd — bewust, want dat zou
  verwijderen zijn.
- **De aan/uit-stand is geen rechtenmodel.** Een module uitzetten haalt hem uit
  het zicht van iedereen, ook van beheerders. Wie wát mag blijft een kwestie van
  rollen.
