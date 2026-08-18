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

## De eerste drie modules

| Sleutel      | Naam                 | Verbergt                                                                             | Standaard |
| ------------ | -------------------- | ------------------------------------------------------------------------------------ | --------- |
| `accounting` | Boekhouding          | `/accounting`                                                                        | uit       |
| `ticketing`  | Kaartverkoop         | `/my-tickets`, `/ticket-sales`, `/ticket-scanner`, `/payment-settings`               | uit       |
| `stage`      | Podium en opstelling | `/seating`, `/voice-parts`, `/occupancy`, `/neighbor-preferences`, `/stage-designer` | uit       |

Samen halen die tien navigatie-items weg voor een vereniging die ze niet
gebruikt.

Deze drie zijn gekozen omdat ze alle drie zelfstandig zijn: geen andere module
leest hun tabellen, en het dashboard, de agenda en de globale zoekfunctie tonen
er niets van. Daardoor is er geen vijfde laag nodig om ze echt onzichtbaar te
maken.

### Waarom standaard uit

Voor bestaande verenigingen is standaard uit een gedragsverandering, maar wel de
juiste: dit zijn de onderdelen waarvan we weten dat de meeste verenigingen ze
niet gebruiken, en die het inlogscherm het meest opblazen. Een vereniging die ze
wel gebruikt, zet ze in twee klikken aan onder **Beheer → Modules** — de
gegevens staan er dan nog gewoon.

## Een module toevoegen

1. Voeg de definitie toe aan `backend/src/modules/registry.ts`.
2. Zet de guard op de mount in `backend/src/index.ts`:
   `app.use('/api/x', optionalAuth, requireModule('x'), xRoutes)`.
   `optionalAuth` moet ervoor, anders kent de guard de vereniging niet.
3. Voeg de paden toe aan `MODULE_BY_PATH` in `frontend/src/utils/modules.ts`.

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

## Wat nog aandacht vraagt bij volgende modules

De eerste drie zijn met opzet de makkelijke. Bij modules die wél verweven zijn
met de rest komt er werk bij:

- **Doorsnijdende weergaven.** Het dashboard, de globale zoekfunctie, de agenda
  en het notificatiecentrum halen gegevens uit meerdere modules. Als een module
  uit staat mag zijn data daar niet meer opduiken, anders is "verborgen" alleen
  cosmetisch.
- **Geplande taken.** Een scheduler die herinneringen verstuurt voor een
  uitgezette module blijft mailen over iets wat niemand meer kan zien. Elke
  scheduler moet de stand van zijn module controleren voordat hij iets
  verstuurt. Voor `stage` is dat al gedaan:
  `scheduler/seating-notifications` slaat verenigingen over die de module uit
  hebben staan. De instellingen blijven bewaard, ze worden alleen niet meer
  uitgevoerd.
- **Verwijzingen tussen modules.** Zodra een tabel van module A naar module B
  wijst, is uitzetten van B niet meer vrijblijvend. Dat is bij deze drie niet
  het geval, maar het is de eerste vraag bij elke volgende.
