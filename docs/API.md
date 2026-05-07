# API Documentation

## Authentication

All endpoints (except login and public routes) require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "admin",
    "associationId": "uuid"
  }
}
```

## Endpoints Overview

| Group | Path | Description |
|---|---|---|
| Auth | `/api/auth/*` | Login, profile, password, MFA, password reset |
| Users | `/api/users/*` | CRUD members, assign instruments/orchestras |
| Instruments | `/api/instruments/*` | CRUD instruments and aliases |
| Orchestras | `/api/orchestras/*` | CRUD orchestras, member management |
| Music Pieces | `/api/music-pieces/*` | Upload, download, metadata, MP3, sharing, ZIP upload |
| Music Titles | `/api/music-titles/*` | Metadata library (via music-pieces routes) |
| Music Lists | `/api/music-lists/*` | Setlists and concert programs |
| Genres | `/api/genres/*` | Music genres/categories |
| Rehearsals | `/api/rehearsals/*` | Scheduling, default days, attendance, recurring series |
| Availability | `/api/availability/*` | Personal and team availability management |
| Concerts | `/api/concerts/*` | Concert management, attendance prediction |
| Tickets | `/api/tickets/*` | Ticket sales and management |
| Spond | `/api/spond/*` | Spond configuration and synchronization |
| Loans | `/api/loans/*` | Loan management, loan history |
| Issues | `/api/issues/*` | Sheet music error reports |
| Activity | `/api/activity/*` | Logging and statistics |
| MusicaInfo | `/api/musicainfo/*` | Metadata lookup via MusicaInfo.net |
| PDF Tools | `/api/pdf-tools/*` | PDF merge, extract, transpose |
| Cloud Import | `/api/cloud-import/*` | OneDrive and Google Drive file import |
| Settings | `/api/settings/*` | Organization settings, theme, SMTP |
| Backup | `/api/backup/*` | Database backup and restore |
| Health | `/api/health/*` | System health monitoring (basic and detailed) |
| Analytics | `/api/analytics/*` | Usage analytics and statistics |
| Microsoft | `/api/microsoft-auth/*` | Azure Entra SSO |
| Multi-Association | `/api/multi-association/*` | Multi-tenant management (super admin) |

## Common Response Formats

### Success
```json
{
  "id": "uuid",
  "field": "value"
}
```

### Error
```json
{
  "error": "Error message in Dutch"
}
```

### Paginated List
```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

## Music Pieces

### Upload Music Piece
```http
POST /api/music-pieces
Content-Type: multipart/form-data

file: <PDF file>
title: "Piece Title"
instrument_id: "uuid"
orchestra_id: "uuid" (optional)
```

### Download Music Piece
```http
GET /api/music-pieces/:id/download
Authorization: Bearer <token>
```

### List Music Pieces
```http
GET /api/music-pieces?instrument_id=uuid&orchestra_id=uuid&search=keyword
```

## Music Lists (Setlists)

### Create Music List
```http
POST /api/music-lists
Content-Type: application/json

{
  "name": "Concert 2024",
  "orchestra_id": "uuid",
  "date": "2024-12-15",
  "location": "Concert Hall",
  "notes": "Winter concert"
}
```

### Add Piece to List
```http
POST /api/music-lists/:id/items
Content-Type: application/json

{
  "music_title_id": "uuid",
  "order": 1
}
```

## Rate Limiting

The API has rate limiting enabled:
- General endpoints: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes

When rate limited, you'll receive:
```http
HTTP/1.1 429 Too Many Requests
```

## Swagger Documentation

In development mode, Swagger UI is available at:
```
http://localhost:3001/api/docs
```
