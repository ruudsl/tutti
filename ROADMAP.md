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

- [ ] `tutti/tutti:latest` Docker image op Docker Hub — _CI bouwt de images (`docker` job in `ci.yml`) maar pusht nog niet naar een registry_
- [x] `docker-compose.yml` met alle services
- [x] `docker-compose.prod.yml` voor productie
- [x] Self-hosting guide voor non-developers
- [x] Backup/restore scripts
- [x] Health check endpoints

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

- Coverage backend (19-08-2026, over de **hele** backend): statements 13,1% (2838/21664), branches 9,3%, functions 14,5%, lines 13,1%
- CI-drempels backend (`backend/vitest.config.ts`): 12 / 8 / 13 / 12 (statements / branches / functions / lines)
- **De eerdere cijfers klopten niet.** Er stond geen `include` in de coverage-instellingen, en de v8-provider telt dan alleen bestanden die een test toevallig inlaadt. Bestanden die geen enkele test aanraakt verdwenen uit de noemer in plaats van als nul mee te tellen. De meting ging over 6140 van de 21664 statements — ruim zeventig procent van de code werd niet bekeken, waaronder `accounting.ts`, `tickets.ts`, `events.ts` en `analytics.ts` (samen ruim tienduizend regels)
- Er zat ook een averechtse prikkel in: een test toevoegen trok het aangeroepen bestand de noemer in, waardoor het percentage dáálde terwijl er meer getest werd (54,4% → 47,4%). De hoeveelheid geteste code veranderde niet door deze correctie; alleen de noemer klopt nu
- Integratietests draaien tegen het echte schema (`src/database/schema.ts` + migraties)
- CI: GitHub Actions — jobs voor backend, frontend, E2E (Playwright), lint, security audit en Docker build
- CD: Docker build in CI (geen registry push, geen staging deploy)

### Scope

- Test coverage verhogen naar >80%
- Dependency vulnerability scanning
- Integration tests voor multi-tenant isolatie
- Automated deployments

### Deliverables

- [ ] Unit tests: >80% coverage — _nu 13,1% statements / 9,3% branches over de hele backend_
  - **De 50 uur die hiervoor begroot staat is niet realistisch.** Van 2838 naar 80% betekent ruim veertienduizend statements erbij afdekken. Dat is werk van maanden, niet van een week
  - Grootste gaten in wat wél gemeten werd: `music-pieces.ts` (472 ongedekte statements), `spond.ts` (339), `polls.ts` (303), `tasks.ts` (293), `concerts.ts` (266)
  - Overweging voor de planning: een tussendoel dat wel haalbaar is (bijvoorbeeld 30%) zegt meer dan een doel dat niemand gaat halen
- [x] Integration tests voor tenant isolatie
- [~] E2E tests voor kritieke flows — _Playwright draait in CI (`e2e` job), voorlopig alleen `e2e/smoke.spec.ts`_
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
