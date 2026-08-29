# Wat we hier al een keer hebben uitgezocht

Elke regel hieronder heeft ooit een halve dag gekost. Ze staan er niet om
gelezen te worden als naslagwerk, maar om te voorkomen dat iemand dezelfde
verkeerde afslag nog eens neemt.

## npm en de productiebuild

**`.npmrc` met `include=dev` wint van `--omit=dev` op de opdrachtregel.**
Gemeten met een echte installatie, niet met `--dry-run` - die laatste liegt
over `omit` en meldt dat dev-pakketten worden overgeslagen terwijl ze wel
worden geïnstalleerd.

| opstelling                                       | resultaat                   |
| ------------------------------------------------ | --------------------------- |
| geen `.npmrc`, `NODE_ENV=production`             | dev-pakketten overgeslagen  |
| `.npmrc` met `include=dev`                       | dev-pakketten geïnstalleerd |
| `.npmrc` met `include=dev` **plus** `--omit=dev` | dev-pakketten geïnstalleerd |

Daarom staat er geen `.npmrc` met `include=dev` in deze repository: hij zou een
Render-build repareren maar tegelijk de productie-image van de Dockerfile
opblazen.

**Een Render-service die met de hand is aangemaakt negeert `render.yaml`.** Wat
daar in het dashboard bij Build Command staat is wat er draait. Faalt een
productiebuild met honderden `TS7016`/`TS2339`-fouten en ontbreekt `typescript`,
dan is dat geen typefout in de code: het build-commando mist `--include=dev`
terwijl `NODE_ENV=production` staat.

## Service worker en PWA

**Workbox gooit `add-to-cache-list-conflicting-entries` tijdens het evalueren
van het script, dus vóór `install`.** Eén dubbele URL in de precache-lijst zet
de hele service worker uit - zonder foutmelding in de interface. `offline.html`
en `/offline.html` zijn voor Workbox twee verschillende strings en één bestand;
`additionalManifestEntries` naast een glob die hetzelfde bestand al pakt is dus
fataal. `scripts/lighthouse-check.mjs` controleert hier sindsdien op.

## Lighthouse

**De prestatiescore hangt af van de machine.** Dezelfde build gaf 91 lokaal en
84-86 op de CI-runner. Een drempel die je op je eigen machine bepaalt laat de
build op GitHub falen. Stel drempels altijd in op wat de runner meet, en
publiceer runner-getallen, geen lokale.

## Afhankelijkheden

**React en react-dom horen in één keer omhoog.** Losse Dependabot-PR's leveren
twee kopieën van `@types/react` en de fout
`Type 'bigint' is not assignable to type 'ReactNode'`, die niets met bigint te
maken heeft.

**archiver 8 heeft de aanroepbare default-export laten vallen.** `archiver('zip')`
bestaat niet meer; het zijn nu de klassen `ZipArchive`, `TarArchive` en
`JsonArchive`. Raakt `backup.ts`, `gdpr.ts`, `music-lists.ts` en `pdf-tools.ts`.

## Database

**`PRAGMA foreign_key_list` op de draaiende database is de waarheid.** Een
parser over `schema.ts` mist sleutels die inline in een kolomdefinitie staan.
Een analyse die daarop leunt komt op te veel tabellen uit.

**SQLite's standaard is `NO ACTION`.** Een lid met een chatbericht is daardoor
niet hard te verwijderen; dat is geen bug in de verwijdercode maar een
ontbrekende `ON DELETE`-regel.

## Vertalingen

**i18next kan met `$t(sleutel)` naar een andere sleutel verwijzen.** Scheelt
dezelfde zin op drie plekken in drie bestanden onderhouden.

## Testen

**De gedeelde `createTestEnvironment()` uitbreiden breekt andere bestanden.**
Alle modules aanzetten in die helper gaf `UNIQUE constraint failed:
association_modules...` in drie testbestanden die het zelf al deden. Wat één
test nodig heeft zet je in die test.

## Onderzoeken

**Een leeg scherm is niet vanzelf een kapot scherm.** Het beheerscherm voor
modules leek nul modules te tonen; het was de `PrivacyConsentGate` die een verse
testgebruiker tegenhield. Dump de paginatekst voordat je concludeert dat er iets
stuk is.
