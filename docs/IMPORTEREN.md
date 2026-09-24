# Importeren uit een spreadsheet

Een vereniging die overstapt, heeft haar leden, haar muziekbibliotheek, haar
instrumenten, uniformen, apparatuur en contacten meestal in Excel. Onder **Beheer → Importeren**
lees je die in.

| Soort                 | Wie                              | Module            |
| --------------------- | -------------------------------- | ----------------- |
| Leden                 | beheerder                        | —                 |
| Muziekbibliotheek     | beheerder, muziekcommissie       | —                 |
| Instrumenten in bezit | beheerder, instrumentencommissie | Inventaris        |
| Contacten             | beheerder, muziekcommissie       | Externe contacten |
| Uniformen             | beheerder, uniformcommissie      | Inventaris        |
| Apparatuur            | beheerder, instrumentencommissie | Inventaris        |

De muziekcommissie vindt het importeren onder **Bibliotheek**, de
instrumentencommissie onder **Inventaris**. Staat een module uit, dan is die
soort er niet, ook niet via de API.

1. Sla het werkblad op als CSV (in Excel: _Opslaan als_ → _CSV_).
2. Kies het bestand. Je ziet per regel wat er gaat gebeuren; er verandert nog
   niets.
3. Klik op importeren. De server beoordeelt het bestand opnieuw en neemt de
   regels over die `nieuw` zijn, en met _Bestaande gegevens bijwerken_ ook de
   regels die `bijwerken` zijn.

Per regel is de uitkomst:

| Uitkomst  | Betekenis                                    |
| --------- | -------------------------------------------- |
| Nieuw     | Wordt geïmporteerd                           |
| Bestaat   | Staat er al en wordt overgeslagen            |
| Bijwerken | Staat er al; wat anders is wordt overgenomen |
| Fout      | Kan niet, met de reden erbij                 |

Een waarschuwing houdt een regel niet tegen. Het gegeven waar hij over gaat valt
dan weg, bijvoorbeeld een instrument dat Tutti niet kent. Twee keer hetzelfde
bestand importeren is dus veilig: de tweede keer is alles `bestaat`.

### Bestaande gegevens bijwerken

Vink _Bestaande gegevens bijwerken_ aan om rijen die er al zijn bij te werken
met wat in het bestand anders is: een nieuw telefoonnummer, een instrument dat
naar een andere kast is verhuisd. Het voorbeeld toont per regel welk veld van
wat naar wat gaat; een regel waarin niets verschilt blijft `bestaat`.

- **Een lege cel wist niets.** Staat het merk niet in het bestand, dan blijft
  het merk dat er was. Leegmaken doe je in het scherm.
- **Een waarde die niet te lezen is, laat het oude staan.** Een onbekende
  status of een bedrag als `veel` is een waarschuwing, en wordt niet de
  standaardwaarde.
- **De sleutel verandert niet.** Wat bepaalt dat een regel al bestaat (het
  e-mailadres, het serienummer, de titel met arrangeur) blijft hetzelfde; wat
  erna komt kan wel veranderen. Een instrument dat op serienummer is gevonden,
  kan zo een andere naam krijgen.
- **Wat je kunt bijwerken:**
  - _Leden:_ voornaam, achternaam en privé-e-mail. De rol niet: die verandert
    wat iemand mag, en dat beslist een beheerder per persoon. Een lid dat ook
    bij een andere vereniging hoort, wordt niet bijgewerkt; zijn naam is daar
    ook zichtbaar.
  - _Muziekbibliotheek:_ componist, duur en graad. Genres niet.
  - _Instrumenten en apparatuur:_ alle velden behalve de categorie van
    apparatuur. Verandert het laatste onderhoud of het interval, dan wordt het
    volgende onderhoud opnieuw uitgerekend.
  - _Contacten:_ alle velden behalve de categorieën.
  - _Uniformen_ kunnen niet bijgewerkt worden: ze hebben geen sleutel.

## Het bestand

- **Scheidingsteken:** puntkomma, komma of tab. Tutti ziet zelf welke het is.
- **Tekenset:** UTF-8, of Windows-1252 zoals Excel op Windows opslaat.
- **Kopregel:** de eerste regel bevat de kolomnamen. Hoofdletters, spaties,
  streepjes en accenten tellen niet mee; wat tussen haakjes staat ook niet, dus
  `Duur (sec)` is `Duur`.
