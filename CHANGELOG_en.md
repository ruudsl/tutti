# Changelog

All notable changes to this application are documented here.

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
