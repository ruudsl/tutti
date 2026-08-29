# Veerkracht bij externe diensten

Tutti praat met een handvol diensten waar we niets over te zeggen hebben:
Spond, Spotify, Apple Music, Telegram, WhatsApp (Meta en Twilio). Die vallen om,
zijn een halve minuut traag, of geven een keer een 503 zonder dat er iets aan de
hand is.

Dit document beschrijft wat er dan gebeurt. De code staat in
[`backend/src/utils/veerkracht.ts`](../backend/src/utils/veerkracht.ts).

## Drie lagen, met verschillende taken

| Laag                  | Waartegen                       | Wat het doet                                                             |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| **Tijdslimiet**       | een dienst die niet antwoordt   | geeft na een vaste tijd op, zodat onze eigen aanvraag niet blijft hangen |
| **Herkansing**        | een hik                         | probeert het nog een of twee keer, met oplopende wachttijd               |
| **Stroomonderbreker** | een dienst die er echt uit ligt | slaat de dienst een tijdje helemaal over                                 |

Ze zijn geen van drieën genoeg op zichzelf, en twee ervan werken elkaar tegen
als je niet oplet:

- Een tijdslimiet zonder onderbreker betekent dat elke aanvraag de volle limiet
  kost zolang de dienst plat ligt. Bij een verzendronde naar honderd leden is
  dat honderd keer tien seconden.
- Herkansen zonder onderbreker **vermenigvuldigt** het verkeer naar een dienst
  die al bezwijkt. Precies op het verkeerde moment sturen we drie keer zoveel.

Daarom zit de onderbreker er altijd omheen: alle pogingen van één aanroep samen
tellen als één storing.

## Wat telt als storing

Alleen fouten waarvan we mogen aannemen dat ze vanzelf overgaan:

- **HTTP 408, 425, 429 en 5xx**, behalve 501 en 505 - die worden over vijf
  minuten ook niet geïmplementeerd.
