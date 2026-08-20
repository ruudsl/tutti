# Partnerschappen tussen verenigingen

Twee verenigingen op dezelfde installatie kunnen een partnerschap aangaan om een
deel van hun gegevens voor elkaar open te stellen. Dit is de enige plaats in
Tutti waar met opzet gegevens over de verenigingsgrens heen zichtbaar worden;
overal elders is die grens absoluut.

## Hoe het werkt

1. Een beheerder of bestuurslid vraagt een partnerschap aan bij een andere
   vereniging, onder **Meerdere verenigingen → Partnerschappen**. De keuzelijst
   komt uit `GET /multi-association/directory` en bevat alleen naam en plaats
   van actieve verenigingen.
2. Het verzoek komt binnen bij de andere vereniging met status `pending`. Daar
   keurt een beheerder het goed of wijst het af.
3. Pas bij status `active` gebeurt er iets. Beide kanten zien dan hetzelfde: het
   partnerschap is wederzijds en het maakt niet uit wie de aanvraag deed.
4. Beëindigen verwijdert het partnerschap; wat gedeeld werd verdwijnt meteen.

## Wat er gedeeld wordt

| Vlag            | Wat de partner ziet                                                                      | Wat de partner niet ziet                                                        |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `share_music`   | Muziektitels met `is_shared = 1`: titel, componist, arrangeur, duur, graad, YouTube-link | Titels die niet zijn opengesteld, `internal_notes`, de bladmuziekbestanden zelf |
| `share_events`  | Aankomende concerten: naam, datum, locatie, soort, omschrijving                          | Concerten die al zijn geweest, de notities, de bezetting                        |
| `share_members` | Nog niets — zie hieronder                                                                |                                                                                 |

Drie regels gelden overal:

- **Alleen lezen.** Er is geen route waarmee een partner iets van de ander kan
  aanpassen of verwijderen.
- **Alleen wat de eigenaar zelf heeft aangemerkt.** Bij muziek is dat het
  bestaande vinkje `is_shared` op de titel. Een partnerschap zet niet in één keer
  de hele bibliotheek open.
- **Intern blijft intern.** Velden die daarvoor bedoeld zijn — `internal_notes`
  bij een titel, `notes` bij een concert — gaan nooit mee.

## Leden delen

`share_members` staat wel in de database maar doet niets, en dat is met opzet.
Muziek en concerten zijn gegevens van de vereniging; leden zijn personen. Twee
organisaties die elkaars ledenbestand inzien is een verwerking waarvoor een
grondslag nodig is, en het is niet aan de code om die te veronderstellen.

Wat hier zou moeten gebeuren is een keuze die eerst gemaakt moet worden: welke
velden, van welke leden, met welke grondslag, en hoe een lid daar zelf iets over
te zeggen heeft. Zolang die keuze er niet is staat de vlag niet in het
aanvraagformulier.

## Waar het in de code staat

- `backend/src/services/partnerschappen.ts` — welke partners er zijn en wat zij
  delen. Alle leesregels staan hier op één plek.
- `backend/src/routes/multi-association.ts` — het beheer van het partnerschap
  zelf, plus `/directory`, `/partners/music`, `/partners/events` en
  `/partners/summary`.
- `frontend/src/pages/MultiAssociation.tsx` — het tabblad met het
  aanvraagformulier en wat partners op dit moment delen.

De tabel `association_partnerships` bestond sinds de multi-vereniging-migratie,
maar werd buiten het beheer van het partnerschap zelf nergens gelezen: een
goedgekeurd partnerschap veranderde niets en de drie vlaggen betekenden niets.
