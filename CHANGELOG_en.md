# Changelog

All notable changes to this application are documented here.

## [1.15.0] - 2026-08-23

A large maintenance round. Test coverage went from 12.9% to 83.4% on the server side and from 6.9% to 81.6% on the screen side, and well over a hundred real bugs surfaced along the way. Almost none of them turned a test red: they were features that silently did nothing, data leaking across the association boundary, and messages saying the opposite of what had happened.

### Added

- **Sharing music between associations** — Link codes, a shared catalogue, sharing per title, requests for files and calls for help. With a screen of its own.
- **Every association its own sign-in link** — Signing in through Microsoft was stuck on whichever association had been created first; each one now has its own way in.
- **Partnerships now do something** — Requesting one works, and an accepted partnership has consequences instead of being a mere listing.
- **The visibility settings now do something** — What a member switches off under privacy is genuinely no longer visible.
- **Linking a rehearsal to a project** — The button existed but had no counterpart on the server; it works now.
- **Offline scanning at the door** — The two missing routes are in place, so a scanner without a connection actually works.
- **Seven routes the screen called that did not exist.**
- **A shared page layout** — Every page now uses the same header, with styling for forms and tabs that simply was not there.

### Changed

- **One api layer instead of two** — `src/api.ts` shadowed the `src/api/` directory beside it, leaving that directory unreachable for years. That 4,149-line file is gone; everything now runs through one path, including expired-session handling.
- **All CSV exports run through one helper**, with protection against formulas and against shifting columns.
- **Subscription limits are real limits** — `max_members` and `max_orchestras` were recorded but never enforced.

### Fixed

#### Data that was not yours

- An association admin could download a backup of the entire installation, and the manifest could write outside the upload directory.
- Every admin saw the audit log of _all_ associations; another association's section chat stayed on screen after switching; and a cached response could reach a different member.
- Any member could request a preview of any pdf, including sheet music they had no access to.
- A new member could end up in another association's orchestra, and a task could be assigned to someone from another association.
- Categories, task lists, comments, notifications and a poll's target orchestra could all five be chosen across the association boundary.
- Signing out did not clear offline storage. On a shared tablet the next user saw the previous association's data, including the unsent sync queue. The "clear everything" button left that same storage in place, and still reported it cleared.

#### Things that had never worked

- Sending an e-mail campaign always failed. An empty recipient list also meant _everyone_, while the preview screen showed zero recipients.
- Signing a member up as a passenger for transport always errored.
- Creating tasks from a workflow worked in no workflow at all, for two independent reasons at once.
- The GDPR export and the article 17 and 20 deletion were unreachable.
- The public calendar, the info screen, transferring a ticket, discounts at the box office and the per-orchestra attendance report were all five broken.
- Cleanup and the weekly summary had stopped running.
- The concert stage layout could not be operated at all: seating a member was impossible with mouse or keyboard.
- Switching off every channel in the notification preferences did nothing.

#### Wrong amounts and figures

- A SEPA direct debit was created as a transfer, paying out instead of collecting.
- The invoice total came out nine percent higher than what had been paid.
- Reports ignored the selected fiscal year: choosing 2025 showed the 2026 balance sheet, while the exported file did contain 2025.
- Ticket sales times shifted with the time zone.
- Twelve accounting functions were broken, and eight queries referred to columns that do not exist.

#### Messages that did not match

- A posts overview left out every post published today for ordinary members, until midnight. A direct link did show it, so it went unnoticed.
- On seven pages a failed request looked exactly like an empty list — including the invitation to create the first item.
- A Spond sync during an outage wiped every link and reported success. After that the app still said "you are signed up" while nothing had happened in Spond.
- The onboarding screen offered a repair button for e-mail forwarding that could not possibly succeed.
- On an error the ticket scanner kept the previous visitor's green tick on screen.
- A Microsoft account without a display name rolled back the entire member sync, and broke search on the screen side.

#### Accessibility

- 274 form labels were not linked to their field. To a screen reader those were nameless fields; clicking the label did nothing. Three remain, each for a stated reason.
- A rejected field is now rejected for a screen reader too, and the file drop zone can be operated by keyboard.
- Hard-coded white surfaces that were unreadable in the dark theme are gone.
- The contact picker could not be reached by keyboard.
- Over 250 missing translation keys filled in, with a guard test that finds the next one.

#### Also