- **Kolommen die Tutti niet kent** worden genoemd en niet gelezen.
- **Hooguit 2000 regels** per bestand.
- **Meerdere waarden in één cel**, zoals twee instrumenten, scheid je met een
  komma, puntkomma, schuine streep of `|`.

Een Excel-bestand (.xlsx) zelf wordt niet gelezen: daarvoor zou een extra
bibliotheek nodig zijn, en elk spreadsheetprogramma kan als CSV opslaan. Op de
importpagina staat per soort een voorbeeldbestand om te downloaden.

## Leden

Alleen de beheerder mag leden importeren.

| Veld          | Herkende kolomnamen (een greep)                    | Verplicht |
| ------------- | -------------------------------------------------- | --------- |
| Voornaam      | Voornaam, Roepnaam, First name, Vorname            | ja        |
| Tussenvoegsel | Tussenvoegsel, Prefix, Namenszusatz                | nee       |
| Achternaam    | Achternaam, Last name, Surname, Nachname           | ja        |
| E-mail        | E-mail, Email, E-mailadres, E-Mail-Adresse         | ja        |
| Rol           | Rol, Role, Rolle                                   | nee       |
| Instrumenten  | Instrument, Instrumenten, Instruments, Instrumente | nee       |
| Orkesten      | Orkest, Orkesten, Orchestra, Orchester, Ensemble   | nee       |
| Privé-e-mail  | Privé-e-mail, Private email                        | nee       |

- **Tussenvoegsel:** komt voor de achternaam (`de` + `Vries` wordt `de Vries`).
- **Rol:** zonder rol wordt iemand lid. De namen uit het scherm worden herkend
  in drie talen (`Dirigent`, `Muziekcommissie`, `Music Committee`,
  `Materialausschuss`), en ook de technische naam (`conductor`). Een onbekende
  rol is een fout, geen gok.
- **Instrumenten:** worden gezocht op naam en op de andere namen van een
  instrument. Een onbekend instrument is een waarschuwing.
- **Orkesten:** moeten al bestaan in de vereniging. Een onbekend orkest is een
  waarschuwing.
- **Een lid bestaat al** als het e-mailadres al bij deze vereniging hoort.
- **Een fout** is:
  - een e-mailadres dat bij een account van een andere vereniging hoort
    (e-mailadressen zijn uniek over de hele installatie);
  - een adres dat twee keer in het bestand staat;
  - een regel boven de ledengrens van het abonnement.
- **Geen mail, geen wachtwoord:** geïmporteerde leden krijgen geen mail en geen
  wachtwoord dat iemand kent. Ze stellen er een in via _Wachtwoord vergeten_, of
  de beheerder stuurt uitnodigingen wanneer de vereniging er klaar voor is. Een
  import van tachtig leden hoort niet ongevraagd tachtig mails te versturen.

## Muziekbibliotheek

De beheerder en de muziekcommissie mogen titels importeren.

| Veld      | Herkende kolomnamen (een greep)      | Verplicht |
| --------- | ------------------------------------ | --------- |
| Titel     | Titel, Title, Werk, Stuk             | ja        |
| Componist | Componist, Composer, Komponist       | nee       |
| Arrangeur | Arrangeur, Arranger, Arr, Bearbeiter | nee       |
| Duur      | Duur, Duration, Dauer, Speelduur     | nee       |
| Graad     | Graad, Grade, Niveau, Moeilijkheid   | nee       |
| Genre     | Genre, Genres, Stijl, Gattung        | nee       |

- **Een titel bestaat al** als de vereniging hem al heeft met dezelfde
  arrangeur. Een andere arrangeur is een andere titel, net als in het scherm.
- **Duur:** leest `5:30`, `1:05:30`, `330` (seconden) en `5 min`.
- **Genres:** moeten al bestaan. Een onbekend genre is een waarschuwing.
- **De repertoire-export teruglezen:** de CSV-export van een repertoire
  (`/api/interop/orchestras/:id/repertoire.csv`) is zo weer in te lezen. De
  kolommen `ID`, `Werk nummer` en `Deel` worden overgeslagen.

## Instrumenten in bezit

