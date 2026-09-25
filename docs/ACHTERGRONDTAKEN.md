# Achtergrondtaken

Werk dat niet binnen een verzoek van een gebruiker gebeurt - meldingen
versturen, opschonen, back-ups - loopt via een wachtrij in de database: de
tabel `achtergrondtaken`, met de werker in `backend/src/taken/wachtrij.ts`.

Tot september 2026 had elke planner een eigen `setTimeout`-lus in het geheugen.
Een herstart (elke uitrol) gooide lopend werk weg zonder spoor, en een
mislukte taak stond alleen in het logboek. Zie WP12 in `ROADMAP.md`.

## Hoe het werkt

1. Een taak wordt klaargezet met `plaatsTaak(soort, gegevens, opties)`: een rij
   met status `wachtend` en een planmoment.
2. De werker kijkt elke vijftien seconden wat aan de beurt is en voert het één
   voor één uit.
3. Lukt het, dan wordt de taak `gelukt`. Mislukt het, dan hangt het ervan af
   of de taak herhaalbaar is (zie hieronder).

Wat een soort doet staat niet in de database maar in de code: een definitie die
bij het opstarten wordt geregistreerd met `registreerTaak`. In de rij staan
alleen de gegevens.

```ts
registreerTaak('rapport-maken', {
  herhaalbaar: true,
  maxPogingen: 3,
  looptijdMs: 10 * 60 * 1000,
  uitvoeren: async (gegevens, { associationId }) => {
    /* ... */
  },
});

plaatsTaak('rapport-maken', { seizoen: '2026' }, { associationId });
```

## Herhaalbaar of niet

Elke definitie zegt of hij `herhaalbaar` is: mag de taak een tweede keer
draaien als een eerdere poging halverwege stopte? Dit is dezelfde afweging als
bij uitgaande aanroepen in [VEERKRACHT.md](./VEERKRACHT.md).

|                        | herhaalbaar                                                     | niet herhaalbaar                              |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| De taak gooit een fout | Opnieuw na 30 s, 1 min, 2 min, ... tot een uur, tot maxPogingen | Meteen `mislukt`                              |
| Het proces viel om     | Na het verlopen van de vergrendeling opnieuw opgepakt           | `mislukt`, met de reden "onderbroken"         |
| Voorbeelden in de code | AVG-opschoning, back-up                                         | Opstellingsmeldingen, mail opnieuw doorsturen |

Iets versturen of aanmaken is niet herhaalbaar: een tweede poging kan een
tweede bericht zijn. Twijfel je, kies dan niet herhaalbaar.

`mislukt` is het eindstation. Daar blijft een taak staan tot iemand hem
bekijkt. Gelukte taken worden na veertien dagen opgeruimd, mislukte na negentig.

## Eén keer per sleutel

Een taak met een `sleutel` wordt maar één keer ingepland: een tweede
`plaatsTaak` met dezelfde sleutel doet niets en geeft `null` terug.

Periodieke taken gebruiken dat. `registreerPeriodiek(soort, { sleutelVoor })`
geeft voor elk moment de sleutel van het tijdvak waarin het valt, of `null` als
de taak nu niet aan de beurt is. De werker zet bij elke tik de taak van het
huidige tijdvak klaar; bestaat die al, dan gebeurt er niets. Zo draait een
periodieke taak één keer per tijdvak, ook na een herstart binnen dat tijdvak.

## De vaste taken

Geregistreerd in `backend/src/taken/index.ts`; het werk zelf staat nog onder
`backend/src/scheduler/`.

| Soort                     | Wanneer                                       | Herhaalbaar |
| ------------------------- | --------------------------------------------- | ----------- |
| `opstelling-meldingen`    | Elke minuut                                   | nee         |
| `mail-doorsturen-opnieuw` | Elke twee minuten                             | nee         |
| `avg-opschonen`           | Eén keer per dag, in `GDPR_CLEANUP_HOUR`      | ja, 3×      |
| `database-back-up`        | Elke `BACKUP_INTERVAL_HOURS` (standaard 24 u) | ja, 3×      |
| `miniaturen-opruimen`     | Eén keer per dag                              | ja, 3×      |
| `pdf-tijdelijk-opruimen`  | Elk uur                                       | ja, 3×      |
| `wachtwoordherstel-mail`  | Na elke aanvraag bij 'wachtwoord vergeten'    | nee         |

