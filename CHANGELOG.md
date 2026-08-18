# Changelog

Alle belangrijke wijzigingen in deze applicatie worden hier gedocumenteerd.

## [1.14.0] - 2026-08-18

### Toegevoegd

#### Modules

- **Onderdelen aan- en uitzetten** — Een beheerder zet onder Beheer → Modules uit wat de vereniging niet gebruikt. Het verdwijnt uit het menu en is niet meer op te vragen.
- **Uitzetten verbergt, het verwijdert niets** — De gegevens van een uitgezette module blijven ongewijzigd staan en komen bij aanzetten precies zo terug.
- **Eerste drie modules** — Boekhouding, Kaartverkoop (inclusief betaalinstellingen en de scanner) en Podium en opstelling. Samen tien menu-items.
- **In de rondleiding** — Nieuwe beheerders krijgen de modules meteen na het welkom te zien.

### Gewijzigd

- **De drie modules staan standaard uit**, ook voor bestaande verenigingen. Gebruik je ze wel, dan zet je ze in twee klikken aan onder Beheer → Modules; je gegevens staan er dan nog gewoon.

### Opgelost

- Tien modules schreven naar tabellen of kolommen die nooit waren aangemaakt, waardoor die functies faalden zodra iemand ze gebruikte: boekhouding, bijlagen bij mailings, schaderapportages op apparatuur, wiki-bijlagen, het tekenpad in annotaties, seizoensplanning, IMSLP-import en de concert-podiumindeling.
- `equipment_loans` stond twee keer in het schema met verschillende kolommen. Doordat de eerste won, kreeg de apparatuurmodule stil de verkeerde tabel.

## [1.13.0] - 2026-05-06

### Toegevoegd

#### Evenementen & Optredens Planner

- **Complete event management** — Beheer evenementen met gedetailleerde locatie-info, tijdschema's en programma's
- **Vervoerscoördinatie** — Auto's/bussen registreren met chauffeurs, passagiers en verzamelpunten
- **Paklijsten** — Maak paklijsten met templates, track voortgang per item, wijs verantwoordelijken toe
- **Weer-integratie** — Weersvoorspellingen voor buitenoptredens met waarschuwingen
- **Aanwezigheidsbeheer** — Leden kunnen aanwezigheid aangeven met vervoersbehoefte en dieetwensen
- **Locatiebeheer** — Beheer favoriete locaties met faciliteiten (stroom, kleedkamers, parkeren)

#### Meerdere Verenigingen

- **Multi-tenant ondersteuning** — Eén installatie voor meerdere orkesten/verenigingen
- **Super admin panel** — Beheer alle verenigingen, abonnementen en limieten
- **Lidmaatschap** — Gebruikers kunnen lid zijn van meerdere verenigingen
- **Partnerschappen** — Verenigingen kunnen muziek, evenementen en leden delen
- **Uitnodigingssysteem** — Nodig nieuwe leden uit met automatische rol-toewijzing
- **Activiteitenlog** — Audit trail van alle belangrijke acties per vereniging

### Technisch

- 20+ nieuwe database tabellen voor events, locaties, vervoer, paklijsten en multi-tenant
- Volledige API met ~50 nieuwe endpoints
- React Query hooks voor alle nieuwe functionaliteit
- Vertalingen in NL, EN en DE

## [1.12.0] - 2026-05-02

### Toegevoegd

#### WP3: Toegankelijkheid (WCAG 2.1 AA)

- **Toetsenbordnavigatie** — Volledige applicatie bedienbaar via toetsenbord met zichtbare focus-indicators
- **Skip links** — Directe navigatie naar hoofdinhoud voor screenreader gebruikers
- **ARIA labels** — Correcte ARIA attributen voor alle interactieve elementen, modals en formulieren
- **Focus management** — Focus wordt automatisch verplaatst bij modal openen/sluiten
- **Toegankelijkheidstests** — Uitgebreide jest-axe tests voor alle componenten

#### WP4: Docker & Self-hosting

- **Docker Compose** — Complete productie-setup met Nginx reverse proxy, Let's Encrypt SSL, en health checks
- **Multi-architecture** — Docker images voor AMD64 en ARM64 (Apple Silicon, Raspberry Pi)
- **Backup volumes** — Automatische volume mounts voor database en uploads

#### WP5: Muziek Metadata & Interoperabiliteit

