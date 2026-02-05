# Changelog

Alle belangrijke wijzigingen in deze applicatie worden hier gedocumenteerd.

## [1.5.0] - 2025-02-05

### Toegevoegd
- **Laatste login zichtbaar** - In het ledenoverzicht is nu te zien wanneer een gebruiker voor het laatst heeft ingelogd
- **SMTP-instellingen via UI** - E-mailinstellingen kunnen nu via de admin-instellingen worden geconfigureerd, inclusief testmail functie
- **Uitgebreide genrelijst** - Genres vervangen door uitgebreide Engelse lijst met 48 genres
- **Nieuwe instrumenten** - Conductor, Alto Clarinet en Vocals toegevoegd
- **Extra instrument aliassen** - Meer aliassen voor bestaande instrumenten (Bariton Saxophone, Horn, Drumset, etc.)

### Opgelost
- Repetities verwijderen werkt nu betrouwbaar (changes() timing fix)

## [1.4.0] - 2025-02-04

### Toegevoegd
- **Microsoft 365 / Entra ID login** - Gebruikers kunnen inloggen met hun Microsoft 365 account
- **Taaldetectie** - Automatische taaldetectie op basis van browserinstellingen
- **Onboarding tours** - Rondleidingen voor nieuwe gebruikers per rol

### Opgelost
- Metronoom volume fix (eerste klik even luid als de rest)
- Auto-logout en rate limiting verbeteringen

## [1.3.0] - 2025-02-03

### Toegevoegd
- **Bulk selectie en verwijderen** - Meerdere muziekstukken tegelijk selecteren en verwijderen
- **Nieuwe lijst bij upload** - Direct een nieuwe lijst aanmaken tijdens het uploaden
- **Dirigent rol** - Aparte rol voor dirigenten met toegang tot proefplanning

### Verbeterd
- Orkest-groepering op Mijn Muziek pagina
- Download .pdf_ extensie fix

## [1.2.0] - 2025-02-02

### Toegevoegd
- **Thema-systeem** - Kleuren, lettertype en vormgeving aanpasbaar per vereniging
- **Configureerbaar logo en naam** - Verenigingsnaam en logo op loginscherm en navigatie
- **Proefplanning** - Proeven plannen met repertoire en Spond-integratie
- **MyMusic accordeon** - Stukken gegroepeerd per titel met uitklapbare stemmen

## [1.1.0] - 2025-02-01

### Toegevoegd
- **Backup en restore** - Volledige database en bestanden backup/restore
- **WCAG 2.1 AA toegankelijkheid** - Verbeterde toegankelijkheid voor screenreaders
- **Meertaligheid** - Nederlands, Engels en Duits ondersteund

## [1.0.0] - 2025-01-15

### Eerste release
- Muziekbibliotheek beheer
- Gebruikers- en orkestbeheer
- PDF upload en verwerking
- Instrumenten en genres beheer
- Uitleenadministratie
- Statistieken
