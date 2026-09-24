# Tutti Roadmap

Dit document beschrijft de geplande ontwikkeling van Tutti voor de komende 12 maanden.

---

## Overzicht Werkpakketten

| WP         | Titel                                           | Uren             | Status       |
| ---------- | ----------------------------------------------- | ---------------- | ------------ |
| 1          | Onafhankelijke security audit                   | extern           | ⬜ Gepland   |
| 2          | Security audit remediation                      | 65h              | ⬜ Gepland   |
| 3          | WCAG 2.1 AA accessibility audit + fixes         | 45h              | ✅ Voltooid  |
| 4          | Docker packaging + self-hosting guide           | 50h              | ✅ Voltooid  |
| 5          | Open music metadata (MusicXML / JSKOS)          | 75h              | ✅ Voltooid  |
| 6          | Privacy-by-design review + GDPR hardening       | 45h              | 🔄 Deels     |
| 7          | Community docs, onboarding, multilingual README | 45h              | ✅ Voltooid  |
| 8          | CI/CD hardening + test coverage >80%            | 50h              | ✅ Voltooid¹ |
| 9          | Community outreach (KNMO, federaties)           | 25h              | ⬜ Gepland   |
| 10         | PWA hardening + mobile UX                       | 55h              | 🔄 Deels     |
| 11         | Pilot deployments (2-3 verenigingen)            | 45h              | ⬜ Gepland   |
| 12         | Achtergrondtaken die een herstart overleven     | 40h              | ✅ Voltooid  |
| **Totaal** |                                                 | **540h + audit** |

¹ Alle deliverables zijn geleverd, maar de staging-uitrol is _ingericht_ en nog niet _aantoonbaar werkend_: hij heeft nog geen keer gedraaid, en de Build Command in het Render-dashboard staat nog zonder `--include=dev`. Zie WP8 hieronder.

---

## Openstaande beslissingen

Bevindingen uit de dekkingsronde van augustus 2026 die bewust níét zelf zijn
ingevuld: ze vragen een keuze die van de omgeving of van de bedoeling afhangt,
niet van de code. Ze staan hier zodat ze niet in een samengevoegde
pull request achterblijven.

1. ~~`X-Forwarded-For` wordt op twee plekken nog rechtstreeks gelezen.~~
   **Opgelost op 22-09-2026.** `middleware/ipWhitelist.ts` en
   `routes/tickets.ts` namen het meest linkse adres uit de kopregel — het adres
   dat de aanvrager er zelf in zet — waardoor de IP-witlijst voor het
   beheerscherm met één kopregel te omzeilen was, en de teller voor verdachte
   bestellingen bij elk verzonnen adres opnieuw begon. Beide lezen nu `req.ip`.

   De open vraag was hoeveel proxy's er vóór de applicatie staan. Dat bleek
   voor alle drie de meegeleverde opstellingen hetzelfde: precies één (Render;
   nginx in `docker-compose.yml`; Traefik in `docker-compose.prod.yml`), dus
   `1` blijft de standaard. Wie er zelf nog een laag vóór zet, stelt
   `TRUST_PROXY` in — zie `docs/SELF_HOSTING.md`. Alleen een getal is
   toegestaan: `true` zou het lek via de achterdeur terugbrengen.

   Bij het nalopen bleek nog een tweede achterdeur: `docker-compose.yml` zette
   de backendpoort open op alle interfaces, en `docker-compose.prod.yml` nam
   dat over. Rechtstreeks op 3001 sla je de proxy over en kies je alsnog je
   eigen adres. Die poort luistert nu alleen op `127.0.0.1`

2. **`payment_settings` heeft Mollie-sleutels per vereniging die nergens
   gebruikt worden.** Alle betalingen lopen over één sleutel uit de omgeving.
   Ofwel de tabel gaat weg, ofwel de code gaat hem gebruiken — nu wekt hij de
   indruk dat verenigingen hun eigen betaalaccount kunnen instellen
3. **`notificationChannels` geeft geen `associationId` door.** Of dat erbij moet
   hangt ervan af of een kanaal per vereniging verschilt
4. ~~`controleerBetaalId` kapt af op 64 tekens.~~ **Opgelost op 24-09-2026.**
   De grens is nu die van Stripe, 255 tekens. Een echt sessiekenmerk
   (`cs_test_` plus 58 tekens) leverde eerder stilzwijgend 'geen gegevens' op,
   en bij een terugbetaling 'Refund service unavailable'. De test die de oude
   grens vastlegde, legt nu de nieuwe vast
5. ~~`backend/src/database/migrations.ts` is dood gewicht.~~ **Onjuist,
   24-09-2026.** `database/connection.ts` roept bij elke start `runMigrations`
   uit dat bestand aan, en die draait vijftien oudere, genummerde migraties
   (tabel `schema_migrations`), met een eigen test in
   `schema-migraties.test.ts`. Weghalen zou installaties breken die er nog niet
   langs zijn gekomen. Het blijft staan; opruimen kan pas als die migraties in
   de nieuwe loper zijn opgenomen
6. **De captcha valt open bij een fout.** Gaat de controledienst plat, dan komt
   iedereen erdoor. Dat is bewust zo gelaten (een captcha die dichtvalt sluit
   bij een storing álle echte gebruikers buiten); vastgelegd in een test zodat
   het een keuze blijft en geen ongeluk

7. **`POST /tasks/templates/:id/apply` bestaat niet aan de serverkant.** De
   frontend heeft er een functie voor; de backend heeft alleen
   `/templates/:id/create-task`, en het woord "apply" komt in `tasks.ts`
   nergens voor. Wat "apply" zou moeten doen dat "create-task" niet doet —
   vermoedelijk meerdere taken tegelijk aanmaken — staat nergens vastgelegd.
   De functie wordt op dit moment niet vanuit de interface aangeroepen, dus er
   is niets stuk; bouwen zou gokken naar een bedoeling zijn
8. **`CampaignRecipient` noemt `deliveredAt` en `bouncedAt`**, en
   `EmailCampaigns.tsx` rendert een tak op `deliveredAt`. Die kolommen bestaan
   niet in `email_campaign_recipients` en de namen komen nergens in de backend
   voor. Een kolom erbij vraagt eerst een antwoord op wie hem vult — de mailer
   zet nu nergens 'delivered'. Tot die keuze gemaakt is, is die tak dode code