- **Netwerkcodes** als `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `EAI_AGAIN` en
  de `UND_ERR_*`-codes van undici, ook als `fetch` ze in een `TypeError`
  verpakt heeft.
- **Verlopen tijdslimieten** (`TimeoutError`, `AbortError`).

Een 400, 401, 403, 404 of 422 is géén storing maar een **antwoord**. Die wordt
niet herkanst en telt niet mee voor de onderbreker: een nummer dat niet bestaat
bestaat bij de derde poging ook niet, en een verkeerd wachtwoord zegt niets over
de gezondheid van de dienst.

## Herkansen: alleen wat herhaalbaar is

Een leesactie mag zonder gevolgen nog eens. Een bericht versturen niet: als het
verzoek is aangekomen en alleen het antwoord onderweg verloren ging, staat het
bericht er na een tweede poging twee keer.

| Dienst            | Herkansingen | Waarom                                                                        |
| ----------------- | ------------ | ----------------------------------------------------------------------------- |
| Spotify           | 3 pogingen   | zoeken en een nummer opvragen zijn leesacties                                 |
| Apple Music       | 3 pogingen   | idem                                                                          |
| Spond             | 3 pogingen   | ophalen leest; een aanwezigheid zetten overschrijft een waarde en mag dus ook |
| Telegram          | **1** (geen) | een bericht versturen is niet te herhalen                                     |
| WhatsApp (Meta)   | **1** (geen) | idem                                                                          |
| WhatsApp (Twilio) | **1** (geen) | idem                                                                          |

De wachttijd verdubbelt per poging en heeft spreiding: bij een storing die
honderd aanvragen tegelijk raakt komen ze anders honderd keer tegelijk terug en
valt de dienst opnieuw om, precies wanneer hij opkrabbelt. Vraagt de dienst zelf
om een wachttijd met een `Retry-After`-kop, dan houden we ons daaraan - tot het
plafond, want een dienst die om een uur vraagt krijgt geen uur.

Er is ook een budget over alle wachttijden samen. Is dat op, dan houdt het op,
ook als er pogingen over zijn: de gebruiker aan de andere kant wacht nog steeds.

## De stroomonderbreker

Drie standen:

- **gesloten** - alles gaat gewoon door. Storingen worden geteld; een geslaagde
  aanroep zet die teller op nul, want losse hikjes zijn geen reeks.
- **open** - na vijf storingen op rij. Aanroepen worden meteen afgewezen met een
  `StroomonderbrekerOpenFout`, zonder de dienst te belasten en zonder dat de
  aanvrager op een tijdslimiet hoeft te wachten. De fout zegt hoeveel seconden
  het nog duurt.
- **halfopen** - de open-tijd is voorbij en er mag **één** aanroep door om te
  kijken. Lukt hij, dan gaat de onderbreker dicht; mislukt hij, dan weer open
  voor de volle tijd. Andere aanroepen worden ondertussen nog steeds afgewezen:
  honderd proeven tegelijk duwen de dienst meteen weer om.

Elke dienst heeft zijn eigen onderbreker. Meta en Twilio ook apart - het zijn
twee diensten, en de een ligt er niet uit omdat de ander dat doet.

De open-tijd is 30 seconden voor de muziekdiensten (waar het om een aardigheid
bij een titel gaat) en 60 seconden voor Spond, Telegram en WhatsApp.

## Waar zie je het

`GET /api/health/detailed` (beheerder) geeft onder `externeDiensten` de stand van
elke onderbreker: hoeveel storingen, sinds wanneer open, hoeveel aanroepen er
zijn overgeslagen.

Een open onderbreker telt **niet** mee in de algehele gezondheidsstatus. De
applicatie is dan niet ziek; ze doet juist wat ze moet doen. Dat het er staat is
wel het antwoord op "waarom komen mijn meldingen niet aan": het ligt niet aan
Tutti en het herstelt vanzelf zodra de andere kant weer antwoordt.

In het logboek:

- `Uitgaande aanroep mislukt, herkansing volgt` - waarschuwing per poging.
- `Stroomonderbreker open: dienst wordt overgeslagen` - fout, met het aantal
  storingen.
- `Stroomonderbreker weer dicht` - informatie, het herstel.

## Zelf gebruiken

```ts
import { beschermd, DienstFout, herkansNaUitKop } from '../utils/veerkracht';

const resultaat = await beschermd(
  'naam-van-de-dienst',
  async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new DienstFout(`Mislukt: ${res.status}`, {
        dienst: 'naam-van-de-dienst',
        status: res.status,
        herkansNaMs: herkansNaUitKop(res.headers.get('retry-after')),
      });
    }
    return res.json();
  },
  { pogingen: 3, onderbreker: { drempel: 5, openMs: 30_000 } },
);
```

Twee dingen die makkelijk misgaan:

1. **Gooi een `DienstFout` met de status erin.** `new Error('mislukt: 503')` is
   voor code een string; zonder het getal kan geen enkele laag beslissen of
   doorgaan zin heeft.
2. **Nest geen twee `beschermd`-aanroepen op dezelfde dienstnaam.** Staat de
   onderbreker halfopen, dan wordt de binnenste afgewezen omdat de buitenste al
   de proef is. Haal wat je eerst nodig hebt (een token bijvoorbeeld) op vóór
   het beschermde blok, niet erbinnen.

Voor een aanroep die **niet** herhaald mag worden geef je `pogingen: 1`. Dan
blijft alleen de onderbreker over, en die is altijd veilig: hij doet nooit een
extra aanroep, hij doet er hooguit minder.

## In tests

De onderbrekers zijn gedeeld over de hele applicatie en dus ook over alle tests
in een bestand. Een test die een dienst vijf keer laat mislukken zou de
onderbreker openzetten en elke volgende test in datzelfde bestand laten falen op
iets wat die test niet doet.

`backend/src/__tests__/setup.ts` zet ze daarom vóór elke test terug op dicht. Er
is niets wat je zelf hoeft te doen.

Wil je de tijd laten verstrijken zonder te wachten, geef dan je eigen `slaap` en
`nu` mee - zie `backend/src/__tests__/utils/veerkracht.test.ts`.
