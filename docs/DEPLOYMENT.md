# Deployment Guide

## Quick Reference

| Component | Recommended Platform | Alternative               |
| --------- | -------------------- | ------------------------- |
| Frontend  | Vercel               | Netlify, Cloudflare Pages |
| Backend   | Render.com           | Railway, Fly.io, Docker   |
| Database  | SQLite (on disk)     | —                         |

## Deploy Backend on Render.com

> **Let op de naamgeving.** De namen hieronder (`tutti-backend`, `tutti.db`)
> komen niet overeen met `render.yaml` in de repo, waar de service
> `harmonie-backend` heet en de database `harmonie.db`. Welke van de twee klopt
> hangt af van hoe de service ooit is aangemaakt — kijk in het Render-dashboard
> voordat je een pad overneemt. Een `DB_PATH` die net naast de bestaande wijst
> geeft geen foutmelding: de applicatie maakt dan gewoon een nieuwe, lege
> database aan en het lijkt alsof alle gegevens weg zijn.

1. **Create an account** on [render.com](https://render.com) and log in

2. **Click "New" → "Web Service"**

3. **Connect your GitHub repository** and select the tutti repository

4. **Configure the service:**
   - **Name:** `tutti-backend`
   - **Region:** Frankfurt (EU Central)
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`

5. **Add Environment Variables:**

   | Key              | Value                                       |
   | ---------------- | ------------------------------------------- |
   | `NODE_ENV`       | `production`                                |
   | `PORT`           | `10000`                                     |
   | `JWT_SECRET`     | _(generate with `openssl rand -hex 32`)_    |
   | `DB_PATH`        | `/opt/render/project/data/tutti.db`         |
   | `UPLOAD_DIR`     | `/opt/render/project/data/uploads`          |
   | `MP3_UPLOAD_DIR` | `/opt/render/project/data/uploads/mp3`      |
   | `FRONTEND_URL`   | _(fill in later after frontend deployment)_ |

6. **Add a Disk** for persistent storage:
   - **Mount Path:** `/opt/render/project/data`
   - **Size:** 1 GB (or more if needed)

7. **Click "Create Web Service"** and note the URL

## Deploy Frontend on Vercel

1. **Create an account** on [vercel.com](https://vercel.com) and log in

2. **Import your GitHub repository** via "Add New..." → "Project"

3. **Configuration:**
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`

4. **Environment Variable:**

   | Key            | Value                                                                |
   | -------------- | -------------------------------------------------------------------- |
   | `VITE_API_URL` | Backend URL + `/api`, e.g., `https://tutti-backend.onrender.com/api` |

5. **Deploy** and note the frontend URL

## After Both Deployments

Go back to Render.com and set `FRONTEND_URL` to the Vercel URL for CORS.

## Staging

Staging is een tweede, losstaande omgeving die automatisch wordt bijgewerkt zodra CI op `main` slaagt. Zo is een wijziging te bekijken op een draaiende installatie voordat productie hem krijgt.

De workflow (`.github/workflows/deploy-staging.yml`) doet drie dingen: hij start de uitrol, wacht tot de omgeving weer antwoordt, en draait daarna een rookproef (`scripts/smoke-test.mjs`). Die laatste stap is er omdat een geslaagde uitrol alleen zegt dat het proces startte — niet dat de migraties doorliepen of dat de database staat.

### Inrichten

**1. Maak een staging-service in Render**

Kies **New → Web Service** en vul handmatig in. Laat Render hier géén Blueprint
uit `render.yaml` toepassen: die beschrijft de _productie_-service, en toepassen
op een tweede service levert een kopie op die naar dezelfde database wijst.

Neem de instellingen over van de productie-service, met deze verschillen:

| Instelling        | Waarde                                                              |
| ----------------- | ------------------------------------------------------------------- |
| Name              | `harmonie-staging`                                                  |
| Branch            | `main`                                                              |
| Root Directory    | `backend`                                                           |
| Build Command     | `cp ../CHANGELOG*.md . && npm install && npm run build`             |
| Start Command     | `npm start`                                                         |
| Health Check Path | `/api/health`                                                       |
| Auto-Deploy       | **Off** — de workflow start de uitrol, anders gebeurt het twee keer |
| `JWT_SECRET`      | **een nieuwe**, `openssl rand -hex 32`                              |
| `DB_PATH`         | een eigen pad, nooit dat van productie                              |
| `FRONTEND_URL`    | de staging-URL van de frontend                                      |

Twee daarvan zijn geen smaakkwestie. **Auto-Deploy uit**, anders rolt Render zelf
óók uit bij elke push en gebeurt het twee keer; die twee lopen elkaar in de weg.
En een **eigen `JWT_SECRET`**, want wordt die gedeeld met productie, dan is een
token dat iemand op staging krijgt ook geldig op productie.

De build command is niet dezelfde als bij de productie-instructies bovenaan dit
document: zonder dat `cp` mist de build de changelog-bestanden.

**Met of zonder disk**

Op het gratis plan van Render kun je geen disk aanmaken. Dat is geen blokkade:
de applicatie maakt de map zelf aan en draait de migraties bij het opstarten, dus
zonder disk komt hij gewoon op met een lege database.

|                        | Met disk (betaald plan)                     | Zonder disk (gratis) |
| ---------------------- | ------------------------------------------- | -------------------- |
| `DB_PATH`              | `/opt/render/project/data/staging.db`       | `/tmp/staging.db`    |
| `UPLOAD_DIR`           | `/opt/render/project/data/uploads`          | `/tmp/uploads`       |
| `MP3_UPLOAD_DIR`       | `/opt/render/project/data/uploads/mp3`      | `/tmp/uploads/mp3`   |
| Disk toevoegen         | Mount Path `/opt/render/project/data`, 1 GB | niet                 |
| Gegevens na een uitrol | blijven staan                               | weg                  |

Zonder disk is staging een **rookproef-omgeving en geen klikomgeving**: bij elke
uitrol, en elke keer dat de service uit de slaapstand komt, begin je met niets.
Voor de vraag die deze workflow stelt — komt de applicatie na deze merge overeind
en lopen de migraties door — is dat genoeg, en zuiverder ook: je test elke keer
de route die een nieuwe installatie ook doorloopt. Wil je met de hand rondklikken
in gevulde gegevens, dan heb je een betaald plan met disk nodig.

Let op het gratis plan ook hierop: de service slaapt na een kwartier zonder
verkeer, en het eerste verzoek daarna duurt ongeveer een minuut. De workflow
wacht tot tien minuten in stappen van tien seconden, dus dat past ruim — maar als
je zelf gaat kijken en het duurt even, is dat dit en geen storing.

**2. Zet de gegevens in GitHub**

| Soort    | Naam                         | Waar vandaan                                                                                                            |
| -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Secret   | `RENDER_STAGING_DEPLOY_HOOK` | Render → staging-service → Settings → Deploy Hook                                                                       |
| Variable | `STAGING_URL`                | de URL van de staging-service, bijvoorbeeld `https://harmonie-staging.onrender.com`, zonder schuine streep aan het eind |

Onder Settings → Secrets and variables → Actions; de eerste bij _Secrets_, de tweede bij _Variables_.

Ontbreekt een van beide, dan stopt de workflow met een uitleg in de samenvatting in plaats van met een rode kruis. Een fout die je niet kunt oplossen zonder toegang tot de instellingen leert je niets, en went eraan dat rood normaal is.

### De rookproef losstaand draaien

```bash
node scripts/smoke-test.mjs https://tutti-staging.onrender.com
```

Hij logt nergens in — daar zouden inloggegevens voor nodig zijn, en die horen niet in een uitrolstap. Wat hij wel controleert: of de gezondheidsroute antwoordt, of de database bereikbaar is, of een beschermde route netjes 401 geeft (niet 200, want dan ligt de beveiliging eraf, en niet 500, want dan is de middleware stuk), en of een onbekend pad 404 geeft.

## Docker (Self-hosting)

The easiest way to self-host Tutti is using Docker Compose:

```bash
# 1. Clone the repository
git clone https://github.com/ruudsl/tutti.git
cd tutti

# 2. Copy the example environment file
cp .env.example .env

# 3. Edit .env and set your JWT_SECRET and domain
nano .env

# 4. Start with Docker Compose
docker-compose up -d
```

The application will be available at `http://localhost:3000` (or your configured domain).

**Features:**

- **Multi-architecture** — Images available for AMD64 and ARM64 (Apple Silicon, Raspberry Pi)
- **Nginx reverse proxy** — With automatic SSL via Let's Encrypt
- **Persistent volumes** — Database and uploads are stored in Docker volumes
- **Health checks** — Automatic container health monitoring

For production deployment with SSL:

```bash
# Set your domain in .env
DOMAIN=tutti.example.com
LETSENCRYPT_EMAIL=admin@example.com

# Start with production profile
docker-compose --profile production up -d
```

## Configuration Reference

### Backend (`backend/.env`)

| Variable                       | Default                 | Description                                                      |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                     | `development`           | `development` or `production`                                    |
| `PORT`                         | `3001`                  | Port for the API server                                          |
| `JWT_SECRET`                   | _(dev-only default)_    | **Required in production!** Generate with `openssl rand -hex 32` |
| `JWT_EXPIRES_IN`               | `7d`                    | JWT token validity period (e.g., `1d`, `12h`)                    |
| `DB_PATH`                      | `./data/tutti.db`       | Path to SQLite database file                                     |
| `UPLOAD_DIR`                   | `./uploads`             | Directory for uploaded PDF files                                 |
| `MP3_UPLOAD_DIR`               | `./uploads/mp3`         | Directory for uploaded MP3 files                                 |
| `MAX_FILE_SIZE`                | `52428800`              | Max file size in bytes (default 50MB)                            |
| `FRONTEND_URL`                 | `http://localhost:5173` | Frontend URL for CORS configuration                              |
| `ADMIN_INIT_PASSWORD`          | _(empty)_               | Optional: admin password on first start                          |
| `MAKE_SUPER_ADMIN`             | _(empty)_               | Email of user to promote to super admin                          |
| `RATE_LIMIT_WINDOW_MS`         | `900000`                | Rate limit window in ms (default 15 min)                         |
| `RATE_LIMIT_MAX_REQUESTS`      | `100`                   | Max requests per window                                          |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | `5`                     | Max login attempts per window                                    |

### Frontend (`frontend/.env.local`)

| Variable       | Default           | Description                                                                                                            |
| -------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | _(empty = proxy)_ | Backend API URL. Leave empty for development (Vite proxy). In production: full URL e.g., `https://api.example.com/api` |

### Cloud Import Settings

Cloud import settings are configured per organization via the Settings page:

**OneDrive/SharePoint:**

- Uses existing Microsoft Entra ID configuration
- Requires the `Files.Read.All` scope to be added to your Azure App Registration

**Google Drive:**

- Configure via Settings → Google Drive
- Requires a Google Cloud project with Picker API and Drive API enabled
- OAuth Client ID: Created in Google Cloud Console (Web Application type)
- API Key: Created in Google Cloud Console with Picker API access

## Troubleshooting

| Problem                  | Solution                                                                         |
| ------------------------ | -------------------------------------------------------------------------------- |
| "Cannot GET /api"        | Check if `VITE_API_URL` is correct (must end with `/api`)                        |
| CORS errors on login     | Set `FRONTEND_URL` correctly on Render (exact, with https://, no trailing slash) |
| Backend won't start      | Check the Render logs; verify all environment variables                          |
| Data lost after redeploy | Add a Disk with the correct mount path                                           |
| Super admin not working  | Set `MAKE_SUPER_ADMIN` env var and redeploy                                      |