9. ~~Negen vertaalsleutels die `createI18nErrorMap` opvraagt bestaan in geen van
   de drie talen.~~ **Opgelost op 22-08-2026**, en het bleek de top van een
   ijsberg: er ontbraken er nog 75 andere. De bestaande waaktest kon dit soort
   gat per definitie niet vinden, want die vergeleek de drie talen onderling en
   een sleutel die overal ontbreekt ontbreekt overal even hard. Er staat nu een
   controle naast die de code met de bestanden vergelijkt.

   **Die 75 zijn inmiddels ook weg.** 72 kwamen erbij in de
   toegankelijkheidsronde; de laatste drie op 22-09-2026. Die drie
   (`concerts.posterDownloaded`, `concerts.setlistSaved`,
   `practice.timerSessionEnded`) zetten hun tekst zelf in elkaar met een
   Nederlandse sjabloonstring en gaven géén waarden aan `t()` mee, dus een
   Engelse of Duitse gebruiker kreeg de Nederlandse zin. Ze geven hun waarden nu
   mee, en de minuten gaan via `_one`/`_other` ("1 minuut", niet "1 minuten").
   De achterstandslijst in `src/locales/__tests__/translations.test.ts` is leeg;
   het mechanisme blijft staan zodat een nieuw gat weer opvalt

10. **Kortingscodes zijn half gebouwd.** De backend kan ze aanmaken, wijzigen en
    controleren (`routes/discount-codes.ts`), maar er is geen scherm voor, de
    bestelroute in `routes/tickets.ts` neemt geen code aan, en
    `applyDiscountCode` in `services/ticketing.ts` - die het gebruik vastlegt -
    wordt nergens aangeroepen. `uses_count` blijft daardoor altijd 0, en
    "maximaal 50 keer" of "één keer per koper" wordt nooit gehandhaafd. Kwaad
    kan het nu niet: niemand kan een code gebruiken. Afbouwen of weghalen is
    een productkeuze. Wordt het afgebouwd, zet dan de grens in het vastleggen
    zelf: `uses_count` alleen ophogen `WHERE uses_count < max_uses`, en kijken
    of er een rij veranderde. Anders kunnen twee gelijktijdige bestellingen
    samen over de grens heen - zie `docs/POSTGRES_MIGRATION.md` §4.H
11. **Kaartfacturen van twee verenigingen op één dag krijgen hetzelfde nummer.**
    `services/invoices.ts` telt per vereniging per dag (`INV-20260923-0001`),
    maar `ticket_invoices.invoice_number` is uniek over de hele installatie. De
    tweede vereniging die op een dag een kaart verkoopt, krijgt daardoor
    `UNIQUE constraint failed` en geen factuur. Vandaag slaapt dit:
    `createInvoice` wordt nergens aangeroepen. Het gaat af zodra kaartfacturen
    worden aangesloten. Twee oplossingen, en de keuze raakt wat er op de
    factuur staat:
    - de vereniging in het nummer opnemen (bijvoorbeeld de slug): geen
      schemawijziging, maar een lang nummer dat meeverandert met de slug;
    - de sleutel `(association_id, invoice_number)` maken, zoals bij `invoices`
      en `transactions`: het juiste model, maar een tabel-herbouw waarbij
      `invoice_line_items` (met `ON DELETE CASCADE`) mee moet, omdat de
      migratieloper elke migratie in een transactie draait en de
      verwijzingscontrole daarbinnen niet uit kan

Daarnaast wachten twee GitHub-instellingen die alleen de eigenaar van de
repository kan zetten. Zonder deze twee stopt `deploy-staging.yml` met een
uitleg in plaats van met een fout, en rolt er dus niets uit:

- secret `RENDER_STAGING_DEPLOY_HOOK`
- variable `STAGING_URL`

Het inrichten staat beschreven in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## WP1: Onafhankelijke Security Audit

**Doorlooptijd:** 2-3 weken  
**Afhankelijkheden:** Geen

### Scope

- Volledige security audit door onafhankelijke derde partij
- Focus op multi-tenant data isolatie, authenticatie, file uploads

### Deliverables

- [ ] Security audit rapport
- [ ] Lijst met bevindingen (kritiek/hoog/medium/laag)
- [ ] Aanbevelingen voor remediation

---

## WP2: Security Audit Remediation

**Doorlooptijd:** 3-4 weken  
**Afhankelijkheden:** WP1

### Scope

Remediatie van alle bevindingen uit WP1, typisch:

- Authenticatie flows verbeteren
- File upload validatie aanscherpen
- Rate limiting verfijnen
- Tenant isolatie checks versterken

### Deliverables

- [ ] Alle kritieke en hoge bevindingen opgelost
- [ ] Alle medium bevindingen opgelost of gedocumenteerd met mitigatie
- [ ] Re-test door auditor (indien van toepassing)
- [ ] Security changelog

---

## WP3: WCAG 2.1 AA Accessibility Audit + Fixes

**Doorlooptijd:** 3 weken  
**Afhankelijkheden:** Geen

### Scope

Formele audit van WCAG 2.1 AA compliance:

- Screen reader ondersteuning (NVDA, VoiceOver)
- Keyboard navigatie
- Kleurcontrast (minimaal 4.5:1)
- Focus indicatoren
- ARIA labels en landmarks

### Deliverables

- [x] Accessibility audit rapport
- [x] Fixes voor alle gevonden issues
- [x] Automated accessibility tests (axe-core)
- [x] Accessibility statement

---

## WP4: Docker Packaging + Self-Hosting Guide

**Doorlooptijd:** 3 weken  
**Afhankelijkheden:** Geen

### Scope

- Officiële Docker image op Docker Hub
- Docker Compose configuratie voor standaard deployments
- Volume-based storage met automated backups
- PostgreSQL migratie pad documenteren

### Deliverables

- [x] Kant-en-klare images in een registry — _`.github/workflows/publish-images.yml` publiceert backend en frontend naar `ghcr.io/ruudsl/tutti-backend` en `-frontend` bij elke merge naar `main` en bij elke versietag_
  - Gekozen voor GitHub Container Registry en niet voor Docker Hub: dat werkt met `GITHUB_TOKEN` en vraagt geen account, geen organisatienaam en geen secrets die iemand moet verversen. Docker Hub is later toe te voegen als de naamruimte `tutti` beschikbaar is
  - `docker-compose.yml` heeft nu `image:` naast `build:`, zodat `docker compose up` de image ophaalt en zelf-hosten geen bouwomgeving vraagt
