# Privacy Impact Assessment — technische onderbouwing

## Wat dit stuk wel en niet is

Een PIA (of DPIA, artikel 35 AVG) bestaat uit twee helften. De ene is feitelijk:
welke persoonsgegevens verwerkt deze applicatie werkelijk, wie kan erbij, waar
gaan ze heen, hoe lang blijven ze staan en wat gebeurt er als iemand ze opvraagt
of laat wissen. De andere is een beoordeling: is die verwerking noodzakelijk,
staat ze in verhouding tot het doel, welke grondslag geldt, en welke restrisico's
accepteert het bestuur.

**Dit document vult alleen de eerste helft in.** Alles hieronder is uit de code
en het schema afgeleid, met bestandsnamen en regelnummers erbij, en waar het
ertoe deed ook uitgeprobeerd tegen een draaiende database. De tweede helft staat
in §9 als een lijst vragen — die horen bij het bestuur van de vereniging, niet
bij de software.

Gemeten op `main` van 2026-08-24.

Zie ook [GDPR.md](GDPR.md), dat beschrijft hoe het bedoeld is. Waar dit stuk
daarvan afwijkt, staat dat er expliciet bij: dan doet de code iets anders dan de
documentatie zegt.

---

## 1. De verwerking in cijfers

|                                                      | Aantal |
| ---------------------------------------------------- | -----: |
| Tabellen in de database                              |    256 |
| Tabellen met een persoonsgegeven erin                |    167 |
| Tabellen met een verwijzing naar een lid (`user_id`) |     70 |
| Tabellen met een e-mailadres als kolom               |     12 |
| Tabellen met binaire gegevens (BLOB)                 |      0 |

De twaalf tabellen met een e-mailadres: `users`, `notification_preferences`,
`tickets`, `ticket_orders`, `guest_list`, `contacts`, `contact_persons`,
`email_campaign_recipients`, `accounting_relations`, `tour_accommodations`,
`association_invitations`, `external_musicians`.

