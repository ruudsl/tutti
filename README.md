# Harmonie Muziek App

Webapplicatie voor het beheren en distribueren van muziekstukken binnen een harmonieorkest.

## Functionaliteiten

### Voor leden
- Bekijk muziekstukken gefilterd op je eigen instrumenten
- Download PDF bestanden van muziekstukken
- Bekijk YouTube previews van muziekstukken
- Overzicht van je orkesten en muzieklijsten

### Voor muziekcommissie
- Upload meerdere muziekstukken tegelijk
- Beheer instrumenten en aliassen (bijv. "Altsax" → "Alto Saxophone")
- Wijs muziekstukken toe aan orkesten en lijsten
- Voeg YouTube links toe aan muziekstukken
- Bewerk metadata van muziekstukken

### Voor beheerders
- Beheer leden (toevoegen, wijzigen, verwijderen)
- Beheer orkesten en muzieklijsten
- Wijs instrumenten en orkesten toe aan leden
- Deel muziekstukken met andere verenigingen

## Bestandsnaam formaat

Muziekstukken worden automatisch geparseerd op basis van de bestandsnaam:

```
Titel_arrangeur_instrument_stemming_groepnummer_muzieksleutel.pdf
```

Voorbeelden:
- `The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf`
- `Shannon Song_Rowwen Heze_Alto Saxophone_Eb_1.pdf`
- `Shannon Song_Rowwen Heze_Altsax_Eb_2.pdf`

## Installatie

### Vereisten
- Node.js 18+
- npm 9+

### Stappen

1. Installeer dependencies:
```bash
npm install
```

2. Initialiseer de database:
```bash
npm run db:init --workspace=backend
```

3. Start de ontwikkelserver:
```bash
npm run dev
```

De applicatie is nu beschikbaar op:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Standaard inloggegevens

Na initialisatie is er een admin account beschikbaar:
- **Email:** admin@harmonie.nl
- **Wachtwoord:** admin123

⚠️ Wijzig dit wachtwoord na de eerste login!

## Projectstructuur

```
harmonie/
├── backend/
│   ├── src/
│   │   ├── database/       # Database schema en connectie
│   │   ├── middleware/     # Auth middleware
│   │   ├── routes/         # API routes
│   │   └── index.ts        # Server entry point
│   ├── data/               # SQLite database (gegenereerd)
│   └── uploads/            # Geüploade PDF bestanden
├── frontend/
│   ├── src/
│   │   ├── components/     # React componenten
│   │   ├── context/        # Auth context
│   │   ├── pages/          # Pagina componenten
│   │   ├── api.ts          # API client
│   │   └── types.ts        # TypeScript types
│   └── index.html
└── package.json
```

## API Endpoints

### Authenticatie
- `POST /api/auth/login` - Inloggen
- `GET /api/auth/me` - Profiel ophalen
- `POST /api/auth/change-password` - Wachtwoord wijzigen

### Gebruikers (admin)
- `GET /api/users` - Alle leden
- `POST /api/users` - Nieuw lid
- `PUT /api/users/:id` - Lid bijwerken
- `DELETE /api/users/:id` - Lid verwijderen

### Instrumenten
- `GET /api/instruments` - Alle instrumenten
- `POST /api/instruments` - Nieuw instrument
- `PUT /api/instruments/:id` - Instrument bijwerken
- `DELETE /api/instruments/:id` - Instrument verwijderen
- `POST /api/instruments/:id/aliases` - Alias toevoegen
- `DELETE /api/instruments/:id/aliases/:aliasId` - Alias verwijderen

### Orkesten (admin)
- `GET /api/orchestras` - Alle orkesten
- `POST /api/orchestras` - Nieuw orkest
- `PUT /api/orchestras/:id` - Orkest bijwerken
- `DELETE /api/orchestras/:id` - Orkest verwijderen

### Muzieklijsten
- `GET /api/music-lists/my-lists` - Mijn lijsten
- `GET /api/music-lists/:id` - Lijst met stukken
- `POST /api/music-lists` - Nieuwe lijst
- `PUT /api/music-lists/:id` - Lijst bijwerken
- `DELETE /api/music-lists/:id` - Lijst verwijderen
- `POST /api/music-lists/:id/pieces` - Stuk toevoegen
- `DELETE /api/music-lists/:id/pieces/:pieceId` - Stuk verwijderen

### Muziekstukken
- `GET /api/music-pieces` - Alle stukken
- `GET /api/music-pieces/my-pieces` - Mijn stukken
- `POST /api/music-pieces/upload` - Stukken uploaden
- `PUT /api/music-pieces/:id` - Stuk bijwerken
- `DELETE /api/music-pieces/:id` - Stuk verwijderen
- `GET /api/music-pieces/:id/download` - Stuk downloaden

## Rollen

| Rol | Beschrijving |
|-----|--------------|
| `member` | Standaard lid, kan alleen eigen muziekstukken zien en downloaden |
| `music_committee` | Muziekcommissie, kan muziekstukken en instrumenten beheren |
| `admin` | Beheerder, volledige toegang tot alle functionaliteiten |

## Technologieën

- **Frontend:** React 18, TypeScript, React Router, Axios
- **Backend:** Node.js, Express, TypeScript
- **Database:** SQLite (better-sqlite3)
- **Authenticatie:** JWT tokens
- **Build tools:** Vite, tsx

## Licentie

MIT
