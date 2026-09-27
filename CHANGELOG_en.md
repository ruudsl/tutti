# Changelog

All notable changes to this application are documented here.

## [Unreleased]

### Note when upgrading

- **Set an `ENCRYPTION_SECRET` before upgrading.** Stored secrets (SMTP password, integration tokens, MFA secrets, Mollie keys, the Spond password) are now encrypted with a dedicated key instead of one derived from `JWT_SECRET`. Create one with `openssl rand -base64 48`; it must differ from `JWT_SECRET`. Without it the server does not start in production, and the migrations stop before touching anything. Docker: put it in `.env`. Render: `render.yaml` generates it for blueprint-managed services; a service created by hand needs it set in the dashboard.
- **Keep `JWT_SECRET` unchanged for this first upgrade.** The migration needs it once to read the existing values; after that it can be rotated on its own.
- **Keep `ENCRYPTION_SECRET` with your backups, but not on the same server.** Automatic backups and pre-restore copies are now encrypted with it as well (`.sqlite.enc`). Decrypt with `npm run backup:ontsleutel --workspace=backend -- <file>`. If the key is lost, backups cannot be restored, and admins must set up their integrations and members their MFA again.
- **The database file and backups get mode 0600.** Your own scripts that read them must run as the server's user.
- **Own proxy or CDN for the frontend:** the security headers (Content-Security-Policy, `Referrer-Policy: no-referrer` and others) are now also in `frontend/nginx.conf`, the Traefik labels and `vercel.json`. If you serve `frontend/dist` differently, copy them; see `docs/SELF_HOSTING.md`. If the API is on another origin, add it to `connect-src`.
- **Traefik:** the `frameDeny` label is replaced by `customFrameOptionsValue=SAMEORIGIN`. The public calendar can no longer be shown in an iframe on another site.
- **The nginx access log** uses its own format without query string and Referer. Tools that expect the default format (fail2ban, GoAccess) need adjusting.
- **Members with a temporary password** from onboarding are sent to their profile to change it at their next login. Tutti no longer stores that temporary password.
- **A login token in a URL no longer works anywhere**, not even for downloads (1.18.0 still allowed it for GET). Your own scripts send the token in the `Authorization` header. Calendar feeds are unchanged.
- **An association's own SMTP server on an internal address** (for example a relay on the Docker network) is refused, when saving and when sending. The installation's SMTP server (`SMTP_*`) is not affected.
- **Connecting Google Calendar** needs `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` in the installation's environment, and `<FRONTEND_URL>/api/calendar/google/callback` as redirect URI at Google.
- **The Traefik access log** no longer stores the path.

### Added

- **Share to Tutti.** When you share a PDF with Tutti on a phone or computer (via **Share** in another app, with Tutti installed as an app), it is ready on the upload page. There you choose the orchestra and list and upload it. If you are not logged in, you log in first and come back. The share action was already in the app manifest but always ended in an error.
- **Storage limit per association.** With `STORAGE_QUOTA_BYTES` (and per subscription `STORAGE_QUOTA_BYTES_FREE`, `_BASIC`, `_PRO`, `_ENTERPRISE`) a limit applies to sheet music, MP3s, MusicXML, recordings and wiki and mail attachments together; a super admin can set a separate limit per association. An upload that no longer fits gets a clear message and is not stored. The administration section of the dashboard shows usage against the limit. Without a setting there is no limit.
- **The backup download is encrypted** once `ENCRYPTION_SECRET` is set: a `.zip.enc` in the same format as the automatic backups. Restoring in the admin screen accepts both `.zip.enc` and an old `.zip`, but a `.zip.enc` only on an installation with the same key.

### Changed

