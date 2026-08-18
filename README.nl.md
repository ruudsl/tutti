# Tutti Muziek App

[![CI](https://github.com/ruudsl/tutti/actions/workflows/ci.yml/badge.svg)](https://github.com/ruudsl/tutti/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ruudsl/tutti/actions/workflows/codeql.yml/badge.svg)](https://github.com/ruudsl/tutti/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/ruudsl/tutti/branch/main/graph/badge.svg)](https://codecov.io/gh/ruudsl/tutti)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

_[English](README.md) · [Deutsche Version](README.de.md)_

Een complete webapplicatie voor het beheren van muziekstukken, repetities, concertprogramma's en ledenorganisatie binnen harmonieorkesten en fanfares.

## Overzicht

Tutti is een multi-tenant webapplicatie ontworpen voor harmonieorkesten, fanfares en brassbands. De applicatie centraliseert het beheer van muziekstukken (PDF's), repetitieplanningen, concertprogramma's, leningen van muziekmateriaal en ledenbeheer.

### Kernfunctionaliteit

- **Muziekbibliotheek** — Upload, categoriseer en distribueer PDF-bladmuziek aan leden op basis van hun instrumenten
- **Repetities & Aanwezigheid** — Plan repetities, koppel met Spond voor automatische aanwezigheidsregistratie
- **Concertprogramma's** — Stel programma's samen met tijdsberekening en stuknummering
- **Ledenbeheer** — Beheer leden, instrumenten, orkesten en rollen
- **Tickets & Concerten** — Verkoop tickets online met QR-scanning en stoelbeheer
- **Multi-tenant** — Ondersteuning voor meerdere verenigingen op één installatie

Zie [docs/FEATURES.md](docs/FEATURES.md) voor de complete functielijst.

## Screenshots

| Dashboard                                    | Muziekstukken                                       |
| -------------------------------------------- | --------------------------------------------------- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Muziekstukken](docs/screenshots/music-pieces.png) |

| Uploaden                                 | Muzieklijsten                                      |
| ---------------------------------------- | -------------------------------------------------- |
| ![Uploaden](docs/screenshots/upload.png) | ![Muzieklijsten](docs/screenshots/music-lists.png) |

## Snel starten

### Vereisten

- **Node.js** 18+ (20+ aanbevolen)
- **npm** 9+

### Installatie

```bash
# Clone de repository
git clone https://github.com/ruudsl/tutti.git
cd tutti

# Installeer dependencies
npm install

# Maak configuratie aan (zie .env.example voor alle 69 gedocumenteerde variabelen)
cp backend/.env.example backend/.env

# Start development server
npm run dev
```

De applicatie is nu beschikbaar op:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

### Standaard inloggegevens

Bij eerste start wordt automatisch een admin-account aangemaakt:

- **E-mail:** `admin@harmonie.nl`
- **Wachtwoord:** Gegenereerd en getoond in console output

Je kunt een wachtwoord vooraf instellen via de `ADMIN_INIT_PASSWORD` omgevingsvariabele.

## Development

```bash
# Start backend + frontend samen
npm run dev

# Alleen backend
npm run dev --workspace=backend

# Alleen frontend
npm run dev --workspace=frontend

# Tests uitvoeren
npm test --workspace=backend
npm test --workspace=frontend

# Productie build
npm run build
```

### Bestandsnaamformaat voor muziekuploads

```
Titel_arrangeur_instrument_toonsoort_groepnummer_sleutel.pdf
```

Voorbeelden:

- `The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf`
- `Shannon Song_Rowwen Heze_Altsaxofoon_Eb_1.pdf`

## Deployment

### Aanbevolen setup

| Component | Platform                         |
| --------- | -------------------------------- |
| Frontend  | [Vercel](https://vercel.com)     |
| Backend   | [Render.com](https://render.com) |

Zie [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) voor gedetailleerde deployment-instructies.

### Docker

```bash
cp .env.example .env
# Bewerk .env met je instellingen
docker-compose up -d
```

Zie [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) voor self-hosting opties.

## Documentatie

### Gebruikersdocumentatie

| Document                                            | Beschrijving                   |
| --------------------------------------------------- | ------------------------------ |
| [USER_GUIDE.md](docs/USER_GUIDE.md)                 | Complete gebruikershandleiding |
| [FEATURES.md](docs/FEATURES.md)                     | Complete functielijst          |
| [KEYBOARD_SHORTCUTS.md](docs/KEYBOARD_SHORTCUTS.md) | Sneltoetsen overzicht          |
| [MOBILE_APP.md](docs/MOBILE_APP.md)                 | Mobiele app / PWA handleiding  |
| [FAQ.md](docs/FAQ.md)                               | Veelgestelde vragen            |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)       | Probleemoplossing              |

### Beheer & Operaties

| Document                                        | Beschrijving                                  |
| ----------------------------------------------- | --------------------------------------------- |
| [ADMIN.md](docs/ADMIN.md)                       | Beheerhandleiding                             |
| [ROLE_PERMISSIONS.md](docs/ROLE_PERMISSIONS.md) | Rol-gebaseerde rechtenmatrix                  |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)             | Deployment handleiding (Render/Vercel/Docker) |
| [SELF_HOSTING.md](docs/SELF_HOSTING.md)         | Self-hosting handleiding                      |
| [MONITORING.md](docs/MONITORING.md)             | Monitoring & observability                    |

### Ontwikkelaarsdocumentatie

| Document                                        | Beschrijving                  |
| ----------------------------------------------- | ----------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)         | Systeemarchitectuur           |
| [DATABASE.md](docs/DATABASE.md)                 | Database schema & ERD         |
| [API.md](docs/API.md)                           | REST API documentatie         |
| [AUTHENTICATION.md](docs/AUTHENTICATION.md)     | Authenticatie flows & JWT/MFA |
| [WEBSOCKET.md](docs/WEBSOCKET.md)               | WebSocket events referentie   |
| [STATE_MANAGEMENT.md](docs/STATE_MANAGEMENT.md) | Frontend state patronen       |
| [HOOKS.md](docs/HOOKS.md)                       | React hooks documentatie      |
| [TESTING.md](docs/TESTING.md)                   | Teststrategie & richtlijnen   |
| [THEMING.md](docs/THEMING.md)                   | Theming systeem               |

### Integraties & Compliance

| Document                                      | Beschrijving                       |
| --------------------------------------------- | ---------------------------------- |
| [INTEGRATIONS.md](docs/INTEGRATIONS.md)       | Externe integraties                |
| [GDPR.md](docs/GDPR.md)                       | AVG/GDPR compliance handleiding    |
| [EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md) | E-mail templates referentie        |
| [PRINT_TEMPLATES.md](docs/PRINT_TEMPLATES.md) | Print templates (tickets, posters) |

### Architectuurbeslissingen

Zie [docs/adr/](docs/adr/) voor Architecture Decision Records (ADR's).

### API Testen

Importeer de [Postman collectie](docs/postman/tutti-api-collection.json) voor interactief API testen.

## Beveiliging

Zie [SECURITY.md](SECURITY.md) voor ons beveiligingsbeleid en het melden van kwetsbaarheden.

## Tech Stack

| Backend         | Frontend           |
| --------------- | ------------------ |
| Node.js 20+     | React 18           |
| Express 4.x     | Vite 5.x           |
| TypeScript 5.x  | TanStack Query 5.x |
| SQLite (sql.js) | React Router 6.x   |
| JWT + TOTP MFA  | i18next (NL/EN/DE) |

Zie [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) voor de volledige technologielijst.

## Licentie

[MIT](LICENSE)