- [x] `docker-compose.yml` met alle services
- [x] `docker-compose.prod.yml` voor productie
- [x] Self-hosting guide voor non-developers
- [x] Backup/restore scripts
- [x] Health check endpoints
- [x] PostgreSQL migratiepad gedocumenteerd — _`docs/POSTGRES_MIGRATION.md`: wat er werkelijk aan sql.js vastzit, de obstakels op volgorde van kosten, en een pad in vier fasen waarvan elke fase los bruikbaar is_
  - Kern van de bevinding: de koppeling met sql.js is **smal maar diep**. Eén bestand kent sql.js (`backend/src/database/connection.ts`, één `require` op regel 13), maar het biedt een _synchrone_ API aan en die aanname zit in 1.753 aanroepen verspreid over 160 productiebestanden. Postgres kan niet synchroon; dat maakt de overstap een herontwerp van de opslaglaag, geen configuratiewijziging
  - Meevallers: sleutels zijn door de applicatie gemaakte uuid's (geen enkele plek leest `lastInsertRowid`), geen BLOB-kolommen, één toegangspunt, en `schema-usage.test.ts` is al het gereedschap dat je bij een schemaherbouw wilt hebben
  - Tegenvallers: het schema staat op vier plaatsen met twee migratiesystemen, 135 × `BOOLEAN DEFAULT 1` (in Postgres een harde fout), 104 bedragen in `REAL`, 89 transactieblokken die een verbinding door de aanroepketen moeten gaan doorgeven
  - Onderweg gevonden en meteen rechtgezet: drie documenten noemden `better-sqlite3` als de gebruikte bibliotheek terwijl die in geen enkele `package.json` staat, en ADR 0001 noemt WAL als mitigatie terwijl sql.js geen journal heeft — `journal_mode` wordt nergens gezet
  - De aanbeveling in het stuk is nadrukkelijk **nog niet migreren**: doe fase 0 en 1 (die betalen zich terug ongeacht de database eronder), en pak Postgres pas als er een concrete aanleiding is

---

## WP5: Open Music Metadata (MusicXML / JSKOS)

**Doorlooptijd:** 4-5 weken  
**Afhankelijkheden:** Geen

### Scope

Integratie van open muziek metadata standaarden:

- MusicXML metadata velden in database schema
- JSKOS vocabularies voor gedeelde repertoire indexering
- Interoperabiliteit tussen verenigingen

### Deliverables

- [x] MusicXML metadata import/export
- [x] JSKOS vocabulary integratie
- [x] API endpoints voor metadata uitwisseling
- [x] Migratie scripts voor bestaande data
- [x] Documentatie metadata standaarden

---

## WP6: Privacy-by-Design Review + GDPR Hardening

**Doorlooptijd:** 3 weken  
**Afhankelijkheden:** Geen

### Scope

Gestructureerde GDPR / privacy-by-design review:

- Data minimalisatie
- Bewaartermijnen
- Leden data export/verwijdering
- Recht op vergetelheid implementatie
- Privacy documentatie

### Deliverables

- [x] Privacy Impact Assessment (PIA) — _`docs/PIA.md`: de technische helft ingevuld en onderbouwd; de beoordelingshelft staat als vragenlijst in §9 en hoort bij het bestuur, niet bij de software_
  - Een PIA heeft twee helften. De feitelijke — welke gegevens, wie ziet ze, waar gaan ze heen, hoe lang blijven ze, wat gebeurt er bij inzage en wissen — is uit de code af te leiden en staat er nu in, met bestandsnamen en regelnummers. De beoordeling — noodzaak, evenredigheid, grondslag, restrisico — kan software niet maken
  - **De inzage-export dekt 10 van de 70 tabellen** die gegevens over een lid bevatten. Aanwezigheid, kaartaankopen, stemmen op peilingen, chatberichten en opgegeven beschikbaarheid ontbreken. `docs/GDPR.md` beschrijft bovendien een ZIP met acht losse bestanden; wat de code maakt is één JSON zonder die inhoud
  - **Een lid dat ooit een chatbericht heeft gestuurd, is niet definitief te verwijderen.** `chat_messages`, `annotation_stamps` en `sync_queue` hebben een foreign key zonder `ON DELETE`-clausule; SQLite leest dat als `NO ACTION` en weigert de verwijdering. Uitgeprobeerd tegen een kopie van een echte database: `FOREIGN KEY constraint failed`
  - **`instrument_history` bewaart naam en ip-adres na een harde verwijdering.** Het is de enige tabel met een `user_id` zonder foreign key naar `users`, en hij bewaart daarnaast `user_name` en `ip_address`. Ook uitgeprobeerd: de rij blijft staan met beide velden erin
  - **62 van de 70 tabellen kennen geen bewaartermijn.** De opruimtaak dekt er acht, precies de acht die `GDPR.md` noemt
  - Deze vier staan er als bevinding, niet als reparatie: ze veranderen wat een export en een verwijdering betékenen, en dat is een keuze van het bestuur voordat de code hem vastlegt
  - Onderweg rechtgezet: mijn eerste analyse las de foreign keys uit de broncode en miste de inline gedeclareerde. Vijf tabellen leken persoonsgegevens te bewaren na verwijdering; het bleek er één. De cijfers hierboven komen uit `PRAGMA foreign_key_list` op de draaiende database
- [ ] PIA: de beoordelingshelft — _§9 van `docs/PIA.md` is een vragenlijst, geen ingevuld oordeel. Noodzaak, evenredigheid, grondslag per verwerking, welke koppelingen werkelijk aanstaan, wie super-admin is en welke restrisico's het bestuur accepteert: dat kan software niet vaststellen. Zolang die vragen open staan is er een onderbouwing en nog geen PIA_
- [x] Data Processing Agreement (DPA) template
- [x] Leden data export functie (GDPR Art. 20) — _werkte tot 19-08-2026 niet: de route stond onder `/:id` en was daardoor onbereikbaar, en de query eronder vroeg kolommen op die niet in `activity_log` bestaan. Beide gerepareerd en geverifieerd tegen een draaiende server_
  - **Werkt, maar dekt niet alles.** De onderbouwing voor de PIA laat zien dat de export 10 van de 70 tabellen met gegevens over dat lid meeneemt. Aanwezigheid, kaartaankopen, stemmen op peilingen, chatberichten en beschikbaarheid ontbreken. Wat er wél in hoort is een keuze van het bestuur — zie `docs/PIA.md` §5
- [x] Account verwijdering met cascade (GDPR Art. 17) — _57 van de 70 tabellen cascaden mee, 9 anonimiseren de verwijzing zoals bedoeld_
  - **Loopt stuk bij een lid met een chatbericht.** `chat_messages`, `annotation_stamps` en `sync_queue` hebben een foreign key zonder `ON DELETE`-clausule; met foreign keys aan weigert SQLite dan de verwijdering. Uitgeprobeerd tegen een kopie van een echte database: `FOREIGN KEY constraint failed`. Zie `docs/PIA.md` §6
  - **`instrument_history` blijft staan, mét naam en ip-adres.** Enige tabel met een `user_id` zonder foreign key naar `users`
- [x] Bewaartermijnen configuratie per data type
- [x] Privacy policy template