- **Too many failed logins now lead to a wait instead of a lock.** After five attempts you wait 1, 2, 4 and at most 15 minutes per e-mail address and device; a successful login resets the counter. Accounts are no longer locked, so nobody can lock someone else out. Wrong two-step verification codes count too.
- **Logging out also ends the session on the server.** Other devices stay logged in.
- **Passwords are at least 8 characters everywhere.**
- **The _Forgot password_ e-mail** goes through the queue and may arrive a few seconds later.
- **Members of a deactivated association** can no longer get in; the calendar feed of a member who has left stops.
- **Anyone with a temporary password** (from onboarding, or from an admin who creates the member or sets a password for them) chooses their own password at the next login, and can only use their profile until then.
- **Connecting Google Calendar works** if the installation has set it up (see _Note when upgrading_). Before, the button always said it was not configured.

### Fixed

#### Security

From our own security review in September:

- **Login:** unknown and known addresses get the same response, including in how long it takes. A revoked session stays revoked for as long as the token is valid. If the session check cannot reach the database, the request is refused instead of let through.
- **Uploads:** a zip of sheet music is limited by its unpacked size, before and during unpacking. Merging PDFs has a limit on the number of files and their size.
- **Custom fields:** a validation pattern that would keep the server busy is stopped after a short time; an invalid pattern is refused when saved.
- **Entered names** are displayed safely in a ticket's print window and in the HTML of e-mails.
- **No secrets in the log:** passwords, tokens and keys are masked in nested fields too, in the log and in Sentry, and e-mail addresses are shortened. Tokens in URLs and the Referer no longer reach the request log.
- **Security headers** now come with the frontend's pages, not just with the API.
- **Addresses the server calls itself** (webhooks) are checked more strictly, including IPv6 forms, and the connection goes to exactly the checked address.
- **Integration secrets** are stored encrypted, and the settings screens no longer show any characters of a token.
- **MP3s** are played with a short-lived token that is valid for that one file only, instead of the login token in the URL.
- **The wait after failed logins** survives a restart. No e-mail or IP address is stored readably for it.
- **An association's SMTP server** is connected at exactly the checked address.
- **The webhook address of the seating notifications** is stored encrypted and no longer sent to the browser.
- **Names and text in notification e-mails, poll reminders, workflows and e-mail campaigns** are placed safely in the HTML.

#### GDPR

- **Deleting a member** now also removes the profile photo, phone numbers, notification channels and the Google Calendar connection (which is revoked at Google). In the audit log, name and e-mail address are replaced; the entries themselves stay.
- **A new member's temporary password** is no longer stored; it only appears in the response when the member is created. Existing stored passwords are wiped.

## [1.18.0] - 2026-09-24

A month with two things the board benefits from straight away, and a lot of work under the hood. Data that still lives in Excel can now be brought over without retyping, and ticket money goes to the association's own account. On top of that: an internal security review, a queue for background work that survives a restart, and a time limit on every call to an external service. Along the way the Equipment page turned out not to work at all; it does now.

### Note when upgrading

For those who install and run Tutti themselves:

- **In production the server no longer starts with a weak `JWT_SECRET`.** Besides a missing or too short secret, the example values from the documentation and monotonous values are now refused as well; the example files leave the field empty from now on. Generate a random secret, for instance with `openssl rand -base64 48`. On Render the secret is generated; nothing needs to be done there.
- **Signing in with Microsoft needs your own organisation's tenant ID.** If the tenant is set to `common`, `organizations` or `consumers`, Microsoft sign-in counts as not configured. Fill in your own tenant ID.
- **A full sign-in token in the URL now only works for downloads** (GET and HEAD requests). Your own scripts that put a token in the URL for anything else must send it in the `Authorization` header instead.
- **Ticket money goes to the association's own Mollie account** for every association that has entered and connected its own key in the payment settings (**Payments**); see _Added_. Associations without their own key stay on the installation's account. If a stored key can no longer be decrypted, Tutti deliberately does not fall back to the installation's account; enter the key again.
- **Docker setups:** in both compose files the backend port now only listens on `127.0.0.1`; visitors come in through nginx or Traefik. These now also forward `/socket.io` to the backend. If you use your own proxy configuration, it must do the same, or chat and notifications will not update live. If there is another layer in front of that proxy, set `TRUST_PROXY` to the number of proxies.
- **Genres and instruments now differ per association.** The existing genres and instruments are the standard list for all associations; only the super admin changes it now. An admin who wants to change or remove a standard genre or instrument hides it and creates their own; see _Added_. Whatever is already linked to it — members, parts, titles — stays as it is.

