# Features

## Music Management

- **Upload** — Drag and drop PDFs to the dropzone; metadata is automatically parsed from the filename (`Title_arranger_instrument_key_groupnumber_clef.pdf`)
- **Bulk Upload** — Upload multiple music pieces at once via ZIP file
- **Cloud Import** — Import sheet music directly from OneDrive/SharePoint or Google Drive without downloading first
- **Music Pieces** — Sheet music per instrument with filters on title, instrument, and orchestra
- **Music Titles** — Metadata per title: composer, arranger, genre, duration, difficulty level, YouTube link
- **MusicaInfo.net Integration** — Search and import metadata (duration, difficulty, publisher) automatically
- **Instrument Aliases** — Flexible instrument matching (e.g., "Altsax" → "Alto Saxophone Eb")
- **Sharing** — Share music pieces and titles between organizations
- **MP3 Uploads** — Add audio recordings to music pieces
- **PDF Tools** — Merge, extract pages, and transpose PDFs

## Rehearsals & Attendance

- **Default Rehearsal Days** — Set recurring days/times per orchestra
- **Rehearsal Instances** — Automatically generated or manually created (regular/extra/cancelled)
- **Recurring Rehearsals** — Bulk create rehearsals for a date range with customizable frequency
- **Series Management** — Delete entire rehearsal series at once
- **Spond Integration** — Sync attendance data automatically from Spond
- **Attendance Overview** — Per member: times present, absent, percentage (filterable by date and orchestra)

## Concert Programs & Music Lists

- **Setlists** — Create concert programs per orchestra with date, location, and notes
- **Time Calculation** — Automatic calculation of total playing time
- **Music Committee Notes** — Internal notes on titles (visible only to committee members)

## Member Management

- **Users** — Create, edit, delete with pagination and search functionality
- **Instruments** — Assign to members with key and clef
- **Orchestras** — Link members to multiple orchestras
- **Roles** — Flexible role system (member, conductor, music_committee, admin)

## Loan Management

- **Loans** — Register loans of music material to external organizations
- **Status Tracking** — Active, overdue, returned with automatic status updates
- **Loan History** — View complete loan history per music title
- **Availability** — Overview of which titles are available for loan

## Issues & Quality Management

- **Reports** — Members can report errors in sheet music (wrong notes, missing pages)
- **Workflow** — Status tracking: open → in review → resolved/rejected

## Concerts & Ticketing

- **Concert Management** — Create and manage concerts with date, location, and program
- **Attendance Prediction** — AI-based prediction of expected attendance based on historical data
- **Ticket Sales** — Sell tickets online with customizable pricing and seat categories
- **Public Ticket Shop** — Customer-facing ticket purchase page
- **Ticket Scanner** — QR code scanning for entrance validation
- **Ticket Transfers** — Allow customers to transfer tickets to others
- **Guest List** — Manage complimentary tickets and VIP guests
- **Payment Settings** — Configure payment providers and pricing
- **Ticket Dashboard** — Sales overview and statistics

## Seating & Orchestra Layout

- **Seating Charts** — Visual seating arrangement editor
- **Neighbor Preferences** — Members can indicate seating preferences
- **Voice Parts** — Organize musicians by section/voice part
- **Occupancy Overview** — See which seats are filled per rehearsal/concert

## Availability Management

- **Personal Availability** — Members can set their availability status (available/unavailable/maybe) for specific dates
- **Bulk Availability** — Set availability for multiple dates at once
- **Team Overview** — View team availability for any date with summary statistics
- **Notes** — Add notes to explain availability status

## Practice Tracker

- **Practice Goals** — Set personal practice goals for music pieces
- **Progress Tracking** — Track practice sessions and progress over time
- **Practice Statistics** — View practice statistics and trends
- **IMSLP Browser** — Search and link to free sheet music on IMSLP.org

## Security & Authentication

- **JWT Tokens** — Secure authentication with configurable validity period
- **TOTP MFA** — Optional two-factor authentication via authenticator app
- **Microsoft SSO** — Azure Entra ID (formerly Azure AD) integration
- **Password Reset** — Via email with secure tokens
- **Rate Limiting** — Protection against brute-force attacks
- **Helmet** — HTTP security headers

## Administration & Monitoring

- **Audit Logs** — Security event logging with user actions
- **Session Management** — View and revoke active user sessions
- **System Health Dashboard** — Real-time monitoring of database, disk space, and memory usage with auto-refresh (admin-only)
- **Data Export** — GDPR-compliant personal data export
- **Entra Sync** — Automatic user synchronization with Microsoft Entra ID
- **Changelog** — In-app version history with language support (NL/EN/DE)

## Other Features

- **Themes** — Customizable colors and branding per organization
- **Logo** — Upload organization logo
- **SMTP Configuration** — Email settings per organization
- **Backup & Restore** — Download/upload complete database with files as ZIP
- **Activity Log** — Track who views and downloads what
- **Statistics** — Dashboard with top-viewed and downloaded pieces
- **Onboarding Tour** — Guided tour for new users
- **Music Tools** — Built-in metronome and tuner
- **Favorites** — Mark music pieces as favorites for quick access
- **Recent Views** — Quick access to recently viewed items
- **WCAG 2.1 AA** — Accessible interface with keyboard navigation and contrast ratio
