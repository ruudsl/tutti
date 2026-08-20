# Muziek delen tussen verenigingen

Twee verenigingen op dezelfde installatie kunnen muziek uitwisselen. Dit is de
enige plaats in Tutti waar met opzet gegevens over de verenigingsgrens heen
zichtbaar worden; overal elders is die grens absoluut.

Vier regels dragen het geheel.

## 1. Koppelen gaat via een code

Er is **geen lijst van verenigingen** op het platform. Je kunt niet rondkijken
wie er verder op Tutti zit, en dat is de bedoeling.

1. Een beheerder of muziekcommissielid maakt een code aan
   (`POST /music-sharing/link-code`). De code ziet eruit als `K7PQ-3MWX`, is 72
   uur geldig en kan één keer worden gebruikt.
2. Die code geef je **buiten Tutti om** door: per telefoon, per mail, op een
   dirigentenoverleg.
3. De andere vereniging voert hem in (`POST /music-sharing/link-code/redeem`).
   Daarmee is de koppeling meteen actief — beide kanten hebben er bewust voor
   gekozen, dus een aparte goedkeuringsstap voegt niets toe.

Een nieuwe code intrekken gaat vanzelf: zodra je er een aanmaakt vervallen je
eerdere ongebruikte codes. Anders blijft een code die je ooit hebt rondgestuurd
bruikbaar terwijl je denkt dat de nieuwe de oude vervangt.

De koppeling is wederzijds en het maakt niet uit wie hem begon. Beëindigen kan
van beide kanten (`DELETE /music-sharing/partners/:id`).

## 2. Delen gaat per titel, met uitzonderingen

Een muziektitel wordt opengezet voor één of meer gekoppelde verenigingen
(`PUT /music-sharing/titles/:id/shares`). Geen deling betekent: met niemand.

Losse partijen kunnen worden uitgesloten
(`POST /music-sharing/pieces/:id/exclude`) — de dirigentenpartituur is het
voorbeeld waar het om begonnen is. Zo'n uitsluiting hoort bij de partij en geldt
dus voor **alle** partners tegelijk: "deze partij deel ik niet" is een
eigenschap van de partij, niet van de relatie.

Een uitgesloten partij komt niet voor in de catalogus van een partner. Die hoeft
niet te weten dat hij bestaat.

## 3. Een bestand komt er niet vanzelf uit

Wat een partner ziet is de **catalogus**: titel, componist, arrangeur, duur,
graad, YouTube-link, en welke partijen erbij horen. Niet de bestanden.

Voor een concreet bestand dient hij een verzoek in
(`POST /music-sharing/requests`) en beslist de eigenaar per keer. Bij
goedkeuring geldt de toegang standaard 30 dagen; de eigenaar kan daarvan
afwijken.

Elke beslissing blijft staan, ook een afwijzing, zodat achteraf na te gaan is
wat er gevraagd is en wat erop is besloten.

Bij elke download wordt opnieuw getoetst of het nog mag. Een eerdere goedkeuring
is geen blijvend recht: de toegang vervalt zodra de termijn verloopt, de deling
wordt ingetrokken, de partij alsnog wordt uitgesloten, of de koppeling wordt
beëindigd.

### Waarom een verzoek, en niet gewoon downloaden

Bladmuziek is bijna nooit vrij van rechten. Bij een gekocht arrangement heeft de
vereniging exemplaren voor eigen gebruik, en die mag ze niet zomaar doorgeven;
bij publiek domein mag het wel. Dat onderscheid kan de software niet maken — het
hangt af van het stuk, de uitgever en de afspraken van die ene vereniging.

Daarom beslist een mens per keer, en blijft die beslissing staan.

## 4. Oproepen

Een vereniging die een stuk zoekt plaatst een oproep
(`POST /music-sharing/wanted`) met een link of een YouTube-filmpje erbij. Alleen
gekoppelde verenigingen zien hem — zonder koppeling zie je alleen je eigen
oproepen, wat volgt uit de keuze om geen lijst van verenigingen te hebben.

Antwoorden doet de muziekcommissie of een beheerder: een antwoord spreekt namens
de vereniging, en vaak volgt er een deling uit. Een antwoord kan een titel uit de
eigen bibliotheek aanwijzen; die moet dan wel echt van de antwoordende
vereniging zijn.

Meelezen mag elk lid.

## Overzicht

`GET /music-sharing/overview` geeft per gekoppelde vereniging welke stukken er
met haar gedeeld worden, plus de partijen die je overal van uitsluit. Een partner
waarmee je niets deelt staat er ook in: "met deze vereniging deel je niets" is
een antwoord, een ontbrekende regel niet.

## Wie mag wat

| Handeling                       | Wie                        |
| ------------------------------- | -------------------------- |
| Koppelcode maken en inwisselen  | beheerder, muziekcommissie |
| Koppeling beëindigen            | beheerder, muziekcommissie |
| Delen per titel instellen       | beheerder, muziekcommissie |
| Partijen uitsluiten             | beheerder, muziekcommissie |
| Catalogus van partners bekijken | elk lid                    |
| Bestand opvragen en beslissen   | beheerder, muziekcommissie |
| Oproep plaatsen en beantwoorden | beheerder, muziekcommissie |
| Oproepen lezen                  | elk lid                    |

## Wat er niet gedeeld wordt

`internal_notes` bij een titel gaat nooit mee: dat veld staat er juist om binnen
de eigen vereniging te blijven.

`share_members` op `association_partnerships` blijft ongebruikt, en dat is een
keuze. Muziek is een gegeven van de vereniging; leden zijn personen. Twee
organisaties die elkaars ledenbestand inzien is een verwerking waarvoor een
grondslag nodig is, en het is niet aan de code om die te veronderstellen. Wie
dat wil, moet eerst bepalen op welke grondslag het gebeurt, wat er precies
zichtbaar wordt en hoe leden daar bezwaar tegen maken.

## Wat er van het oude model over is

`music_titles.is_shared` betekende "mag gedeeld worden met andere verenigingen",
zonder te zeggen met welke. Wie dat vlaggetje aan had staan en een partnerschap
met `share_music` had, deelde in de praktijk met al zijn partners tegelijk.

Migratie `20260820000007` heeft die situatie omgezet: voor elke combinatie van
zo'n titel en zo'n partner staat er nu een rij in `music_title_shares`. Er is dus
niets stilletjes dichtgegaan, en iedereen kan daarna per titel bijsturen.
