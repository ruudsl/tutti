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

| Group             | Path                       | Description                                            |
| ----------------- | -------------------------- | ------------------------------------------------------ |
| Auth              | `/api/auth/*`              | Login, profile, password, MFA, password reset          |
| Users             | `/api/users/*`             | CRUD members, assign instruments/orchestras            |
| Instruments       | `/api/instruments/*`       | CRUD instruments and aliases                           |
| Orchestras        | `/api/orchestras/*`        | CRUD orchestras, member management                     |
| Music Pieces      | `/api/music-pieces/*`      | Upload, download, metadata, MP3, sharing, ZIP upload   |
| Music Titles      | `/api/music-titles/*`      | Metadata library (via music-pieces routes)             |
| Music Lists       | `/api/music-lists/*`       | Setlists and concert programs                          |
| Genres            | `/api/genres/*`            | Music genres/categories                                |
| Rehearsals        | `/api/rehearsals/*`        | Scheduling, default days, attendance, recurring series |
| Availability      | `/api/availability/*`      | Personal and team availability management              |
| Concerts          | `/api/concerts/*`          | Concert management, attendance prediction              |
| Tickets           | `/api/tickets/*`           | Ticket sales and management                            |
| Spond             | `/api/spond/*`             | Spond configuration and synchronization                |
| Loans             | `/api/loans/*`             | Loan management, loan history                          |
| Issues            | `/api/issues/*`            | Sheet music error reports                              |
| Activity          | `/api/activity/*`          | Logging and statistics                                 |
| MusicaInfo        | `/api/musicainfo/*`        | Metadata lookup via MusicaInfo.net                     |
| PDF Tools         | `/api/pdf-tools/*`         | PDF merge, extract, transpose                          |
| Cloud Import      | `/api/cloud-import/*`      | OneDrive and Google Drive file import                  |
| Settings          | `/api/settings/*`          | Organization settings, theme, SMTP                     |
| Backup            | `/api/backup/*`            | Database backup and restore                            |
| Health            | `/api/health/*`            | System health monitoring (basic and detailed)          |
| Analytics         | `/api/analytics/*`         | Usage analytics and statistics                         |
| Microsoft         | `/api/microsoft-auth/*`    | Azure Entra SSO                                        |
| Multi-Association | `/api/multi-association/*` | Multi-tenant management (super admin)                  |

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

## Tickets API

The ticketing system supports sales, reservations, transfers, and scanning.

### Get Available Tickets for Concert

```http
GET /api/concerts/:id/tickets
Authorization: Bearer <token> (optional)
```

Response:

```typescript
{
  concert: {
    id: string;
    name: string;
    date: string;
    endDate: string | null;
    location: string | null;
    description: string | null;
    concertType: string | null;
  };
  ticketTypes: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    available: number;
    description: string | null;
    maxPerOrder: number;
    onSale: boolean;
    saleStart: string | null;
    saleEnd: string | null;
    serviceFee: number;
    showServiceFeeSeparate: boolean;
  }>;
  paymentMethods: string[];
  captcha: {
    enabled: boolean;
    siteKey: string | null;
  };
}
```

### Create Ticket Order

```http
POST /api/concerts/:id/tickets/order
Content-Type: application/json

{
  "items": [
    {
      "ticketTypeId": "uuid",
      "quantity": 2
    }
  ],
  "buyerName": "Jan de Vries",
  "buyerEmail": "jan@example.com",
  "buyerPhone": "+31612345678",
  "notes": "Graag naast elkaar",
  "captchaToken": "recaptcha-token",
  "language": "nl" // nl, en, de
}
```

Response:

```typescript
{
  orderId: string;
  subtotal: number;
  serviceFee: number;
  total: number;
  showServiceFeeSeparate: boolean;
  expiresAt: string;
  items: Array<{
    ticketTypeId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    serviceFee: number;
    subtotal: number;
    serviceFeeTotal: number;
  }>;
}
```

### Pay for Order

```http
POST /api/tickets/orders/:id/pay
Authorization: Bearer <token> (optional)
Content-Type: application/json

{
  "method": "ideal", // ideal, creditcard, bancontact, paypal, applepay, googlepay
  "returnUrl": "https://example.com/confirmation"
}
```

Response:

```typescript
{
  paymentId: string;
  checkoutUrl: string;
}
```

