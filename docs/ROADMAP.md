# Tutti Roadmap

Dit document beschrijft de geplande ontwikkeling van Tutti, gefinancierd door een NLnet-subsidie van EUR 50.000 voor 12 maanden.

---

## Overzicht Werkpakketten

| WP | Titel | Uren | Budget (EUR) | Status |
|----|-------|------|--------------|--------|
| 1 | Onafhankelijke security audit | extern | 5.000 | ⬜ Gepland |
| 2 | Security audit remediation | 65h | 5.525 | ⬜ Gepland |
| 3 | WCAG 2.1 AA accessibility audit + fixes | 45h | 3.825 | ⬜ Gepland |
| 4 | Docker packaging + self-hosting guide | 50h | 4.250 | ⬜ Gepland |
| 5 | Open music metadata (MusicXML / JSKOS) | 75h | 6.375 | ⬜ Gepland |
| 6 | Privacy-by-design review + GDPR hardening | 45h | 3.825 | ⬜ Gepland |
| 7 | Community docs, onboarding, multilingual README | 45h | 3.825 | ⬜ Gepland |
| 8 | CI/CD hardening + test coverage >80% | 50h | 4.250 | ⬜ Gepland |
| 9 | Community outreach (KNMO, federaties) | 25h | 2.125 | ⬜ Gepland |
| 10 | PWA hardening + mobile UX | 55h | 4.675 | 🔄 Deels |
| 11 | Pilot deployments (2-3 verenigingen) | 45h | 3.825 | ⬜ Gepland |
| — | Contingency (~5%) | — | 2.500 | — |
| **Totaal** | | **500h + audit** | **50.000** | |

Uurtarief: EUR 85/uur (cost-recovery)

---

## WP1: Onafhankelijke Security Audit

**Budget:** EUR 5.000 (externe contractor)  
**Doorlooptijd:** 2-3 weken  
**Afhankelijkheden:** Geen

### Scope
- Volledige security audit door onafhankelijke derde partij
- NLnet's eigen security audit partners kunnen worden gebruikt
- Focus op multi-tenant data isolatie, authenticatie, file uploads

### Deliverables
- [ ] Security audit rapport
- [ ] Lijst met bevindingen (kritiek/hoog/medium/laag)
- [ ] Aanbevelingen voor remediation

---

## WP2: Security Audit Remediation

**Budget:** EUR 5.525 (65 uur)  
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

**Budget:** EUR 3.825 (45 uur)  
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
- [ ] Accessibility audit rapport
- [ ] Fixes voor alle gevonden issues
- [ ] Automated accessibility tests (axe-core)
- [ ] Accessibility statement

---

## WP4: Docker Packaging + Self-Hosting Guide

**Budget:** EUR 4.250 (50 uur)  
**Doorlooptijd:** 3 weken  
**Afhankelijkheden:** Geen

### Scope
- Officiële Docker image op Docker Hub
- Docker Compose configuratie voor standaard deployments
- Volume-based storage met automated backups
- PostgreSQL migratie pad documenteren

### Deliverables
- [ ] `tutti/tutti:latest` Docker image op Docker Hub
- [ ] `docker-compose.yml` met alle services
- [ ] `docker-compose.prod.yml` voor productie
- [ ] Self-hosting guide voor non-developers
- [ ] Backup/restore scripts
- [ ] Health check endpoints

---

## WP5: Open Music Metadata (MusicXML / JSKOS)

**Budget:** EUR 6.375 (75 uur)  
**Doorlooptijd:** 4-5 weken  
**Afhankelijkheden:** Geen

### Scope
Integratie van open muziek metadata standaarden:
- MusicXML metadata velden in database schema
- JSKOS vocabularies voor gedeelde repertoire indexering
- Interoperabiliteit tussen verenigingen

### Deliverables
- [ ] MusicXML metadata import/export
- [ ] JSKOS vocabulary integratie
- [ ] API endpoints voor metadata uitwisseling
- [ ] Migratie scripts voor bestaande data
- [ ] Documentatie metadata standaarden

---

## WP6: Privacy-by-Design Review + GDPR Hardening

**Budget:** EUR 3.825 (45 uur)  
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
- [ ] Privacy Impact Assessment (PIA)
- [ ] Data Processing Agreement (DPA) template
- [ ] Leden data export functie (GDPR Art. 20)
- [ ] Account verwijdering met cascade (GDPR Art. 17)
- [ ] Bewaartermijnen configuratie per data type
- [ ] Privacy policy template

---

## WP7: Community Docs, Onboarding, Multilingual README

**Budget:** EUR 3.825 (45 uur)  
**Doorlooptijd:** 3 weken  
**Afhankelijkheden:** WP4 (voor deployment docs)

### Scope
- Uitgebreide Engelse documentatie
- Verbetering Duitse en Nederlandse vertalingen
- Community governance via GitHub Discussions
- Contributie beleid

### Deliverables
- [ ] Architecture documentation
- [ ] API reference (OpenAPI/Swagger)
- [ ] Deployment guide
- [ ] Contributing guide (CONTRIBUTING.md)
- [ ] Code of Conduct
- [ ] Issue/PR templates
- [ ] Public roadmap (dit document)

---

## WP8: CI/CD Hardening + Test Coverage >80%

**Budget:** EUR 4.250 (50 uur)  
**Doorlooptijd:** 3-4 weken  
**Afhankelijkheden:** Geen

### Huidige Status
- Test coverage: ~40%
- CI: GitHub Actions (build, lint)
- CD: Handmatig

### Scope
- Test coverage verhogen naar >80%
- Dependency vulnerability scanning
- Integration tests voor multi-tenant isolatie
- Automated deployments

### Deliverables
- [ ] Unit tests: >80% coverage
- [ ] Integration tests voor tenant isolatie
- [ ] E2E tests voor kritieke flows
- [ ] Dependabot of Renovate configuratie
- [ ] SAST scanning (CodeQL of Semgrep)
- [ ] Automated staging deployments
- [ ] Coverage badges in README

---

## WP9: Community Outreach (KNMO, Federaties)

**Budget:** EUR 2.125 (25 uur)  
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

**Budget:** EUR 4.675 (55 uur)  
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
- [ ] Offline PDF viewing
- [ ] Background push notifications
- [ ] App shortcuts (manifest)
- [ ] Share Target API
- [ ] Improved mobile touch UX
- [ ] Lighthouse PWA score >90

---

## WP11: Pilot Deployments (2-3 Verenigingen)

**Budget:** EUR 3.825 (45 uur)  
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

| Risico | Mitigatie |
|--------|-----------|
| Security audit vindt kritieke issues | Contingency budget, prioriteit op fixes |
| Pilot verenigingen trekken zich terug | Actief 5+ kandidaten werven |
| MusicXML complexer dan verwacht | Scope beperken tot meest gebruikte velden |
| Test coverage target niet haalbaar | Focus op kritieke paden, coverage als guideline |

---

## Licentie & Governance

- Alle outputs onder **MIT licentie**
- Security audit rapport publiek
- Community governance via GitHub Discussions
- Publieke roadmap (dit document)

---

*Document versie: 1.0*  
*Aangemaakt: 2026-04-26*  
*Status: Subsidieaanvraag ingediend*