| Veld         | Herkende kolomnamen (een greep)                 | Verplicht |
| ------------ | ----------------------------------------------- | --------- |
| Naam         | Naam, Omschrijving, Name, Bezeichnung           | ja        |
| Soort        | Soort, Instrument, Type, Instrumentart          | ja        |
| Categorie    | Categorie, Category, Kategorie, Groep           | nee       |
| Merk, model  | Merk, Brand, Marke; Model, Modell               | nee       |
| Serienummer  | Serienummer, Serial number, Seriennummer        | nee       |
| Bouwjaar     | Bouwjaar, Jaar, Year, Baujahr                   | nee       |
| Aankoopdatum | Aankoopdatum, Purchase date, Kaufdatum          | nee       |
| Aankoopprijs | Aankoopprijs, Prijs, Purchase price, Kaufpreis  | nee       |
| Waarde       | Waarde, Huidige waarde, Current value, Zeitwert | nee       |
| Status       | Status, Beschikbaarheid                         | nee       |
| Staat        | Staat, Conditie, Condition, Zustand             | nee       |
| Locatie      | Locatie, Opslag, Location, Standort             | nee       |
| Opmerkingen  | Opmerkingen, Notities, Notes, Bemerkungen       | nee       |

- **Een instrument bestaat al** als de vereniging er een heeft met hetzelfde
  serienummer. Zonder serienummer is de naam de sleutel ("Trompet 3").
- **Categorie, status en staat** worden herkend in drie talen: `Koperblazers`,
  `uitgeleend`, `goed`, `Blechbläser`, `verliehen`. Zonder waarde wordt het
  _overig_, _beschikbaar_ en _goed_; een onbekende waarde is een waarschuwing en
  wordt ook die standaardwaarde.
- **Bedragen:** `1.249,50`, `€ 1249.50` en `1249`.
- **Datums:** `2016-03-15`, `15-03-2016`, `15/3/2016` en `15.03.2016`. Een datum
  die niet bestaat, zoals 31 februari, is een waarschuwing.

## Contacten

| Veld           | Herkende kolomnamen (een greep)                  | Verplicht |
| -------------- | ------------------------------------------------ | --------- |
| Naam           | Naam, Organisatie, Bedrijf, Name, Firma          | ja        |
| Soort          | Soort, Type, Art                                 | nee       |
| Contactpersoon | Contactpersoon, Contact person, Ansprechpartner  | nee       |
| E-mail         | E-mail, Email, E-Mail-Adresse                    | nee       |
| Telefoon       | Telefoon, Mobiel, Phone, Telefon, Handy          | nee       |
| Adres          | Adres, Postcode, Plaats, Land (elk een kolom)    | nee       |
| IBAN           | IBAN, Rekeningnummer, Kontonummer                | nee       |
| Website        | Website, Webseite, URL                           | nee       |
| KvK, btw       | KvK-nummer, Chamber of commerce; Btw-nummer, VAT | nee       |
| Categorie      | Categorie, Category, Kategorie                   | nee       |
| Opmerkingen    | Opmerkingen, Notities, Notes                     | nee       |

- **Een contact bestaat al** als de vereniging een contact met dezelfde naam
  heeft.
- **Soort:** _organisatie_, _persoon_, _zaal_ of _leverancier_, ook in het
  Engels en Duits. Zonder soort wordt het een organisatie.
- **Ongeldige waarden:** een e-mailadres, IBAN of website dat niet klopt, is een
  waarschuwing en wordt niet overgenomen. Een IBAN wordt zonder spaties
  opgeslagen, een website zonder `https://` krijgt dat ervoor.
- **Categorieën** moeten al bestaan.

## Uniformen

| Veld           | Herkende kolomnamen (een greep)                  | Verplicht |
| -------------- | ------------------------------------------------ | --------- |
| Soort          | Soort, Onderdeel, Type, Art                      | ja        |
| Maat           | Maat, Size, Größe                                | nee       |
| Lengte, wijdte | Lengte, Length, Länge; Wijdte, Taille, Weite     | nee       |
| Kleur          | Kleur, Color, Farbe                              | nee       |
| Aantal         | Aantal, Stuks, Quantity, Anzahl                  | nee       |
| Staat          | Staat, Conditie, Condition, Zustand              | nee       |
| Status         | Status, Beschikbaarheid                          | nee       |
| Uitgegeven aan | Uitgegeven aan, Drager, Lid, E-mail, Issued to   | nee       |
| Uitgiftedatum  | Uitgiftedatum, Uitgegeven op, Ausgabedatum       | nee       |
| Aankoop        | Aankoopdatum, Aankoopprijs, Purchase date, Preis | nee       |
| Opmerkingen    | Opmerkingen, Notities, Notes                     | nee       |

