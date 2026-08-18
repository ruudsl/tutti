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
- [x] Leden data export functie (GDPR Art. 20)
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

- Coverage backend (18-08-2026): statements 51,4%, branches 39,6%, functions 53,4%, lines 51,6%
- CI-drempels backend (`backend/vitest.config.ts`): 48 / 37 / 50 / 48
- Integratietests draaien tegen het echte schema (`src/database/schema.ts` + migraties)
- CI: GitHub Actions — jobs voor backend, frontend, E2E (Playwright), lint, security audit en Docker build
- CD: Docker build in CI (geen registry push, geen staging deploy)

### Scope

- Test coverage verhogen naar >80%
- Dependency vulnerability scanning
- Integration tests voor multi-tenant isolatie
- Automated deployments

### Deliverables

- [ ] Unit tests: >80% coverage — _nu 51,4% statements / 39,6% branches_
- [x] Integration tests voor tenant isolatie
- [~] E2E tests voor kritieke flows — _Playwright draait in CI (`e2e` job), voorlopig alleen `e2e/smoke.spec.ts`_
- [x] Dependabot of Renovate configuratie
- [x] SAST scanning (CodeQL of Semgrep)
- [ ] Automated staging deployments — _nog niet ingericht_
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
- [ ] Lighthouse PWA score >90 — _nog niet gemeten in CI_

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
