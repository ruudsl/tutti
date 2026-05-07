# Tutti Musik-App

[![CI](https://github.com/ruudsl/tutti/actions/workflows/ci.yml/badge.svg)](https://github.com/ruudsl/tutti/actions/workflows/ci.yml)
[![CodeQL](https://github.com/ruudsl/tutti/actions/workflows/codeql.yml/badge.svg)](https://github.com/ruudsl/tutti/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/ruudsl/tutti/branch/main/graph/badge.svg)](https://codecov.io/gh/ruudsl/tutti)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

*[English](README.md) · [Nederlandse versie](README.nl.md)*

Eine vollständige Webanwendung zur Verwaltung von Noten, Proben, Konzertprogrammen und der Mitgliederorganisation für Blasorchester und Brass Bands.

## Überblick

Tutti ist eine mandantenfähige Webanwendung, die für Blasorchester, Brass Bands und Sinfonische Blasorchester entwickelt wurde. Die Anwendung zentralisiert die Verwaltung von Noten (PDFs), Probenplanung, Konzertprogrammen, Verleih von Notenmaterial und Mitgliederverwaltung.

### Kernfunktionen

- **Musikbibliothek** — PDFs hochladen, kategorisieren und auf Basis der Instrumente an Mitglieder verteilen
- **Proben & Anwesenheit** — Proben planen, Spond für automatische Anwesenheitserfassung einbinden
- **Konzertprogramme** — Setlists mit Zeitberechnung und Stücknummerierung erstellen
- **Mitgliederverwaltung** — Mitglieder, Instrumente, Orchester und Rollen verwalten
- **Tickets & Konzerte** — Online-Ticketverkauf mit QR-Scanning und Sitzplatzverwaltung
- **Mandantenfähig** — Unterstützung mehrerer Vereine auf einer einzigen Installation

Siehe [docs/FEATURES.md](docs/FEATURES.md) für die vollständige Funktionsliste.

## Screenshots

| Dashboard | Musikstücke |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Musikstücke](docs/screenshots/music-pieces.png) |

| Hochladen | Musiklisten |
|---|---|
| ![Hochladen](docs/screenshots/upload.png) | ![Musiklisten](docs/screenshots/music-lists.png) |

## Schnellstart

### Voraussetzungen

- **Node.js** 18+ (20+ empfohlen)
- **npm** 9+

### Installation

```bash
# Repository klonen
git clone https://github.com/ruudsl/tutti.git
cd tutti

# Abhängigkeiten installieren
npm install

# Konfiguration erstellen
cp backend/.env.example backend/.env

# Entwicklungsserver starten
npm run dev
```

Die Anwendung ist jetzt verfügbar unter:
- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

### Standard-Anmeldedaten

Beim ersten Start wird automatisch ein Admin-Konto erstellt:
- **E-Mail:** `admin@harmonie.nl`
- **Passwort:** Generiert und in der Konsolenausgabe angezeigt

Sie können ein Passwort über die Umgebungsvariable `ADMIN_INIT_PASSWORD` voreinstellen.

## Entwicklung

```bash
# Backend + Frontend zusammen starten
npm run dev

# Nur Backend
npm run dev --workspace=backend

# Nur Frontend
npm run dev --workspace=frontend

# Tests ausführen
npm test --workspace=backend
npm test --workspace=frontend

# Produktions-Build
npm run build
```

### Dateinamenformat für Musik-Uploads

```
Titel_Arrangeur_Instrument_Tonart_Gruppennummer_Schlüssel.pdf
```

Beispiele:
- `The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf`
- `Shannon Song_Rowwen Heze_Altsaxophon_Eb_1.pdf`

## Deployment

### Empfohlenes Setup

| Komponente | Plattform |
|---|---|
| Frontend | [Vercel](https://vercel.com) |
| Backend | [Render.com](https://render.com) |

Siehe [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) für detaillierte Deployment-Anleitungen.

### Docker

```bash
cp .env.example .env
# .env mit Ihren Einstellungen bearbeiten
docker-compose up -d
```

Siehe [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) für Self-Hosting-Optionen.

## Dokumentation

| Dokument | Beschreibung |
|---|---|
| [FEATURES.md](docs/FEATURES.md) | Vollständige Funktionsliste |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment-Anleitung für Render/Vercel/Docker |
| [ADMIN.md](docs/ADMIN.md) | Administrationshandbuch, Rollen, Super-Admin |
| [API.md](docs/API.md) | API-Dokumentation |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Systemarchitektur und Designentscheidungen |
| [SELF_HOSTING.md](docs/SELF_HOSTING.md) | Self-Hosting-Anleitung |

## Tech Stack

| Backend | Frontend |
|---|---|
| Node.js 20+ | React 18 |
| Express 4.x | Vite 5.x |
| TypeScript 5.x | TanStack Query 5.x |
| SQLite (sql.js) | React Router 6.x |
| JWT + TOTP MFA | i18next (NL/EN/DE) |

Siehe [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) für die vollständige Technologieliste.

## Lizenz

[MIT](LICENSE)
