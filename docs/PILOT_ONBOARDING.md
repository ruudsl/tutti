# Een pilotvereniging aan de slag

Deze handleiding is voor de eerste weken van een vereniging op Tutti: wie
wat doet, in welke volgorde, en wat je beter vooraf weet. Ze hoort bij WP11
van de [roadmap](../ROADMAP.md#wp11-pilot-deployments-2-3-verenigingen).

Er zijn twee rollen in dit verhaal:

- **De platformbeheerder** (in Tutti: _superbeheerder_) beheert de installatie
  en maakt verenigingen aan. Bij een gehoste pilot is dat de ontwikkelaar,
  bij zelf hosten iemand van de vereniging.
- **De beheerder van de vereniging** (rol _admin_) richt de eigen vereniging
  in. Hij ziet alleen zijn eigen vereniging.

Alles hieronder is nagelopen tegen de code van versie 1.19.

---

## 1. Platformbeheerder: de vereniging klaarzetten

### Op een nieuwe installatie

Bij de allereerste start maakt Tutti zelf aan (`backend/src/database/init.ts`):

- een vereniging _Harmonie_ met één orkest, _Groot Orkest_;
- de gebruiker `admin@harmonie.nl`, beheerder van die vereniging én
  superbeheerder.

Het wachtwoord is `ADMIN_INIT_PASSWORD`, of anders een willekeurig wachtwoord
in `data/admin-password.txt`. Bewaar het en verwijder dat bestand. Zie
[SELF_HOSTING.md](./SELF_HOSTING.md).

Is de installatie voor één vereniging, hernoem _Harmonie_ dan onder
**Instellingen → Vereniging** en ga door naar stap 2.

### Een vereniging bij een bestaande installatie

1. **Vereniging aanmaken:** **Beheer → Verenigingen** (`/multi-association`),
   tabblad _Verenigingen_. Alleen een superbeheerder ziet die pagina. Er wordt
   alleen de vereniging aangemaakt: geen orkest, geen gebruikers.
2. **Wisselen** naar de nieuwe vereniging met de verenigingskiezer in de kop.
   Een superbeheerder mag dat bij elke vereniging.
3. **De eerste beheerder aanmaken:** **Beheer → Leden** (`/users`) → nieuwe
   gebruiker met rol _Beheerder_. Het lid komt in de vereniging waarin je nu
   staat. Je kiest een tijdelijk wachtwoord; bij de eerste keer inloggen moet
   hij een eigen kiezen. Als e-mail werkt, krijgt hij een welkomstmail met de
   link naar het inlogscherm (zonder wachtwoord - dat geef je zelf door).
4. Terugwisselen naar je eigen vereniging.

Er is geen zelfregistratie: een vereniging kan zich niet zelf aanmelden.

### Wat alleen de platformbeheerder kan

- **Reservekopieën.** Een reservekopie bevat de hele installatie, alle
  verenigingen samen. Daarom kan alleen de superbeheerder er een maken of
  terugzetten. Een vereniging kan zelf geen kopie van alleen haar eigen
  gegevens maken; spreek af hoe vaak de platformbeheerder er een maakt en waar
  hij ze bewaart. Zie [BACKUP_RESTORE.md](./BACKUP_RESTORE.md).
- **Een buitengesloten beheerder** weer binnenlaten, als _Wachtwoord vergeten_
  niet werkt. Zie [SELF_HOSTING.md](./SELF_HOSTING.md#reset-admin-password).
- **Het IP-filter voor beheerpagina's** (`IP_WHITELIST_ENABLED`). Dat staat in
  de serverconfiguratie, niet in de app.

---

## 2. Beheerder: de eerste week

Doe het in deze volgorde. Latere stappen leunen op eerdere.

| #   | Wat                                                     | Waar                                          |
| --- | ------------------------------------------------------- | --------------------------------------------- |
| 1   | Eigen wachtwoord kiezen, tweestapsverificatie aanzetten | Inloggen → **Dashboard → Accountbeveiliging** |
| 2   | Naam en logo van de vereniging                          | **Instellingen → Vereniging / Logo**          |
| 3   | E-mail (SMTP) instellen en testen                       | **Instellingen → E-mail (SMTP)**              |
| 4   | Kleuren en huisstijl                                    | **Thema** (`/theme`)                          |
| 5   | Modules kiezen                                          | **Modules** (`/modules`)                      |
| 6   | Orkesten aanmaken                                       | **Orkesten** (`/orchestras`)                  |
| 7   | Genres en instrumenten nalopen                          | **Genres**, **Instrumenten**                  |
| 8   | Bewaartermijnen vaststellen                             | **Beheer → AVG-beheer → Bewaring**            |
| 9   | Gegevens importeren                                     | **Importeren** (`/importeren`), zie §4        |
| 10  | Leden toegang geven                                     | zie §3                                        |

Toelichting bij een paar stappen:

- **E-mail eerst.** Zonder SMTP verstuurt Tutti niets: geen welkomstmail, geen
  _Wachtwoord vergeten_, geen herinneringen. Wie ooit zijn wachtwoord kwijt
  is, heeft dan de platformbeheerder nodig.
- **Tweestapsverificatie** stel je per account in; je kunt het niet voor de
  hele vereniging verplicht maken. Vraag in elk geval de beheerders het aan
  te zetten.
- **Modules.** Alles buiten de kern staat uit tot je het aanzet: boekhouding,
  kaartverkoop, inventaris (instrumenten, uniformen, apparatuur), contacten,
  peilingen, taken, wiki, aanwezigheid en meer. Uitzetten verbergt, het
  verwijdert niets. Begin klein; zet aan wat je in de pilot echt gebruikt. Zie
  [MODULES.md](./MODULES.md).
- **Genres en instrumenten.** Er is een standaardlijst voor alle verenigingen.
  Wat je niet gebruikt kun je verbergen; wat ontbreekt maak je zelf aan. Een
  standaarditem wijzigen kan niet - dat zou elke vereniging raken.
- **Bewaartermijnen.** Kies ze bewust; de standaardwaarden zijn een begin, geen
  advies. Zie [GDPR.md](./GDPR.md).

---

## 3. Leden toegang geven

Er zijn drie manieren. Kies per groep wat past.

**Eén voor één, met een tijdelijk wachtwoord** - **Beheer → Leden** (`/users`)
of **Beheer → Ledenbeheer** (`/onboarding`). De beheerder kiest of krijgt een tijdelijk
wachtwoord en geeft het zelf door; bij de eerste keer inloggen kiest het lid
een eigen. _Ledenbeheer_ maakt het wachtwoord zelf aan, toont het één keer en
kan ook een Microsoft 365-account aanmaken als die koppeling is ingesteld.
Geschikt voor bestuur en commissies.

**Met een spreadsheet** - **Importeren → Leden**. Handig voor de hele
vereniging tegelijk. Let op:

- Geïmporteerde leden krijgen **geen wachtwoord en geen mail**. Ze gaan naar
  het inlogscherm en kiezen **Wachtwoord vergeten**. Dat werkt alleen als
  e-mail is ingesteld (stap 3).
- Stuur ze zelf een bericht met de link en die ene instructie. Een
  voorbeeldtekst staat hieronder.
- De rol komt uit de kolom _Rol_; zonder rol wordt het _lid_.

**Uitnodigen per link** bestaat in de code, maar is voor een pilot nog niet
bruikbaar: alleen een superbeheerder kan uitnodigen, er gaat geen mail uit en
er is nog geen pagina om de uitnodiging aan te nemen. Gebruik een van de twee
manieren hierboven.

Voorbeeldbericht na een import:

> Onze vereniging gebruikt vanaf nu Tutti voor bladmuziek, repetities en
> concerten. Ga naar **[adres]**, klik op **Wachtwoord vergeten** en vul het
> e-mailadres in waarop je dit bericht krijgt. Je ontvangt een link om een
> wachtwoord te kiezen. Vragen? Mail **[naam beheerder]**.

---

## 4. Importeren: de volgorde

Elke import toont eerst een voorbeeld per regel; pas na bevestigen verandert
er iets. Een verwijzing naar iets dat nog niet bestaat (een orkest, een genre)
geeft een waarschuwing en wordt overgeslagen - de rest van de regel komt wel
binnen. Daarom deze volgorde:

1. **Met de hand aanmaken:** orkesten, eigen genres, contactcategorieën en
   apparatuurcategorieën.
2. **Leden** - koppelt aan orkesten en instrumenten.
3. **Muziektitels** - koppelt aan genres.
4. **Uniformen** - _Uitgegeven aan_ koppelt aan het e-mailadres van een lid,
   dus na de leden.
5. **Instrumenten in bezit, apparatuur, contacten** - in willekeurige
   volgorde. Instrumenten, uniformen en apparatuur vragen de module
   _Inventaris_, contacten de module _Externe contacten_.

Kolomnamen, synoniemen in drie talen en wat er (nog) niet kan:
[IMPORTEREN.md](./IMPORTEREN.md).

---

## 5. Privacy regelen vóór de eerste ledenimport

Een vereniging die ledengegevens in Tutti zet, is daarvoor verantwoordelijk.
Wie Tutti host, verwerkt ze in haar opdracht. Regel vooraf:

- **Verwerkersovereenkomst** tussen vereniging en host:
  [templates/DATA_PROCESSING_AGREEMENT.md](./templates/DATA_PROCESSING_AGREEMENT.md).
- **Privacyverklaring** voor de leden:
  [templates/PRIVACY_POLICY.md](./templates/PRIVACY_POLICY.md). Tutti heeft
  geen plek om die in de app te zetten; publiceer hem op de eigen website.
- **De beoordelingsvragen** in [PIA.md](./PIA.md) §9 - welke koppelingen
  aanstaan, wie superbeheerder is, welke restrisico's het bestuur accepteert.
- **Bewaartermijnen** (stap 8 hierboven).

Leden zien en downloaden hun eigen gegevens via **Jouw gegevens**
(`/data-export`) en stellen zelf in wie hun telefoonnummer en adres ziet
(**Privacy**, `/privacy-settings`).

---

## 6. Tijdens de pilot

**Afspraken vooraf.** Eén aanspreekpunt bij de vereniging, één bij de host.
Een vaste dag in de week waarop vragen en problemen worden doorgenomen.

**Problemen melden.** Onderaan elke pagina staat een feedbacklink naar de
issues op GitHub. Voor de meeste leden is dat een drempel; laat ze liever
melden bij het aanspreekpunt, dat bundelt en doorzet. Zet er bij: welke
pagina, wat je deed, wat je verwachtte, wat er gebeurde, en een schermafbeelding.

**Problemen met bladmuziek** (verkeerde partij, ontbrekende pagina) meldt een
lid in de app zelf, als de module _Meldingen_ aanstaat.

**Evaluatie.** Na vier weken een tussengesprek, aan het eind een
eindgesprek. Het sjabloon voor het verslag staat in
[templates/PILOT_FEEDBACK.md](./templates/PILOT_FEEDBACK.md).

---

## 7. Wat je vooraf moet weten

Eerlijk over wat er (nog) niet is, zodat het niet halverwege de pilot opvalt:

- Een vereniging kan **zelf geen reservekopie** maken (§1).
- **Tweestapsverificatie** is niet verplicht te stellen (§2).
- **Uitnodigen per link** werkt nog niet van begin tot eind (§3).
- Er is **geen plek voor de privacyverklaring** in de app (§5).
- **Concertkleding** is niet te importeren (de rest wel, §4).

Loopt de pilot hier tegenaan, zet het dan in het feedbackverslag. Dat bepaalt
wat er na de pilot het eerst gebouwd wordt.