- **MusicXML import** — Parse MusicXML bestanden voor automatische metadata extractie
- **JSKOS vocabulaires** — Gestandaardiseerde genre-classificatie via JSKOS/SKOS
- **Dublin Core export** — Metadata export conform Dublin Core standaard
- **IIIF manifest** — Bladmuziek beschikbaar via IIIF protocol

#### WP6: GDPR & Privacy-by-Design

- **Data export** — Gebruikers kunnen al hun gegevens downloaden (JSON)
- **Verwijderverzoeken** — Self-service account verwijdering met 30-dagen bewaarperiode
- **Retentie-instellingen** — Configureerbare bewaartermijnen per datatype
- **Automatische cleanup** — Dagelijkse scheduler voor verlopen sessies, logs en verwijderde accounts
- **Audit logging** — Uitgebreide audit trail voor alle CRUD operaties
- **Consent tracking** — Registratie van gebruikerstoestemmingen

#### WP7: Community & Governance

- **Code of Conduct** — Contributor Covenant gedragscode
- **Contributing Guide** — Richtlijnen voor bijdragen aan het project
- **Security Policy** — Responsible disclosure beleid

#### WP8: CI/CD & Test Coverage

- **GitHub Actions** — Geautomatiseerde CI/CD pipeline met parallel testen
- **CodeQL** — SAST security scanning voor kwetsbaarheden
- **Dependabot** — Automatische dependency updates
- **Codecov** — Test coverage rapportage (>80% target)
- **Multi-tenant tests** — Data-isolatie tests tussen organisaties

#### WP10: PWA & Mobiele UX

- **App shortcuts** — Directe toegang tot Mijn Muziek, Repetities, Tickets vanaf homescreen
- **Share Target** — Ontvang PDF bestanden via native share dialoog
- **Push notificaties** — Native push meldingen met click handling en navigatie
- **Offline sync** — Background sync voor acties uitgevoerd zonder internet
- **Verbeterde caching** — Slimme cache strategieën per contenttype

### Verbeterd

- **156 ontbrekende Engelse vertalingen** — Volledige pariteit tussen NL/EN/DE
- **Accessibility tests** — Tests op echte componenten i.p.v. mock HTML
- **Service worker** — Custom SW met workbox voor push en offline functionaliteit

### Tests

- Backend: 265+ tests
- Frontend: 85+ tests (inclusief accessibility)
- E2E coverage voor kritieke user flows

## [1.11.0] - 2026-04-25

### Toegevoegd

- **Cloud import (OneDrive/SharePoint & Google Drive)** — Importeer bladmuziek rechtstreeks vanuit OneDrive/SharePoint of Google Drive zonder eerst te downloaden. Bestanden worden server-side opgehaald via access tokens en geparseerd zoals reguliere uploads
- **Google Drive instellingen** — Aparte configuratiekaart in Instellingen voor OAuth Client ID en API Key (Picker API + Drive API)
- **Rolgebaseerde handleiding** — User Guide secties worden gefilterd op basis van gebruikersrol (member, conductor, music_committee, admin) met uitgebreide HTML-content in alle drie de talen
- **Rolgebaseerde rondleiding** — Onboarding Tour heeft aparte stappen per rol: admin (6), music_committee (7), conductor (5), member (6), elk met op maat gemaakte uitleg en navigatie-doelen
- **Lucide icoonsysteem** — Centrale `Icon`-component met 60+ vector iconen (SF Symbols-stijl) ter vervanging van 145+ emoji's verspreid over 36 bestanden
- **iOS-style bottom sheets op mobiel** — Modals op smartphones glijden van onderen omhoog met een "grabber" handvat en safe-area padding, conform Apple HIG

### Verbeterd (Apple HIG-uitlijning)

- **Tap-targets** — Minimum 44×44pt voor alle knoppen (Apple HIG vereiste), ook icoon-only knoppen
- **Border-radius** — Buttons 10px, cards 14px, modals 16-20px voor een natuurlijker iOS-gevoel
- **Animatie-easing** — Vervangen door iOS easing curves (`cubic-bezier(0.25, 0.1, 0.25, 1)`) plus spring-curve voor speelse animaties
- **Login pagina** — Paarse gradient vervangen door neutrale achtergrond met radial accent gradients en frosted-glass kaart (`backdrop-filter: blur(28px)`)
- **Grote pagina-titels** — iOS-style large titles (32-34px bold) met SF Pro letter-spacing op pagina-headers
- **Spacing scale** — Uitgebreid met `--space-16` en `--space-20` (64/80px) voor betere 8pt-grid uitlijning
- **Button press-animatie** — Subtiele `scale(0.97)` op active state voor tactiele feedback
- **Modal animaties** — Entrance animatie met fade + lift, blur backdrop op overlay
- **Talenswitcher verplaatst** — Van bovenste navigatiebalk naar gebruikersinstellingen (profiel)