- Download names with an accent or umlaut now survive the header; previously that caused an error.
- A breadcrumb pointed at a page that does not exist, and so landed on "not found".
- An error on one page stayed visible on every page opened afterwards.
- Every keystroke in a search box triggered its own request, on three pages; and the guest list's search box vanished from under the cursor.
- A streaming link was saved without validation and rendered as a clickable link.
- The tuner left the microphone running after an error message.
- A pdf without pages showed "0 / 0" and a blank screen; the annotation layer sat wrong when zoomed; and leaving an instrument left a gap in the part numbering.
- The rate limiter flattened the whole screen during development.
- Every dialog sat askew because of a page animation.

### Technical

- **Test coverage**: backend 12.9% → 83.4%, frontend 6.9% → 81.6% (statements). 6,251 and 6,189 tests, across 180 and 276 files respectively. The CI thresholds sit just below, so a regression stands out.
- **The earlier figures were wrong**: without `include` in the measurement settings, only files a test happened to load were counted. Files no test touched dropped out of the denominator instead of counting as zero.
- **The large pages have been split up**, each with a characterisation test as a safety net first.
- **Docker images** are published on every merge to `main`, and a staging deployment is ready that runs automatically after CI passes and performs a smoke test.
- **Two guard tests** catch a whole class of bugs rather than one case: a literal path underneath a parameter path (that had happened five times), and default values in update schemas.
- The backend suite runs in parallel: from 19m35s to 7m52s.
- Code scanning and secret scanning findings worked through; SQL injection via a language parameter and a bot token in the log lines resolved.

## [1.14.0] - 2026-08-18

### Added

- **Sixteen more modules** — Polls, Tasks, Posts, Mailings, External contacts, Issues, Home practice, Substitutes, Inventory, Projects and trips, Room booking, Wiki, Performance history, Workflow automation, Season planning and Attendance analytics. Together with the first three that is nineteen switches, hiding 32 menu items.
- **Cross-cutting views follow suit** — Dashboard widgets, the info screen, the weekly e-mail and workflow execution no longer show anything from a disabled module. Widget preferences are kept and return exactly as they were.

### Fixed

- The practice summary never appeared in the weekly e-mail: the query returned `total_minutes` while the text read `totalMinutes`.

### Added

#### Modules

- **Switch parts on and off** — An administrator switches off what the association does not use under Admin → Modules. It disappears from the menu and can no longer be opened.
- **Switching off hides, it does not delete** — The data of a disabled module stays untouched and comes back exactly as it was when switched on again.
- **First three modules** — Accounting, Ticket sales (including payment settings and the scanner) and Stage and seating. Ten menu items in total.
- **Part of the tour** — New administrators see the modules right after the welcome step.

### Changed

- **The three modules are off by default**, including for existing associations. If you do use them, two clicks under Admin → Modules turn them back on; your data is still there.

### Fixed

- Ten modules wrote to tables or columns that had never been created, so those features failed the moment anyone used them: accounting, campaign attachments, equipment damage reports, wiki attachments, the drawing path in annotations, season planning, IMSLP import and concert stage assignments.
- `equipment_loans` was defined twice in the schema with different columns. Because the first one won, the equipment module silently got the wrong table.

## [1.13.0] - 2026-05-06

### Added

#### Events & Performance Planner

- **Complete event management** — Manage events with detailed location info, schedules and programs
- **Transport coordination** — Register cars/buses with drivers, passengers and meeting points
- **Packing lists** — Create packing lists with templates, track progress per item, assign responsible persons
- **Weather integration** — Weather forecasts for outdoor performances with alerts
- **Attendance management** — Members can indicate attendance with transport needs and dietary requirements
- **Location management** — Manage favorite locations with facilities (power, changing rooms, parking)

#### Multiple Associations

- **Multi-tenant support** — One installation for multiple orchestras/associations
- **Super admin panel** — Manage all associations, subscriptions and limits
- **Membership** — Users can be members of multiple associations
- **Partnerships** — Associations can share music, events and members
- **Invitation system** — Invite new members with automatic role assignment
- **Activity log** — Audit trail of all important actions per association

### Technical

- 20+ new database tables for events, locations, transport, packing lists and multi-tenant
- Full API with ~50 new endpoints
- React Query hooks for all new functionality
- Translations in NL, EN and DE

## [1.12.0] - 2026-05-02

### Added

#### WP3: Accessibility (WCAG 2.1 AA)

- **Keyboard navigation** — Full application keyboard accessible with visible focus indicators
- **Skip links** — Direct navigation to main content for screen reader users
- **ARIA labels** — Correct ARIA attributes for all interactive elements, modals and forms
- **Focus management** — Focus automatically moves when modals open/close
- **Accessibility tests** — Comprehensive jest-axe tests for all components