### Get Order Details

```http
GET /api/tickets/orders/:id
Authorization: Bearer <token> (optional)
```

### Get My Tickets

```http
GET /api/tickets/my
Authorization: Bearer <token>
```

### Validate Ticket (Scanning)

```http
POST /api/tickets/:code/validate
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "concertId": "uuid"
}
```

Response:

```typescript
{
  valid: boolean;
  status: 'valid' | 'used' | 'cancelled' | 'expired';
  ticket: {
    id: string;
    buyerName: string;
    ticketType: string;
    concert: {
      id: string;
      name: string;
      date: string;
    }
  }
  message: string;
}
```

### Transfer Ticket

```http
POST /api/tickets/:id/transfer
Authorization: Bearer <token>
Content-Type: application/json

{
  "recipientEmail": "recipient@example.com",
  "recipientName": "Piet Jansen"
}
```

### Accept Transfer

```http
POST /api/tickets/transfers/:transferCode/accept
Authorization: Bearer <token>
```

### Create Ticket Type (Admin)

```http
POST /api/concerts/:id/ticket-types
Authorization: Bearer <token>
Roles: admin, music_committee
Content-Type: application/json

{
  "name": "Regulier",
  "price": 15.00,
  "quantity": 100,
  "description": "Standaard ticket",
  "saleStart": "2024-01-01T00:00:00Z",
  "saleEnd": "2024-06-15T20:00:00Z",
  "maxPerOrder": 10,
  "serviceFee": 1.50,
  "showServiceFeeSeparate": true
}
```

### Get Ticket Sales Dashboard

```http
GET /api/tickets/dashboard/:concertId
Authorization: Bearer <token>
Roles: admin, music_committee
```

Response includes: total sold, revenue, sales over time, recent orders, guest list count.

---

## Seasons API

Season planning and template management.

### List Seasons

```http
GET /api/seasons?status=active
Authorization: Bearer <token>
```

Response:

```typescript
Array<{
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  templateId: string | null;
  templateName: string | null;
  status: 'draft' | 'active' | 'completed';
  budgetTotal: number | null;
  budgetAllocated: number | null;
  notes: string | null;
  eventCount: number;
  concertCount: number;
  rehearsalCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;
```

### Create Season

```http
POST /api/seasons
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "name": "Seizoen 2024-2025",
  "startDate": "2024-09-01",
  "endDate": "2025-07-01",
  "templateId": "uuid",
  "budgetTotal": 5000,
  "notes": "Focus op jubileumjaar"
}
```

### Get Season with Events

```http
GET /api/seasons/:id
Authorization: Bearer <token>
```

### Update Season

```http
PUT /api/seasons/:id
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "name": "Updated Name",
  "status": "active",
  "budgetTotal": 6000
}
```

### Add Event to Season

```http
POST /api/seasons/:id/events
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "eventType": "concert", // concert, rehearsal, other
  "eventId": "uuid",
  "plannedDate": "2024-12-15",
  "budgetAmount": 500,
  "notes": "Kerstconcert"
}
```

### Generate Season Events

Automatically generate rehearsals and concerts from template settings.

```http
POST /api/seasons/:id/generate
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "rehearsalDay": 2, // 0=Sunday, 2=Tuesday
  "rehearsalTime": "19:30",
  "rehearsalEndTime": "21:30",
  "rehearsalLocation": "Dorpshuis",
  "orchestraId": "uuid",
  "concerts": [
    {
      "name": "Voorjaarsconcert",
      "date": "2024-04-20",
      "location": "Theater",
      "type": "concert",
      "budgetAmount": 1000
    }
  ],
  "excludeDates": ["2024-12-25", "2024-12-31"],
  "generateRehearsals": true,
  "generateConcerts": true
}
```

Response:

```typescript
{
  message: string;
  rehearsalCount: number;
  concertCount: number;
  rehearsalDates: string[];
  concertNames: string[];
}
```

### Season Templates

```http
GET    /api/seasons/templates
POST   /api/seasons/templates
PUT    /api/seasons/templates/:id
DELETE /api/seasons/templates/:id
```

---

## Stage Layouts API

Visual stage designer for seating arrangements.

### List Stage Layouts

```http
GET /api/stage-layouts?includeTemplates=true
Authorization: Bearer <token>
```