---

## WP7: Community Docs, Onboarding, Multilingual README

**Doorlooptijd:** 3 weken  
**Afhankelijkheden:** WP4 (voor deployment docs)

### Scope

- Uitgebreide Engelse documentatie
- Verbetering Duitse en Nederlandse vertalingen
- Community governance via GitHub Discussions
- Contributie beleid

### Deliverables

- [x] Architecture documentation
- [x] API reference (OpenAPI/Swagger) — `backend/src/swagger.ts`, gemount op `/api/docs`
- [x] Deployment guide (SELF_HOSTING.md)
- [x] Contributing guide (CONTRIBUTING.md)
- [x] Code of Conduct
- [x] Issue/PR templates
- [x] Public roadmap (dit document)

---

## WP8: CI/CD Hardening + Test Coverage >80%

**Doorlooptijd:** 3-4 weken  
**Afhankelijkheden:** Geen

### Huidige Status

Gemeten 23-08-2026, over de **hele** backend respectievelijk frontend:

|          | statements              | branches | functions | lines |
| -------- | ----------------------- | -------- | --------- | ----- |
| Backend  | **83,4%** (19227/23058) | 75,7%    | 84,4%     | 83,6% |
| Frontend | **81,6%** (19821/24294) | 72,9%    | 76,2%     | 82,4% |

- CI-drempels: backend 82 / 74 / 83 / 82, frontend 80 / 71 / 74 / 80 (statements / branches / functions / lines). Die staan bewust onder de gemeten stand: hoog genoeg om een terugval te vangen, laag genoeg om niet af te gaan op meetruis
- Het frontendcijfer is op 23-08-2026 licht gedaald (van 35,4 naar 35,1) doordat `src/api.ts` is opgeheven. Dat is geen terugval: die 4.149 regels waren 44% gedekt tegen een codebasegemiddelde van 35, en wie boven het gemiddelde gedekte code weghaalt verlaagt het gemiddelde. Dezelfde behoefte wordt nog steeds getest — `src/api` staat als geheel op 87%
- De backend ging in drie PR's (#160, #161, #162, #163) van 46,4% naar 64,4%; het aantal tests van 2.895 naar 4.629 over 173 bestanden. De frontend van ~273 naar 774 tests over 32 bestanden
- Onderweg zijn er ruim veertig echte fouten gevonden en gerepareerd, elk met een test die zonder de reparatie rood is. De zwaarste: de nepbetaalprovider draaide gewoon door in productie (en meldde een terugbetaling als geslaagd), uitloggen wiste IndexedDB niet (op een gedeelde tablet zag de volgende gebruiker de gegevens van de vorige vereniging, inclusief de synchronisatiewachtrij), SQL-injectie via `?lang=`, een Telegram-bottoken in de logregels, elk CIDR-bereik in de IP-witlijst kwam stilzwijgend met niets overeen, `connection.ts` stopte na één mislukte rollback stilletjes met naar schijf schrijven, een SEPA-incasso werd als overboeking aangemaakt, en elke verenigingsbeheerder was platformbeheerder
- De frontend ging op 22-08-2026 van 6,9% naar 24,2%, met 2.641 tests over 93 bestanden (was 774 over 32), en staat nu op 3.010 tests over 138 bestanden. `src/api.ts` - 4.149 regels, eerder zonder ook maar één test - is op 23-08-2026 opgeheven: dat bestand schaduwde de map `src/api/` ernaast, waardoor die map jarenlang onbereikbaar was. De api-laag staat nu op 87%
- Op 22-08-2026 zijn de grote pagina's opgeknipt, met per pagina eerst een karakteriseringstest als vangnet. **Branches ging daarmee van 8,7% naar 14,0%** terwijl statements maar drie punten steeg - dat bevestigt dat daar het overgrote deel van de vertakkingen zat, en dat geen enkele hoeveelheid api- en hooktests dat getal kon meetillen:

| pagina        | was   | index nu                  |
| ------------- | ----- | ------------------------- |
| Accounting    | 2.680 | 851                       |
| Rehearsals    | 1.950 | 886                       |
| Concerts      | 1.655 | 1.289                     |
| SeasonPlanner | 1.352 | 277                       |
| Contacts      | 1.344 | 311                       |
| MusicTitles   | 1.317 | 411                       |
| Settings      | 1.495 | ongewijzigd, wel 17 tests |

- **`Settings.tsx` is bewust niet opgeknipt.** 40 useState, 6 useQuery, 5 useEffect en 19 handlers in één functie. De secties lijken zelfstandig, maar de toestand hoort bij de sectie en niet bij de pagina: alleen de opmaak van de SMTP-sectie verplaatsen geeft een component met twintig props, en de toestand meeverhuizen is geen verhuizing meer maar een herontwerp - bij de Microsoft 365-sectie verandert dat aantoonbaar gedrag, want die query draait nu onvoorwaardelijk terwijl de sectie alleen zichtbaar is als Microsoft is ingesteld. Daarbij bedient één bevestigingsdialoog vijf secties. Wat wél goedkoop te knippen viel is samen 150 van de 1.495 regels: dat haalt tien procent weg, laat de zware negentig procent staan, en levert wel een map op die suggereert dat de pagina opgedeeld is. Een herontwerp per sectie is een aparte, bewuste keuze; het vangnet dat er nu staat maakt hem na te lopen
- **Waarom de eerdere cijfers niet klopten:** er stond geen `include` in de coverage-instellingen, en de v8-provider telt dan alleen bestanden die een test toevallig inlaadt. Bestanden die geen enkele test aanraakt verdwenen uit de noemer in plaats van als nul mee te tellen. Aan de backendkant ging de meting over 6.140 van de 21.664 statements; aan de frontendkant over 2.134 van de 24.789, wat als 82 procent las. Dat gaf ook een averechtse prikkel: een test toevoegen trok het aangeroepen bestand de noemer in, waardoor het percentage dáálde terwijl er méér getest werd
- Er zijn twee waaktests bijgekomen die een hele klasse fouten afvangen in plaats van één geval: `route-shadowing.test.ts` (een letterlijk pad onder een parameterpad — dat kwam vijf keer eerder voor) en `wijzigingsschema-standaardwaarden.test.ts`
- De backendsuite draait sinds #163 parallel (`fileParallelism: true`): 19m35s → 7m52s lokaal, 11m06s op CI. De oude reden om dat uit te zetten — "om databaseconflicten te voorkomen" — gold niet: de testdatabase zit volledig in het geheugen
- Integratietests draaien tegen het echte schema (`src/database/schema.ts` + migraties)
- CI: GitHub Actions — jobs voor backend, frontend, E2E (Playwright), lint, security audit, CodeQL, Lighthouse en Docker build
- CD: images naar ghcr.io bij elke merge op `main`; staging-uitrol staat klaar maar wacht op twee instellingen (zie hieronder)