#### WP4: Docker & Self-hosting

- **Docker Compose** — Complete production setup with Nginx reverse proxy, Let's Encrypt SSL, and health checks
- **Multi-architecture** — Docker images for AMD64 and ARM64 (Apple Silicon, Raspberry Pi)
- **Backup volumes** — Automatic volume mounts for database and uploads

#### WP5: Music Metadata & Interoperability

- **MusicXML import** — Parse MusicXML files for automatic metadata extraction
- **JSKOS vocabularies** — Standardized genre classification via JSKOS/SKOS
- **Dublin Core export** — Metadata export conforming to Dublin Core standard
- **IIIF manifest** — Sheet music available via IIIF protocol

#### WP6: GDPR & Privacy-by-Design

- **Data export** — Users can download all their data (JSON)
- **Deletion requests** — Self-service account deletion with 30-day retention period
- **Retention settings** — Configurable retention periods per data type
- **Automatic cleanup** — Daily scheduler for expired sessions, logs and deleted accounts
- **Audit logging** — Comprehensive audit trail for all CRUD operations
- **Consent tracking** — Recording of user consents

#### WP7: Community & Governance

- **Code of Conduct** — Contributor Covenant code of conduct
- **Contributing Guide** — Guidelines for contributing to the project
- **Security Policy** — Responsible disclosure policy

#### WP8: CI/CD & Test Coverage

- **GitHub Actions** — Automated CI/CD pipeline with parallel testing
- **CodeQL** — SAST security scanning for vulnerabilities
- **Dependabot** — Automatic dependency updates
- **Codecov** — Test coverage reporting (>80% target)
- **Multi-tenant tests** — Data isolation tests between organizations

#### WP10: PWA & Mobile UX

- **App shortcuts** — Direct access to My Music, Rehearsals, Tickets from homescreen
- **Share Target** — Receive PDF files via native share dialog
- **Push notifications** — Native push notifications with click handling and navigation
- **Offline sync** — Background sync for actions performed without internet
- **Enhanced caching** — Smart cache strategies per content type

### Improved

- **156 missing English translations** — Full parity between NL/EN/DE
- **Accessibility tests** — Tests on real components instead of mock HTML
- **Service worker** — Custom SW with workbox for push and offline functionality

### Tests

- Backend: 265+ tests
- Frontend: 85+ tests (including accessibility)
- E2E coverage for critical user flows

## [1.11.0] - 2026-04-25

### Added

- **Cloud import (OneDrive/SharePoint & Google Drive)** — Import sheet music directly from OneDrive/SharePoint or Google Drive without downloading first. Files are fetched server-side using access tokens and parsed like regular uploads
- **Google Drive settings** — Separate configuration card in Settings for OAuth Client ID and API Key (Picker API + Drive API)
- **Role-based User Guide** — Guide sections are filtered by user role (member, conductor, music_committee, admin) with comprehensive HTML content in all three languages
- **Role-based Onboarding Tour** — Onboarding tour has separate paths per role: admin (6), music_committee (7), conductor (5), member (6), each with tailored explanations and navigation targets
- **Lucide icon system** — Central `Icon` component with 60+ vector icons (SF Symbols-style) replacing 145+ emojis across 36 files
- **iOS-style bottom sheets on mobile** — Modals on smartphones slide up from below with a "grabber" handle and safe-area padding, per Apple HIG

### Improved (Apple HIG alignment)

- **Tap targets** — Minimum 44×44pt for all buttons (Apple HIG requirement), including icon-only buttons
- **Border radius** — Buttons 10px, cards 14px, modals 16-20px for a more natural iOS feel
- **Animation easing** — Replaced with iOS easing curves (`cubic-bezier(0.25, 0.1, 0.25, 1)`) plus spring curve for playful animations
- **Login page** — Purple gradient replaced with neutral background featuring radial accent gradients and frosted-glass card (`backdrop-filter: blur(28px)`)
- **Large page titles** — iOS-style large titles (32-34px bold) with SF Pro letter-spacing on page headers
- **Spacing scale** — Extended with `--space-16` and `--space-20` (64/80px) for better 8pt-grid alignment
- **Button press animation** — Subtle `scale(0.97)` on active state for tactile feedback
- **Modal animations** — Entrance animation with fade + lift, blur backdrop on overlay
- **Language switcher relocated** — From top navigation bar to user settings (profile)

### Documentation

- **Cloud import in READMEs** — Added to README.md, README.nl.md and README.de.md including architecture diagrams, configuration instructions (OAuth setup) and API endpoint references
- **Changelog translations** — Full English and German changelogs with all versions

