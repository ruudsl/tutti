# Importeren uit een spreadsheet

Een vereniging die overstapt, heeft haar leden en haar muziekbibliotheek meestal
in Excel. Onder **Beheer → Importeren** lees je die in. De muziekcommissie vindt
het onder **Bibliotheek**.

1. Sla het werkblad op als CSV (in Excel: _Opslaan als_ → _CSV_).
2. Kies het bestand. Je ziet per regel wat er gaat gebeuren; er verandert nog
   niets.
3. Klik op importeren. De server beoordeelt het bestand opnieuw en neemt de
   regels over die `nieuw` zijn.

Per regel is de uitkomst:

| Uitkomst | Betekenis                         |
| -------- | --------------------------------- |
| Nieuw    | Wordt geïmporteerd                |
| Bestaat  | Staat er al en wordt overgeslagen |
| Fout     | Kan niet, met de reden erbij      |

Een waarschuwing houdt een regel niet tegen. Het gegeven waar hij over gaat valt
dan weg, bijvoorbeeld een instrument dat Tutti niet kent. Twee keer hetzelfde
bestand importeren is dus veilig: de tweede keer is alles `bestaat`.

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

## Wat (nog) niet kan

- Instrumenten en materiaal in bezit, uniformen en contacten importeren.
- Een bestaand lid of een bestaande titel bijwerken vanuit een spreadsheet: een
  import voegt alleen toe.
- Onbekende orkesten, instrumenten of genres laten aanmaken.

De techniek staat in `backend/src/services/importeren.ts` en
`backend/src/utils/csvLezen.ts`; de API in [API.md](./API.md#import-api).