Bestanden (bladmuziek, foto's, audio-opnamen) staan op schijf en niet in de
database; de database bewaart alleen paden. Dat is voor een PIA relevant: een
back-up van de database bevat die bestanden dus niet, en een verwijdering uit de
database haalt het bestand niet weg tenzij de code dat apart doet.

### Bijzondere categorieën

Het schema kent geen kolommen voor gezondheid, religie, politieke voorkeur of
etniciteit. Wél zijn er vrije tekstvelden waarin zulke gegevens terecht kunnen
komen zonder dat de software dat merkt — `member_availability.notes`,
`practice_logs.notes`, de chat en de commentaarvelden. Dat is geen technisch
probleem maar een organisatorisch aandachtspunt; zie §9.

---

## 2. Wie ziet wat

Rollen worden afgedwongen door `backend/src/middleware/auth.ts`
(`requireRole`, `requireMinRole`, met de reeks `admin`, `music_committee`,
`conductor`, `section_leader`, `member`). De verenigingsgrens is een aparte laag: vrijwel elke query
filtert op `association_id`, en de dekkingsronde van augustus 2026 heeft daar
negen plekken gerepareerd waar dat ontbrak.

Voor de PIA is vooral dit van belang: **een super-admin ziet alles, over alle
verenigingen heen.** Dat is een noodzakelijke rol voor beheer van de installatie,
maar het betekent dat de beheerder van de server toegang heeft tot de
ledenadministratie van elke aangesloten vereniging. Wie die rol heeft en op grond
waarvan, is een vraag voor §9.

Leden kunnen per veld instellen wie het mag zien (`user_privacy_settings`, met
niveaus `admin_only`, `committee`, `orchestra`, `section`, `all_members`,
`public`). Tot augustus 2026 werd die instelling wel opgeslagen maar nergens
toegepast; dat is inmiddels gerepareerd.

---

## 3. Waar gegevens de installatie verlaten

Alleen de bestemmingen die in de productiecode voorkomen. Of ze in gebruik zijn
hangt af van welke koppelingen de vereniging heeft aangezet — dat is per
installatie verschillend en hoort in §9 ingevuld te worden.

| Bestemming                                                            | Wat er heen gaat                                                                                              | Wanneer                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `graph.microsoft.com`, `login.microsoftonline.com`                    | Naam, e-mailadres, functietitel, profielfoto                                                                  | Entra ID-koppeling voor inloggen en ledeninvoer |
| `accounts.google.com`, `www.googleapis.com`                           | Naam, e-mailadres; agenda-items                                                                               | Google-inloggen en agendasynchronisatie         |
| `graph.facebook.com`                                                  | Naam, e-mailadres                                                                                             | Facebook-inloggen                               |
| `api.twilio.com`, `graph.facebook.com`                                | Telefoonnummer, berichtinhoud                                                                                 | WhatsApp-berichten                              |
| `api.telegram.org`                                                    | Chat-id, berichtinhoud                                                                                        | Telegram-berichten                              |
| `api.spond.com`                                                       | Naam, e-mailadres, aanwezigheidsantwoorden                                                                    | Spond-synchronisatie                            |
| `api.mollie.com`                                                      | Naam, e-mailadres, bedrag                                                                                     | Kaartverkoop en betalingen                      |
| SMTP-server van de vereniging                                         | Alle e-mail: uitnodigingen, kaarten, herinneringen                                                            | Altijd, als e-mail is ingesteld                 |
| `imslp.org`, `open.spotify.com`, `music.apple.com`, `www.youtube.com` | Geen persoonsgegevens in de aanvraag — maar de aanvraag zelf verraadt aan die partij welk stuk iemand opzoekt | Bladmuziek en metadata opzoeken                 |

Die laatste rij verdient een aparte opmerking. Er gaat geen naam mee, maar een
verzoek vanaf de server naar `imslp.org` op het moment dat een lid een titel
opzoekt, vertelt IMSLP wél wat er wordt opgezocht en vanaf welk ip-adres de
server staat. Dat is een lichte, maar reële verwerking.

De DPA-sjablonen staan in `docs/templates/`.

---

## 4. Bewaren en opruimen

Er is een opruimtaak die dagelijks draait (`backend/src/scheduler/gdpr-cleanup.ts`,
standaard om 03:00, in te stellen met `GDPR_CLEANUP_HOUR`). Bewaartermijnen zijn
per vereniging in te stellen in `data_retention_settings`, en de opruimtaak leest
die tabel uit — dat is aangesloten, niet alleen bedoeld.

Acht soorten worden werkelijk opgeruimd, en dat zijn precies de acht die
[GDPR.md](GDPR.md) noemt: `sessions`, `activity_log`, `audit_logs`,
`practice_logs`, `audio_recordings`, `deleted_users`, `password_reset_tokens`,
`recent_views`.

**Wat er niet in zit:** de overige 62 tabellen met een verwijzing naar een lid
kennen geen bewaartermijn. Aanwezigheid, peilingantwoorden, chatberichten,
kaartaankopen, beschikbaarheid en reacties blijven staan zolang de vereniging
bestaat. Voor een deel is dat te rechtvaardigen (financiële administratie kent
een wettelijke termijn), voor een deel is het gewoon nooit ingericht. Welke van
de twee het per soort is, hoort in §9.

---

## 5. Artikel 15 en 20 — inzage en overdraagbaarheid

De export zit op `GET /api/users/export-data`
(`backend/src/routes/users.ts:408`) en levert één JSON-bestand.

> Deze route werkte tot 19-08-2026 niet. Hij stond ónder `/:id`, en Express
> matcht op volgorde, dus `/users/export-data` kwam uit bij `/:id` en zocht een
> lid met het id "export-data". De query eronder vroeg bovendien kolommen op die
> niet bestaan. Beide zijn gerepareerd.

De export bevat nu: profiel, instrumenten, orkesten, favorieten,
oefenlogboek, recent bekeken, aantal annotaties, uitgeleende instrumenten,
kledingtoewijzingen, activiteitenlogboek en buurvoorkeuren.

**Dat is 10 van de 70 tabellen die gegevens over dat lid bevatten.** De volgende
staan er niet in terwijl een lid ze redelijkerwijs verwacht:

| Ontbreekt                                                        | Waarom dat opvalt                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `rehearsal_attendance`, `concert_attendance`, `event_attendance` | Aanwezigheid staat in GDPR.md zelf als verwerkte categorie |
| `tickets`, `ticket_orders`, `invoices`                           | Financiële geschiedenis, ook in GDPR.md genoemd            |
| `poll_votes`, `poll_comments`, `post_comments`, `task_comments`  | Wat iemand heeft gestemd en geschreven                     |
| `chat_messages`, `section_chat_messages`                         | Berichten van het lid zelf                                 |
| `member_availability`                                            | Opgegeven beschikbaarheid, met vrije tekst                 |
| `notification_preferences`, `user_notification_channels`         | Inclusief gekoppeld telefoonnummer of Telegram-id          |
| `user_privacy_settings`, `user_calendar_settings`                | Eigen instellingen van het lid                             |
| `practice_goals`, `practice_streaks`                             | Wél oefenlogboek in de export, niet de doelen erbij        |
| `tour_participants`, `project_members`, `memberships`            | Deelnames                                                  |

Een aantal ontbrekende tabellen hoort er terecht níét in: `password_reset_tokens`,
`mfa_recovery_codes`, `oauth_states`, `scanner_sync_tokens` en `user_sessions`
zijn beveiligingsmiddelen, en die meesturen in een downloadbaar bestand maakt het
probleem groter dan het oplost.

**Beoordeling:** dit is de grootste technische afwijking die deze ronde heeft
opgeleverd. GDPR.md beschrijft bovendien een ZIP met acht losse JSON-bestanden,
waaronder `attendance.json`, `notifications.json` en `ticket-purchases.json`. Die
ZIP bestaat niet en die drie bestanden bestaan niet; het is één JSON zonder die
inhoud. Documentatie en code beschrijven hier twee verschillende functies.

---

## 6. Artikel 17 — wissen

Verwijderen loopt via `backend/src/routes/gdpr.ts`. Er is een verzoek
(`POST /delete-request`), een beheerder die het afhandelt
(`/deletion-requests/:requestId/process`), en daarna een zachte verwijdering: het
lid krijgt `status = 'deleted'`, persoonsgegevens worden overschreven, en
zestien tabellen worden direct leeggehaald. Na een instelbare termijn haalt de
opruimtaak de rij zelf weg — dát is het moment waarop de foreign keys hun werk
doen.

`PRAGMA foreign_keys = ON` staat aan (`backend/src/database/connection.ts:67`),
dus dat werkt. Van de 70 tabellen met een `user_id`, uit de draaiende database
opgevraagd met `PRAGMA foreign_key_list`:

| Gedrag bij het wissen van het lid | Aantal | Gevolg                                                                            |
| --------------------------------- | -----: | --------------------------------------------------------------------------------- |
| `ON DELETE CASCADE`               |     57 | Rijen verdwijnen mee — dit is het bedoelde geval                                  |
| `ON DELETE SET NULL`              |      9 | Rij blijft staan, verwijzing wordt leeg — de anonimisering die GDPR.md beschrijft |
| `NO ACTION`                       |      3 | **Blokkeert het wissen**                                                          |
| Geen foreign key                  |      1 | **Rij blijft staan, mét persoonsgegevens**                                        |

De negen met `SET NULL` zijn `rehearsal_attendance`, `concert_attendance`,
`rehearsal_seating`, `tickets`, `ticket_orders`, `accounting_relations`,
`invoices`, `event_transport_passengers` en `association_activity_log`. Dat komt
overeen met wat GDPR.md belooft: aanwezigheid geanonimiseerd, financiële
administratie bewaard.

### Bevinding 1 — chatberichten blokkeren het wissen

`chat_messages`, `annotation_stamps` en `sync_queue` hebben een foreign key naar
`users` zonder `ON DELETE`-clausule. SQLite leest dat als `NO ACTION`, en met
foreign keys aan betekent dat: de verwijdering wordt geweigerd.

Uitgeprobeerd tegen een kopie van een echte database: één chatbericht invoeren en
daarna het lid wissen geeft `FOREIGN KEY constraint failed`. **Een lid dat ooit
een chatbericht heeft gestuurd, is niet definitief te verwijderen.** De zachte
verwijdering slaagt, de opruimtaak die later de rij moet weghalen loopt stuk.

### Bevinding 2 — het instrumentenlogboek bewaart naam en ip-adres

`instrument_history` heeft géén foreign key naar `users`, en bewaart naast
`user_id` ook `user_name` en `ip_address`. Uitgeprobeerd: na een harde
verwijdering van het lid blijft de rij staan, met `"Jan Jansen"` en
`"10.0.0.9"` er nog in.

Dat is een kleine tabel met een groot gevolg: het is de enige plek waar na een
verwijdering nog een naam en een ip-adres van het lid staan.

---

## 7. Beveiligingsmaatregelen die er zijn

Feitelijk, zonder oordeel over of het genoeg is:

- Wachtwoorden met bcrypt; tweefactor met herstelcodes (`mfa_recovery_codes`)
- Sessies met JWT, intrekbaar (`user_sessions.revoked_at`), opgeruimd door de
  dagelijkse taak volgens de ingestelde bewaartermijn (GDPR.md noemt 90 dagen als
  standaard)
- Rolcontrole per route, plus een filter op `association_id` per query
- Auditlogboek van beheerhandelingen (`audit_logs`), zelf onder een bewaartermijn
- Een strak Content-Security-Policy en de gebruikelijke helmet-kopregels
- Snelheidsbegrenzing: een algemene op alle verzoeken plus een strengere op
  inloggen en op wachtwoordherstel (`backend/src/routes/auth.ts:25` en `:48`)
- Reservekopieën met een eigen planning en bewaartermijn

Twee dingen die het bestuur moet weten omdat ze een keuze vragen:

1. **`X-Forwarded-For` wordt onvoorwaardelijk vertrouwd.** Wie die kopregel zelf
   meestuurt kiest daarmee zijn eigen ip-adres, en dus wat er in het auditlogboek
   komt te staan en hoe de snelheidsbegrenzer telt. De reparatie is één regel
   `trust proxy`, maar de juiste waarde hangt af van hoeveel proxy's er vóór de
   applicatie staan. Staat ook in de openstaande beslissingen van de roadmap.
2. **De database is één bestand.** Wie toegang heeft tot de schijf van de server
   heeft alles. Versleuteling in rust is niet ingericht; dat is bij een
   zelf-gehoste opzet een keuze van degene die host.

---

## 8. Bevindingen uit deze ronde, op volgorde van gewicht

1. **De inzage-export dekt 10 van de 70 tabellen** (§5). Aanwezigheid,
   kaartaankopen, stemmen, berichten en beschikbaarheid ontbreken.
2. **GDPR.md beschrijft een andere export dan er bestaat** (§5): een ZIP met acht
   bestanden tegenover één JSON.
3. **Een lid met een chatbericht is niet definitief te wissen** (§6, bevinding 1).
4. **`instrument_history` bewaart naam en ip-adres na verwijdering** (§6,
   bevinding 2).
5. **62 van de 70 tabellen kennen geen bewaartermijn** (§4).

Deze staan hier als bevinding, niet als reparatie. Ze raken de betekenis van een
export en van een verwijdering, en dat zijn keuzes die het bestuur hoort te maken
voordat de code ze vastlegt — hoort aanwezigheid in de export, of is dat een
gegeven van de vereniging over het lid? Welke termijn geldt voor een chatbericht?

---

## 9. Wat de vereniging zelf invult

De beoordelingshelft. Deze vragen zijn niet uit code te beantwoorden.

**Doel en grondslag**

- Voor welke van de verwerkingen uit §1 is de grondslag uitvoering van de
  lidmaatschapsovereenkomst, en voor welke gerechtvaardigd belang of toestemming?
  GDPR.md doet daar een voorstel; het bestuur bevestigt het.
- Is elk van de 167 tabellen met persoonsgegevens nodig voor een doel dat de
  vereniging kan benoemen? Modules die niet worden gebruikt, kunnen uit.

**Noodzaak en evenredigheid**

- Is het bewaren van aanwezigheid per repetitie, jaren terug, nodig voor het doel
  waarvoor het is verzameld?
- Wat is de termijn voor de 62 soorten die er nu geen hebben (§4)?
- Wat betekent "verwijderen" voor deze vereniging: alles weg, of aanwezigheid
  geanonimiseerd bewaren zoals nu (§6)?

**Ontvangers**

- Welke koppelingen uit §3 zijn werkelijk aan? Voor elke aangezette koppeling
  hoort een verwerkersovereenkomst; de sjablonen staan in `docs/templates/`.
- Staat de server binnen de EER? Bij een zelf-gehoste opzet is dat de keuze van
  degene die host.

**Toegang**

- Wie heeft de rol super-admin, en op welke grond (§2)?
- Wie kan bij de schijf van de server, en dus bij het databasebestand (§7)?

**Risico's**

- Wat is de kans en de schade van een lek van het databasebestand, gegeven dat
  het één bestand is en niet versleuteld in rust?
- Welke restrisico's accepteert het bestuur, en welke moeten eerst gedekt?

---

## Verwijzingen

- [GDPR.md](GDPR.md) — hoe het bedoeld is, met de categorieën en termijnen
- `docs/templates/` — DPA- en privacyverklaringsjablonen
- `backend/src/routes/gdpr.ts` — verzoek, afhandeling, bewaartermijnen, opruimen
- `backend/src/routes/users.ts:408` — de inzage-export
- `backend/src/scheduler/gdpr-cleanup.ts` — de dagelijkse opruimtaak
- `backend/src/database/connection.ts:67` — waar de foreign keys aan gaan