## [1.10.0] - 2026-04-24

### Added

- **In-app PDF viewer** — View sheet music directly in the app without downloading first. Supports zoom, swipe navigation between pages, click-and-drag panning when zoomed, and dark mode for better readability
- **PDF annotations** — Members can add personal per-page notes to sheet music with color selection. Annotations are private and persist across sessions
- **Offline PDF caching** — "Make available offline" button per music list caches all PDFs for offline use. Green checkmarks show which pieces are cached
- **Download all** — Zip download of all PDFs in a music list at once
- **Compact view** — Toggle in MyMusic to show tuning/number/clef columns inline for better mobile experience
- **Dashboard widgets** — Redesigned dashboard with widgets for upcoming rehearsals, quick actions, practice progress, favorites, and recent activity. Drag-and-drop reordering and toggle visibility
- **Notification bell in header** — Prominent notification bell with unread count badge and dropdown for recent notifications
- **Mollie live/test API keys** — Configure both a live and a test API key and toggle between modes. Warning badge when test mode is active
- **Telegram & WhatsApp UI configuration** — Admins can configure Telegram bot tokens and WhatsApp credentials (Meta or Twilio) from the Settings page, without environment variables
- **Navigation redesign** — Persistent sidebar on desktop with collapsible role-based sections, mobile bottom tab bar with "More" slide-up panel for full navigation
- **Design token system** — Expanded CSS custom property system (colors, typography, spacing, shadows) with utility classes for consistent UI development
- **Email notification triggers** — Automatic notifications on new music uploads and rehearsal changes/cancellations
- **ESLint + Prettier** — Flat config with TypeScript and React Hooks rules, `lint` and `format` scripts
- **German README** — Complete README.de.md translation with architecture diagrams

### Improved

- Global search button (🔍) added to the header
- Dashboard widget empty states with icons and action links
- Architecture diagrams in READMEs updated to reflect all current external services (Mollie, Telegram, WhatsApp, Web Push, IMSLP, Spotify, Apple Music)
- 938 missing German translation keys filled in, 46 ticket strings manually translated
- Duplicate JSON keys in `nl.json`, `en.json` and `de.json` merged
- Tokens are masked in settings API responses for better security

### Fixed

- PDF viewer "Could not load PDF" error — blob URLs were passed as raw data instead of as a URL
- PDF viewer zoom had no visible effect — canvas `maxWidth: 100%` constraints scaled it back down
- PDF viewer panning/scrolling when zoomed — canvas in flex container now gets `flex-shrink: 0` when zoomed
- Missing translations on the practice schedule page (`common.orchestra`, `common.notes`, `music.title`, etc.)

### Tests

- 47 new tests added (annotations route, instruments route, pdfCache utility)
- Total test coverage: backend 249 tests (+30), frontend 59 tests (+17)

## [1.9.0] - 2026-03-30

### Added

- **Push notifications** — Web push notifications with VAPID for new music pieces, rehearsal changes and announcements. Supports multiple channels: push, email, WhatsApp and Telegram
- **Notification preferences** — Users can configure which channel they want to receive notifications per notification type
- **Global search** — Unified search (Cmd+K / Ctrl+K) across music pieces, members, orchestras, lists and rehearsals with autocomplete and recent searches
- **Sortable concert programs** — Drag-and-drop with @dnd-kit to reorder pieces in concert programs
- **Concert program PDF export** — Generate professionally formatted PDF program booklets with title page, numbered piece list and total duration
- **PWA support** — Progressive Web App with service worker, offline page and install capability

### Improved

- Notification center with dropdown for recent notifications and preferences
- Keyboard navigation in search results (arrow keys, Home/End)
- Search suggestions with 200ms debounce for better performance

## [1.8.1] - 2026-03-28

### Fixed

- **Trust proxy configuration** - Added Express `trust proxy` setting for production environments behind a reverse proxy (e.g., Render, Nginx), enabling express-rate-limit to work correctly with X-Forwarded-For headers
- **TypeScript build** - Excluded test files from production build to prevent missing devDependencies errors

## [1.8.0] - 2026-02-27

### Added

- **Orchestra section** - New section with voice parts, occupancy and neighbor preferences
- **Hybrid navigation** - Context sidebar with improved navigation experience
- **Bidirectional Spond sync** - Sync attendance to and from Spond
- **Member directory** - Member list with M365 profile photos
- **Photo sync** - Synchronize and display profile photos in the UI
- **WhatsApp integration** - Direct WhatsApp messages via Twilio
- **Automatic seating notifications** - Scheduler for automatic notifications
- **Drag-and-drop seating editor** - Visual editor for seating arrangements
- **Seating visualization** - Member count and chairs per row display