### Scope

- Test coverage verhogen naar >80%
- Dependency vulnerability scanning
- Integration tests voor multi-tenant isolatie
- Automated deployments

### Deliverables

- [x] Unit tests: >80% coverage — _backend **83,4%**, frontend **81,6%**_ (statements; lines 83,6% en 82,4%)
  - **De 50 uur die hiervoor begroot staat was niet realistisch.** Alleen al de eerste drie backend-PR's (12,9% naar 64,4%) waren meer werk dan de hele post; daarna kwamen er nog vier rondes bij, aan beide kanten
  - De volgorde was: eerst de api-laag en de hooks, dan de grote pagina's opknippen, dan pas tests daarop. Andersom zouden die tests vastzitten aan een structuur die toch moest wijken. `Accounting.tsx` ging van 2.680 regels naar 851, `Rehearsals.tsx` van 1.950 naar 886
  - **De backend is op 23-08-2026 over de 80% gegaan: 64,7% -> 83,4%**, in een ronde met tien parallelle agenten over twintig bronbestanden. 1.466 tests erbij (4.785 -> 6.251), 205 testbestanden. Onderweg zijn er **40 echte fouten** gevonden; 75 tests zijn aantoonbaar rood zonder de reparatie
  - Wat die ronde over de fouten zegt: bijna geen enkele was subtiel. `GET /export/accounts` gaf altijd een 500 omdat er een parameter te veel meeging; `create_task` werkte in geen enkele workflow omdat de motor een status zette die de CHECK niet toelaat; een lid als passagier aanmelden gaf altijd een 500 op een NOT NULL-kolom. Ze konden blijven staan omdat geen enkele test die route ooit aanriep
  - **De frontend is op 23-08-2026 over de 80% gegaan: 36,6% -> 81,6%**, in drie golven van tien parallelle agenten over ruim honderd bronbestanden. 2.850 tests erbij (3.339 -> 6.189), 276 testbestanden
  - Branches (72,9%) en functions (76,2%) blijven onder de 80. Dat is eerlijk zo gelaten: de resterende vertakkingen zijn grotendeels `?? null`-terugvallen en stijltakken, en daar een test op zetten bewaakt niets
  - Twee bestanden zijn bewust ongedekt gebleven: `sw-custom.ts` (113 statements) draait als service worker in een eigen levenscyclus, en `src/index.ts` en `migrations/cli.ts` aan de serverkant zijn opstartbestanden. Die testen vraagt om een eigen aanpak, niet om een dekkingsronde
- [x] Integration tests voor tenant isolatie
- [x] E2E tests voor kritieke flows — _Playwright draait in CI (`e2e` job): `e2e/smoke.spec.ts` plus drie flowbestanden, 17 tests_
  - `e2e/repetities.spec.ts`: een beheerder plant een repetitie, een lid meldt zich aan en weer af, en een lid krijgt de beheerknoppen niet te zien
  - `e2e/leden.spec.ts`: een beheerder voegt een lid toe en koppelt het aan een orkest, en een lid komt niet op de ledenbeheerpagina
  - De seed (`backend/src/scripts/seed-e2e.ts`) zet daar repetities en een tweede orkest voor klaar, met vaste id's
  - `e2e/concerten.spec.ts`: een beheerder maakt een concert aan, vult het programma en vindt beide terug na opnieuw laden; een gewoon lid komt niet op de pagina
  - Die laatste kon lang niet, en niet omdat hij vergeten was: de drie actieknoppen per concertrij droegen alleen een pictogram zonder toegankelijke naam. Een test kon ze alleen op positie aanwijzen, en zo'n verwijzing breekt bij de eerste kolomwijziging. Ze dragen nu een `aria-label` met de naam van het concert erin - ook winst voor een schermlezer, die anders drie keer "knop" hoorde bij elke rij. `Concerts.knopnamen.test.tsx` bewaakt dat ze die naam houden
- [x] Dependabot of Renovate configuratie
- [x] SAST scanning (CodeQL of Semgrep)
- [x] Automated staging deployments — _`.github/workflows/deploy-staging.yml`: rolt uit zodra CI op `main` slaagt, wacht tot de omgeving antwoordt en draait daarna `scripts/smoke-test.mjs`_
  - De twee GitHub-instellingen zijn gezet (24-08-2026): secret `RENDER_STAGING_DEPLOY_HOOK` en variable `STAGING_URL`. Zonder die twee sloeg de workflow zichzelf over met een uitleg in plaats van een fout
  - **Dit vinkje betekent ingericht, niet aantoonbaar werkend.** De uitrol heeft nog geen enkele keer gedraaid. Één keer met de hand starten (Actions → _Deploy naar staging_ → _Run workflow_) is wat er nodig is om dat verschil weg te nemen; pas dan is bewezen dat de hook, de wachtlus en de rooktest samen doen wat ze horen te doen
  - **De Build Command in het Render-dashboard staat nog op `npm install` zonder `--include=dev`.** `render.yaml` is daarvoor gerepareerd, maar een service die eerder met de hand is aangemaakt leest dat bestand niet: die houdt de waarde uit het dashboard. Dat gaat pas mis bij de eerstvolgende uitrol die een dev-afhankelijkheid nodig heeft — de build is `tsc`, en typescript staat juist daar. De juiste waarde staat in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [x] Coverage badges in README

---

## WP9: Community Outreach (KNMO, Federaties)

**Doorlooptijd:** Doorlopend  
**Afhankelijkheden:** WP7 (docs), WP11 (pilots)

### Doelorganisaties

- **KNMO** — Koninklijke Nederlandse Muziek Organisatie
- **Confédération Musicale de France** — ~3.000 verenigingen
- **Bundesvereinigung Deutscher Musikverbände** — ~25.000 verenigingen
- **Making Music (UK)** — ~3.500 muziekgroepen

### Deliverables

- [ ] Nederlandse introductie op KNMO website
- [ ] Talk proposal FOSDEM 2027 (Open Source in Culture track)
- [ ] Minimaal 3 pilot verenigingen uit 2 EU landen
- [ ] Case studies van pilots

---

## WP10: PWA Hardening + Mobile UX

**Doorlooptijd:** 4 weken  
**Afhankelijkheden:** Geen

### Huidige Status

Zie [PWA_IMPLEMENTATION_PLAN.md](./PWA_IMPLEMENTATION_PLAN.md) voor details.

Fase 1-4 zijn geïmplementeerd:

- ✅ Service worker + precaching
- ✅ Manifest + icons
- ✅ Offline indicator
- ✅ Install prompt
- ✅ Push notifications (basis)

### Scope (Fase 5)

- Service Worker push handler (achtergrond push)
- Offline partituren bekijken (Cache API voor PDFs)
- Background sync voor mutations
- App shortcuts
- Selective offline mode

### Deliverables

- [x] Offline PDF viewing
- [x] Background push notifications — `push` + `pushsubscriptionchange` handlers in `frontend/src/sw-custom.ts`
- [x] App shortcuts (manifest)
- [x] Share Target API
- [x] Improved mobile touch UX
- [x] Lighthouse gemeten in CI — _job `lighthouse` in `ci.yml`, mediaan van drie metingen tegen de gebouwde applicatie_
  - Gemeten 19-08-2026: performance 80, accessibility 98, best-practices 96, seo 100
  - De **PWA-categorie bestaat niet meer**: Lighthouse 12 heeft die geschrapt, inclusief de losse audits (`installable-manifest`, `service-worker`, `maskable-icon`). Een PWA-score van >90 is dus niet te halen omdat het getal niet meer bestaat. Wat die score controleerde staat nu als eigen controle in `scripts/lighthouse-check.mjs`
- [x] Prestatiescore naar >90 — _**92 en 90** op de CI-runner in twee runs, 23-09-2026 (elk de mediaan van drie; FCP 1,4 s, LCP 3,0 s in beide). Drempel in `scripts/lighthouse-check.mjs` staat op 86_
  - **Dit zit op de grens, niet er ruim boven.** Het verschil tussen de twee runs zat in TBT (20 tegen 210 ms): rekentijd op de runner, niet de pagina. Wie een zekere >90 wil, moet de LCP verder omlaag krijgen; zie "de marge is klein" hieronder
  - **Van 84 naar 92 zat in wat er vóór de eerste weergave binnen moest**, en niet in een verbouwing van het schild. De vorige ronde schatte dat alleen een aparte inlogpagina of weergave aan de serverkant >90 zou halen; dat bleek te somber, omdat twee dingen nog niet waren meegeteld:
    - **De pagina was wit tot alle JavaScript draaide.** `#root` in `index.html` was leeg. Nu staat daar een shell met het logo als inline SVG, die React bij het eerste tekenen vervangt. FCP ging van ongeveer 2,7 naar 1,4 s op de runner. De shell bevat bewust geen tekst of `<img>`: dan hoeft er niets vertaald te worden, en telt hij niet als LCP, zodat die het echte inlogscherm blijft meten in plaats van een opgepoetst cijfer te geven
    - **`nl.json` was tweederde van de hoofdbundel.** 243 KB, waarvan het inlogscherm er zo'n 9 gebruikt. `frontend/tekstenKernPlugin.ts` snijdt bij het bouwen een kern uit `nl.json` voor de hoofdbundel; de rest wordt na de eerste weergave opgehaald en elke lui geladen pagina wacht erop. De hoofdbundel ging van 96 naar 39 KB ingepakt. `kern.test.ts` loopt de imports vanaf `main.tsx` na en faalt als een onderdeel in de hoofdbundel een sleutel buiten de kern gebruikt
  - **De marge is klein.** Rondes en runs op de runner schommelen een paar punten. Wat de LCP nog op 3,0 s houdt is de HTML met alle ingelijnde CSS (25 KB ingepakt), React en de andere vendorchunks en het lettertype (49 KB). De volgende stappen, als het nodig is: de CSS van het inlogscherm apart, of axios vervangen door `fetch`
  - Eerder, 24-08-2026: **84** op de CI-runner, tegen **79** op `main` daarvoor
  - **Het cijfer hangt af van de machine, en dat is hier de kern.** Dezelfde build haalt lokaal een paar punten meer dan op de CI-runner (deze ronde 94-95 tegen 90-92; de vorige 91 tegen 84). De CI-runner is de maat, want daar gaat de drempel af
  - De sprong van 75 naar 80 kwam doordat het lettertype uit het project zelf komt. Er stond een render-blokkerende stylesheet van `fonts.googleapis.com` in de `<head>`; die host is in de meetomgeving geblokkeerd, waardoor het verzoek het tekenen 12,9 seconden tegenhield
  - Van 79 naar 84 zat vrijwel alles in wat de browser moest ophalen en ontleden vóór de eerste weergave. De hoofdbundel ging van **905 KB naar 296 KB**:
    - **610 KB aan vertalingen eruit.** `i18n.ts` importeerde `nl`, `en` én `de` statisch. Wie de applicatie in het Nederlands opent, haalde de Engelse en Duitse teksten ook binnen en deed er niets mee. Nederlands blijft in de bundel (het is de terugvaltaal en de taal van vrijwel iedereen), de andere twee worden opgehaald als iemand ze kiest
    - **Layout en de toestemmingspoort zijn lui geworden.** Ze renderen alleen binnen `<PrivateRoute>`, maar stonden als gewone import in `App.tsx` en sleepten het hele ingelogde schild mee — GlobalSearch, NotificationCenter, QuickActionsMenu, RecentItems, Breadcrumbs, OnboardingTour — plus, via `AuthContext` en `OfflineIndicator`, dexie: 94 KB IndexedDB-laag op het inlogscherm
    - **`vendor-utils` opgesplitst.** Eén chunk met axios, date-fns, ua-parser-js en idb wordt geladen zodra íéts erin nodig is. Het inlogscherm heeft axios nodig, dus kwamen de andere drie ongevraagd mee
    - **De stylesheet staat ingelijnd in de HTML.** Eén bestand van 118 KB voor de hele applicatie hield het tekenen tegen; Lighthouse rekende daar 600 ms voor, vooral vanwege de rondgang zelf
  - `lighthouse-check.mjs` print sinds deze ronde de losse metrieken mee. Dat was geen luxe: dezelfde ingreep leverde lokaal twaalf punten op en in CI vijf, en uit één samengesteld cijfer valt niet af te lezen of dat aan bytes of aan rekentijd ligt. Het antwoord staat hierboven — bytes, niet rekentijd
  - **De installatiebalk staat niet meer op het inlogscherm** — een neveneffect van de service worker-reparatie hierboven. Die balk was dode code zolang de service worker niet registreerde; sindsdien verscheen hij meteen op het inlogscherm, aan iemand die de applicatie nog niet binnen is. Dat is de verkeerde volgorde en is nu achter een inlogcontrole gezet
    - Ik dacht dat het ook de LCP zou schelen: op de CI-runner was die balk het grootste element, met LCP 3,5 s tegenover Speed Index 2,9 s. Dat bleek niet zo — zonder de balk meet CI LCP 3,4 s. Het gat zit dus niet in die balk maar in de applicatiebundel zelf. De wijziging blijft staan om de eerste reden, niet om de tweede