### Added

- **Import from a spreadsheet.** Under **Admin → Import** you can read in members, the music library, instruments owned, contacts, uniforms and equipment. You first see what will happen to each row — new, already exists, or an error with the reason — and nothing changes until you click import.
  - Save the worksheet as CSV (in Excel: _Save As → CSV_); an .xlsx file itself is not read. Column names may be Dutch, English or German, there is a sample file to download for each kind, and a CSV the way Excel on Windows saves it is read correctly. Tutti's own repertoire export can be read back in too.
  - With the **Update existing records** checkbox, a row that already exists receives whatever is different in the file; the preview shows old → new per field. An empty cell erases nothing, and a value that cannot be read leaves the old one in place. For members only the name and private email address are updated, never the role. Uniforms do not take part: an item has no number to recognise it by.
  - Imported members receive no email and no password. They set one themselves through _Forgot password_, or the admin sends invitations when the association is ready. The subscription's member limit applies here too.
  - Who may import something is whoever manages it on the regular page: members only the admin; the music library and contacts also the music committee; instruments and equipment also the instrument committee (under _Inventory_); uniforms also the uniform committee. If the Inventory or Contacts module is switched off, those kinds disappear from the import as well.
- **Ticket money to your own account.** In the payment settings an association could already enter its own Mollie key, but ticket sales only used the installation's key. With several associations on one installation, all ticket money therefore ended up in one account. Payments, payment status and refunds now go through the association's own account, in the chosen mode (live or test).
- **Background jobs that survive a restart.** The line-up notifications, re-forwarding mail, the GDPR clean-up, the backup and clearing temporary files each ran in their own loop in the server's memory. Every update is a restart, and it threw away running work without a trace; a failed backup only appeared in the log. That work now sits in a queue in the database: it carries on after a restart, never runs twice, and whatever fails stays visible. Work that is safe to repeat gets new attempts automatically; anything that may already have been sent does not.
  - The super admin has a new **Background jobs** tab. It opens on the failed jobs, shows the last error for each, and has a **Retry** button.
- **Own genres and instruments.** An association adds genres and instruments that only it sees, and hides standard items it doesn't use; those then no longer appear in its pick lists. Two associations can each have their own genre with the same name. A new **Instruments** page under **Library** handles this; the **Genres** page shows what is standard and what is your own. Linking a part or a member to an instrument by name, when uploading and when importing, only looks at what the association sees.

### Changed

- **An outage at an external service no longer ties Tutti up.** Tutti talks to Mollie, Stripe, Microsoft 365, Google, Spond, Telegram, WhatsApp and IMSLP, among others. Some of those calls had no time limit, payments included: a hanging payment service kept a buyer stuck at checkout until they gave up. Every call now has a limit, a brief hiccup is retried automatically, and a service that is truly down is skipped for a while instead of costing the full wait again for every member.
  - Creating or sending something — a payment, a refund, a message, a calendar appointment, a Microsoft account — never happens twice. After a time-out nobody knows whether the first attempt got through after all.
  - When a service is down you get "try again later" instead of "Internal server error", as if Tutti itself were broken.
  - The installation's detailed health check shows for each external service whether it is currently being skipped — the answer to "why aren't my notifications arriving".
