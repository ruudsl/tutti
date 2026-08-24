# Migratiepad naar PostgreSQL

Dit stuk beantwoordt één vraag: **wat zou er moeten gebeuren om Tutti op
PostgreSQL te laten draaien, en wat kost dat?**

Het is geen vergelijking van SQLite en Postgres — die staat overal en helpt
niemand. Het gaat over dít schema, déze queries en déze opslaglaag, met
getallen die uit de codebase zelf komen. Alle tellingen hieronder zijn gemeten
op de productiecode in `backend/src` (dus zonder tests), op `main` van
2026-08-24.

De uitkomst vooraf, zodat niemand zestig regels hoeft te lezen voor de
conclusie: **de koppeling met sql.js is smal maar diep.** Er is precies één
bestand dat de database opent, en dat is goed nieuws. Maar dat bestand biedt
een _synchrone_ API aan, en die aanname zit in 1.753 aanroepen verspreid over
160 bestanden. Postgres kan niet synchroon. Dat maakt de overstap een
herontwerp van de opslaglaag, geen configuratiewijziging.

---

## 1. Wanneer zou je dit willen?

Niet "voor de zekerheid". De redenen die deze migratie rechtvaardigen, in
volgorde van waarschijnlijkheid:

| Aanleiding                                      | Waarom SQLite dan niet meer volstaat                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Meer dan één backendproces**                  | De database staat volledig in het geheugen van één Node-proces en wordt naar een bestand weggeschreven. Twee processen betekent twee kopieën die elkaar overschrijven. Horizontaal schalen kan niet, ook niet met een gedeeld volume |
| **Databestand groeit voorbij het werkgeheugen** | sql.js laadt de hele database in RAM en exporteert hem in zijn geheel bij elke save. Bij een paar honderd MB aan gegevens wordt dat merkbaar in geheugen én in schrijftijd                                                           |
| **Beheerde back-ups en point-in-time-herstel**  | Nu is de back-up een kopie van een bestand. Een verenigingsbestuur dat "we willen terug naar dinsdagmiddag" vraagt, heeft daar niets aan                                                                                             |
| **Gelijktijdig schrijven**                      | Eén schrijver tegelijk. Bij 20-150 leden die vooral lézen is dat geen probleem; bij een kaartverkoop die opengaat wel                                                                                                                |

Wat **geen** aanleiding is: het gevoel dat een "echte" database professioneler
staat. De keuze voor SQLite is bewust gemaakt (zie
[ADR 0001](adr/0001-use-sqlite.md)) en de argumenten daarin gelden nog steeds
voor een zelf-hostende vereniging.

---

## 2. Wat er nu staat

### De opslaglaag

`backend/src/database/connection.ts` (431 regels) is het enige bestand dat
sql.js kent. Er is precies één `require('sql.js')`, op regel 13. Het bestand
bouwt een `DatabaseWrapper` die de API van better-sqlite3 nabootst:
`db.prepare(sql).get()/.all()/.run()`, `db.exec(sql)` en
`db.transaction(fn)`.

> Terzijde: `better-sqlite3` staat in geen enkele `package.json`. Alleen de
> vórm van die API is overgenomen. Drie documenten beschreven het als de
> gebruikte database-bibliotheek; die zijn in dezelfde wijziging als dit stuk
> rechtgezet.

De aannames in die wrapper die bij een serverdatabase niet meer gelden:

1. **Alles is synchroon.** `.get()` geeft een rij terug, geen `Promise`. Een
   netwerkverbinding kan dat niet.
2. **De database is een variabele.** Eén `new SQL.Database(buffer)` in het
   geheugen van dít proces; geen verbindingspool, geen andere lezers.
3. **Bewaren is een expliciete handeling.** `save()` exporteert de héle
   database en schrijft die atomair naar schijf (tmp-bestand + rename), met
   een debounce van 500 ms. Bij Postgres bestaat "bewaren" niet als apart
   begrip.
4. **Transactiestatus is één booleaanse vlag** (`inTransaction`) op het
   object. Bij een pool hoort transactiestatus bij een verbinding, niet bij de
   database.
