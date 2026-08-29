# Third-Party Integrations

This document describes all third-party integrations available in Harmonie, including what they do, how to configure them, and the required environment variables.

## Overview

| Category      | Service            | Status   | Purpose                                         |
| ------------- | ------------------ | -------- | ----------------------------------------------- |
| Payment       | Mollie             | Optional | Payment processing (iDEAL, credit card, PayPal) |
| Payment       | Stripe             | Optional | Payment processing (international)              |
| Cloud Storage | OneDrive           | Optional | Import sheet music from Microsoft cloud         |
| Cloud Storage | Google Drive       | Optional | Import sheet music from Google cloud            |
| Calendar      | Spond              | Optional | Attendance sync for rehearsals                  |
| Calendar      | iCal               | Built-in | Export events to any calendar app               |
| Calendar      | Google Calendar    | Optional | Two-way calendar sync                           |
| SSO           | Microsoft Entra ID | Optional | Single sign-on and user sync                    |
| SSO           | Google             | Optional | Social login for guest checkout                 |
| SSO           | Facebook           | Optional | Social login for guest checkout                 |
| Messaging     | WhatsApp           | Optional | Member notifications                            |
| Messaging     | Telegram           | Optional | Member notifications                            |
| Messaging     | Twilio SMS         | Optional | SMS notifications via WhatsApp                  |
| Music         | Spotify            | Optional | Search and link streaming tracks                |
| Music         | Apple Music        | Optional | Search and link streaming tracks                |
| Music         | MusicaInfo         | Built-in | Sheet music metadata lookup                     |
| Monitoring    | Sentry             | Optional | Error tracking and performance                  |

Every outbound call to these services runs behind a timeout, a retry policy and
a circuit breaker. What happens when a service is slow, hiccups or goes down -
and which calls may be retried and which may not - is described in
[VEERKRACHT.md](VEERKRACHT.md).

---

## Payment Integrations

### Mollie

Mollie is a European payment service provider, ideal for Dutch and Belgian organizations. Supports iDEAL, credit cards, Bancontact, PayPal, and more.

**What it does:**

- Process ticket payments for concerts
- Support multiple payment methods popular in Europe
- Handle refunds programmatically
- Webhook notifications for payment status updates

**Configuration:**

