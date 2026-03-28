# Changelog

Alle belangrijke wijzigingen in deze applicatie worden hier gedocumenteerd.

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