### Documentatie

- **Cloud import in README's** — Toegevoegd aan README.md, README.nl.md en README.de.md inclusief architectuurdiagrammen, configuratie-instructies (OAuth setup) en API endpoint referenties
- **Changelog vertalingen** — Volledige Engelse en Duitse changelog met alle versies

## [1.10.0] - 2026-04-24

### Toegevoegd

- **In-app PDF viewer** — Bekijk bladmuziek direct in de app zonder eerst te downloaden. Ondersteunt zoom, swipe-navigatie tussen pagina's, click-and-drag pannen bij zoom, en dark mode voor betere leesbaarheid
- **PDF annotaties** — Leden kunnen per pagina persoonlijke aantekeningen toevoegen aan bladmuziek, met kleurkeuze. Annotaties zijn privé en blijven bewaard
- **Offline PDF caching** — Knop "Offline beschikbaar maken" per muzieklijst cachet alle PDFs voor offline gebruik. Groene vinkjes tonen welke stukken zijn gecached
- **Download alles** — Zip-download van alle PDFs in een muzieklijst tegelijk
- **Compacte weergave** — Toggle in MyMusic om tuning/nummer/sleutel kolommen inline te tonen voor beter mobiel gebruik
- **Dashboard widgets** — Herontworpen dashboard met widgets voor aankomende repetities, snelle acties, oefenvoortgang, favorieten en recente activiteit. Drag-and-drop herschikken en aan/uit te schakelen
- **Notificatiebel in header** — Prominente notificatiebel met ongelezen teller en dropdown voor recente meldingen
- **Mollie live/test API keys** — Configureer zowel een live als een test API key en wissel tussen de modes. Waarschuwingsbadge als testmodus actief is
- **Telegram & WhatsApp UI configuratie** — Admins kunnen Telegram bot tokens en WhatsApp credentials (Meta of Twilio) configureren vanuit de Instellingen-pagina, zonder environment variables
- **Navigatie herontwerp** — Persistente zijbalk op desktop met inklapbare rolgebaseerde secties, mobiele bottom tab bar met "Meer" slide-up paneel voor volledige navigatie
- **Design token systeem** — Uitgebreid CSS custom property systeem (kleuren, typografie, spacing, shadows) met utility classes voor consistente UI-ontwikkeling
- **E-mailnotificatie triggers** — Automatische notificaties bij nieuwe muziek upload en repetitie wijzigingen/annuleringen
- **ESLint + Prettier** — Flat config met TypeScript en React Hooks regels, scripts voor `lint` en `format`
- **Duitse README** — Complete README.de.md vertaling met architectuurdiagrammen

### Verbeterd

- Globale zoekfunctie-knop (🔍) toegevoegd aan de header
- Lege states in dashboard widgets met iconen en actie-links
- Architectuurdiagrammen in README's bijgewerkt met alle huidige external services (Mollie, Telegram, WhatsApp, Web Push, IMSLP, Spotify, Apple Music)
- 938 ontbrekende Duitse vertaling-keys aangevuld, 46 ticket-strings handmatig vertaald
- Dubbele JSON-keys in `nl.json`, `en.json` en `de.json` samengevoegd
- Tokens in instellingen-API worden gemaskeerd teruggegeven voor betere beveiliging

### Opgelost

- PDF viewer "Could not load PDF" fout — blob URLs werden als raw data doorgegeven in plaats van als URL
- PDF viewer zoom werkte visueel niet — canvas had `maxWidth: 100%` beperkingen die vergroting terugschaalden
- PDF viewer pannen/scrollen bij zoom — canvas in flexbox container kreeg `flex-shrink: 0` bij zoom
- Ontbrekende vertalingen op oefenschema pagina (`common.orchestra`, `common.notes`, `music.title`, etc.)

### Tests

- 47 nieuwe tests toegevoegd (annotations route, instruments route, pdfCache utility)
- Totale test coverage: backend 249 tests (+30), frontend 59 tests (+17)

## [1.9.0] - 2026-03-30

### Toegevoegd

