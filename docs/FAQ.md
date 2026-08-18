# Veelgestelde Vragen (FAQ)

## Installatie

### Welke Node.js versie heb ik nodig?

Tutti vereist **Node.js 18 of hoger**. We raden Node.js 20+ aan voor de beste prestaties. Controleer je versie met:

```bash
node --version  # Moet v18.0.0 of hoger zijn
```

### De installatie mislukt met npm errors

**Mogelijke oorzaken en oplossingen:**

1. **Verouderde npm versie**

   ```bash
   npm install -g npm@latest
   ```

2. **Cache problemen**

   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Onvoldoende rechten**
   Gebruik geen `sudo npm install`. Configureer npm correct:
   ```bash
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH
   ```

### Docker geeft permissie-fouten

Zorg dat je gebruiker lid is van de docker-groep:

```bash
sudo usermod -aG docker $USER
# Log uit en opnieuw in
```

---

## Inloggen & Authenticatie

### Ik ben mijn wachtwoord vergeten

1. Klik op "Wachtwoord vergeten" op de inlogpagina
2. Voer je e-mailadres in
3. Controleer je inbox (en spam-folder) voor de reset-link
4. De link is 1 uur geldig

**Let op:** De wachtwoord-reset functie werkt alleen als SMTP correct is geconfigureerd.

### Ik krijg "Invalid credentials" maar mijn wachtwoord is correct

**Controleer:**

1. **Caps Lock** — Wachtwoorden zijn hoofdlettergevoelig
2. **Spaties** — Geen extra spaties voor of na het wachtwoord
3. **E-mailadres** — Gebruik exact het geregistreerde e-mailadres
4. **Account status** — Je account kan geblokkeerd zijn na te veel pogingen

**Oplossing bij blokkade:**
Wacht 15 minuten of vraag een beheerder om je account te deblokkeren.

### MFA/Tweefactorauthenticatie werkt niet

1. **Controleer de tijd** — Je telefoon en de server moeten gesynchroniseerde tijd hebben
2. **Gebruik de juiste code** — Codes zijn 30 seconden geldig
3. **Nieuw apparaat** — Vraag een beheerder om MFA te resetten

### Microsoft SSO werkt niet

**Controleer bij je beheerder:**

- Is SSO geconfigureerd voor je organisatie?
- Is je Microsoft-account gekoppeld?
- Zijn de Azure Entra ID-instellingen correct?

---

## Muziek Uploaden

### Welke bestandsformaten worden ondersteund?

