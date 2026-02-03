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

## Deployment

De applicatie kan worden gedeployed met Vercel (frontend) en Render.com (backend).

### Backend deployen op Render.com

1. **Maak een account** op [render.com](https://render.com) en log in

2. **Klik op "New" → "Web Service"**

3. **Connect je GitHub repository**
   - Selecteer de repository waar deze code staat
   - Geef Render toegang tot de repository

4. **Configureer de service:**
   - **Name:** `harmonie-backend` (of een andere naam)
   - **Region:** Frankfurt (EU Central) - dichtstbij voor Nederland
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

5. **Voeg Environment Variables toe** (klik op "Advanced" → "Add Environment Variable"):
   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `JWT_SECRET` | *(genereer een lange random string, bijv. met `openssl rand -hex 32`)* |
   | `DB_PATH` | `/opt/render/project/data/harmonie.db` |
   | `UPLOAD_DIR` | `/opt/render/project/data/uploads` |
   | `MP3_UPLOAD_DIR` | `/opt/render/project/data/uploads/mp3` |
   | `FRONTEND_URL` | *(vul later in na frontend deployment)* |

6. **Voeg een Disk toe** voor persistente opslag:
   - Klik op "Add Disk"
   - **Name:** `harmonie-data`
   - **Mount Path:** `/opt/render/project/data`
   - **Size:** 1 GB (of meer indien nodig)

7. **Klik op "Create Web Service"**

8. **Wacht tot de deployment klaar is** - noteer de URL (bijv. `https://harmonie-backend.onrender.com`)

### Frontend deployen op Vercel

1. **Maak een account** op [vercel.com](https://vercel.com) en log in

2. **Klik op "Add New..." → "Project"**

3. **Import je GitHub repository**
   - Selecteer de repository waar deze code staat

4. **Configureer het project:**
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`

5. **Voeg Environment Variables toe:**
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | De Render backend URL + `/api`, bijv. `https://harmonie-backend.onrender.com/api` |

6. **Klik op "Deploy"**

7. **Noteer de frontend URL** (bijv. `https://harmonie-frontend.vercel.app`)

### Na beide deployments: CORS configureren

Ga terug naar **Render.com** en voeg de frontend URL toe aan de environment variables:

1. Ga naar je backend service → "Environment"
2. Voeg toe of update: `FRONTEND_URL` = `https://harmonie-frontend.vercel.app` (jouw Vercel URL)
3. Klik op "Save Changes" - de service herstart automatisch

### Verificatie

1. Open de frontend URL in je browser
2. Log in met:
   - **Email:** `admin@harmonie.nl`
   - **Wachtwoord:** `admin123`
3. **Wijzig direct je wachtwoord** via Profiel → Wachtwoord wijzigen

### Troubleshooting

**"Cannot GET /api" foutmelding:**
- Check of je de juiste backend URL hebt in `VITE_API_URL`
- De URL moet eindigen op `/api`, bijv. `https://harmonie-backend.onrender.com/api`

**CORS errors (login mislukt):**
- Zorg dat `FRONTEND_URL` correct is ingesteld op Render
- De URL moet exact overeenkomen (inclusief https://, zonder trailing slash)

**Backend start niet:**
- Check de logs in Render dashboard
- Verifieer dat alle environment variables correct zijn ingesteld

**Database of uploads kwijt na redeploy:**
- Zorg dat je een Disk hebt toegevoegd met het juiste mount path
- Zonder Disk gaan alle gegevens verloren bij elke redeploy

## Technologieën

- **Frontend:** React 18, TypeScript, React Router, Axios, TanStack Query
- **Backend:** Node.js, Express, TypeScript
- **Database:** SQLite (better-sqlite3)
- **Authenticatie:** JWT tokens, TOTP MFA
- **Build tools:** Vite, tsx
- **Deployment:** Vercel (frontend), Render.com (backend)

## Licentie

MIT