1. Create a Mollie account at [mollie.com](https://www.mollie.com/)
2. Get your API keys from the Mollie Dashboard
3. Configure webhooks to point to your backend

**Environment Variables:**

```env
# Mollie API key (live or test)
MOLLIE_API_KEY=live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Notes:**

- Use test API keys (starting with `test_`) during development
- Webhook URL: `https://your-domain.com/api/payments/mollie/webhook`
- Supported payment methods: iDEAL, creditcard, bancontact, paypal

---

### Stripe

Stripe is a global payment platform with excellent international support. Recommended for international organizations.

**What it does:**

- Process ticket payments via Stripe Checkout
- Support cards, iDEAL, Bancontact, and more
- Handle refunds
- Secure webhook verification

**Configuration:**

1. Create a Stripe account at [stripe.com](https://stripe.com/)
2. Get your API keys from the Stripe Dashboard
3. Create a webhook endpoint and get the signing secret

**Environment Variables:**

```env
# Stripe secret key
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE

# Stripe webhook signing secret
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SIGNING_SECRET
```

**Notes:**

- Use test keys (starting with `sk_test_`) during development
- Webhook URL: `https://your-domain.com/api/payments/stripe/webhook`
- Configure these events: `checkout.session.completed`, `checkout.session.expired`

---

## Cloud Storage Integrations

### OneDrive / SharePoint

Import sheet music directly from Microsoft OneDrive or SharePoint.

**What it does:**

- Browse OneDrive/SharePoint files from within Harmonie
- Import PDF files as music pieces
- Parse filenames to auto-fill metadata (title, arranger, instrument)
- Support batch imports

**Configuration:**

1. Register an app in [Azure Portal](https://portal.azure.com/)
2. Configure redirect URI and API permissions
3. Add credentials to association settings in admin panel

**Database Configuration (per association):**

```sql
-- Set in admin panel > Settings > Integrations
microsoft_client_id = 'your-client-id'
microsoft_tenant_id = 'your-tenant-id'
microsoft_enabled = 1
```

**Required Azure AD Permissions:**

- `Files.Read` - Read user files
- `Files.Read.All` - Read all files (for SharePoint)
- `User.Read` - Basic profile

---

### Google Drive

Import sheet music from Google Drive.

**What it does:**

- Browse Google Drive files from within Harmonie
- Import PDF files as music pieces
- Support Google Picker API for file selection

**Configuration:**

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Google Drive API
3. Create OAuth credentials and an API key
4. Add credentials to association settings

**Database Configuration (per association):**

```sql
-- Set in admin panel > Settings > Integrations
google_drive_client_id = 'your-client-id.apps.googleusercontent.com'
google_drive_api_key = 'your-api-key'
google_drive_enabled = 1
```

---

## Calendar Integrations

### Spond

Sync rehearsal attendance with [Spond](https://spond.com/), a popular team management app for sports and music groups.

**What it does:**

- Import rehearsal events from Spond
- Sync attendance responses (accepted/declined)
- Two-way attendance updates
- Match Spond members with Harmonie users by email

**Configuration:**

Per-association configuration via admin panel. Credentials are stored encrypted in the database.

**Setup:**

1. Go to Admin > Settings > Integrations > Spond
2. Enter your Spond account email and password
3. Select the Spond group to sync
4. Configure sync direction (import/export/both)

**Security:**

- Passwords are encrypted using AES-256-GCM before storage
- Encryption key is derived from the JWT secret

---

### iCal Export

Built-in iCal feed generation for subscribing to Harmonie events in any calendar app.

**What it does:**

- Generate personal iCal feeds per user
- Include rehearsals and/or concerts based on preferences
- Export single events as .ics files
- Public iCal feed for embedding on websites

**Usage:**

1. Go to Profile > Calendar Settings
2. Copy the personal feed URL
3. Subscribe in your calendar app (Google Calendar, Apple Calendar, Outlook)

**Feed URL Format:**

```
https://your-domain.com/api/calendar/feed/{userId}?token={feedToken}
```

---

### Google Calendar Sync

Two-way sync with Google Calendar.

**What it does:**

- Push Harmonie events to Google Calendar
- Create calendar events for rehearsals and concerts
- Support multiple Google calendars

**Configuration:**

1. Create OAuth credentials in Google Cloud Console
2. Enable Google Calendar API
3. Configure per association in admin panel

**Database Configuration:**

```sql
-- Set in admin panel > Settings > Integrations
google_calendar_client_id = 'your-client-id'
google_calendar_client_secret = 'your-client-secret'
```

---

## SSO Integrations

### Microsoft Entra ID (Azure AD)

Full single sign-on and user provisioning from Microsoft 365.

**What it does:**

- Single sign-on for members
- Import users from Entra ID
- Sync profile photos from Microsoft 365
- Map job titles to instruments
- Map departments to orchestras

**Configuration:**

1. Register an application in Azure Portal
2. Configure API permissions
3. Set up client credentials for app-only access

**Environment Variables / Database:**

```sql
-- Set in admin panel > Settings > Microsoft SSO
microsoft_client_id = 'your-client-id'
microsoft_client_secret = 'your-client-secret'
microsoft_tenant_id = 'your-tenant-id'
microsoft_enabled = 1
```

**Required Azure AD Permissions:**

- `User.Read.All` (Application) - Read all user profiles
- `User.Read` (Delegated) - Sign-in and read profile

**Features:**

- Job title to instrument mapping (e.g., "1st Clarinet" -> Clarinet instrument)
- Department to orchestra mapping (comma-separated departments supported)
- Profile photo sync from Microsoft 365

---

### Google OAuth

Social login for guest ticket checkout.

**What it does:**

- Allow ticket buyers to authenticate via Google
- Pre-fill checkout with name and email from Google profile
- No full registration required for ticket purchases

**Environment Variables:**

```env
# Google OAuth credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Callback URL (defaults to FRONTEND_URL)
SOCIAL_AUTH_CALLBACK_URL=https://your-domain.com
```

**Setup:**

1. Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com/)
2. Configure authorized redirect URIs
3. Enable the Google+ API (for profile data)

---

### Facebook OAuth

Social login for guest ticket checkout.

**What it does:**

- Allow ticket buyers to authenticate via Facebook
- Pre-fill checkout with name and email from Facebook profile
- No full registration required for ticket purchases

**Environment Variables:**

```env
# Facebook OAuth credentials
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret

# Callback URL (defaults to FRONTEND_URL)
SOCIAL_AUTH_CALLBACK_URL=https://your-domain.com
```

**Setup:**

1. Create an app in [Facebook Developers](https://developers.facebook.com/)
2. Add Facebook Login product
3. Configure valid OAuth redirect URIs
4. Request `email` and `public_profile` permissions

---

## Messaging Integrations

### WhatsApp (Meta Business API)

Send notifications to members via WhatsApp using the official Meta Business API.

**What it does:**

- Send rehearsal reminders
- Send concert notifications
- Verify phone numbers via WhatsApp
- Delivery status tracking

**Environment Variables:**

```env
# Meta WhatsApp Business API
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_ACCESS_TOKEN=your-access-token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=random-string-for-verification
```

**Setup:**

1. Create a Meta Business account
2. Set up WhatsApp Business API
3. Create message templates (required for notifications outside 24h window)
4. Configure webhook for delivery receipts

**Required Templates:**

- `harmonie_notification` - General notifications
- `harmonie_verification` - Phone verification codes

---

### WhatsApp (Twilio)

Alternative WhatsApp integration via Twilio.

**What it does:**

- Same functionality as Meta API
- Easier setup via Twilio
- Pay-per-message pricing

**Environment Variables:**

```env
# Twilio WhatsApp
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

**Notes:**

- Use Twilio sandbox number for testing
- Production requires WhatsApp Business profile approval

---

### Telegram

Send notifications via Telegram bot.

**What it does:**

- Send rehearsal and concert notifications
- Account linking via bot commands
- Rich message formatting (HTML)
- Inline buttons for quick actions

**Environment Variables:**

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIjKlmnOPQrstUVwxYZ
```

**Setup:**

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get the bot token
3. Set up webhook: `https://your-domain.com/api/telegram/webhook`

**Bot Commands:**

- `/start` - Link Telegram account
- `/stop` - Unlink and stop notifications
- `/settings` - View notification preferences
- `/status` - Check account link status

---

## Music Integrations

### Spotify

Search and link Spotify tracks to music pieces.

**What it does:**

- Search Spotify for recordings of music pieces
- Store Spotify track links with pieces
- Display album art and preview URLs
- Link to open tracks in Spotify

**Environment Variables:**

```env
# Spotify API (Client Credentials flow)
SPOTIFY_CLIENT_ID=your-client-id
SPOTIFY_CLIENT_SECRET=your-client-secret
```

**Setup:**

1. Create an app in [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Copy Client ID and Client Secret
3. No redirect URI needed (uses Client Credentials flow)

**Notes:**

- Uses Netherlands (NL) market by default
- Token refresh handled automatically

---

### Apple Music

Search and link Apple Music tracks to music pieces.

**What it does:**

- Search Apple Music for recordings
- Store Apple Music links with pieces
- Display album art and preview URLs

**Environment Variables:**

```env
# Apple Music API (requires MusicKit private key)
APPLE_MUSIC_TEAM_ID=your-team-id
APPLE_MUSIC_KEY_ID=your-key-id
APPLE_MUSIC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

**Setup:**

1. Enroll in [Apple Developer Program](https://developer.apple.com/)
2. Create a MusicKit identifier
3. Generate a private key
4. Configure environment with key contents (use `\n` for newlines)

---

### MusicaInfo

Search the MusicaInfo.net database for sheet music metadata.

**What it does:**

- Search for wind band/orchestra sheet music
- Retrieve metadata: composer, arranger, duration, difficulty, instrumentation
- Auto-fill music piece metadata

**Configuration:**

Built-in, no configuration required. Uses web scraping with browser-like headers.

**Usage:**

1. Open a music piece
2. Click "Search MusicaInfo"
3. Select a result to import metadata

**Notes:**

- Requires internet connection
- Respects robots.txt and rate limiting
- Parse duration into seconds for programmatic use

---

## Monitoring

### Sentry

Error tracking and performance monitoring.

**What it does:**

- Capture and report errors automatically
- Track performance with traces
- Filter sensitive data (passwords, tokens)
- Set user context for error attribution
- Handle unhandled rejections and exceptions

**Environment Variables:**

```env
# Sentry DSN
SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
```

**Setup:**

1. Create a project in [Sentry](https://sentry.io/)
2. Get your DSN from project settings
3. Set environment variable

**Features:**

- Automatic Express.js integration
- Breadcrumb filtering for sensitive URLs
- User context tracking (after authentication)
- Environment tagging (production/development)
- Performance sampling (10% in production, 100% in development)

---

## Per-Association vs. Global Configuration

Some integrations can be configured globally (environment variables) or per-association (database):

| Integration     | Global (ENV) | Per-Association (DB) |
| --------------- | ------------ | -------------------- |
| Mollie          | Yes          | No                   |
| Stripe          | Yes          | No                   |
| OneDrive        | No           | Yes                  |
| Google Drive    | No           | Yes                  |
| Spond           | No           | Yes                  |
| Microsoft Entra | No           | Yes                  |
| Google OAuth    | Yes          | No                   |
| Facebook OAuth  | Yes          | No                   |
| WhatsApp        | Both         | Yes                  |
| Telegram        | Both         | Yes                  |
| Spotify         | Yes          | No                   |
| Apple Music     | Yes          | No                   |
| Sentry          | Yes          | No                   |

Per-association configuration allows multi-tenant setups where each association has their own integration credentials.

---

## Security Considerations

1. **API Keys**: Never commit API keys to version control. Use environment variables or secure secret management.

2. **OAuth Secrets**: Store client secrets securely. Use encrypted database fields for per-association secrets.

3. **Webhook Verification**: Always verify webhook signatures (Stripe, WhatsApp) to prevent spoofing.

4. **Token Storage**: OAuth refresh tokens are stored encrypted in the database.

5. **Credential Encryption**: Sensitive credentials (like Spond passwords) are encrypted using AES-256-GCM.

6. **Rate Limiting**: External API calls are rate-limited to prevent abuse and respect provider limits.

---

## Troubleshooting

### Common Issues

**Payment not processing:**

- Check API key is correct (live vs. test)
- Verify webhook URL is accessible from the internet
- Check Mollie/Stripe dashboard for error details

**OneDrive/Google Drive not working:**

- Verify OAuth credentials are correct
- Check redirect URIs match exactly
- Ensure required API permissions are granted

**WhatsApp messages not sending:**

- Verify phone number ID and access token
- Check message templates are approved
- For Twilio: verify WhatsApp sender is approved

**Entra sync failing:**

- Check `User.Read.All` permission is granted (Application, not Delegated)
- Verify tenant ID is correct
- Check admin consent was given for the application

### Logs

Integration-related logs are tagged with the service name:

- `Mollie payment creation failed`
- `Spotify authentication failed`
- `Spond login failed`
- `Telegram message sent successfully`

Check logs with:

```bash
# Development
npm run dev 2>&1 | grep -i "mollie\|stripe\|spond\|telegram"

# Production (PM2)
pm2 logs harmonie --lines 1000 | grep -i "integration_name"
```
