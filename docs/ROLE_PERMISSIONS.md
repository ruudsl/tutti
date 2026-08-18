# Rollen en Machtigingen

Harmonie gebruikt een rollenstructuur om te bepalen welke acties gebruikers kunnen uitvoeren. Elke gebruiker heeft precies een rol toegewezen.

## Overzicht rollen

| Rol                   | Nederlandse naam      | Beschrijving                                        |
| --------------------- | --------------------- | --------------------------------------------------- |
| `admin`               | Beheerder             | Volledige toegang tot alle functies en instellingen |
| `board`               | Bestuur               | Evenementen en verenigingszaken beheren             |
| `music_committee`     | Muziekcommissie       | Bladmuziek, lijsten en repertoire beheren           |
| `equipment_committee` | Instrumentencommissie | Instrumenten en apparatuur beheren                  |
| `uniforms_committee`  | Uniformencommissie    | Uniformen en kledij beheren                         |
| `conductor`           | Dirigent              | Repetities en muzikale zaken beheren                |
| `member`              | Lid                   | Basistoegang voor orkestleden                       |

---

## Machtigingsmatrix

### Legende

- **Volledig** = Lezen, aanmaken, bewerken en verwijderen
- **Bewerken** = Lezen, aanmaken en bewerken (geen verwijderen)
- **Lezen** = Alleen bekijken
- **Eigen** = Alleen eigen gegevens
- **-** = Geen toegang

---

### Muziek en bladmuziek

| Functie                  | Admin    | Muziekcommissie | Dirigent | Lid      |
| ------------------------ | -------- | --------------- | -------- | -------- |
| Bladmuziek bekijken      | Volledig | Volledig        | Lezen    | Lezen    |
| Bladmuziek uploaden      | Volledig | Volledig        | -        | -        |
| Bladmuziek bewerken      | Volledig | Volledig        | -        | -        |
| Bladmuziek verwijderen   | Volledig | Volledig        | -        | -        |
| Muzieklijsten beheren    | Volledig | Volledig        | Lezen    | Lezen    |
| Titels/metadata bewerken | Volledig | Volledig        | -        | -        |
| Interne notities zien    | Volledig | Volledig        | Volledig | -        |
| PDF's downloaden         | Volledig | Volledig        | Volledig | Volledig |

### Repetities en aanwezigheid

| Functie                | Admin    | Muziekcommissie | Dirigent | Lid   |
| ---------------------- | -------- | --------------- | -------- | ----- |
| Repetities bekijken    | Volledig | Volledig        | Volledig | Lezen |
| Repetities aanmaken    | Volledig | Volledig        | Volledig | -     |
| Repetities bewerken    | Volledig | Volledig        | Volledig | -     |
| Repetities verwijderen | Volledig | Volledig        | Volledig | -     |
| Spond synchroniseren   | Volledig | Volledig        | Volledig | -     |
| Eigen beschikbaarheid  | Volledig | Volledig        | Volledig | Eigen |
| Aanwezigheid overzicht | Volledig | Volledig        | Volledig | Lezen |

### Concerten en tickets

| Functie                | Admin    | Muziekcommissie | Dirigent | Lid   |
| ---------------------- | -------- | --------------- | -------- | ----- |
| Concerten bekijken     | Volledig | Volledig        | Lezen    | Lezen |
| Concerten aanmaken     | Volledig | Volledig        | -        | -     |
| Concerten bewerken     | Volledig | Volledig        | -        | -     |
| Tickettypen beheren    | Volledig | Volledig        | -        | -     |
| Ticket dashboard       | Volledig | Volledig        | -        | -     |
| Gastenlijst beheren    | Volledig | Volledig        | -        | -     |
| Tickets valideren      | Volledig | Volledig        | Volledig | -     |
| Eigen tickets bekijken | Volledig | Volledig        | Volledig | Eigen |

### Leden en gebruikers

| Functie                | Admin    | Bestuur  | Muziekcommissie | Lid      |
| ---------------------- | -------- | -------- | --------------- | -------- |
| Gebruikers bekijken    | Volledig | Lezen    | Lezen           | Lezen    |
| Gebruikers aanmaken    | Volledig | -        | -               | -        |
| Gebruikers bewerken    | Volledig | -        | -               | Eigen    |
| Gebruikers verwijderen | Volledig | -        | -               | -        |
| Rollen toewijzen       | Volledig | -        | -               | -        |
| Smoelenboek bekijken   | Volledig | Volledig | Volledig        | Volledig |
| Privacy-instellingen   | Volledig | Eigen    | Eigen           | Eigen    |

### Communicatie

| Functie               | Admin    | Muziekcommissie | Dirigent | Lid      |
| --------------------- | -------- | --------------- | -------- | -------- |
| Berichten lezen       | Volledig | Volledig        | Volledig | Volledig |
| Berichten plaatsen    | Volledig | Volledig        | -        | -        |
| Berichten bewerken    | Volledig | Volledig        | -        | -        |
| Berichten verwijderen | Volledig | Volledig        | -        | -        |
| Peilingen bekijken    | Volledig | Volledig        | Volledig | Volledig |
| Peilingen aanmaken    | Volledig | Volledig        | -        | -        |
| Peilingen beheren     | Volledig | Volledig        | -        | -        |
| Stemmen in peilingen  | Volledig | Volledig        | Volledig | Volledig |
| E-mailcampagnes       | Volledig | Volledig        | -        | -        |