Response:

```typescript
Array<{
  id: string;
  name: string;
  description: string | null;
  venueName: string | null;
  stageWidth: number;
  stageDepth: number;
  isTemplate: boolean;
  isDefault: boolean;
  thumbnailUrl: string | null;
  usageCount: number;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
}>;
```

### Get Stage Layout

```http
GET /api/stage-layouts/:id
Authorization: Bearer <token>
```

Response includes `layoutData`:

```typescript
{
  positions: Array<{
    id: string;
    x: number;
    y: number;
    type: 'chair' | 'stand' | 'conductor' | 'piano' | 'percussion' | 'other';
    rotation: number;
    label: string | null;
    section: string | null;
    instrumentId: string | null;
  }>;
  shapes: Array<{
    id: string;
    type: 'rect' | 'circle' | 'line' | 'text';
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    label?: string;
    fill?: string;
    stroke?: string;
    fontSize?: number;
  }>;
  sections: Array<{
    id: string;
    name: string;
    color: string;
    instrumentId?: string;
  }>;
}
```

### Create Stage Layout

```http
POST /api/stage-layouts
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "name": "Grote Zaal",
  "description": "Layout voor Theater aan de Markt",
  "venueName": "Theater aan de Markt",
  "stageWidth": 1200,
  "stageDepth": 800,
  "isTemplate": false,
  "isDefault": true,
  "layoutData": {
    "positions": [...],
    "shapes": [...],
    "sections": [...]
  }
}
```

### Duplicate Layout

```http
POST /api/stage-layouts/:id/duplicate
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "name": "Grote Zaal (kopie)"
}
```

### Save Concert Stage Assignment

```http
PUT /api/stage-layouts/concerts/:id/stage
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "layoutId": "uuid",
  "assignments": {
    "position-id-1": {
      "userId": "uuid",
      "instrumentId": "uuid",
      "name": "Jan de Vries"
    }
  }
}
```

### Get Printable Seat Cards

```http
GET /api/stage-layouts/concerts/:id/stage/print
Authorization: Bearer <token>
```

---

## External Musicians API

Manage guest musicians, alumni, and substitutes.

### List External Musicians

```http
GET /api/external-musicians?type=guest&instrumentId=uuid&isActive=true&search=jan
Authorization: Bearer <token>
```

Response:

```typescript
Array<{
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  musicianType: 'alumni' | 'guest' | 'substitute' | 'friend';
  notes: string | null;
  isActive: boolean;
  rating: number | null; // 1-5
  lastPlayedDate: string | null;
  totalPerformances: number;
  instrumentNames: string; // comma-separated
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}>;
```

### Search by Instrument

```http
GET /api/external-musicians/search?instrument=uuid&skillLevel=professional&activeOnly=true
Authorization: Bearer <token>
```

### Get External Musician

```http
GET /api/external-musicians/:id
Authorization: Bearer <token>
```

Response includes `instruments` and `recentAssignments`.

### Create External Musician

```http
POST /api/external-musicians
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "firstName": "Marie",
  "lastName": "Jansen",
  "email": "marie@example.com",
  "phone": "+31612345678",
  "musicianType": "substitute",
  "notes": "Beschikbaar op donderdag",
  "rating": 4,
  "instruments": [
    {
      "instrumentId": "uuid",
      "skillLevel": "professional",
      "isPrimary": true
    }
  ]
}
```

### Update External Musician

```http
PUT /api/external-musicians/:id
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Add Instrument to Musician

```http
POST /api/external-musicians/:id/instruments
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "instrumentId": "uuid",
  "skillLevel": "advanced",
  "isPrimary": false
}
```

### Deactivate External Musician

```http
DELETE /api/external-musicians/:id
Authorization: Bearer <token>
Roles: admin, music_committee
```

(Soft delete - sets `isActive` to false)

---

## Replacement Requests API

Manage substitute musician requests for events.

### List Replacement Requests

```http
GET /api/replacement-requests?status=open&eventType=concert&instrumentId=uuid&urgency=high
Authorization: Bearer <token>
```

Response:

```typescript
Array<{
  id: string;
  eventType: 'concert' | 'rehearsal';
  eventId: string;
  eventDate: string;
  eventName: string;
  eventLocation: string | null;
  instrumentId: string;
  instrumentName: string;
  instrumentTuning: string | null;
  positionsNeeded: number;
  positionsFilled: number;
  urgency: 'low' | 'normal' | 'high' | 'critical';
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled';
  notes: string | null;
  deadline: string | null;
  assignmentCount: number;
  confirmedCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}>;