5. **`init()` repareert het schema bij het opstarten.** Mislukte
   `CREATE INDEX`- en `no such column`-fouten worden gelogd en overgeslagen,
   in de hoop dat een migratie ze later goedmaakt. Dat is een
   SQLite-gewoonte; Postgres in productie hoort niet zo te starten.

### Het schema

| Wat                                   |      Aantal | Waar                                            |
| ------------------------------------- | ----------: | ----------------------------------------------- |
| `CREATE TABLE` in `schema.ts`         |         185 | `backend/src/database/schema.ts` (3.678 regels) |
| Migratiebestanden                     |          46 | `backend/src/migrations/*.ts`                   |
| Genummerde migraties (tweede systeem) | 15 tabellen | `backend/src/database/migrations.ts`            |
| Tabellen in `init.ts`                 |          10 | `backend/src/database/init.ts`                  |
| Tabel aangemaakt door een scheduler   |           1 | `backend/src/scheduler/gdpr-cleanup.ts:369`     |

Er zijn dus **vier plaatsen** waar tabellen ontstaan, plus twee onafhankelijke
migratiesystemen: een genummerd systeem met SQL-strings dat vanuit
`connection.init()` draait, en een tijdstempelsysteem
(`backend/src/migrations/runner.ts`) dat bijhoudt wat het gedaan heeft in een
`migrations`-tabel. Dat is nu al lastig — bij een overstap wordt het het
grootste struikelblok, want je moet weten wélk schema waar geldt.

### De typen

| Type / constructie                      | Aantal | In Postgres                                                                                                                               |
| --------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `TEXT PRIMARY KEY` (uuid als tekst)     |    335 | `TEXT`/`UUID`; werkt zoals het is                                                                                                         |
| `CURRENT_TIMESTAMP`                     |    609 | Bestaat, andere uitvoer (met tijdzone)                                                                                                    |
| `DATETIME` als kolomtype                |    600 | Bestaat niet; `TIMESTAMPTZ`                                                                                                               |
| `REAL` als kolomtype                    |    158 | Bestaat; **maar 104 daarvan zijn bedragen** (`amount`, `purchase_price`, `repair_cost`, `vat_amount`, …) en horen `NUMERIC(10,2)` te zijn |
| `BOOLEAN` met `DEFAULT 1` / `DEFAULT 0` |    135 | `BOOLEAN` bestaat, maar `1` is geen booleaanse waarde — dit is een harde fout                                                             |
| `AUTOINCREMENT`                         |      1 | Alleen `gdpr_cleanup_log`; `GENERATED … AS IDENTITY`                                                                                      |
| `BLOB`                                  |      0 | Niets te doen — bestanden staan op schijf, niet in de database                                                                            |

Twee dingen daaruit zijn opvallend gunstig. Ten eerste: sleutels zijn uuid's
als tekst, door de applicatie gegenereerd. Er is **geen enkele plek in de
productiecode die `lastInsertRowid` uitleest** — de wrapper geeft het terug,
niemand gebruikt het. Dat scheelt een klassieke migratieval. Ten tweede: geen
BLOB-kolommen, dus geen binaire gegevens die geconverteerd moeten worden.

Twee dingen zijn ongunstig. `BOOLEAN DEFAULT 1` is in Postgres geen
subtiliteit maar een weigering, en er staan minstens 51 vergelijkingen als
`is_active = 1` in de queries die dan ook stuklopen. En bedragen in `REAL`
(zwevende komma) zijn nu al fout — `0.1 + 0.2` is ook in SQLite niet `0.3` —
alleen valt dat pas op bij een afrekening die een cent verschilt.

### De queries

1.198 keer `db.prepare(` en 555 keer `db.exec(`, samen **1.753 aanroepen in
160 bestanden**, waarvan 83 routebestanden en 25 services. Ter schaal: de
productiecode is 107.685 regels TypeScript.

Wat daarvan SQLite-eigen is:

| Constructie                   |                Aantal | Vervanging in Postgres                                                                                                     |
| ----------------------------- | --------------------: | -------------------------------------------------------------------------------------------------------------------------- |
| `?`-plaatshouders             | in vrijwel elke query | `$1, $2, …` — mechanisch te vertalen, maar de volgorde moet kloppen                                                        |
| `is_x = 1` / `= 0`            |                   51+ | `= true` / `= false`                                                                                                       |
| `INSERT OR IGNORE`            |                    24 | `ON CONFLICT DO NOTHING`                                                                                                   |
| `INSERT OR REPLACE`           |                     2 | `ON CONFLICT … DO UPDATE` — let op: niet hetzelfde, `OR REPLACE` verwijdert de oude rij en laat `ON DELETE CASCADE` afgaan |
| `strftime(…)`                 |                    23 | `to_char(…)` / `EXTRACT`                                                                                                   |
| `date('now')`                 |                    18 | `CURRENT_DATE`                                                                                                             |
| `json_extract(…)`             |                    13 | `->>` / `jsonb_path_query`                                                                                                 |
| `GROUP_CONCAT(x)`             |                    12 | `string_agg(x, ',')` — het scheidingsteken is verplicht                                                                    |
| `LIMIT ? OFFSET ?`            |                    17 | Werkt zoals het is, alleen de plaatshouders veranderen                                                                     |
| `COLLATE NOCASE`              |                     4 | `ILIKE` of `CITEXT`                                                                                                        |
| `julianday(a) - julianday(b)` |                     2 | `a::date - b::date`                                                                                                        |
| `PRAGMA table_info(…)`        |                    42 | `information_schema.columns`                                                                                               |
| `sqlite_master`               |                    16 | `information_schema.tables`                                                                                                |
| `PRAGMA foreign_keys = ON`    |                     5 | Overbodig; in Postgres altijd aan                                                                                          |
| `ORDER BY RANDOM()`           |                     0 | Niets — alle 4 de treffers zijn `Math.random()` in JavaScript                                                              |
| `RETURNING`                   |                     0 | Nog niet gebruikt; in Postgres juist de nette manier                                                                       |

En drie regels die er nu al niet horen te staan, omdat ze SQL-functies met
**dubbele** aanhalingstekens aanroepen. SQLite accepteert dat als tekst,
Postgres leest het als een kolomnaam en weigert:

- `backend/src/routes/tours.ts:114` — `strftime("%Y", t.start_date) = ?`
- `backend/src/routes/events.ts:353` — `e.start_datetime >= datetime("now")`
- `backend/src/routes/practice-schedules.ts:110` — `ps.target_date >= date("now")`

### Datum-en-tijd als tekst

Dit is de gemeenste categorie, omdat er niets van stukgaat. Timestamps worden
op twee manieren opgeslagen: als ISO-tekst uit JavaScript
(`2026-08-23T14:20:53.571Z`) en als SQLite-tekst uit `CURRENT_TIMESTAMP`
(`2026-08-23 14:50:43`). SQLite vergelijkt beide als tekst, en op positie 11
staat een `T` (0x54) tegenover een spatie (0x20). Een vergelijking tussen die
twee vormen is dus **altijd onwaar**, ongeacht de datums.

Dat is deze maand als echte fout gevonden: berichten die vandaag gepubliceerd
werden, waren onzichtbaar voor gewone leden. Er staan nog **10** vergelijkingen
van een kolom met `datetime('now')` of `CURRENT_TIMESTAMP` in de code; of ze
misgaan hangt per geval af van hoe die kolom gevuld wordt, en dat is precies
waarom ze zo lastig te vinden zijn. In Postgres met `TIMESTAMPTZ` verdwijnt de
hele categorie — dat is een reëel voordeel van de migratie, geen bijvangst.

---

## 3. Wat al meezit

Niet alles is tegen. Vier dingen die de overstap goedkoper maken dan hij bij
een willekeurige codebase zou zijn:

1. **Eén toegangspunt.** Alle 160 bestanden importeren `db` uit
   `database/connection`. Er wordt nergens rechtstreeks een
   database-bibliotheek aangeroepen. Wat er achter die import zit, kan
   vervangen worden zonder dat de aanroepers weten waardoor.
