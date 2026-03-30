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

- [x] **Notificaties** — Push-notificaties, e-mail, WhatsApp en Telegram bij nieuwe muziekstukken, repetitiewijzigingen, of opgeloste issues
- [x] **Zoekfunctie verbeteren** — Unified search over alle muziekstukken, titels, leden, orkesten en repetities (Cmd+K)
- [x] **Sorteerbare muzieklijsten** — Drag-and-drop volgorde aanpassen van stukken in concertprogramma's
- [x] **Concertprogramma PDF export** — Genereer een opgemaakt PDF-programma voor concerten
- [x] **Bulk-bewerkingen uitbreiden** — UI voor bulk-bewerken van instrument, titel, orkest toewijzen

### Middellange termijn

- [x] **Repetitieplannen** — Koppel muziekstukken aan specifieke repetities met oefenschema
- [x] **Favorieten** — Leden kunnen favoriete stukken markeren voor snel terugvinden
- [x] **Offline modus** — PWA met service worker voor offline toegang tot gedownloade muziekstukken
- [x] **Geavanceerde statistieken** — Trends over tijd, vergelijking tussen periodes, exporteerbare rapportages
- [x] **Auditlog** — Uitgebreide logging van alle wijzigingen voor compliance en traceerbaarheid

### Lange termijn

- [x] **Mobiele app** — PWA met barcode-scanner voor muziekstukken en tickets
- [x] **Digitale bladmuziek viewer** — In-app PDF-viewer met annotaties, zoom en dark mode
- [x] **Multi-vereniging samenwerking** — Gedeelde muziekbibliotheek tussen partnerverenigingen
- [ ] **Financieel beheer** — Contributie-administratie en budget-tracking voor muziekaankopen (ticketverkoop is gereed)
- [x] **Evenementenbeheer** — Concertplanning met ticketverkoop, kortingscodes, gastenlijsten en locatiebeheer

## Bekende aandachtspunten

### Technisch

- [ ] Backend test-coverage uitbreiden (momenteel 4 test suites; routes met database-afhankelijkheid nog beperkt)
- [x] Swagger/OpenAPI annotaties toevoegen aan alle routes (298 annotaties in 41 route-bestanden)
- [x] Database migratie-systeem implementeren (runner, CLI en 12 migraties beschikbaar)
- [x] Content Security Policy (CSP) configureren via Helmet

### Operationeel

- [x] Monitoring en alerting opzetten (Sentry integratie voor errors)
- [ ] Automatische database-backup scheduling
- [x] Log-aggregatie voor productie (centraal logbeheer via logger module)
- [ ] Performance profiling en optimalisatie van zware database queries

## Bijdragen

Wil je bijdragen aan dit project? Bekijk de [open issues](../../issues) op GitHub of neem contact op met het ontwikkelteam.

Suggesties voor nieuwe features zijn welkom via [GitHub Issues](../../issues/new).