```

### Get Suggestions for Event

```http
GET /api/replacement-requests/suggestions/:eventId
Authorization: Bearer <token>
```

Returns suggested musicians for each open request based on instrument match.

### Create Replacement Request

```http
POST /api/replacement-requests
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "eventType": "concert",
  "eventId": "uuid",
  "eventDate": "2024-12-15",
  "instrumentId": "uuid",
  "positionsNeeded": 2,
  "urgency": "high",
  "notes": "1e en 2e hoorn nodig",
  "deadline": "2024-12-10"
}
```

### Invite External Musician

```http
POST /api/replacement-requests/:id/invite
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "externalMusicianId": "uuid",
  "notes": "Zou je beschikbaar zijn?",
  "feeAmount": 75.00
}
```

### Update Assignment Status

```http
PUT /api/replacement-requests/:id/assignments/:assignmentId
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
Content-Type: application/json

{
  "status": "confirmed", // pending, confirmed, declined, completed, no_show
  "notes": "Bevestigd via telefoon",
  "feeAmount": 80.00
}
```

---

## Attendance API

Attendance tracking endpoints are part of Rehearsals, Concerts, and Analytics routes.

### Rehearsals Attendance Summary

```http
GET /api/rehearsals/attendance/summary?from=2024-01-01&to=2024-06-30&orchestraId=uuid
Authorization: Bearer <token>
```

### Concert Attendance

```http
POST /api/concerts/:id/attendance
Authorization: Bearer <token>
Roles: admin, music_committee
Content-Type: application/json

{
  "userId": "uuid",
  "status": "present", // present, absent, excused
  "notes": "Kwam 10 min later"
}
```

### Bulk Add Concert Attendance

```http
POST /api/concerts/:id/attendance/bulk
Authorization: Bearer <token>
Roles: admin, music_committee
Content-Type: application/json

{
  "userIds": ["uuid1", "uuid2", "uuid3"]
}
```

### Concert Attendance Prediction

```http
GET /api/concerts/:id/attendance-prediction
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: Attendance Overview

```http
GET /api/analytics/attendance/overview?orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: Attendance Trends

```http
GET /api/analytics/attendance/trends?months=12&orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: Attendance by Section

```http
GET /api/analytics/attendance/by-section?orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: Attendance by Member

```http
GET /api/analytics/attendance/by-member?limit=50&sortBy=rate_desc&orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: At-Risk Members

```http
GET /api/analytics/attendance/at-risk?orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: Attendance Predictions

```http
GET /api/analytics/attendance/predictions?limit=5&orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

### Analytics: Attendance Leaderboard

```http
GET /api/analytics/attendance/leaderboard?limit=10&orchestraId=uuid
Authorization: Bearer <token>
Roles: admin, music_committee, conductor
```

---

## Holidays API

Dutch school holiday management.

### List Holidays

```http
GET /api/holidays?year=2024&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

Response:

```typescript
{
  holidays: Array<{
    id: string;
    name: string;
    nameEnglish?: string;
    region: string | null;
    country: string;
    startDate: string;
    endDate: string;
    year: number;
    holidayType: string | null;
    isCustom: boolean;
    source: string | null;
  }>;
  settings: {
    region: "noord" | "midden" | "zuid";
    showHolidaysInCalendar: boolean;
    autoBlockRehearsals: boolean;
  };
  meta: {
    availableYears: number[];
    regions: Array<{ id: string; name: string }>;
  };
}
```

### Check if Date is Holiday

```http
GET /api/holidays/check?date=2024-12-25
Authorization: Bearer <token>
```

Response:

```typescript
{
  isHoliday: boolean;
  holiday: {
    name: string;
    startDate: string;
    endDate: string;
    holidayType: string;
    isCustom: boolean;
  } | null;
}
```

### Get Upcoming Holidays

```http
GET /api/holidays/upcoming?limit=5
Authorization: Bearer <token>
```

### Create Custom Holiday

```http
POST /api/holidays
Authorization: Bearer <token>
Roles: admin, music_committee
Content-Type: application/json