2. **Sleutels zijn uuid's, door de applicatie gemaakt.** Geen
   volgnummerreeksen om over te zetten, geen `lastInsertRowid` om te
   vervangen.
3. **Er is een echte migratieloper.** `backend/src/migrations/runner.ts` houdt
   in een tabel bij wat er gedraaid is en kan terugdraaien. De vorm klopt;
   alleen de inhoud van de migraties is SQLite-dialect.
4. **Er ligt al gereedschap om schemafouten te vinden.**
   `backend/src/__tests__/database/schema-usage.test.ts` leest elke
   `INSERT INTO` uit de routebestanden en controleert tabel én kolommen tegen
   het echte schema. Dat is precies de test die je wilt hebben als je het
   schema opnieuw opbouwt — hij is al geschreven en hoeft alleen op de nieuwe
   schemabron te wijzen.

---

## 4. De obstakels, op volgorde van kosten

### A. Synchroon → asynchroon _(veruit het duurst)_

Dit is de migratie. Al het andere is bijwerk.

```ts
// nu
const lid = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// met een echte serverdatabase
const lid = (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
```

Die verandering raakt 1.753 aanroepen, en niet alleen op de regel zelf: elke
functie die zo'n aanroep bevat wordt `async`, elke aanroeper van díé functie
moet `await`, en zo verder tot aan de routehandler. In een codebase van
107.685 regels is dat geen zoek-en-vervang.

Er is één ontsnapping die het overwegen waard is: **een adapter die dezelfde
synchrone vorm aanbiedt bovenop `better-sqlite3`** in plaats van sql.js. Dat
lost het schaalprobleem niet op, maar het verwijdert de "hele database in
RAM"-aanname en de save-debounce, en het is een middag werk in plaats van
maanden. Zie §6.

### B. Transacties door de aanroepketen

`db.transaction(fn)` werkt nu omdat er één database is. Met een pool moet de
verbinding waarop `BEGIN` is gedaan meegegeven worden aan élke query
daarbinnen. Dat betekent een extra parameter in elke functie die binnen een
transactie iets doet — **89 transactieblokken** in routes en services, met
alles wat ze aanroepen.

De savepoint-logica die er nu in zit (voor geneste transacties, na een fout
bij het importeren vanuit Entra ID) werkt in Postgres net zo; die kan mee.

### C. Het schema opnieuw opbouwen

Vier bronnen, twee migratiesystemen, 185 `CREATE TABLE` in één bestand van
3.678 regels. Dit moet één keer goed: één schemabron, één migratieloper. Dat
is werk dat óók waarde heeft als de migratie nooit komt — de bug waarbij
`equipment_loans` twee keer in `schema.ts` stond met verschillende kolommen,
en `CREATE TABLE IF NOT EXISTS` stil de eerste liet winnen, is een direct
gevolg van deze situatie.

### D. Typen en dialect

De tabellen in §2 hierboven. Mechanisch werk, goed te vinden, goed te testen.
Reken op een paar dagen, niet op weken. De 104 bedragen van `REAL` naar
`NUMERIC` is een verbetering die je toch al wilt.

### E. De testomgeving

`backend/src/__tests__/testDb.ts` bevat een tweede kopie van de wrapper (met
dezelfde `runStatement`/`lastInsertRowid`-logica). Bij een overstap moeten de
tests op een echte Postgres draaien — een container in CI, of `pg-mem` voor
snelheid. Dat raakt de opzet van de hele testsuite, en die is inmiddels 83,4%
dekking waard; die niet stukmaken is een randvoorwaarde, geen bijzaak.

### F. De gegevens zelf overzetten

Het eenvoudigste deel, en het enige waar een bestaand hulpmiddel echt helpt:
`pgloader` leest een SQLite-bestand rechtstreeks in Postgres in. Aandacht
vragen alleen de datums-als-tekst (§2) en de booleans (0/1 → `false`/`true`).
Omdat de bestanden (bladmuziek, audio) op schijf staan en niet in de database,
hoeft daar niets mee te gebeuren.