- **Push notificaties** — Web push notificaties met VAPID voor nieuwe muziekstukken, repetitiewijzigingen en aankondigingen. Ondersteunt meerdere kanalen: push, e-mail, WhatsApp en Telegram
- **Notificatievoorkeuren** — Gebruikers kunnen per notificatietype instellen via welk kanaal zij meldingen willen ontvangen
- **Globale zoekfunctie** — Unified search (Cmd+K / Ctrl+K) over muziekstukken, leden, orkesten, lijsten en repetities met autocomplete en recente zoekopdrachten
- **Sorteerbare concertprogramma's** — Drag-and-drop met @dnd-kit om de volgorde van stukken in concertprogramma's aan te passen
- **Concertprogramma PDF export** — Genereer professioneel opgemaakte PDF-programmaboekjes met titelpagina, genummerde stukkenlijst en totale speelduur
- **PWA ondersteuning** — Progressive Web App met service worker, offline pagina en installatiemogelijkheid

### Verbeterd

- Notificatiecentrum met dropdown voor recente meldingen en voorkeuren
- Toetsenbordnavigatie in zoekresultaten (pijltjes, Home/End)
- Zoeksuggesties met 200ms debounce voor betere performance

## [1.8.1] - 2026-03-28

### Opgelost

- **Trust proxy configuratie** - Express `trust proxy` instelling toegevoegd voor productieomgevingen achter een reverse proxy (bijv. Render, Nginx), waardoor express-rate-limit correct werkt met X-Forwarded-For headers
- **TypeScript build** - Testbestanden uitgesloten van productie-build om ontbrekende devDependencies fouten te voorkomen

## [1.8.0] - 2026-02-27

### Toegevoegd

- **Orkest sectie** - Nieuwe sectie met stemgroepen, bezetting en buurvoorkeuren
- **Hybride navigatie** - Context sidebar met verbeterde navigatie-ervaring
- **Bidirectionele Spond synchronisatie** - Aanwezigheid van en naar Spond synchroniseren
- **Smoelenboek** - Ledenlijst met M365 profielfoto's
- **Foto synchronisatie** - Profielfoto's synchroniseren en tonen in de UI
- **WhatsApp integratie** - Directe WhatsApp berichten via Twilio
- **Automatische zitplaatsmeldingen** - Scheduler voor automatische notificaties
- **Drag-and-drop zitplaatseneditor** - Visuele editor voor zitplaatsindelingen
- **Zitplaatsvisualisatie** - Ledentelling en stoelen per rij weergave

### Opgelost

- Spond sync gebruikt nu spond_member_id uit aanwezigheidsrecord
- Gebruikersnaam ophalen uit database in plaats van JWT token
- Aanwezigheidsstatus matchen op lidnaam als fallback
- 'undefined undefined' namen voorkomen bij Spond synchronisatie
- Auth token toegevoegd aan foto URLs voor browserverzoeken
- Betere logging voor foto synchronisatie debugging
- Afwezige leden toevoegen aan meldingen
- Dubbele navigatiesecties verwijderd uit vertaalbestanden

## [1.7.0] - 2026-02-10

### Toegevoegd

- **Materiaal- en uniformbeheer** - Beheer van instrumenten, uniformen en accessoires met toewijzing aan leden
- **Concertbeheer** - Concerten plannen met datum, locatie en repertoire
- **Buma/Stemra export** - Exporteer concertprogramma's voor auteursrechtenmelding
- **MusicaInfo.net integratie** - Zoek metadata en moeilijkheidsgraad van muziekstukken
- **Aanwezigheidsoverzicht** - Nieuw tabblad bij repetities met overzicht van aanwezigheid
- **Sectie-weergave** - Muziekstukken bekijken per orkestsectie
- **Muziekcommissie notities** - Interne notities voor muziekcommissie bij stukken
- **Concertprogramma's** - Programma's samenstellen voor concerten
- **Visuele grafieken** - Grafieken toegevoegd aan statistiekenpagina
- **Nieuwe instrumenten** - Bariton, Euphonium en Basgitaar toegevoegd
- **Extra instrument aliassen** - Meer aliassen voor bestaande instrumenten

### Verbeterd

- Verbeterde foutafhandeling in de backend
- Uitgebreide API-documentatie
- Muzieklijsten layout en PDF-knop zichtbaarheid
- Navigatiebalk layout op desktop en mobiel
- WCAG 2.1 AA toegankelijkheid verbeteringen