{
  "name": "Jubileumweekend",
  "startDate": "2024-09-14",
  "endDate": "2024-09-15",
  "region": "midden",
  "holidayType": "custom"
}
```

### Holiday Settings

```http
GET /api/holidays/settings
Authorization: Bearer <token>
```

```http
PUT /api/holidays/settings
Authorization: Bearer <token>
Roles: admin
Content-Type: application/json

{
  "region": "zuid",
  "showHolidaysInCalendar": true,
  "autoBlockRehearsals": false
}
```

### Sync Holidays

```http
GET /api/holidays/sync?year=2024
Authorization: Bearer <token>
Roles: admin
```

---

## Notifications API

Push notifications and preferences.

### Get Notifications

```http
GET /api/notifications?unreadOnly=true&type=rehearsal_change&limit=50&offset=0
Authorization: Bearer <token>
```

Response:

```typescript
Array<{
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}>;
```

### Get Unread Count

```http
GET /api/notifications/unread-count
Authorization: Bearer <token>
```

### Mark as Read

```http
POST /api/notifications/:id/read
Authorization: Bearer <token>
```

### Mark All as Read

```http
POST /api/notifications/read-all
Authorization: Bearer <token>
```

### Get Notification Preferences

```http
GET /api/notifications/preferences
Authorization: Bearer <token>
```

Response:

```typescript
{
  newMusic: boolean;
  rehearsalChanges: boolean;
  seatingUpdates: boolean;
  chatMessages: boolean;
  practiceReminders: boolean;
  concertReminders: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
}
```

### Update Notification Preferences

```http
PATCH /api/notifications/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "rehearsalChanges": true,
  "pushEnabled": true
}
```

### Register Push Subscription

```http
POST /api/notifications/push-subscription
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "base64-key",
    "auth": "base64-auth"
  }
}
```

### Unregister Push Subscription

```http
DELETE /api/notifications/push-subscription
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/..."
}
```

### Get VAPID Public Key

```http
GET /api/notifications/vapid-public-key
```

Response:

```typescript
{
  publicKey: string;
}
```

---

## Calendar API

iCal feeds and Google Calendar integration.

### Export Single Event (ICS)

```http
GET /api/calendar/export/:type/:id
Authorization: Bearer <token>
```

- `type`: `rehearsal` or `concert`

Returns `.ics` file download.

### Personal Calendar Feed (Public URL)

```http
GET /api/calendar/feed/:userId?token=xxx
```

Returns iCal feed (ICS format) with upcoming rehearsals and concerts.

### Get Calendar Settings

```http
GET /api/calendar/settings
Authorization: Bearer <token>
```

Response:

```typescript
{
  feedUrl: string;
  includeRehearsals: boolean;
  includeConcerts: boolean;
  googleConnected: boolean;
  googleCalendarId: string | null;
  lastSync: string | null;
}
```

### Update Calendar Settings

```http
PUT /api/calendar/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "includeRehearsals": true,
  "includeConcerts": true,
  "googleCalendarId": "primary"
}
```

### Regenerate Feed Token

```http
POST /api/calendar/feed/regenerate
Authorization: Bearer <token>
```

### Google Calendar Integration

```http
POST /api/calendar/google/auth
Authorization: Bearer <token>
```

Response: `{ authUrl: string }` - redirect user to this URL.

```http
POST /api/calendar/google/disconnect
Authorization: Bearer <token>
```

```http
POST /api/calendar/google/sync
Authorization: Bearer <token>
```

### Public Calendar (No Auth)

```http
GET /api/calendar/public/:associationSlug?months=3&format=json
```

- `format`: `json` or `ics`

Response (JSON):

```typescript
{
  association: {
    name: string;
    slug: string;
  }
  events: Array<{
    id: string;
    type: 'concert' | 'rehearsal';
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    venue: string | null;
    location: string | null;
    address: string | null;
    city: string | null;
    ticketPrice: number | null;
    description: string | null;
  }>;
  generatedAt: string;
}
```

### Info Screen Data

```http
GET /api/calendar/info-screen/:associationSlug
```

Returns optimized data for display boards/kiosks.

---

## Swagger Documentation

In development mode, Swagger UI is available at:

```
http://localhost:3001/api/docs
```