- **The login screen appears faster.** Where there used to be a white screen until everything had loaded, the logo now appears straight away, and of the Dutch texts the login screen only gets what it needs; the rest follows afterwards. The package the browser fetches first went from 96 to 39 KB, and the performance score on the build pipeline's measuring machine from 84 to around 90.
- **The journal and invoices in accounting are paginated.** Both fetched everything an association had ever booked, and that grows every season. They now come in pages of 25, with buttons to page through. The counts on the overview — the number of bookings and the open invoices — come from the server, so they cover everything and not just the page you are looking at. Switching fiscal year takes you back to page 1; previously you could stay on page 3 of a year with only one page and look at an empty list. The list of bank statements has been given the same limit.
- **The info screen only shows messages meant for everyone.** A message intended for a particular audience no longer appears on the public info screen.
- **Two scheduled features that never ran on their own have been removed.** The weekly email digest was built but never started anywhere, and never reached a single member; switching it on would have sent members an unrequested weekly email. The same was true of workflows with the _On schedule_ or _On date field_ trigger: they never fired on their own. They are no longer offered for a new trigger; existing triggers of that kind stay visible and editable, with a note that they do not fire on their own.
- **Who sees external contacts depends on the role.** Admin and board see everything. The committees and the conductor see the contacts, but not the bank details, the chamber of commerce and VAT numbers, or the notes. Regular members no longer see the contacts; the menu item disappears for them.

### Fixed

#### Security

From an internal security review. Every item has a test that failed on the old code.

- **Roles.** An admin could grant more rights through an invitation than they had themselves — that is no longer possible, and it is checked again when the invitation is accepted. After removal from an association or a role change, a member's role is correct straight away.
- **Sessions.** When an admin changes a member's role or password, that member is signed out everywhere. A removed or inactive member no longer gets in with a session that was still open. The live connection for chat and notifications now also checks whether a session still exists; after signing out or a password change, that connection could keep working.
- **Signing in with Microsoft** is checked more strictly against your own organisation. An account is only linked to a member automatically when it demonstrably belongs to that organisation, and an inactive member does not get in.
- **The association boundary.** Workflows, shared annotations on sheet music, lending and issuing uniforms, equipment and instruments, and the repertoire statistics now stay within the association; lending is only possible to a member of your own association. Email — including from workflows — only goes through your own association's mail server or the installation's, never through another association's.
- **Payments.** A payment confirmation from Mollie is only linked to the order the payment was created for, and the amount has to match.
- **Addresses the server calls itself.** A webhook address (for line-up notifications and in workflows) and the mail server in the SMTP test may not point to the server's internal network. The OneDrive import only fetches files from Microsoft itself.
- **The IP allowlist for the admin screen** and the check for suspicious ticket orders now determine the visitor's address in the same reliable way as the rest of the application.
- **Logos and profile photos.** The file type is determined by the content, not the name, and the files are served in such a way that a browser can do nothing with them but display them.
- **The overview of all associations and creating a new association** are reserved for the super admin.
- Paths of uploaded files and log lines are checked more strictly, following reports from code scanning.

#### Things that did not work

- **The Equipment page did not work at all.** Creating an item gave an error, the list was always empty, and editing, lending, maintenance and recording damage called functions that did not exist on the server. The page and the server spoke two different languages, and the tests did not notice because they imitated the server. The page now follows what the server knows: type, status, condition, category, inventory number, brand and model, location and whether an item can be lent out. You pick the borrower from the member list instead of typing a number, and the overdue maintenance warning comes from the next maintenance date. A new test now compares every call the page makes with what the server actually offers.
- **Uploading a zip of sheet music always failed**: the screen and the server used a different name for the file. On top of that, unpacking a large zip held the whole server for up to nearly two seconds, so nobody else got an answer in the meantime, and a file whose title did not make it into the database stayed on disk where nobody could find it. All three are fixed.
- **Realtime did not work in the Docker setups.** Chat, notifications and the line-up only updated live when the browser ran on the server itself (see _Note when upgrading_).
- **Telegram and WhatsApp notifications per association.** A member saw Telegram as available as soon as any association on the installation had set up a bot, and linking then failed. Which channels are available now depends on your own association.
- **Forwarding mail when enrolling a new member in Microsoft 365** was skipped when Microsoft returned an error page instead of a regular response. Enrolment and the member synchronisation with Microsoft now use the same, repaired helper functions.
- **Stripe:** a payment's status was silently not fetched when Stripe used a long payment reference.
- **Every restart removed genres that were not in the standard list**, together with their links to titles. A genre an admin had added therefore only lasted until the next update. Startup now only adds to the standard list.

