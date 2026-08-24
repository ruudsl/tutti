# Tutti Architecture

## Overview

Tutti is a multi-tenant web application for music associations (concert bands, brass bands, wind orchestras). It manages sheet music, rehearsals, concerts, and members.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  Browser (SPA)  │  │   PWA (Mobile)  │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
└───────────┼────────────────────┼────────────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Pages   │  │Components│  │  Hooks   │  │  Utils   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              React Query (State Management)           │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Service Worker (PWA/Offline)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ REST API
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Routes  │  │Middleware│  │ Services │  │Validation│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Authentication                      │   │
│  │              (JWT + Optional MFA/SSO)                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  SQLite (sql.js) │  │   File Storage   │                 │
│  │                  │  │   (PDFs, Audio)  │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend

| Technology   | Purpose                           |
| ------------ | --------------------------------- |
| React 18     | UI framework                      |
| TypeScript   | Type safety                       |
| Vite         | Build tool                        |
| React Query  | Server state management           |
| React Router | Client-side routing               |
| i18next      | Internationalization (nl, en, de) |
| Workbox      | PWA/Service Worker                |

### Backend

| Technology | Purpose            |
| ---------- | ------------------ |
| Node.js 24 | Runtime            |
| Express    | HTTP framework     |
| TypeScript | Type safety        |
| sql.js     | Database (SQLite)  |
| Zod        | Request validation |
| JWT        | Authentication     |
| bcrypt     | Password hashing   |

## Multi-Tenancy

Tutti uses a **shared database, shared schema** multi-tenant architecture:

```
┌─────────────────────────────────────────┐
│              Single Database             │
│  ┌─────────────────────────────────────┐│
│  │ associations                        ││
│  │ ├── id (PK)                         ││
│  │ └── name                            ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ users                               ││
│  │ ├── id (PK)                         ││
│  │ ├── association_id (FK) ◄── Tenant  ││
│  │ └── ...                             ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ music_titles                        ││
│  │ ├── id (PK)                         ││
│  │ ├── association_id (FK) ◄── Tenant  ││
│  │ └── ...                             ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Key principle**: Every query filters by `association_id` from the authenticated user's JWT token.

## Authentication Flow

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
│ Client │     │Frontend│     │Backend │     │Database│
└───┬────┘     └───┬────┘     └───┬────┘     └───┬────┘
    │   Login      │              │              │
    │─────────────►│              │              │
    │              │ POST /auth   │              │
    │              │─────────────►│              │
    │              │              │ Verify user  │
    │              │              │─────────────►│
    │              │              │◄─────────────│
    │              │   JWT Token  │              │
    │              │◄─────────────│              │
    │  Store JWT   │              │              │
    │◄─────────────│              │              │
    │              │              │              │
    │ API Request  │              │              │
    │─────────────►│              │              │
    │              │ + Auth Header│              │
    │              │─────────────►│              │
    │              │              │ Verify JWT   │
    │              │              │ Extract user │
    │              │              │ + assoc_id   │
    │              │              │─────────────►│
    │              │   Response   │◄─────────────│
    │◄─────────────│◄─────────────│              │
```

## Directory Structure

```
tutti/
├── backend/
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── middleware/      # Auth, error handling, cache
│   │   ├── services/        # Business logic
│   │   ├── validation/      # Zod schemas
│   │   ├── database/        # DB connection, migrations
│   │   └── utils/           # Helpers
│   └── uploads/             # PDF/audio storage
├── frontend/
│   ├── src/
│   │   ├── pages/           # Route components
│   │   ├── components/      # Reusable UI
│   │   ├── hooks/           # Custom React hooks
│   │   ├── context/         # React context (auth)
│   │   ├── utils/           # Helpers
│   │   └── locales/         # i18n translations
│   └── public/              # Static assets
├── docs/                    # Documentation
└── scripts/                 # Deployment scripts
```

## API Design

RESTful API with consistent patterns:

```
GET    /api/resource          # List (paginated)
GET    /api/resource/:id      # Get single
POST   /api/resource          # Create
PUT    /api/resource/:id      # Update
DELETE /api/resource/:id      # Delete
```

### Response Format

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

### Error Format

```json
{
  "error": "Error message",
  "details": [...]
}
```

## Caching Strategy

### Frontend (React Query)

- Stale time: 5 minutes
- Cache persisted to IndexedDB
- Background refetch on focus

### Backend (HTTP)

- ETag for conditional requests
- Cache-Control headers for static assets

### PWA (Service Worker)

- Precache: App shell, fonts, icons
- Runtime cache: API responses, PDFs
- Offline fallback page

## Security Measures

1. **Authentication**: JWT with configurable expiry
2. **Authorization**: Role-based (admin, music_committee, member, etc.)
3. **Input validation**: Zod schemas on all endpoints
4. **SQL injection**: Parameterized queries only
5. **XSS**: React's built-in escaping
6. **CSRF**: SameSite cookies
7. **Rate limiting**: Per-IP and per-user limits
8. **File uploads**: Type validation, size limits

## Deployment

See [SELF_HOSTING.md](SELF_HOSTING.md) for deployment instructions.

### Docker Architecture

```
┌─────────────────────────────────────────┐
│              Docker Compose              │
│  ┌─────────────┐  ┌─────────────┐       │
│  │   Traefik   │  │   Backend   │       │
│  │   (Proxy)   │──│  (Node.js)  │       │
│  └─────────────┘  └──────┬──────┘       │
│         │                │              │
│         │         ┌──────┴──────┐       │
│         │         │   Volumes   │       │
│         │         │ - database  │       │
│         │         │ - uploads   │       │
│         │         └─────────────┘       │
│  ┌──────┴──────┐                        │
│  │ Let's Encrypt│                       │
│  │    (SSL)     │                       │
│  └─────────────┘                        │
└─────────────────────────────────────────┘
```

## Performance Considerations

1. **Database**: SQLite is fast for read-heavy workloads
2. **Pagination**: All list endpoints are paginated
3. **Lazy loading**: PDF.js loaded on demand
4. **Code splitting**: Vite chunks by route
5. **Image optimization**: SVG icons, lazy loaded images
6. **Caching**: Aggressive caching for static content
