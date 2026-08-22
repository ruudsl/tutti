# Tutti Roadmap

Dit document beschrijft de geplande ontwikkeling van Tutti voor de komende 12 maanden.

---

## Overzicht Werkpakketten

| WP         | Titel                                           | Uren             | Status      |
| ---------- | ----------------------------------------------- | ---------------- | ----------- |
| 1          | Onafhankelijke security audit                   | extern           | ⬜ Gepland  |
| 2          | Security audit remediation                      | 65h              | ⬜ Gepland  |
| 3          | WCAG 2.1 AA accessibility audit + fixes         | 45h              | ✅ Voltooid |
| 4          | Docker packaging + self-hosting guide           | 50h              | 🔄 Deels    |
| 5          | Open music metadata (MusicXML / JSKOS)          | 75h              | ✅ Voltooid |
| 6          | Privacy-by-design review + GDPR hardening       | 45h              | 🔄 Deels    |
| 7          | Community docs, onboarding, multilingual README | 45h              | ✅ Voltooid |
| 8          | CI/CD hardening + test coverage >80%            | 50h              | 🔄 Deels    |
| 9          | Community outreach (KNMO, federaties)           | 25h              | ⬜ Gepland  |
| 10         | PWA hardening + mobile UX                       | 55h              | 🔄 Deels    |
| 11         | Pilot deployments (2-3 verenigingen)            | 45h              | ⬜ Gepland  |
| **Totaal** |                                                 | **500h + audit** |

---

## Openstaande beslissingen

Bevindingen uit de dekkingsronde van augustus 2026 die bewust níét zelf zijn
ingevuld: ze vragen een keuze die van de omgeving of van de bedoeling afhangt,
niet van de code. Ze staan hier zodat ze niet in een samengevoegde
pull request achterblijven.

1. **`X-Forwarded-For` wordt onvoorwaardelijk vertrouwd.** Wie die kopregel zelf
   meestuurt, kiest daarmee zijn eigen IP-adres — en daarmee wat er in het
   auditlogboek komt te staan, hoe de snelheidsbegrenzer telt en of hij door de
   IP-witlijst komt. De reparatie is één regel `trust proxy` in
   `backend/src/index.ts`, maar welke waarde daar moet staan hangt af van
   hoeveel proxy's er vóór de applicatie staan. Een verkeerde waarde is net zo
   fout als geen waarde
2. **`payment_settings` heeft Mollie-sleutels per vereniging die nergens
   gebruikt worden.** Alle betalingen lopen over één sleutel uit de omgeving.
   Ofwel de tabel gaat weg, ofwel de code gaat hem gebruiken — nu wekt hij de
   indruk dat verenigingen hun eigen betaalaccount kunnen instellen
3. **`notificationChannels` geeft geen `associationId` door.** Of dat erbij moet
   hangt ervan af of een kanaal per vereniging verschilt
4. **`controleerBetaalId` kapt af op 64 tekens.** Echte Stripe-sessie-id's zijn
   langer, dus die worden geweigerd. Of dat erg is hangt ervan af of Stripe
   ooit gebruikt gaat worden
5. **`backend/src/database/migrations.ts` is dood gewicht** naast de echte
   migratieloper. Weghalen is veilig, maar het is een bestand dat iemand ooit
   met opzet heeft neergezet
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

   De resterende 75 staan als expliciete achterstandslijst in
   `src/locales/__tests__/translations.test.ts`, met een tweede test die de lijst
   schoonhoudt. Grote clusters: `sync.*` (16 sleutels), `offline.*` (9),
   `shareTarget.*` (8), `memberDirectory.*` (4). Dat is een eigen ronde waard —
   niet omdat het moeilijk is, maar omdat het per sleutel een keuze over
   formulering vraagt in drie talen

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
- [ ] PostgreSQL migratiepad gedocumenteerd — _staat wel in de scope hierboven, maar er is niets over geschreven. `docs/adr/0001-use-sqlite.md` noemt het alleen als iets om te overwegen als de schaal daarom vraagt; dat is een afweging, geen migratiepad. Dit is het enige dat WP4 nog openhoudt_

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

- [ ] Privacy Impact Assessment (PIA) — _nog op te stellen; checklist staat in `docs/GDPR.md`_
- [x] Data Processing Agreement (DPA) template
- [x] Leden data export functie (GDPR Art. 20) — _werkte tot 19-08-2026 niet: de route stond onder `/:id` en was daardoor onbereikbaar, en de query eronder vroeg kolommen op die niet in `activity_log` bestaan. Beide gerepareerd en geverifieerd tegen een draaiende server_
- [x] Account verwijdering met cascade (GDPR Art. 17)
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

Gemeten 22-08-2026, over de **hele** backend respectievelijk frontend:

|          | statements              | branches | functions | lines |
| -------- | ----------------------- | -------- | --------- | ----- |
| Backend  | **64,7%** (14740/22775) | 55,7%    | 68,3%     | 65,0% |
| Frontend | **35,4%** (8881/25116)  | 23,5%    | 30,8%     | 36,3% |

