# Werken aan Tutti

Dit bestand is wat een AI-assistent leest voordat hij iets aanraakt in deze
repository. Het bevat de afspraken die je nergens uit de code kunt aflezen en
de valkuilen die hier eerder tijd hebben gekost.

Aanvullend:

- `.claude/LESSONS.md` - dingen die één keer fout zijn gegaan en die je niet
  opnieuw hoeft uit te zoeken.
- `.claude/skills/` - stap-voor-stap-recepten voor terugkerend werk (een module
  toevoegen, een migratie schrijven, een route bouwen).
- `CONTRIBUTING.md` - het proces: branches, commits, pull requests.
- `docs/ARCHITECTURE.md` - hoe de applicatie in elkaar zit.

## Wat dit is

Een meertalige, multi-tenant webapplicatie voor muziekverenigingen (harmonie,
fanfare, brassband, koor). Eén installatie bedient meerdere verenigingen.

```
backend/    Express + TypeScript + sql.js (SQLite in het geheugen, op schijf bewaard)
frontend/   React + Vite + TypeScript, React Query voor serverstatus
e2e/        Playwright
docs/       Documentatie, inclusief adr/ voor architectuurbesluiten
scripts/    Losse hulpprogramma's (Lighthouse-controle, releasewerk)
```

npm-workspaces. Vanuit de hoofdmap:

```bash
npm run dev                       # backend + frontend tegelijk
npm run lint                      # eslint over beide workspaces
npm test --workspace=backend      # vitest
npm test --workspace=frontend     # vitest
npx playwright test               # e2e (vraagt een draaiende applicatie)
```

## Taal

- **Code, commentaar, commits, testnamen en documentatie: Nederlands.**
  Bestaande Engelse code is historie, geen richtlijn; nieuwe code is Nederlands.
- Bestandsnamen van tests beschrijven het gedrag, niet het bestand:
  `accounting-verenigingsgrens.test.ts`, niet `accounting2.test.ts`.
- De gebruikersinterface is drietalig: `nl` (bron), `en`, `de`. Een nieuwe
  zichtbare tekst zonder alle drie de vertalingen is niet af.

## Regels die altijd gelden

Deze staan hier omdat ze in deze repository al eens zijn overtreden.

### Multi-tenancy

1. **Elke query die verenigingsgegevens leest of schrijft filtert op
   `association_id`.** Er is geen middleware die dat voor je doet. Vergeet je
   het, dan lekt de ene vereniging in de andere en merkt niemand het tot het te
   laat is.
2. **Cache varieert standaard op vereniging.** `cacheMiddleware` doet dat zelf,
   maar zet `varyByUser: true` zodra het antwoord per gebruiker verschilt
   (alles onder `/my-*`). Anders krijgt lid A het antwoord van lid B.
3. Superbeheerders zijn de enige uitzondering en gaan via `requireSuperAdmin`.

### Database

4. **Altijd prepared statements.** Nooit een query met string-plakwerk.
5. **Schemawijzigingen gaan via een migratie in `backend/src/migrations/`**, met
   een werkende `down`. Het schema in `database/schema.ts` beschrijft een verse
   installatie; bestaande installaties zien alleen je migratie.
6. `PRAGMA foreign_keys` staat aan. Een `DELETE` die een verwijzing achterlaat
   faalt met `FOREIGN KEY constraint failed`, ook in tests.
7. Vragen over het echte schema beantwoord je op de draaiende database
   (`PRAGMA table_info`, `PRAGMA foreign_key_list`), niet door de bron te
   parseren. Inline gedeclareerde sleutels mis je anders.

### Routes

8. Validatie met Zod via `validate(schema)`; niet met handgeschreven `if`-reeksen.
9. Fouten via `asyncHandler` + `ApiError`; niet met een eigen `try/catch` die
   een `res.status(500)` teruggeeft.
10. Een route achter een module krijgt `requireModule('sleutel')`. Die geeft
    **404, niet 403**: een uitgezette module hoort niet te bestaan voor die
    vereniging, en een 403 verklapt dat de functionaliteit er wel is.
