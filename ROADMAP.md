# Roadmap

Overzicht van geplande features, verbeteringen en bekende aandachtspunten voor de Harmonie Muziek App.

## Status legenda

| Status | Betekenis |
|---|---|
| Gepland | Nog niet begonnen |
| In ontwikkeling | Actief mee bezig |
| Gereed | Afgerond en beschikbaar |

## Gerealiseerde features

### Kernfunctionaliteit
- [x] Muziekbibliotheek met PDF upload en automatische metadata-parsing
- [x] Muziektitels met metadata (componist, arrangeur, genre, speelduur, moeilijkheidsgraad)
- [x] Muzieklijsten en concertprogramma's per orkest
- [x] Ledenbeheer met rollen (lid, dirigent, muziekcommissie, admin)
- [x] Instrumentenbeheer met aliassen en stemmingen
- [x] Orkestenbeheer met leden-toewijzing

### Integraties
- [x] Spond koppeling voor aanwezigheidsregistratie
- [x] MusicaInfo.net integratie voor metadata-verrijking
- [x] Microsoft/Azure Entra SSO
- [x] SMTP e-mail configuratie per vereniging

### Beveiliging
- [x] JWT authenticatie met configureerbare geldigheidsduur
- [x] TOTP tweefactor-authenticatie (MFA)
- [x] Rate limiting (algemeen + strenger voor login)
- [x] Helmet security headers
- [x] Zod input-validatie op alle endpoints
- [x] Wachtwoord-reset via e-mail

### Tools & Extra's
- [x] PDF Tools (samenvoegen, splitsen, roteren, A3→A4)
- [x] Uitleenbeheer voor muziekmateriaal
- [x] Issue/meldingensysteem voor bladmuziekfouten
- [x] Activiteitenlog en statistieken
- [x] Backup en restore (database + bestanden als ZIP)
- [x] Thema-aanpassing per vereniging
- [x] Meertalig (Nederlands, Engels, Duits)
- [x] Responsief design met mobiele navigatie
- [x] WCAG 2.1 AA toegankelijkheid
- [x] Ingebouwde metronoom en stemapparaat
- [x] Swagger/OpenAPI documentatie

## Geplande verbeteringen

### Korte termijn

- [ ] **Notificaties** — Push-notificaties of e-mail bij nieuwe muziekstukken, repetitiewijzigingen, of opgeloste issues
- [ ] **Zoekfunctie verbeteren** — Full-text zoeken over alle muziekstukken, titels en leden
- [ ] **Bulk-bewerkingen** — Meerdere muziekstukken tegelijk bewerken (instrument, titel, orkest toewijzen)
- [ ] **Sorteerbare muzieklijsten** — Drag-and-drop volgorde aanpassen van stukken in concertprogramma's
- [ ] **Concertprogramma PDF export** — Genereer een opgemaakt PDF-programma voor concerten

### Middellange termijn

- [ ] **Repetitieplannen** — Koppel muziekstukken aan specifieke repetities met oefenschema
- [ ] **Favorieten** — Leden kunnen favoriete stukken markeren voor snel terugvinden
- [ ] **Offline modus** — PWA met service worker voor offline toegang tot gedownloade muziekstukken
- [ ] **Geavanceerde statistieken** — Trends over tijd, vergelijking tussen periodes, exporteerbare rapportages
- [ ] **Auditlog** — Uitgebreide logging van alle wijzigingen voor compliance en traceerbaarheid

### Lange termijn

- [ ] **Mobiele app** — Native iOS/Android app met barcode-scanner voor muziekstukken
- [ ] **Digitale bladmuziek viewer** — In-app PDF-viewer met annotaties en pagina-omslag
- [ ] **Multi-vereniging samenwerking** — Gedeelde muziekbibliotheek tussen partnervereningingen
- [ ] **Financieel beheer** — Contributie-administratie en budget-tracking voor muziekaankopen
- [ ] **Evenementenbeheer** — Concertplanning met ticketverkoop en locatiebeheer

## Bekende aandachtspunten

### Technisch

- [ ] Backend test-coverage uitbreiden (momenteel middleware en utilities; routes met database-afhankelijkheid nog beperkt)
- [ ] Swagger/OpenAPI annotaties toevoegen aan alle resterende routes (activity, issues, loans, pdf-tools, rehearsals, spond, musicainfo, genres, settings)
- [ ] Database migratie-systeem implementeren (momenteel schema-wijzigingen vereisen handmatige aanpassingen)
- [ ] Content Security Policy (CSP) configureren voor productie

### Operationeel

- [ ] Monitoring en alerting opzetten (uptime, error rates, response times)
- [ ] Automatische database-backup scheduling
- [ ] Log-aggregatie voor productie (centraal logbeheer)
- [ ] Performance profiling en optimalisatie van zware database queries

## Bijdragen

Wil je bijdragen aan dit project? Bekijk de [open issues](../../issues) op GitHub of neem contact op met het ontwikkelteam.

Suggesties voor nieuwe features zijn welkom via [GitHub Issues](../../issues/new).