### Fixed

- Spond sync now uses spond_member_id from attendance record
- User name lookup from database instead of JWT token
- Match attendance status by member name as fallback
- Prevent 'undefined undefined' names when syncing Spond attendance
- Auth token added to photo URLs for browser requests
- Better logging for photo sync debugging
- Absent members added to notifications
- Duplicate nav sections removed from translation files

## [1.7.0] - 2026-02-10

### Added

- **Equipment and uniform management** - Manage instruments, uniforms and accessories with member assignments
- **Concert management** - Plan concerts with date, location and repertoire
- **Buma/Stemra export** - Export concert programs for copyright reporting
- **MusicaInfo.net integration** - Search metadata and difficulty grades of music pieces
- **Attendance overview** - New tab in rehearsals with attendance overview
- **Section view** - View music pieces per orchestra section
- **Music committee notes** - Internal notes for music committee on pieces
- **Concert programs** - Create programs for concerts
- **Visual charts** - Charts added to statistics page
- **New instruments** - Baritone, Euphonium and Bass Guitar added
- **Additional instrument aliases** - More aliases for existing instruments

### Improved

- Improved error handling in the backend
- Extended API documentation
- Music lists layout and PDF button visibility
- Navigation bar layout on desktop and mobile
- WCAG 2.1 AA accessibility improvements

### Fixed

- Spond bulk sync: clears stale event links before re-matching
- Spond sync for same-day rehearsals with duplicate attendance

## [1.6.0] - 2026-02-07

### Added

- **PDF page previews** - Thumbnails of all pages visible when splitting, with adjustable size
- **PDF split with instrument selection** - Instrument dropdown with tuning and clef, automatic numbering for the same instrument
- **Save PDF as music piece** - Save split PDFs directly as music pieces in the library
- **Download all (zip)** - Download all split parts at once as a zip file
- **Save all as music pieces** - Save all split parts at once to the library
- **Hamburger menu** - Responsive navigation menu for mobile devices
- **Changelog page** - Version history available under Admin menu
- **Feedback link** - Link to GitHub Issues in the footer
- **Multilingual changelog** - Changelog available in Dutch, English and German

### Improved

- Backup now uses original filenames instead of UUID names
- Filenames in PDF split preserve spaces within field values

### Fixed

- PDF download authentication now works correctly (token as query parameter)
- Local PDF.js worker for better compatibility
- Results no longer disappear after saving as music piece

## [1.5.0] - 2026-02-05

### Added

- **Last login visible** - User overview now shows when a user last logged in
- **SMTP settings via UI** - Email settings can now be configured through the admin settings, including test email function
- **Extended genre list** - Genres replaced with extended English list of 48 genres
- **New instruments** - Conductor, Alto Clarinet and Vocals added
- **Additional instrument aliases** - More aliases for existing instruments (Baritone Saxophone, Horn, Drumset, etc.)

### Fixed

- Rehearsal deletion now works reliably (changes() timing fix)

## [1.4.0] - 2026-02-04

### Added

- **Microsoft 365 / Entra ID login** - Users can log in with their Microsoft 365 account
- **Language detection** - Automatic language detection based on browser settings
- **Onboarding tours** - Guided tours for new users per role

### Fixed

- Metronome volume fix (first click as loud as the rest)
- Auto-logout and rate limiting improvements

## [1.3.0] - 2026-02-03

### Added

- **Bulk selection and deletion** - Select and delete multiple music pieces at once
- **New list during upload** - Create a new list directly during upload
- **Conductor role** - Separate role for conductors with access to rehearsal planning

### Improved

- Orchestra grouping on My Music page
- Download .pdf_ extension fix

## [1.2.0] - 2026-02-02

### Added

- **Theme system** - Colors, fonts and styling customizable per association
- **Configurable logo and name** - Association name and logo on login screen and navigation
- **Rehearsal planning** - Plan rehearsals with repertoire and Spond integration
- **MyMusic accordion** - Pieces grouped by title with expandable parts

## [1.1.0] - 2026-02-01

### Added

- **Backup and restore** - Full database and file backup/restore
- **WCAG 2.1 AA accessibility** - Improved accessibility for screen readers
- **Multilingual** - Dutch, English and German supported

## [1.0.0] - 2026-01-15

### First release

- Music library management
- User and orchestra management
- PDF upload and processing
- Instruments and genres management
- Loan administration
- Statistics