De back-up wordt niet ingepland als `BACKUP_ENABLED=false`.

`wachtwoordherstel-mail` is geen periodieke taak: `POST /auth/forgot-password`
zet hem klaar voor een bestaand adres. Het token ontstaat pas in de taak, zodat
het nergens leesbaar in de wachtrij staat, en het verzoek zelf wacht niet op de
mailserver - anders verraadt de looptijd welke adressen bestaan.

De twee opruimtaken stonden eerst als `setInterval` in `routes/thumbnails.ts`
en `routes/pdf-tools.ts`, en begonnen al te lopen zodra die bestanden werden
geladen - ook in elke test die de route importeerde.

## Wat niet in de wachtrij hoort

Vier plekken houden met een `setInterval` iets in het geheugen van het proces
bij: de CSRF-tokens (`middleware/csrf.ts`), de antwoordcache
(`middleware/cache.ts`) en de inlogstatus van Google, Facebook en Microsoft
(`routes/social-auth.ts`, `routes/microsoft-auth.ts`). Die lussen gooien
verlopen items uit een `Map` weg.

Dat is geen werk voor de wachtrij. Wat ze opruimen bestaat alleen in dit
proces en is na een herstart toch al weg; een taak in de database erover zou
een ander proces niets zeggen. Regel 21 in `CLAUDE.md` gaat over werk met een
gevolg buiten het geheugen: berichten, bestanden, de database.

## De sluis

Een werker pakt een taak met een `UPDATE` die alleen slaagt zolang de taak nog
vrij is, en telt de gewijzigde rijen: één is van hem, nul is van een ander.
Daarbij zet hij zichzelf als `eigenaar` en een `vergrendeld_tot`. Loopt een
poging langer dan die vergrendeling - omdat het proces omviel - dan geldt de
taak als onderbroken.

Met sql.js is er één proces, omdat de database in zijn geheugen zit. De sluis
voorkomt nu vooral dat twee tikken elkaar in de weg zitten. Hij is zo opgezet
omdat hetzelfde patroon werkt met meerdere instanties op PostgreSQL; daar komt
er `FOR UPDATE SKIP LOCKED` bij. Zie [POSTGRES_MIGRATION.md](./POSTGRES_MIGRATION.md).

Kies `looptijdMs` ruim. Te kort, en een trage maar gezonde taak geldt als
onderbroken terwijl hij nog loopt.

## Het beheerscherm

Superbeheerders zien de wachtrij op de pagina _Verenigingen Beheer_, tabblad
_Achtergrondtaken_. Het scherm opent op de mislukte taken, met per taak de
laatste fout, en heeft bij een mislukte taak een knop om hem opnieuw te
proberen: dan staat hij weer op `wachtend` met een verse teller. De API staat
in [API.md](./API.md#achtergrondtaken-api).

Alleen superbeheerders, omdat de taken van nu systeemtaken zijn die bij geen
vereniging horen. Komen er taken die wel bij een vereniging horen
(`association_id` gevuld), dan krijgt de beheerder van die vereniging een eigen
route die op `association_id` filtert.

## Weggehaald

Twee planners waren geschreven en getest, maar werden nergens gestart:
`scheduler/workflow-runner.ts` (geplande workflows en workflows op een
datumveld) en `scheduler/email-digest.ts` (een wekelijkse samenvatting per mail
aan alle leden). Ze zijn in september 2026 weggehaald in plaats van aangezet.
Aanzetten had betekend dat leden ineens een wekelijkse mail kregen waar niemand
om had gevraagd, en dat workflows die beheerders ooit hadden ingesteld zonder
waarschuwing gingen lopen.

Komt een van de twee terug, dan als taak in deze wachtrij. Het werk voor de
workflows staat nog in `services/workflowEngine.ts`
(`processScheduledWorkflows`, `processDateFieldWorkflows`), omdat de routes
onder `/api/workflows/process/` het per vereniging handmatig aftrappen. Het
workflowscherm biedt beide triggers niet meer aan bij een nieuwe trigger;
bestaande staan er met de melding dat ze niet vanzelf afgaan.