### Inventaris

| Functie                 | Admin    | Instrumentencommissie | Uniformencommissie | Lid   |
| ----------------------- | -------- | --------------------- | ------------------ | ----- |
| Instrumenten bekijken   | Volledig | Volledig              | Lezen              | Lezen |
| Instrumenten beheren    | Volledig | Volledig              | -                  | -     |
| Uitleningen registreren | Volledig | Volledig              | -                  | -     |
| Onderhoud loggen        | Volledig | Volledig              | -                  | -     |
| Uniformen bekijken      | Volledig | Lezen                 | Volledig           | Lezen |
| Uniformen beheren       | Volledig | -                     | Volledig           | -     |
| Uniformen toewijzen     | Volledig | -                     | Volledig           | -     |

### Evenementen en planning

| Functie              | Admin    | Bestuur  | Muziekcommissie | Lid   |
| -------------------- | -------- | -------- | --------------- | ----- |
| Evenementen bekijken | Volledig | Volledig | Lezen           | Lezen |
| Evenementen aanmaken | Volledig | Volledig | -               | -     |
| Evenementen bewerken | Volledig | Volledig | -               | -     |
| Locaties beheren     | Volledig | Volledig | -               | -     |
| Transport plannen    | Volledig | Volledig | -               | -     |
| Paklijsten beheren   | Volledig | Volledig | -               | -     |

### Opstelling en bezetting

| Functie                | Admin    | Muziekcommissie | Dirigent | Lid   |
| ---------------------- | -------- | --------------- | -------- | ----- |
| Opstelling bekijken    | Volledig | Volledig        | Volledig | Lezen |
| Opstelling bewerken    | Volledig | Volledig        | Volledig | -     |
| Podiumindeling beheren | Volledig | Volledig        | -        | -     |
| Buurvoorkeuren opgeven | Volledig | Volledig        | Volledig | Eigen |

### Wiki en documentatie

| Functie                | Admin    | Bestuur  | Muziekcommissie | Lid      |
| ---------------------- | -------- | -------- | --------------- | -------- |
| Wiki lezen (publiek)   | Volledig | Volledig | Volledig        | Volledig |
| Wiki lezen (commissie) | Volledig | Volledig | Volledig        | -        |
| Wiki aanmaken          | Volledig | Volledig | Volledig        | -        |
| Wiki bewerken          | Volledig | Volledig | Volledig        | -        |

### Systeembeheer

| Functie                 | Admin    | Overige rollen |
| ----------------------- | -------- | -------------- |
| Verenigingsinstellingen | Volledig | -              |
| Thema en branding       | Volledig | -              |
| SMTP configuratie       | Volledig | -              |
| Spond configuratie      | Volledig | -              |
| Microsoft/Entra ID      | Volledig | -              |
| Betalingsinstellingen   | Volledig | -              |
| Audit logs bekijken     | Volledig | -              |
| Systeemgezondheid       | Volledig | -              |
| Backup/Restore          | Volledig | -              |
| Vakanties beheren       | Volledig | -              |

---

## Rollen-hierarchie

De rollen hebben een hierarchie voor bepaalde machtigingscontroles:

```
1. member (laagst)
2. section_leader*
3. conductor
4. music_committee
5. admin (hoogst)
```

*`section_leader` is een speciale rol voor sectieleiders die hun eigen sectie kunnen beheren.

### Hierarchische machtigingen

Bij sommige acties wordt gecontroleerd of je rol "minstens" een bepaald niveau heeft:

- Een `conductor` kan alles wat een `member` kan, plus meer
- Een `music_committee` lid kan alles wat een `conductor` kan, plus meer
- Een `admin` heeft alle rechten

---

## Speciale machtigingen

### Sectieleiders

Gebruikers met de rol `section_leader` kunnen:

- Hun eigen sectie (instrumentgroep) beheren
- Nieuwe stukken voor hun sectie uploaden
- Sectiespecifieke notities toevoegen

### Commissieleden met meerdere rechten

De volgende rollen hebben vergelijkbare rechten voor specifieke domeinen:

- `equipment_committee` - instrumentenbeheer
- `uniforms_committee` - uniformenbeheer
- `board` - evenementen en verenigingszaken

### Multi-associatie

Bij het beheren van meerdere verenigingen (multi-association):

- Per vereniging kan een aparte rol worden toegekend
- Machtigingen zijn strikt gescheiden per vereniging

---

## Tips voor beheerders

1. **Principe van minste machtiging**: Geef gebruikers alleen de rol die ze nodig hebben
2. **Muziekcommissie voor dagelijks beheer**: Deze rol is ideaal voor actieve leden die muziek beheren
3. **Dirigent voor repetities**: De dirigentrol is specifiek voor muzikale leiding
4. **Admin spaarzaam gebruiken**: Beperk admin-toegang tot 1-2 personen
5. **Bestuur voor evenementen**: Gebruik de bestuursrol voor verenigingsactiviteiten

---

## Rol wijzigen

Een gebruikersrol kan alleen worden gewijzigd door een beheerder:

1. Ga naar **Beheer > Leden**
2. Zoek de gebruiker
3. Klik op bewerken
4. Selecteer de nieuwe rol
5. Klik op **Opslaan**

Wijzigingen gaan direct in; de gebruiker hoeft niet opnieuw in te loggen.