### Opgelost

- Spond bulk sync: verwijdert verouderde event-koppelingen voor opnieuw matchen
- Spond sync voor repetities op dezelfde dag met dubbele aanwezigheid

## [1.6.0] - 2026-02-07

### Toegevoegd

- **PDF pagina voorbeelden** - Thumbnails van alle pagina's zichtbaar bij het splitsen, met instelbare grootte
- **PDF splitsen met instrumentkeuze** - Instrument-dropdown met stemming en sleutel, automatische nummering bij hetzelfde instrument
- **PDF opslaan als muziekstuk** - Gesplitste PDF's direct opslaan als muziekstuk in de bibliotheek
- **Alles downloaden (zip)** - Alle gesplitste delen in één keer downloaden als zip-bestand
- **Alles opslaan als muziekstukken** - Alle gesplitste delen in één keer opslaan in de bibliotheek
- **Hamburger menu** - Responsive navigatiemenu voor mobiele apparaten
- **Changelog pagina** - Versiegeschiedenis beschikbaar onder Admin menu
- **Feedback link** - Link naar GitHub Issues in de footer
- **Meertalige changelog** - Changelog beschikbaar in Nederlands, Engels en Duits

### Verbeterd

- Backup gebruikt nu originele bestandsnamen in plaats van UUID-namen
- Bestandsnamen bij PDF splitsen behouden spaties binnen veldwaarden

### Opgelost

- PDF download authenticatie werkt nu correct (token als query parameter)
- Lokale PDF.js worker voor betere compatibiliteit
- Resultaten verdwijnen niet meer na opslaan als muziekstuk

## [1.5.0] - 2026-02-05

### Toegevoegd

- **Laatste login zichtbaar** - In het ledenoverzicht is nu te zien wanneer een gebruiker voor het laatst heeft ingelogd
- **SMTP-instellingen via UI** - E-mailinstellingen kunnen nu via de admin-instellingen worden geconfigureerd, inclusief testmail functie
- **Uitgebreide genrelijst** - Genres vervangen door uitgebreide Engelse lijst met 48 genres
- **Nieuwe instrumenten** - Conductor, Alto Clarinet en Vocals toegevoegd
- **Extra instrument aliassen** - Meer aliassen voor bestaande instrumenten (Bariton Saxophone, Horn, Drumset, etc.)

### Opgelost

- Repetities verwijderen werkt nu betrouwbaar (changes() timing fix)

## [1.4.0] - 2026-02-04

### Toegevoegd

- **Microsoft 365 / Entra ID login** - Gebruikers kunnen inloggen met hun Microsoft 365 account
- **Taaldetectie** - Automatische taaldetectie op basis van browserinstellingen
- **Onboarding tours** - Rondleidingen voor nieuwe gebruikers per rol

### Opgelost

- Metronoom volume fix (eerste klik even luid als de rest)
- Auto-logout en rate limiting verbeteringen

## [1.3.0] - 2026-02-03

### Toegevoegd

- **Bulk selectie en verwijderen** - Meerdere muziekstukken tegelijk selecteren en verwijderen
- **Nieuwe lijst bij upload** - Direct een nieuwe lijst aanmaken tijdens het uploaden
- **Dirigent rol** - Aparte rol voor dirigenten met toegang tot proefplanning

### Verbeterd

- Orkest-groepering op Mijn Muziek pagina
- Download .pdf_ extensie fix

## [1.2.0] - 2026-02-02

### Toegevoegd

- **Thema-systeem** - Kleuren, lettertype en vormgeving aanpasbaar per vereniging
- **Configureerbaar logo en naam** - Verenigingsnaam en logo op loginscherm en navigatie
- **Proefplanning** - Proeven plannen met repertoire en Spond-integratie
- **MyMusic accordeon** - Stukken gegroepeerd per titel met uitklapbare stemmen

## [1.1.0] - 2026-02-01

### Toegevoegd

- **Backup en restore** - Volledige database en bestanden backup/restore
- **WCAG 2.1 AA toegankelijkheid** - Verbeterde toegankelijkheid voor screenreaders
- **Meertaligheid** - Nederlands, Engels en Duits ondersteund

## [1.0.0] - 2026-01-15

### Eerste release

- Muziekbibliotheek beheer
- Gebruikers- en orkestbeheer
- PDF upload en verwerking
- Instrumenten en genres beheer
- Uitleenadministratie
- Statistieken