- CI-drempels: backend 64 / 55 / 68 / 64, frontend 35 / 23 / 30 / 36 (statements / branches / functions / lines). Die staan bewust net onder de gemeten stand: hoog genoeg om een terugval te vangen, laag genoeg om niet af te gaan op meetruis
- De backend ging in drie PR's (#160, #161, #162, #163) van 46,4% naar 64,4%; het aantal tests van 2.895 naar 4.629 over 173 bestanden. De frontend van ~273 naar 774 tests over 32 bestanden
- Onderweg zijn er ruim veertig echte fouten gevonden en gerepareerd, elk met een test die zonder de reparatie rood is. De zwaarste: de nepbetaalprovider draaide gewoon door in productie (en meldde een terugbetaling als geslaagd), uitloggen wiste IndexedDB niet (op een gedeelde tablet zag de volgende gebruiker de gegevens van de vorige vereniging, inclusief de synchronisatiewachtrij), SQL-injectie via `?lang=`, een Telegram-bottoken in de logregels, elk CIDR-bereik in de IP-witlijst kwam stilzwijgend met niets overeen, `connection.ts` stopte na één mislukte rollback stilletjes met naar schijf schrijven, een SEPA-incasso werd als overboeking aangemaakt, en elke verenigingsbeheerder was platformbeheerder
- De frontend ging op 22-08-2026 van 6,9% naar 24,2%, met 2.641 tests over 93 bestanden (was 774 over 32). `src/api.ts` - 3.967 regels, 741 exports, eerder zonder ook maar één test - staat nu op 99,9%
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

- [~] Unit tests: >80% coverage — _backend 64,8%, frontend 35,4%_
  - **De 50 uur die hiervoor begroot staat is niet realistisch.** De backend is in drie PR's van 12,9% naar 64,4% gegaan; dat alleen al was meer werk dan de hele post. De frontend staat nog vrijwel op nul
  - De api-laag en de hooks zijn nu grotendeels gedekt. Wat resteert zijn de pagina's, en dat is bewust nog niet aangeraakt: `Accounting.tsx` is 2.680 regels, `Rehearsals.tsx` 1.950, `Concerts.tsx` 1.655. Tests schrijven tegen zo'n bestand betekent ze vastzetten aan een structuur die toch moet wijken — opknippen hoort eerst
  - Overweging voor de planning: de backend haalt 80% met nog een ronde van deze omvang. De frontend niet, zolang de pagina's staan zoals ze staan
- [x] Integration tests voor tenant isolatie
- [~] E2E tests voor kritieke flows — _Playwright draait in CI (`e2e` job): `e2e/smoke.spec.ts` plus twee flowbestanden_
  - `e2e/repetities.spec.ts`: een beheerder plant een repetitie, een lid meldt zich aan en weer af, en een lid krijgt de beheerknoppen niet te zien
  - `e2e/leden.spec.ts`: een beheerder voegt een lid toe en koppelt het aan een orkest, en een lid komt niet op de ledenbeheerpagina
  - De seed (`backend/src/scripts/seed-e2e.ts`) zet daar repetities en een tweede orkest voor klaar, met vaste id's
  - Nog niet gedekt: concerten met een programma. De knoppen in de concerttabel zijn pictogrammen zonder toegankelijke naam, dus een test zou ze op positie moeten aanwijzen. Eerst die knoppen een naam geven
- [x] Dependabot of Renovate configuratie
- [x] SAST scanning (CodeQL of Semgrep)
- [x] Automated staging deployments — _`.github/workflows/deploy-staging.yml`: rolt uit zodra CI op `main` slaagt, wacht tot de omgeving antwoordt en draait daarna `scripts/smoke-test.mjs`_
  - Vereist nog twee instellingen in GitHub: secret `RENDER_STAGING_DEPLOY_HOOK` en variable `STAGING_URL`. Zonder die twee stopt de workflow met een uitleg in plaats van met een fout. Inrichten staat in `docs/DEPLOYMENT.md`
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
- [ ] Prestatiescore naar >90 — _staat op 80, was 75_
  - De sprong van 75 naar 80 kwam doordat het lettertype nu uit het project zelf komt. Er stond een render-blokkerende stylesheet van `fonts.googleapis.com` in de `<head>`; die host is in de meetomgeving geblokkeerd, waardoor het verzoek het tekenen 12,9 seconden tegenhield en de pagina tot 13 seconden wit bleef. Ook in productie kostte die verwijzing een volledige rondgang naar Google voordat er iets op het scherm stond
  - `scripts/lighthouse-check.mjs` laat een mislukt netwerkverzoek nu de controle falen. Lighthouse meldt zoiets nergens; het cijfer komt alleen lager uit, en dat stuurt je de verkeerde kant op
  - De resterende twintig punten zitten in LCP en Speed Index. De hoofdbundel is 760 KB (was 816) en er zit geen enkele grote klapper meer in — dat is een lange staart van shell-onderdelen stuk voor stuk nalopen

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
- [ ] Import tooling voor spreadsheets/legacy data
- [ ] Onboarding handleiding
- [ ] Feedback rapport per pilot
- [ ] Publieke case studies

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