- [x] **De service worker registreerde nooit** — _gevonden bij deze ronde, in `frontend/vite.config.ts`_
  - `offline.html` stond twee keer in de precachelijst: één keer via het globpatroon `**/*.html` met een revisie uit de bestandsinhoud, en één keer via `additionalManifestEntries` met revisie `'1'`. Workbox weigert dezelfde URL met twee revisies en gooit `add-to-cache-list-conflicting-entries` — al bij het evalueren van het script, dus vóór het installeren
  - Registreren liep daardoor **altijd** stuk op "ServiceWorker script evaluation failed", in elke browser en ook in productie. De applicatie logde de fout naar de console en werkte verder gewoon door, dus het viel niemand op
  - Daar zaten drie deliverables hierboven aan vast die dus niet werkten: precaching, offline bladmuziek en de achtergrondmeldingen. Installeren als app evenmin
  - `controleerServiceWorker()` in `scripts/lighthouse-check.mjs` haalt de precachelijst nu uit het gebouwde script en controleert op dubbele URL's — met de adressen eerst omgerekend naar absoluut, want `offline.html` en `/offline.html` zijn twee teksten en één bestand. Best-practices ging van 96 naar **100** toen de fout weg was
- [x] **61 van de 65 paginatitels bestonden niet** — _`useDocumentTitle('pageTitle.dashboard')` zette letterlijk `pageTitle.dashboard` in het tabblad van de browser, en daarmee ook in bladwijzers en geschiedenis_
  - `translations.test.ts` ving dit niet omdat het `t()`-aanroepen uit de bron leest; hier zit de `t()` in de hook, met een variabele als argument
  - De 61 sleutels zijn toegevoegd in alle drie de talen als i18next-verwijzing (`"dashboard": "$t(nav.dashboard)"`), zodat er niets dubbel onderhouden wordt. `InstrumentAssets.tsx` gaf een vaste Nederlandse tekst mee in plaats van een sleutel; die is nu ook vertaald
  - `frontend/src/locales/__tests__/paginatitels.test.ts` bewaakt het: elke `useDocumentTitle`-sleutel moet in nl, en en de bestaan, en elke `$t(...)`-verwijzing moet ergens uitkomen

---

## WP11: Pilot Deployments (2-3 Verenigingen)

**Doorlooptijd:** 6-8 weken  
**Afhankelijkheden:** WP4 (Docker), WP7 (docs)

### Scope

Gestructureerde pilot deployments:

- Onboarding support
- Feedback verzameling
- Data import uit bestaande systemen
- Publieke case studies

### Deliverables

- [ ] 2-3 live deployments
- [x] Import tooling voor spreadsheets/legacy data — _leden, muziekbibliotheek, instrumenten in bezit en contacten uit CSV, met eerst een voorbeeld per regel, 24-09-2026; zie `docs/IMPORTEREN.md`. Nog niet: materiaal, uniformen en concertkleding, en bijwerken van wat er al is_
- [ ] Onboarding handleiding
- [ ] Feedback rapport per pilot
- [ ] Publieke case studies

---

## WP12: Achtergrondtaken die een Herstart Overleven

**Doorlooptijd:** 4-6 weken  
**Afhankelijkheden:** WP4 (Docker), en de PostgreSQL-keuze uit `docs/POSTGRES_MIGRATION.md` als er meer dan één instantie komt

### Huidige status

_Zo stond het er vóór WP12 voor; de deliverables hieronder zijn allemaal geleverd (september 2026). Zie `docs/ACHTERGRONDTAKEN.md` voor hoe het nu werkt._

Achtergrondwerk zat tot dan volledig in het geheugen van het ene proces dat de
applicatie draait. Dat is te overzien zolang er één instantie is, maar het valt
op drie manieren stil.

**1. De wachtrij die er is, wordt nergens gebruikt.**
`backend/src/utils/backgroundQueue.ts` is 290 regels: een `BackgroundQueue` met
statussen, herkansingen, een maximum aan gelijktijdige taken en een eigen
testbestand. Er is geen enkele plek in de productiecode die hem aanroept. Zwaar
werk - PDF's samenvoegen, rapporten maken, exports - gebeurt gewoon binnen het
verzoek van de gebruiker.

**2. Twee stukken gepland werk zijn geschreven en getest maar starten nooit.**

| Bestand                        | Wat het doet                                    | Aangeroepen vanuit         |
| ------------------------------ | ----------------------------------------------- | -------------------------- |
| `scheduler/workflow-runner.ts` | `runWorkflowScheduler`, `runDateFieldWorkflows` | niets                      |
| `scheduler/email-digest.ts`    | `sendWeeklyDigest`, de wekelijkse samenvatting  | alleen de tests (21 stuks) |

De wekelijkse samenvatting is dus volledig gebouwd en uitgebreid getest, en is
nog nooit bij een lid aangekomen.

**3. Wat wél draait, draait per proces.**
`seating-notifications` (elke minuut), `email-forwarding-retry` (elke twee
minuten), `gdpr-cleanup` (elk uur) en de back-upplanner worden gestart binnen
`httpServer.listen` in `index.ts`. Gevolgen:

- **Een herstart onderbreekt lopend werk.** Elke uitrol naar Render is een
  herstart. Wat halverwege was, is weg; er is geen enkele plek waar staat dat
  het niet af is.
- **Een tweede instantie doet alles dubbel.** Er is geen sluis en geen
  eigenaarschap per taak. Zodra Tutti horizontaal schaalt, krijgt elk lid zijn
  melding twee keer.
- **Niemand kan zien wat er misging.** Een taak die faalt komt in het logboek
  terecht en verder nergens. Er is geen scherm met "wat staat er klaar, wat is
  mislukt, en waarom".

### Scope

Achtergrondwerk verplaatsen van geheugen naar de database, zodat het een
herstart overleeft, hooguit één keer wordt uitgevoerd en zichtbaar is.

- Een `jobs`-tabel met status, poging, eigenaar, planmoment en foutmelding
- Een werker die taken oppakt met een sluis, zodat twee instanties elkaar niet
  in de weg zitten
- Herkansing met oplopende wachttijd, en een eindstation voor wat blijft
  mislukken
- De bestaande planners omzetten naar taken in die tabel
- De twee stukken gepland werk die nooit starten: aanzetten of weghalen - maar
  niet laten liggen
- Een beheerscherm met de wachtrij, de mislukte taken en een knop om er één
  opnieuw te proberen