- **Een onderdeel heeft geen nummer.** Vier jassen in maat 52 zijn vier gelijke
  onderdelen; schrijf ze als één regel met `Aantal` 4. Of iets al bestaat,
  bepaalt het aantal: zijn er al twee jassen van dezelfde soort, maat, kleur en
  drager, dan worden er van die vier nog twee toegevoegd. Hetzelfde bestand
  twee keer inlezen verdubbelt dus niets. Staat en status tellen daarbij niet
  mee, die veranderen met de tijd.
- **Soort:** _jas_, _broek_, _gilet_, _stropdas_, _sjaal_, _polo_, _regenjas_,
  _overhemd_, _schoenen_ of _hoed/pet_, ook in het Engels en Duits. Een
  onbekende soort wordt _overig_, met de naam uit het bestand in de
  opmerkingen.
- **Uitgegeven aan** is het e-mailadres van een lid van de vereniging. Het
  onderdeel krijgt dan de status _uitgegeven_ en een uitgifte, zoals bij het
  uitgeven op de pagina Uniformen, met de uitgiftedatum of anders vandaag. Een
  regel met een drager heeft aantal 1. Een adres dat geen lid is, is een
  waarschuwing: het onderdeel komt er dan zonder drager bij. Uitgegeven zonder
  drager kan niet; dat wordt _beschikbaar_.
- **Staat:** _goed_, _redelijk_ of _slecht_; _nieuw_ en _uitstekend_ worden
  _goed_, _versleten_ wordt _slecht_.

## Apparatuur

Geluid, licht, lessenaars, een aanhanger: wat de vereniging bezit en geen
instrument is. Instrumenten hebben hun eigen soort hierboven.

| Veld             | Herkende kolomnamen (een greep)                    | Verplicht |
| ---------------- | -------------------------------------------------- | --------- |
| Naam             | Naam, Omschrijving, Name, Bezeichnung              | ja        |
| Soort            | Soort, Type, Art                                   | nee       |
| Categorie        | Categorie, Category, Kategorie, Groep              | nee       |
| Inventarisnummer | Inventarisnummer, Inventory number, Inventarnummer | nee       |
| Serienummer      | Serienummer, Serial number, Seriennummer           | nee       |
| Merk, model      | Merk, Brand, Marke; Model, Modell                  | nee       |
| Status, staat    | Status, Beschikbaarheid; Staat, Conditie, Zustand  | nee       |
| Locatie, opslag  | Locatie, Location, Standort; Opslag, Lagerort      | nee       |
| Aankoop, waarde  | Aankoopdatum, Aankoopprijs, Waarde, Zeitwert       | nee       |
| Garantie tot     | Garantie tot, Warranty, Garantie bis               | nee       |
| Onderhoud        | Laatste onderhoud, Onderhoudsinterval (in maanden) | nee       |
| Uitleenbaar      | Uitleenbaar, Loanable, Ausleihbar                  | nee       |
| Opmerkingen      | Opmerkingen, Notities, Notes                       | nee       |

- **Apparatuur bestaat al** als de vereniging er een heeft met hetzelfde
  inventarisnummer. Zonder inventarisnummer telt het serienummer, en zonder
  beide de naam.
- **Inventarisnummer:** zonder nummer krijgt een stuk er een in dezelfde reeks
  als op de pagina Apparatuur (`EQ-00001`). Het voorbeeld toont welk nummer.
- **Soort:** _instrument_, _accessoire_, _geluid_, _licht_, _meubilair_,
  _vervoer_ of _overig_, ook in het Engels en Duits. Zonder soort wordt het
  _overig_.
- **Onderhoud:** met een laatste onderhoud en een interval (`12` of
  `12 maanden`) staat het volgende onderhoud er meteen in.
- **Uitleenbaar:** _ja_ of _nee_; zonder waarde _ja_.
- **Categorieën** moeten al bestaan.

## Wat (nog) niet kan

- Concertkleding importeren.
- Iets leegmaken of weghalen vanuit een spreadsheet, en genres, categorieën,
  instrumenten of orkesten van bestaande rijen bijwerken.
- Onbekende orkesten, instrumenten of genres laten aanmaken.

De techniek staat in `backend/src/services/importeren/` en
`backend/src/utils/csvLezen.ts`; de API in [API.md](./API.md#import-api).
