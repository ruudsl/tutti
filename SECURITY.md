# Beveiligingsbeleid

## Ondersteunde Versies

| Versie | Ondersteund        |
| ------ | ------------------ |
| 1.x    | :white_check_mark: |
| < 1.0  | :x:                |

Wij ondersteunen uitsluitend de nieuwste hoofdversie met beveiligingsupdates. Oudere versies ontvangen geen patches.

## Een Kwetsbaarheid Melden

Wij nemen de beveiliging van Tutti serieus. Als je een beveiligingsprobleem ontdekt, help ons dan om dit verantwoord te melden.

### Meldingskanalen

1. **E-mail (voorkeur):** security@tutti.nl
2. **GitHub Security Advisories:** [github.com/ruudsl/tutti/security/advisories/new](https://github.com/ruudsl/tutti/security/advisories/new)

### Wat te Melden

- Beschrijving van de kwetsbaarheid
- Stappen om het probleem te reproduceren
- Potentiele impact
- Eventuele suggesties voor een oplossing

### Reactietijd

| Fase                        | Termijn               |
| --------------------------- | --------------------- |
| Eerste ontvangstbevestiging | Binnen 48 uur         |
| Beoordeling en triage       | Binnen 7 dagen        |
| Oplossing en patch          | Afhankelijk van ernst |
| Publieke disclosure         | Na release van fix    |

### Wat te Verwachten

1. **Ontvangstbevestiging** — Wij bevestigen je melding binnen 48 uur.
2. **Communicatie** — Wij houden je op de hoogte van de voortgang.
3. **Erkenning** — Met je toestemming vermelden we je in de release notes.
4. **Geen juridische actie** — Wij ondernemen geen juridische stappen tegen onderzoekers die zich aan dit beleid houden.

## Verantwoorde Disclosure

Wij vragen je om:

- **Niet** openbaar te maken totdat wij een oplossing hebben uitgebracht.
- **Niet** kwetsbaarheden te misbruiken om data van anderen te verkrijgen.
- **Niet** denial-of-service aanvallen uit te voeren.
- **Ons de tijd te geven** om het probleem op te lossen voordat je publiceert.

## Beveiligingsmaatregelen in Tutti

### Authenticatie & Autorisatie

- **JWT-tokens** met configureerbare geldigheidsduur
- **TOTP MFA** — Optionele tweefactorauthenticatie via authenticator-app
- **Microsoft SSO** — Azure Entra ID integratie voor enterprise-omgevingen
- **Rolgebaseerde toegang** — Fijnmazige permissies per gebruikersrol
- **Sessie-beheer** — Actieve sessies kunnen worden bekeken en ingetrokken

### Invoervalidatie & Bescherming

- **Zod-validatie** — Alle API-invoer wordt server-side gevalideerd
- **SQL-injectie preventie** — Uitsluitend geparametriseerde queries
- **XSS-bescherming** — React's ingebouwde escaping en Content Security Policy
- **CSRF-bescherming** — SameSite cookies
- **Helmet.js** — Veilige HTTP-headers

### Rate Limiting

- **Per-IP en per-gebruiker limieten** — Bescherming tegen brute-force aanvallen
- **Authenticatie-specifieke limieten** — Stricter voor login-endpoints
- **Configureerbaar** — Aanpasbaar via omgevingsvariabelen

### Bestandsuploads

- **Bestandstype validatie** — Alleen toegestane bestandstypen (PDF, audio)
- **Grootte limieten** — Maximum bestandsgrootte per upload
- **Veilige opslag** — Geuploade bestanden worden buiten de webroot opgeslagen
- **Virus scanning** — Aanbevolen voor productie-omgevingen

### Data-isolatie (Multi-tenant)

- **Tenant-isolatie** — Alle data wordt gefilterd op `association_id`
- **JWT claims** — Associatie-ID wordt opgenomen in de token
- **Query-filters** — Automatische filtering in alle database queries

### Logging & Monitoring

- **Audit logs** — Beveiligingsgebeurtenissen worden gelogd
- **Activiteitenlog** — Wie bekijkt en downloadt wat
- **Health dashboard** — Real-time monitoring van systeemstatus (admin-only)

### Netwerk & Infrastructuur

- **HTTPS verplicht** — TLS 1.2+ voor alle verkeer
- **Let's Encrypt** — Automatische SSL-certificaten in productie
- **Firewall aanbevelingen** — UFW-configuratie gedocumenteerd
- **Docker security** — Geen root-processen in containers

## Best Practices voor Beheerders

### Configuratie

```bash
# Genereer een sterk JWT-geheim
JWT_SECRET=$(openssl rand -base64 64)

# Stel rate limiting in
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX_REQUESTS=5
```

### Regelmatig Onderhoud

1. **Update regelmatig** — Houd Docker, Node.js en dependencies up-to-date
2. **Maak backups** — Dagelijkse geautomatiseerde backups
3. **Controleer logs** — Monitor op verdachte activiteit
4. **Roteer secrets** — Wijzig JWT-geheimen periodiek

### Firewall Configuratie

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (redirect naar HTTPS)
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

## Bekende Beperkingen

- **SQLite** — Niet geschikt voor zeer hoge belasting of gedistribueerde deployments
- **Lokale bestandsopslag** — Overweeg object storage (S3) voor grote installaties
- **Single-server** — Geen ingebouwde clustering

## Contact

Voor beveiligingszaken: security@tutti.nl

Voor algemene vragen: [GitHub Discussions](https://github.com/ruudsl/tutti/discussions)
