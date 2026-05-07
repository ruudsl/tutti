# Deployment Guide

## Quick Reference

| Component | Recommended Platform | Alternative |
|---|---|---|
| Frontend | Vercel | Netlify, Cloudflare Pages |
| Backend | Render.com | Railway, Fly.io, Docker |
| Database | SQLite (on disk) | — |

## Deploy Backend on Render.com

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

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `JWT_SECRET` | *(generate with `openssl rand -hex 32`)* |
   | `DB_PATH` | `/opt/render/project/data/tutti.db` |
   | `UPLOAD_DIR` | `/opt/render/project/data/uploads` |
   | `MP3_UPLOAD_DIR` | `/opt/render/project/data/uploads/mp3` |
   | `FRONTEND_URL` | *(fill in later after frontend deployment)* |

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

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | Backend URL + `/api`, e.g., `https://tutti-backend.onrender.com/api` |

5. **Deploy** and note the frontend URL

## After Both Deployments

Go back to Render.com and set `FRONTEND_URL` to the Vercel URL for CORS.

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

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `3001` | Port for the API server |
| `JWT_SECRET` | *(dev-only default)* | **Required in production!** Generate with `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | `7d` | JWT token validity period (e.g., `1d`, `12h`) |
| `DB_PATH` | `./data/tutti.db` | Path to SQLite database file |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded PDF files |
| `MP3_UPLOAD_DIR` | `./uploads/mp3` | Directory for uploaded MP3 files |
| `MAX_FILE_SIZE` | `52428800` | Max file size in bytes (default 50MB) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS configuration |
| `ADMIN_INIT_PASSWORD` | *(empty)* | Optional: admin password on first start |
| `MAKE_SUPER_ADMIN` | *(empty)* | Email of user to promote to super admin |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window in ms (default 15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | `5` | Max login attempts per window |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty = proxy)* | Backend API URL. Leave empty for development (Vite proxy). In production: full URL e.g., `https://api.example.com/api` |

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

| Problem | Solution |
|---|---|
| "Cannot GET /api" | Check if `VITE_API_URL` is correct (must end with `/api`) |
| CORS errors on login | Set `FRONTEND_URL` correctly on Render (exact, with https://, no trailing slash) |
| Backend won't start | Check the Render logs; verify all environment variables |
| Data lost after redeploy | Add a Disk with the correct mount path |
| Super admin not working | Set `MAKE_SUPER_ADMIN` env var and redeploy |