| Type        | Formaten        |
| ----------- | --------------- |
| Bladmuziek  | PDF             |
| Audio       | MP3, WAV, M4A   |
| Bulk upload | ZIP (met PDF's) |

### Het uploaden mislukt

**Mogelijke oorzaken:**

1. **Bestand te groot** — Maximum is standaard 25 MB per bestand
2. **Verkeerd formaat** — Alleen PDF is toegestaan voor bladmuziek
3. **Bestandsnaam** — Vermijd speciale tekens in de bestandsnaam
4. **Onvoldoende schijfruimte** — Controleer de beschikbare opslagruimte

### Hoe werkt het bestandsnaamformaat?

Tutti kan metadata automatisch uit de bestandsnaam halen:

```
Titel_arrangeur_instrument_toonsoort_groepnummer_sleutel.pdf
```

**Voorbeelden:**

- `Bohemian Rhapsody_arr. Wasson_Klarinet_Bb_1_sol.pdf`
- `Abba Gold_Ron Sebregts_Altsax_Eb__sol.pdf`

**Onderdelen:**

- **Titel** — Naam van het muziekstuk
- **Arrangeur** — Naam van de arrangeur
- **Instrument** — Volledig instrument of afkorting
- **Toonsoort** — Bb, Eb, C, F (leeg = C)
- **Groepnummer** — Voor dubbele bezetting (1, 2, 3)
- **Sleutel** — sol (G-sleutel) of fa (F-sleutel)

### Kan ik muziek delen met andere verenigingen?

Ja, beheerders kunnen muziekstukken delen met partner-organisaties. Dit is handig voor samenwerkingen of uitleningen.

---

## Offline Modus

### Werkt Tutti offline?

Ja, Tutti is een Progressive Web App (PWA) met offline-ondersteuning:

- **Eerder bekeken muziek** blijft beschikbaar
- **PDF's** worden gecached voor offline toegang
- **Wijzigingen** worden gesynchroniseerd zodra je weer online bent

### Hoe installeer ik de offline versie?

De browser toont automatisch een "Installeren" optie wanneer je de app gebruikt. Je kunt ook:

1. Open Tutti in je browser
2. Klik op het installatie-icoon in de adresbalk (of menu > "Installeren")
3. Volg de instructies

---

## Mobiele App (PWA)

### Hoe installeer ik Tutti op mijn telefoon?

**iPhone/iPad (Safari):**

1. Open Tutti in Safari
2. Tik op het deel-icoon (vierkant met pijl omhoog)
3. Scroll naar "Zet op beginscherm"
4. Tik op "Voeg toe"

**Android (Chrome):**

1. Open Tutti in Chrome
2. Tik op de drie puntjes (menu)
3. Kies "Toevoegen aan startscherm"
4. Bevestig de installatie

**Desktop (Chrome/Edge):**

1. Open Tutti in je browser
2. Klik op het installatie-icoon in de adresbalk
3. Klik op "Installeren"

### De PWA werkt niet goed

**Probeer:**

1. **Cache wissen** — Instellingen > Opslag > Wis gegevens
2. **Opnieuw installeren** — Verwijder en installeer de app opnieuw
3. **Browser updaten** — Gebruik de nieuwste versie van je browser

---

## Meertaligheid

### Welke talen worden ondersteund?

Tutti ondersteunt drie talen:

- **Nederlands** (standaard)
- **Engels**
- **Duits**

### Hoe wijzig ik de taal?

1. Klik op je profielicoon (rechtsboven)
2. Ga naar "Instellingen" of "Profiel"
3. Selecteer je gewenste taal
4. De interface wordt direct bijgewerkt

### Kan ik vertalingen verbeteren?

Ja! Tutti is open source. Vertalingen staan in:

```
frontend/src/locales/
  nl.json  # Nederlands
  en.json  # Engels
  de.json  # Duits
```

Maak een pull request met je verbeteringen.

---

## Rollen & Rechten

### Welke rollen zijn er?

| Rol                 | Rechten                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| **Lid**             | Eigen bladmuziek bekijken/downloaden, profiel beheren                            |
| **Sectie-leider**   | Alle lid-rechten + eigen instrumentsectie beheren                                |
| **Dirigent**        | Alle lid-rechten + repetities en concertprogramma's beheren                      |
| **Muziekcommissie** | Alle dirigent-rechten + muziek uploaden, instrumenten beheren, issues afhandelen |
| **Beheerder**       | Volledige toegang: ledenbeheer, instellingen, backup/restore                     |

### Ik kan bepaalde functies niet zien

Je rechten worden bepaald door je rol. Neem contact op met je organisatiebeheerder om je rol te wijzigen.

### Wat is het verschil tussen beheerder en super-admin?

- **Beheerder** — Beheert een enkele organisatie
- **Super-admin** — Platform-niveau toegang tot alle organisaties

Super-admins kunnen:

- Alle organisaties beheren
- Nieuwe organisaties aanmaken
- Andere super-admins aanwijzen

---

## Data & Backup

### Hoe maak ik een backup?

**Als beheerder:**

1. Ga naar Instellingen > Backup
2. Klik op "Backup maken"
3. Download het ZIP-bestand

**Via CLI (Docker):**

```bash
./scripts/backup.sh --docker /pad/naar/backups
```

### Hoe herstel ik een backup?

**Als beheerder:**

1. Ga naar Instellingen > Backup
2. Klik op "Backup herstellen"
3. Upload het ZIP-bestand
4. Bevestig het herstel (let op: dit overschrijft alle data!)

**Via CLI (Docker):**

```bash
docker compose down
./scripts/restore.sh backup.tar.gz --docker
docker compose up -d
```

### Hoe exporteer ik mijn persoonlijke gegevens (AVG/GDPR)?

1. Ga naar Profiel > Instellingen
2. Klik op "Exporteer mijn gegevens"
3. Je ontvangt een bestand met al je persoonlijke data

### Hoe lang worden backups bewaard?

Dit hangt af van je configuratie. Wij raden aan:

- **Dagelijkse backups** — Bewaar minimaal 7 dagen
- **Wekelijkse backups** — Bewaar minimaal 4 weken
- **Maandelijkse backups** — Bewaar minimaal 12 maanden

---

## Overige Vragen

### Hoe voeg ik een nieuw orkest toe?

1. Ga naar Beheer > Orkesten
2. Klik op "Nieuw orkest"
3. Vul de naam en standaard repetitiedagen in
4. Voeg leden toe aan het orkest

### Werkt Tutti met Spond?

Ja! Tutti kan integreren met Spond voor automatische aanwezigheidsregistratie:

1. Ga naar Instellingen > Integraties
2. Configureer je Spond-API-gegevens
3. Koppel je orkesten aan Spond-groepen

### Hoe werkt de metronoom/stemapparaat?

Tutti heeft ingebouwde muziektools:

1. Klik op "Tools" in het menu
2. Kies "Metronoom" of "Stemapparaat"
3. De tools werken direct in je browser

### Waar vind ik hulp?

- **Documentatie:** [github.com/ruudsl/tutti/wiki](https://github.com/ruudsl/tutti/wiki)
- **GitHub Issues:** [github.com/ruudsl/tutti/issues](https://github.com/ruudsl/tutti/issues)
- **Discussies:** [github.com/ruudsl/tutti/discussions](https://github.com/ruudsl/tutti/discussions)
