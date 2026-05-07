# Tutti Muziek App

[![CI](https://github.com/ruudsl/tutti/actions/workflows/ci.yml/badge.svg)](https://github.com/ruudsl/tutti/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ruudsl/tutti/actions/workflows/codeql.yml/badge.svg)](https://github.com/ruudsl/tutti/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/ruudsl/tutti/branch/main/graph/badge.svg)](https://codecov.io/gh/ruudsl/tutti)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

*[English](README.md) · [Deutsche Version](README.de.md)*

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

| Dashboard | Muziekstukken |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Muziekstukken](docs/screenshots/music-pieces.png) |

| Uploaden | Muzieklijsten |
|---|---|
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

# Maak configuratie aan
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

| Component | Platform |
|---|---|
| Frontend | [Vercel](https://vercel.com) |
| Backend | [Render.com](https://render.com) |

Zie [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) voor gedetailleerde deployment-instructies.

### Docker

```bash
cp .env.example .env
# Bewerk .env met je instellingen
docker-compose up -d
```

Zie [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) voor self-hosting opties.

## Documentatie

| Document | Beschrijving |
|---|---|
| [FEATURES.md](docs/FEATURES.md) | Complete functielijst |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment handleiding voor Render/Vercel/Docker |
| [ADMIN.md](docs/ADMIN.md) | Beheerhandleiding, rollen, super-admin |
| [API.md](docs/API.md) | API documentatie |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Systeemarchitectuur en ontwerpbeslissingen |
| [SELF_HOSTING.md](docs/SELF_HOSTING.md) | Self-hosting handleiding |

## Tech Stack

| Backend | Frontend |
|---|---|
| Node.js 20+ | React 18 |
| Express 4.x | Vite 5.x |
| TypeScript 5.x | TanStack Query 5.x |
| SQLite (sql.js) | React Router 6.x |
| JWT + TOTP MFA | i18next (NL/EN/DE) |

Zie [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) voor de volledige technologielijst.

## Licentie

[MIT](LICENSE)
