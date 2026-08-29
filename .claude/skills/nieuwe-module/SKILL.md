---
name: nieuwe-module
description: Een stuk functionaliteit in Tutti aan- en uitzetbaar maken als module. Gebruik dit wanneer een beheerder een onderdeel uit het zicht moet kunnen halen, of wanneer bestaande functionaliteit een module wordt.
---

# Een module toevoegen

Een module is een samenhangend stuk functionaliteit dat een beheerder kan
uitzetten. **Uitzetten verbergt, het verwijdert niets.** Wat niet uit kan is
kern: leden, repetities, concerten, bladmuziek, instellingen.

Een module bestaat pas als alle drie de helften er zijn. Twee van de drie levert
een navigatie-item dat naar een 404 leidt, of een route die open blijft staan
terwijl de kaart verdwenen is.

## 1. Registreren (backend)

`backend/src/modules/registry.ts`, in `MODULES`:

```ts
{
  key: 'sleutel',              // gaat nooit meer veranderen; staat zo in de database
  category: 'planning',        // music | planning | communication | assets | finance
  title: 'Naam voor de beheerder',
  description: 'Eén zin die zegt wat er verdwijnt als dit uit gaat.',
  defaultEnabled: false,       // lees stap 4 voordat je dit op false zet
  apiPrefixes: ['/pad'],       // zonder /api; deze paden geven 404 als de module uit staat
  navPaths: ['/pad'],          // wat uit de navigatie verdwijnt
},
```

Een module zonder eigen pagina (een koppeling die alleen binnen andere schermen
zichtbaar is) krijgt `navPaths: []`. Zet hem dan ook in `MODULES_ZONDER_PAGINA`
in `backend/src/__tests__/modules/registry.test.ts`, anders faalt de test die
bewaakt dat elke module een pad heeft.

## 2. De routes afsluiten (backend)

In elke `backend/src/routes/*.ts` die bij de module hoort:

```ts
import { requireModule } from '../middleware/requireModule';

router.get('/', authenticateToken, requireModule('sleutel'), asyncHandler(...));
```

- Het antwoord is **404, geen 403**. Een uitgezette module hoort niet te bestaan
  voor die vereniging.
- `requireModule` staat ná `authenticateToken`: zonder gebruiker is de
  vereniging niet bekend.
- Laat een route alleen open als hij ook zonder de module betekenis heeft, en
  schrijf in een commentaar waarom. Geeft zo'n route een veld terug dat de
  koppeling aanprijst (`canSyncToSpond` en dergelijke), controleer dan
  `isModuleEnabled(...)` in de handler zelf.

## 3. De paden verbergen (frontend)

`frontend/src/utils/modules.ts`, in `MODULE_BY_PATH`: elk pad → de sleutel.
Ook de onderliggende paden hoeven niet apart; `isLocationHidden` kijkt naar het
voorvoegsel, dus `/accounting` dekt ook `/accounting/facturen/123`.

## 4. Bestaande gebruikers niet verrassen

`association_modules` bevat **alleen afwijkingen** van `defaultEnabled`. Een
vereniging zonder rij krijgt de standaard.

Maak je iets dat vandaag al werkt tot module met `defaultEnabled: false`, dan
verdwijnt het van het ene op het andere moment bij iedereen die het gebruikt,
zonder melding. Schrijf dan een migratie die voor de bestaande gebruikers een
expliciete rij zet:

```ts
db.prepare(
  `INSERT OR IGNORE INTO association_modules (id, association_id, module_key, enabled, updated_at)
   VALUES (?, ?, 'sleutel', 1, datetime('now'))`,
).run(uuidv4(), association_id);
```

`INSERT OR IGNORE`, niet `OR REPLACE`: heeft een beheerder de module al bewust
uitgezet, dan is dat zijn keuze.

Zie `backend/src/migrations/20260824000001_spond_module_aanzetten.ts`.

## 5. Vertalen

`title` en `description` staan in de registry (Nederlands). De kopjes van de
categorieën staan onder `modules.categories` in
`frontend/src/locales/{nl,en,de}.json`. Voeg je een nieuwe categorie toe, dan
alle drie de bestanden.

## 6. Testen

- De registry-test bewaakt unieke sleutels, geldige categorieën en dat elke
  module een pad heeft.
- Test per route dat hij 404 geeft met de module uit en werkt met de module aan.
- Zet de module in je eigen testbestand aan met `setModuleEnabled(...)`.
  **Pas `createTestEnvironment()` niet aan** - dat breekt tests die het zelf al
  doen (`UNIQUE constraint failed: association_modules`).

## Checklist

- [ ] `registry.ts`: sleutel, categorie, titel, beschrijving, standaard, paden
- [ ] `requireModule` op alle bijbehorende routes
- [ ] `MODULE_BY_PATH` in de frontend
- [ ] Migratie voor bestaande gebruikers (als de standaard uit is)
- [ ] `MODULES_ZONDER_PAGINA` bijgewerkt (alleen bij `navPaths: []`)
- [ ] Vertalingen in nl, en, de
- [ ] Tests voor aan én uit
- [ ] `docs/MODULES.md` bijgewerkt