---

## 5. Een pad in fasen

Elke fase is los bruikbaar en heeft waarde ook als de volgende nooit komt. Dat
is bewust: de meeste verenigingen zullen fase 3 nooit nodig hebben.

**Fase 0 — opruimen wat nu al fout is** _(dagen)_
Drie dubbele aanhalingstekens repareren (§2), de 10 datumvergelijkingen
nalopen, de 104 bedragen van `REAL` naar een exact type. Levert direct werkende
functies op; heeft niets met Postgres te maken behalve dat het het pad
vrijmaakt.

**Fase 1 — één schemabron** _(1-2 weken)_
Vier bronnen terugbrengen tot één, twee migratiesystemen tot één.
`schema-usage.test.ts` uitbreiden zodat hij ook `SELECT` en `UPDATE`
controleert. Zonder dit weet je bij fase 3 niet wat je overzet.

**Fase 2 — het dialect isoleren** _(1-2 weken)_
De 24 `INSERT OR IGNORE`, de 23 `strftime`, de 12 `GROUP_CONCAT`, de 42
`PRAGMA table_info` en de 16 `sqlite_master`-queries achter hulpfuncties in
`backend/src/utils/database.ts`. Daarna staat het SQLite-eigen deel op één
plaats in plaats van verspreid over 160 bestanden.

**Fase 3 — de opslaglaag vervangen** _(maanden, niet weken)_
`connection.ts` herschrijven op `pg` met een pool, en dan de asynchrone golf
door de hele codebase. Dit is het punt waarop het een herontwerp wordt. Doe
dit niet zonder een concrete aanleiding uit §1.

---

## 6. Een goedkoper alternatief dat de meeste pijn wegneemt

Als de aanleiding "sql.js houdt alles in het geheugen en schrijft de hele
database bij elke wijziging weg" is — en niet "we willen meerdere
serverprocessen" — dan is er een tussenstap die een fractie kost:

**Vervang sql.js door `better-sqlite3`.** De wrapper in `connection.ts` bootst
de API van better-sqlite3 al na; de aanroepers merken er niets van. Weg zijn:
de volledige database in RAM, de export-bij-elke-save, de debounce-timer en de
`inTransaction`-vlag die bij een fout ooit stil het wegschrijven uitzette.
Blijft: één schrijver tegelijk, één proces.

Dat is dagen werk in plaats van maanden, en het lost het waarschijnlijkste
schaalprobleem op. `libSQL`/Turso is een variant daarop die ook replicatie
biedt en dezelfde SQL spreekt.

---

## 7. Aanbeveling

Doe fase 0 nu — dat zijn openstaande fouten, geen voorbereiding. Doe fase 1
wanneer er tijd is; die betaalt zichzelf terug in minder schemabugs, ongeacht
welke database eronder zit.

Ga **niet** naar Postgres tot een van de aanleidingen uit §1 zich echt
voordoet. De koppeling is smal genoeg dat dit stuk over een jaar nog klopt, en
de tussenstap uit §6 vangt het meest waarschijnlijke geval op voor een
fractie van de prijs.

Wanneer het wel zover komt: begin bij fase 1 en 2, niet bij `connection.ts`.
De verleiding is om met de opslaglaag te beginnen omdat dat het interessante
deel is — maar zonder één schemabron migreer je iets waarvan je niet weet hoe
het eruitziet.

---

## Verwijzingen

- [ADR 0001: Use SQLite as Database](adr/0001-use-sqlite.md) — de
  oorspronkelijke afweging
- [MIGRATIONS.md](MIGRATIONS.md) — hoe het migratiesysteem nu werkt
- [ARCHITECTURE.md](ARCHITECTURE.md) — plaats van de opslaglaag in het geheel
- `backend/src/database/connection.ts` — het enige bestand dat sql.js kent
- `backend/src/__tests__/database/schema-usage.test.ts` — de test die
  INSERT-statements tegen het echte schema houdt