11. Uitgaande HTTP heeft een tijdslimiet en gaat door `beschermd(...)` uit
    `utils/veerkracht.ts`. Zonder tijdslimiet blijft een trage externe dienst je
    verzoek vasthouden tot de gebruiker weggaat; zonder stroomonderbreker kost
    elke aanroep de volle limiet zolang de dienst plat ligt. Herkansen mag
    alleen als de aanroep herhaalbaar is - iets versturen krijgt `pogingen: 1`.
    Zie `docs/VEERKRACHT.md`.

### Modules

12. Een module aan- of uitzetten is een drieluik. Alle drie of geen:
    - `backend/src/modules/registry.ts` - dat de module bestaat.
    - `backend/src/routes/*.ts` - `requireModule` op de bijbehorende routes.
    - `frontend/src/utils/modules.ts` - welke paden uit de navigatie verdwijnen.
13. **Uitzetten verbergt, het verwijdert niets.** Aanzetten geeft de gegevens
    ongewijzigd terug.
14. `association_modules` bevat alleen afwijkingen van `defaultEnabled`. Zet je
    een bestaande functie om naar een module met `defaultEnabled: false`, dan
    verdwijnt hij bij iedereen die hem gebruikt - tenzij je een migratie
    schrijft die voor die verenigingen een expliciete `enabled = 1` zet.

### Veiligheid

15. Geen geheimen in de repository, ook niet in testfixtures. GitHub's push
    protection blokkeert secret-vormige strings; de oplossing is de fixture
    aanpassen, nooit de unblock-link.
16. Gebruikersinvoer die als HTML of markdown terugkomt gaat door DOMPurify.
17. Autorisatie is `requireRole` / `requireMinRole`, niet een controle in de
    handler.

### Testen

18. Nieuw gedrag krijgt een test. Een bugfix krijgt een test die zonder de fix
    faalt.
19. Gebruik `createTestEnvironment()` uit `backend/src/__tests__/testUtils.ts`
    voor de standaardopstelling (vereniging + beheerder + lid + muziekcommissie).
    Verander die helper niet voor één testbestand; zet wat jij nodig hebt in je
    eigen bestand.
20. Tests mogen niet van elkaars volgorde afhangen en niet van het netwerk.

## Wat je niet zomaar doet

- **Een test overslaan, uitzetten of aanpassen om groen te worden.** Een rode
  test is een bevinding, geen obstakel.
- **`git push --force` naar `main`.** Werk gaat via een branch en een pull
  request.
- **Een afhankelijkheid toevoegen** waar de standaardbibliotheek of iets dat er
  al zit volstaat.
- **React en react-dom los van elkaar bijwerken.** Dat levert twee kopieën van
  `@types/react` en een typefout die nergens op slaat.
- **Concluderen dat iets kapot is zonder het te hebben gezien.** Draai het,
  vraag de database, lees het antwoord.

## Waar dingen staan

| Wat                             | Waar                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ |
| Databaseverbinding              | `backend/src/database/connection.ts`                                     |
| Schema verse installatie        | `backend/src/database/schema.ts`                                         |
| Migraties                       | `backend/src/migrations/` (`npm run migrate:create --workspace=backend`) |
| Authenticatie                   | `backend/src/middleware/auth.ts`                                         |
| Foutafhandeling                 | `backend/src/middleware/errorHandler.ts`                                 |
| Validatie                       | `backend/src/middleware/validate.ts`                                     |
| Cache                           | `backend/src/middleware/cache.ts`                                        |
| Modules                         | `backend/src/modules/registry.ts`, `frontend/src/utils/modules.ts`       |
| Achtergrondtaken                | `backend/src/scheduler/`, `backend/src/utils/backgroundQueue.ts`         |
| Externe koppelingen             | `backend/src/services/`                                                  |
| Herkansen en stroomonderbrekers | `backend/src/utils/veerkracht.ts`, `docs/VEERKRACHT.md`                  |
| Logboek                         | `backend/src/utils/logger.ts`, `backend/src/logging/requestLogger.ts`    |
| Vertalingen                     | `frontend/src/locales/{nl,en,de}.json`                                   |
| API-laag frontend               | `frontend/src/api/` (niet langs `fetch` heen)                            |
