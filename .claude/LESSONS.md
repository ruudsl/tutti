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

**Bij die sprong houdt npm de oude react in de lock vast.** Dit is een
workspace-opstelling: alle react-bibliotheken worden gehoist naar de
hoofd-`node_modules`, en `require('react')` vanuit bijvoorbeeld `@dnd-kit/core`
komt daar uit. Bewerk je alleen `frontend/package.json`, dan zet npm de nieuwe
versie _genest_ onder `frontend/node_modules` en laat de oude bovenin staan.
Twee kopieën, en de gehoiste bibliotheken praten met de verkeerde: `Invalid
hook call` op elk scherm dat ze gebruikt.

`npm install` repareert dat niet, ook niet na `rm -rf node_modules`: de
package-lock is leidend en die wijst nog naar de oude. Een `overrides`-blok
helpt evenmin - npm neemt het niet mee zolang de lock klopt. Wat wél werkt:
**de vermeldingen weghalen uit de lock, bovenin én in de workspace**, en dan
opnieuw installeren. Dan hoist npm de nieuwe versie vanzelf naar boven.

```bash
node -e "const fs=require('fs');const l=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
for (const k of Object.keys(l.packages)) if (/(^|\/)node_modules\/(react|react-dom|scheduler|@types\/react|@types\/react-dom)$/.test(k)) delete l.packages[k];
fs.writeFileSync('package-lock.json', JSON.stringify(l,null,2)+'\n');"
npm install
```

Controleer daarna dat er van elk precies één staat, bovenin en nergens anders:

```bash
node -e "console.log(require.resolve('react',{paths:['node_modules/@dnd-kit/core']}))"
```

**archiver 8 heeft de aanroepbare default-export laten vallen.** `archiver('zip')`
bestaat niet meer; het zijn nu de klassen `ZipArchive`, `TarArchive` en
`JsonArchive`. Raakt `backup.ts`, `gdpr.ts`, `music-lists.ts` en `pdf-tools.ts`.

**jsdom 30.1.0 heeft een kapotte `URL.createObjectURL`.** Er een `Blob` in
stoppen gooit `TypeError: Cannot read properties of undefined (reading
'_buffer')`. Elk scherm dat een bestand aanbiedt doet precies dat, dus zo'n test
valt om terwijl de applicatie niets mankeert. `jsdom` staat daarom op een vaste
`30.0.1` in `frontend/package.json` en op de negeerlijst in `dependabot.yml`.

**TypeScript 7 kan nog niet.** Het is de native herschrijving, en
`typescript-eslint` accepteert tot en met 8.70.1 alleen `>=4.8.4 <6.1.0`. De
linter kan de bron dan niet meer ontleden. Controleer dat met
`npm view typescript-eslint peerDependencies` voordat je het opnieuw probeert.

**Zoek bij een rode Dependabot-PR eerst uit of `main` zelf rood is.** Dat
scheelt een middag zoeken in een diff die er niets mee te maken heeft; zie de
tijdbom hieronder onder Testen.

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

**Een test met een vaste datum in de toekomst is een tijdbom.** De test voor
terugkerende repetities vroeg een reeks aan op 7 en 14 september 2026 en werkte
prima - tot 15 september. De route genereert met `between(new Date(), until)` en
maakt dus niets in het verleden aan, dus vanaf die dag kwam er een 400 uit op
een dag dat niemand iets had aangeraakt. Dat hield `main` rood en daarmee elke
openstaande Dependabot-PR. Reken datums uit vanaf vandaag.

**De gedeelde `createTestEnvironment()` uitbreiden breekt andere bestanden.**
Alle modules aanzetten in die helper gaf `UNIQUE constraint failed:
association_modules...` in drie testbestanden die het zelf al deden. Wat één
test nodig heeft zet je in die test.

## Onderzoeken

**Een leeg scherm is niet vanzelf een kapot scherm.** Het beheerscherm voor
modules leek nul modules te tonen; het was de `PrivacyConsentGate` die een verse
testgebruiker tegenhield. Dump de paginatekst voordat je concludeert dat er iets
stuk is.