- Het zware werk binnen een verzoek (PDF's, exports, rapporten) naar de
  wachtrij verplaatsen

### Overwegingen

- **Geen extra dienst als het niet hoeft.** Redis of een aparte queue-server
  betekent iets extra's om te draaien, te bewaken en uit te leggen in de
  zelfhostinghandleiding. Een tabel in de database die er toch al is, is voor
  een vereniging met honderd leden ruim genoeg.
- **Dit raakt de PostgreSQL-vraag.** De sluis die voorkomt dat twee instanties
  dezelfde taak pakken vraagt om `SELECT ... FOR UPDATE SKIP LOCKED` of iets
  gelijkwaardigs. sql.js draait in het geheugen van één proces en kan dat per
  definitie niet. Zolang er één instantie is, kan het met een `UPDATE ... WHERE
status = 'wachtend'`; wordt het er meer, dan hoort dit werk na de
  PostgreSQL-overstap.
- **Herkansen mag niet alles.** Een taak die een e-mail verstuurt en dan
  vastloopt mag niet opnieuw. Elke taak moet zeggen of hij herhaalbaar is; zie
  dezelfde afweging in `docs/VEERKRACHT.md`.

### Deliverables

- [x] Tabel met migratie — _`achtergrondtaken`, migratie `20260923171135_achtergrondtaken` en `schema.ts`. De tabel heet niet `jobs` maar Nederlands, zoals nieuwe code hier hoort_
- [x] Werker met sluis, herkansing en eindstation — _`backend/src/taken/wachtrij.ts`. Een niet-herhaalbare taak die door een herstart werd onderbroken, wordt niet opnieuw gedaan maar als mislukt gemarkeerd, met die reden erbij_
- [x] De vier draaiende planners omgezet, en de twee verborgen opruimlussen in `routes/thumbnails.ts` en `routes/pdf-tools.ts` — _`backend/src/taken/index.ts`. Elke periodieke taak heeft een sleutel per tijdvak en draait daardoor één keer per vak, ook na een herstart. Dat was bij de AVG-opschoning niet zo: die draaide opnieuw als er binnen het opschoonuur werd uitgerold. En een mislukte back-up staat nu als mislukt in de wachtrij in plaats van alleen in het logboek_
- [x] `workflow-runner` en `email-digest` aangezet of weggehaald, met een reden — _weggehaald, 24-09-2026, op keuze van de eigenaar. Ze zijn nooit gestart; aanzetten had leden een ongevraagde wekelijkse mail gestuurd en door beheerders ingestelde workflows zonder waarschuwing laten lopen. Het werk voor de workflows blijft in `services/workflowEngine.ts`, omdat de routes onder `/api/workflows/process/` het handmatig aftrappen_
  - **Daarna, 24-09-2026:** het workflowscherm biedt de triggers _Gepland_ en _Datumveld_ niet meer aan bij een nieuwe trigger. Bestaande triggers van die soort blijven zichtbaar en te bewerken, met de melding dat ze niet vanzelf afgaan. De API accepteert ze nog, zodat bestaande triggers geldig blijven en met de hand af te trappen zijn
- [x] `backgroundQueue.ts` vervangen of verwijderd — _verwijderd, met zijn test; hij werd nergens gebruikt en de wachtrij vervangt hem_
- [x] Beheerscherm voor de wachtrij en de mislukte taken — _tabblad Achtergrondtaken op de superbeheerderspagina, met `GET /api/achtergrondtaken` en `POST /api/achtergrondtaken/:id/opnieuw`. Alleen superbeheerders: de taken van nu horen bij geen vereniging_
- [x] Zwaar werk binnen een verzoek onderzocht — _gemeten en **niet** naar de wachtrij verplaatst, 24-09-2026. Terug te draaien als de afweging anders uitvalt_
  - **Gemeten:** 30 ingescande partituren samenvoegen (32 MB, 120 pagina's, via `pdf-lib` zoals `routes/pdf-tools.ts`) kost 125-150 ms. Het zwaarste toegestane zip-bestand uitpakken en wegschrijven (200 pdf's, 200 MB, de grens van `/music-pieces/upload-zip`) kost 1,8 s
  - **Waarom niet:** de upload zelf duurt vele malen langer dan die 1,8 s, en daar helpt een wachtrij niet bij. Een taak die hetzelfde werk doet in hetzelfde proces blokkeert de event loop net zo lang. Wat een wachtrij wel toevoegt: de gebruiker krijgt geen resultaat meer terug, maar moet wachten en navragen of het klaar is - meer code aan beide kanten zonder dat iemand iets sneller heeft
  - **De streamende downloads** (zip van een muzieklijst, AVG-export, back-up) sturen hun antwoord terwijl het gemaakt wordt en lopen niet tegen een tijdslimiet aan
  - **Wat wel beter kon, los van de wachtrij:** de zip-import pakte synchroon uit en schreef met `fs.writeFileSync`, en hield het proces daardoor 1,3 tot 1,8 seconde helemaal vast. _Gedaan, 24-09-2026:_ asynchroon uitpakken en schrijven kost even lang, maar het proces staat nu hooguit 9 ms stil. Onderweg bleek dat een rij die niet in de database kwam zijn bestand op schijf achterliet; dat gaat nu weer weg (`muziek-zip-import.test.ts`)
- [x] Documentatie in `docs/` en een regel in `CLAUDE.md` — _`docs/ACHTERGRONDTAKEN.md`, regel 21_

---

## Tijdlijn (indicatief)

```
Maand 1-2:   WP1 (security audit)
Maand 2-3:   WP2 (remediation), WP3 (accessibility)
Maand 3-4:   WP4 (Docker), WP8 (CI/CD)
Maand 4-6:   WP5 (metadata), WP6 (GDPR)
Maand 6-8:   WP7 (docs), WP10 (PWA)
Maand 8-10:  WP9 (outreach), WP11 (pilots)
Maand 10-12: Afronding, documentatie, contingency
```

---

## Risico's & Mitigatie

| Risico                                | Mitigatie                                       |
| ------------------------------------- | ----------------------------------------------- |
| Security audit vindt kritieke issues  | Contingency budget, prioriteit op fixes         |
| Pilot verenigingen trekken zich terug | Actief 5+ kandidaten werven                     |
| MusicXML complexer dan verwacht       | Scope beperken tot meest gebruikte velden       |
| Test coverage target niet haalbaar    | Focus op kritieke paden, coverage als guideline |

---

## Licentie & Governance

- Alle outputs onder **MIT licentie**
- Security audit rapport publiek
- Community governance via GitHub Discussions
- Publieke roadmap (dit document)

---

_Document versie: 1.1_  
_Aangemaakt: 2026-04-26_  
_Laatst bijgewerkt: 2026-08-18_  
_Status: Subsidieaanvraag ingediend_