#### GDPR

- **One member who could not be erased blocked the erasure of all members.** The GDPR clean-up erased members who had been removed long enough all at once. If anything still referred to one of them — a chat message, or an invoice or booking they had created — nobody on the entire installation was erased, and that only showed up in the log. It now goes member by member: whoever cannot be erased stays and is named in the log, the rest are erased. The same applies to the retention periods per association and to the manual clean-up. What should happen to the chat messages and bookings of such a member is a decision for the board (see `docs/PIA.md`).

#### Other

- Signing up twice as a passenger for the same ride put you on it twice, taking up two seats.
- Three messages were only in Dutch: when downloading a poster, saving a setlist and ending a practice session. They are translated now, and the Dutch reads "1 minuut" instead of "1 minuten".

### Technical

- **Vitest 5** for both test suites, together with the coverage measurement; **React 19**, with react and react-dom updated in one go. Also updated, among others: archiver 8 (backups and zip downloads adapted to the new call), multer, helmet, i18next, axios and react-dropzone. jsdom is temporarily pinned to 30.0.1, because 30.1.0 has a bug in the test environment; TypeScript 7 waits until typescript-eslint supports it.
- The Lighthouse threshold in CI goes from 80 to 86.
- Two tests that depended on the date or on the speed of the machine have been decoupled from it.
- Agreements and recipes for those working on Tutti recorded (`CLAUDE.md`, `docs/VEERKRACHT.md`, `docs/ACHTERGRONDTAKEN.md`, `docs/IMPORTEREN.md`).

## [1.17.0] - 2026-08-24

### Added

- **The Spond integration is now a module.** Under **Admin → Modules** it sits under _Planning_ and can be switched on or off like the other nineteen parts. Associations that don't use Spond — the large majority — no longer see the integration on the rehearsals screen.
  - Anyone using Spond today notices nothing: the module is on for those associations. Switching it off hides the integration and deletes nothing — the settings, the linked members and the fetched rehearsals stay put and come back unchanged when it is switched on again.
  - What does _not_ go with the module is your own attendance. Marking yourself present or absent for a rehearsal keeps working with Spond off; only pushing it through to Spond falls away, because there is no integration to push to.

## [1.16.0] - 2026-08-24

A performance round that found two long-standing problems along the way. The application is now more than three times lighter on first open, the service worker was doing nothing at all, and the browser tab showed a technical key instead of a title on nearly every page.

### Fixed

- **The app never installed as an app, and never worked offline.** Service worker registration failed every time. `offline.html` appeared twice in the precache list with two different revisions, which Workbox refuses — while reading the script, so before anything could be installed. The result: no offline use, no offline sheet music, no background notifications and no install to the home screen. The error was logged to the console and everything else kept working, so nobody noticed.
- **The browser tab showed `pageTitle.dashboard`.** Of the 65 page titles, 61 existed in no language at all, so the technical key itself ended up in the tab — and therefore in bookmarks and history too. All 61 are now there, in Dutch, English and German. The Instrument Management page also had a fixed Dutch title for everyone; that is translated now as well.

### Changed

- **Opening the application is more than three times lighter.** What the browser has to fetch and process on a first visit before anything appears on screen went from 905 KB to 296 KB. The Lighthouse performance score went from 79 to 84 on the build pipeline's measuring machine (from 79 to 91 on a faster machine — the number depends on where you measure).
  - **The English and German texts are no longer sent** to someone using the application in Dutch. That was 610 KB nobody touched. Switching language fetches the matching file at that moment.
  - **The signed-in menu is only fetched after signing in.** Search bar, notifications, quick actions, breadcrumbs and the offline storage were all in the package handed to someone on the login screen.
  - **The styling now sits in the page itself** instead of in a separate file that held up rendering.

### Added

- **Two checks that stop these bugs from coming back.** The performance measurement in CI now also verifies the service worker's precache list, and a new test guards that every page title exists in all three languages.

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
