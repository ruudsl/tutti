# Tutti Roadmap — Feature Implementation Plan

> **Doel:** Per feature een concreet implementatie-blueprint: wat, database-wijzigingen, backend routes, frontend pages/components, integraties met bestaande Tutti-modules, acceptance criteria, en effort-schatting.

## Effort-schatting (T-shirt sizing)

| Size | Tijd |
|------|------|
| **XS** | 1–3 dagen |
| **S** | 1 week |
| **M** | 2–3 weken |
| **L** | 4–6 weken |
| **XL** | 8+ weken |

## Conventies

- Backend routes: `/api/<module>/...`
- Backend routes file: `backend/src/routes/<module>.ts`
- Frontend pages: `frontend/src/pages/<Module>/<Page>.tsx`
- Frontend hooks: `frontend/src/hooks/use<Module>.ts`

---

# Inhoudsopgave

## Fase 1 — Prioriteit HOOG
- [1.1 Polls / voting module](#11-polls--voting-module)
- [1.2 Custom fields per orchestra](#12-custom-fields-per-orchestra)
- [1.3 Boekhouding-module](#13-boekhouding-module)
- [1.4 Granular per-user privacy](#14-granular-per-user-privacy)
- [1.5 External contacts](#15-external-contacts)
- [1.6 Email bulk-mailing](#16-email-bulk-mailing)
- [1.7 Tasks module](#17-tasks-module)

## Fase 2 — Prioriteit MIDDEN
- [2.1 Tour module](#21-tour-module)
- [2.2 Probenphasen / Projects](#22-probenphasen--projects)
- [2.3 Resource booking](#23-resource-booking)
- [2.4 Posts / news module](#24-posts--news-module)
- [2.5 Performance histories](#25-performance-histories)
- [2.6 Calendar embedding + Info-Screen](#26-calendar-embedding--info-screen)
- [2.7 Workflow automation / Routines](#27-workflow-automation--routines)
- [2.8 Equipment / instrument inventory](#28-equipment--instrument-inventory)
- [2.9 Outfits-module](#29-outfits-module)
- [2.10 Wiki module](#210-wiki-module)
- [2.11 OpenAPI/Swagger + client libraries](#211-openapi--client-libraries)

## Bijlagen
- [Bijlage A: Fasering](#bijlage-a-fasering)
- [Bijlage B: Cross-cutting refactors](#bijlage-b-cross-cutting-refactors)
- [Bijlage C: Effort summary](#bijlage-c-effort-summary)

---

# 1.1 Polls / voting module

> **Effort: M (2–3 weken)**

## Wat & waarom

Een Doodle-achtige module binnen Tutti. Verenigingen organiseren constant stemmingen: nieuwe repetitiedag, uniformkleur, locatie van het feest, datum van een extra repetitie.

## User stories

- **US-1.1.1** Als dirigent wil ik een datumpoll uitzetten voor een extra repetitie.
- **US-1.1.2** Als bestuur wil ik een single-choice poll houden over uniformkleur.
- **US-1.1.3** Als beheerder wil ik bepalen wie aan een poll kan meedoen (specifieke orchestra / instrument-sectie / iedereen).
- **US-1.1.4** Als lid wil ik een poll-uitslag zien als grafiek én tabel.
- **US-1.1.5** Als dirigent wil ik dat de winnende datum automatisch wordt omgezet in een nieuwe rehearsal-instance.
- **US-1.1.6** Als beheerder wil ik instellen of een poll anoniem is.
- **US-1.1.7** Als poll-creator wil ik herinneringsmails versturen naar leden die nog niet hebben gestemd.

## Database schema

```sql
CREATE TABLE polls (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL REFERENCES associations(id),
    title TEXT NOT NULL,
    description TEXT,
    poll_type TEXT NOT NULL CHECK (poll_type IN ('date', 'single_choice', 'multi_choice')),
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    allow_change_vote INTEGER NOT NULL DEFAULT 1,
    deadline DATETIME,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','closed','archived')),
    target_orchestra_id TEXT REFERENCES orchestras(id),
    target_instrument_ids TEXT,
    auto_create_rehearsal INTEGER DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    deleted_at DATETIME
);

CREATE TABLE poll_options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    option_value TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE poll_votes (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    vote_value TEXT NOT NULL DEFAULT 'yes' CHECK (vote_value IN ('yes','maybe','no')),
    voted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poll_id, user_id, option_id)
);

CREATE TABLE poll_comments (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## Backend API

**Routes file:** `backend/src/routes/polls.ts`

```
GET    /api/polls
POST   /api/polls
GET    /api/polls/:id
PATCH  /api/polls/:id
DELETE /api/polls/:id

POST   /api/polls/:id/options
PATCH  /api/polls/:id/options/:optid
DELETE /api/polls/:id/options/:optid

POST   /api/polls/:id/vote
DELETE /api/polls/:id/vote

POST   /api/polls/:id/close
POST   /api/polls/:id/remind

GET    /api/polls/:id/results
GET    /api/polls/:id/comments
POST   /api/polls/:id/comments
```

## Frontend

**Pages:**
- `PollsList.tsx` — overzicht met filters
- `PollDetail.tsx` — detail met grafiek + tabel
- `PollForm.tsx` — create/edit
- `PollVote.tsx` — stemweergave

**Components:**
- `<PollCard>`
- `<PollOptionsEditor>`
- `<PollResultsBar>` — recharts grafiek
- `<PollVoteRow>` — yes/maybe/no kolommen

## Acceptance criteria

1. Een conductor kan een date-poll aanmaken met 5 opties, target = orkest A.
2. Alleen leden van orkest A zien de poll.
3. Een lid kan ja/maybe/no per optie aangeven en later wijzigen.
4. Sluiting maakt rehearsal aan op winnende datum (indien `auto_create_rehearsal`).
5. Anonieme polls tonen geen namen, alleen tellingen.
6. Reminder-mail naar non-voters.
7. Visuele uitslag met bar chart + percentage.

---

# 1.2 Custom fields per orchestra

> **Effort: M (2–3 weken)**

## Wat & waarom

Verenigingen verschillen sterk: de ene heeft rijbewijs-categorie nodig, de andere t-shirt-maat, een derde dieet-allergieën, een vierde KNMO-lidnummer. Hard-coden is niet schaalbaar.

## User stories

- **US-1.2.1** Als admin wil ik een tekstveld "KNMO-nummer" toevoegen aan members.
- **US-1.2.2** Als admin wil ik een dropdown "T-shirt maat" met opties XS-XXL.
- **US-1.2.3** Als admin wil ik een datumveld "VOG verloopt" met automatische reminder.
- **US-1.2.4** Als admin wil ik een veld als "verplicht" markeren.
- **US-1.2.5** Als admin wil ik velden alleen voor admins zichtbaar maken.
- **US-1.2.6** Als lid wil ik mijn eigen custom field-waardes kunnen invullen.

## Database schema

```sql
CREATE TABLE custom_field_definitions (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL REFERENCES associations(id),
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'user', 'orchestra', 'rehearsal', 'concert', 'music_piece', 'loan', 'instrument'
    )),
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN (
        'text', 'textarea', 'number', 'date', 'datetime',
        'boolean', 'select', 'multiselect', 'email', 'phone', 'url', 'file'
    )),
    field_options TEXT,
    is_required INTEGER NOT NULL DEFAULT 0,
    is_unique INTEGER NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'all' CHECK (visibility IN (
        'all', 'admin_only', 'committee_plus', 'self_only'
    )),
    self_editable INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    placeholder TEXT,
    default_value TEXT,
    validation_regex TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    UNIQUE(association_id, entity_type, field_key)
);

CREATE TABLE custom_field_values (
    id TEXT PRIMARY KEY,
    field_definition_id TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    value_text TEXT,
    value_number REAL,
    value_date DATETIME,
    value_boolean INTEGER,
    value_json TEXT,
    updated_by TEXT REFERENCES users(id),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(field_definition_id, entity_type, entity_id)
);
```

## Backend API

```
GET    /api/custom-fields/definitions?entity_type=user
POST   /api/custom-fields/definitions
PATCH  /api/custom-fields/definitions/:id
DELETE /api/custom-fields/definitions/:id

GET    /api/custom-fields/values/:entity_type/:entity_id
PUT    /api/custom-fields/values/:entity_type/:entity_id
DELETE /api/custom-fields/values/:entity_type/:entity_id/:field_key

POST   /api/custom-fields/values/bulk
```

## Frontend

**Pages:**
- `Settings/CustomFields/CustomFieldsList.tsx`
- `Settings/CustomFields/CustomFieldEditor.tsx`

**Components:**
- `<CustomFieldRenderer>` — universele renderer
- `<CustomFieldFormSection>` — embed in andere forms
- `<CustomFieldDisplay>` — read-only weergave

## Acceptance criteria

1. Admin kan veld "T-shirt maat" toevoegen met opties XS-XXL.
2. Het veld verschijnt in UserForm direct na opslaan.
3. Member ziet het veld als `self_editable=1`, anders read-only.
4. Bij `is_required=1` geeft form-submit fout als leeg.
5. Velden met `visibility=admin_only` zijn afwezig in API-response voor non-admins.
6. GDPR data export bevat custom_field_values.

---

# 1.3 Boekhouding-module

> **Effort: XL (8+ weken)**

## Wat & waarom

Verenigingen hebben nodig:
1. **Contributie-administratie**: jaarlijkse contributie per lid met SEPA-incasso
2. **Sectie-kassen**: elke sectie heeft een kleine kas
3. **Subsidies & ANBI**: rapportage ontvangen subsidies, giften
4. **Concert-financiën**: ticket-inkomsten, gage-uitgaven
5. **Buma/Stemra-rapportage**: gespeelde werken met componist + duur

## User stories

- **US-1.3.1** Als penningmeester wil ik contributie-categorieën definiëren en koppelen aan members.
- **US-1.3.2** Als penningmeester wil ik jaarlijks contributie-facturen genereren met SEPA-incasso.
- **US-1.3.3** Als penningmeester wil ik betalings-status zien per member.
- **US-1.3.4** Als slagwerk-coördinator wil ik een sectie-kas beheren.
- **US-1.3.5** Als penningmeester wil ik aan een concert kosten en opbrengsten koppelen.
- **US-1.3.6** Als bestuur wil ik een ANBI-rapportage genereren.
- **US-1.3.7** Als secretaris wil ik bank-export (CSV) inlezen voor automatische matching.
- **US-1.3.8** Als penningmeester wil ik een Buma/Stemra rapportage exporteren.

## Database schema (samenvatting)

```sql
-- Rekeningen/kassen
CREATE TABLE accounts (...)

-- Kostenposten
CREATE TABLE cost_centers (...)

-- Contributie-categorieën
CREATE TABLE membership_fee_types (...)

-- Koppeling member -> contributie
CREATE TABLE memberships (...)

-- Facturen
CREATE TABLE invoices (...)
CREATE TABLE invoice_lines (...)

-- Transacties
CREATE TABLE transactions (...)

-- Bank import
CREATE TABLE bank_statements (...)
CREATE TABLE bank_statement_lines (...)

-- Budgets
CREATE TABLE budgets (...)

-- Donaties
CREATE TABLE donations (...)

-- Boekjaren
CREATE TABLE fiscal_years (...)
```

## Backend API

```
# Accounts, Cost centers, Membership fees, Memberships
# Invoices + bulk runs
# Transactions
# Bank import + auto-match
# SEPA generation
# Budgets
# Donations
# Fiscal years
# Reports: profit-loss, balance, ANBI, Buma/Stemra
```

## Acceptance criteria

1. Rekeningschema met minimaal 10 standaard rekeningen.
2. Contributie-run voor 200 members genereert binnen 30 sec 200 invoices.
3. SEPA XML (pain.008) valideert tegen schema.
4. Bank CSV import plaatst lines correct.
5. Auto-match herkent invoice-nummer of IBAN+bedrag.
6. ANBI-rapportage exporteert XLSX.
7. Buma/Stemra rapport genereert lijst van werken.

---

# 1.4 Granular per-user privacy

> **Effort: M (3 weken)**

## Wat & waarom

Tutti registreert telefoon, adres, geboortedatum, etc. Onder AVG moet elk lid kunnen kiezen welke velden gedeeld worden met andere members.

## User stories

- **US-1.4.1** Als lid wil ik aangeven dat mijn telefoonnummer alleen voor mijn sectie-leden zichtbaar is.
- **US-1.4.2** Als lid wil ik mijn adres uitschakelen voor zichtbaarheid maar wel voor admin.
- **US-1.4.3** Als lid wil ik bij eerste login een privacy-onboarding krijgen.
- **US-1.4.4** Als nieuw lid wil ik begrijpen waarom elk veld gevraagd wordt.
- **US-1.4.5** Als admin wil ik privacy-defaults configureren.
- **US-1.4.6** Als lid wil ik een "data sheet" downloaden.

## Database schema

```sql
CREATE TABLE user_privacy_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN (
        'admin_only', 'committee', 'orchestra', 'section', 'all_members', 'public'
    )),
    custom_field_id TEXT REFERENCES custom_field_definitions(id),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, field_name)
);

CREATE TABLE association_privacy_defaults (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL REFERENCES associations(id),
    field_name TEXT NOT NULL,
    default_visibility TEXT NOT NULL,
    purpose_statement TEXT,
    is_required INTEGER DEFAULT 0,
    UNIQUE(association_id, field_name)
);

CREATE TABLE privacy_consents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    consent_version TEXT NOT NULL,
    consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT
);
```

## Backend API

```
GET    /api/privacy/my-settings
PUT    /api/privacy/my-settings
GET    /api/privacy/association-defaults
PUT    /api/privacy/association-defaults
POST   /api/privacy/consent
GET    /api/privacy/consent-status
GET    /api/privacy/data-sheet
GET    /api/privacy/visible-fields/:user_id
```

## Acceptance criteria

1. Lid kan per veld privacy-niveau wijzigen.
2. Wijziging naar `admin_only` zorgt dat collega's het veld als `null` zien.
3. Privacy onboarding bij eerste login.
4. Admin kan defaults instellen met purpose-statement.
5. "Mijn data" PDF beschikbaar.

---

# 1.5 External contacts

> **Effort: M (2 weken)**

## Wat & waarom

Tutti modelleert alleen users (= mensen met login). Verenigingen hebben veel contacten zonder login: veranstalters, gast-dirigenten, solisten, sponsors, leveranciers, andere verenigingen.

## User stories

- **US-1.5.1** Als secretaris wil ik een contact aanmaken voor "Gemeente Eindhoven Cultuurfonds".
- **US-1.5.2** Als bestuur wil ik een gast-dirigent registreren met IBAN voor uitbetaling.
- **US-1.5.3** Als music_committee wil ik een lening uitlenen aan een externe organisatie.
- **US-1.5.4** Als penningmeester wil ik een sponsor registreren.
- **US-1.5.5** Als beheerder wil ik contacten organiseren in categorieën.
- **US-1.5.6** Als secretaris wil ik een contact promoten naar full user.

## Database schema

```sql
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL REFERENCES associations(id),
    contact_type TEXT NOT NULL CHECK (contact_type IN ('organization','person','venue','vendor')),
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address_line TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'NL',
    iban TEXT,
    vat_number TEXT,
    website TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    promoted_to_user_id TEXT REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE TABLE contact_categories (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL REFERENCES associations(id),
    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE contact_category_links (
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES contact_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, category_id)
);
```

## Backend API

```
GET    /api/contacts
POST   /api/contacts
GET    /api/contacts/:id
PATCH  /api/contacts/:id
DELETE /api/contacts/:id
POST   /api/contacts/:id/promote

GET    /api/contacts/categories
POST   /api/contacts/categories

GET    /api/contacts/:id/relations
```

## Acceptance criteria

1. Contact aanmaken voor "Gemeente Eindhoven" met BTW, KvK.
2. ContactPicker bruikbaar in invoice-form.
3. Contact promoten naar user genereert email-uitnodiging.
4. Contact-history toont alle invoices, concerts, donations.

---

# 1.6 Email bulk-mailing

> **Effort: S–M (1.5 weken)**

## Wat & waarom

Tutti gebruikt SMTP alleen voor systeem-mail. Verenigingen versturen continu mail aan groepen: nieuwsbrieven, concert-aankondigingen, repetitie-wijzigingen.

## User stories

- **US-1.6.1** Als secretaris wil ik een mail aan alle members van orkest A versturen met PDF-bijlage.
- **US-1.6.2** Als penningmeester wil ik een herinneringsmail aan members met openstaande contributie.
- **US-1.6.3** Als bestuur wil ik zien wie de mail heeft geopend.
- **US-1.6.4** Als beheerder wil ik mail-templates aanmaken.
- **US-1.6.5** Als lid wil ik me kunnen afmelden van niet-essentiële mails.
- **US-1.6.6** Als beheerder wil ik testmail naar mezelf voor preview.

## Database schema

```sql
CREATE TABLE mail_templates (...)
CREATE TABLE mail_campaigns (...)
CREATE TABLE mail_campaign_attachments (...)
CREATE TABLE mail_campaign_recipients (...)
CREATE TABLE mail_subscriptions (...)
```

## Acceptance criteria

1. Campaign versturen naar 25 leden met PDF-bijlage.
2. Open-rate zichtbaar in stats.
3. Click-tracking werkt.
4. Unsubscribe-link werkt.
5. Test-mail naar mezelf.

---

# 1.7 Tasks module

> **Effort: S (1 week)**

## Wat & waarom

Verenigingen hebben constant operationele taken: "vleugel stemmen voor concert", "programmatekst drukken". Nu leeft dit in WhatsApp en post-its.

## User stories

- **US-1.7.1** Als bestuur wil ik een taak "vleugel stemmen" toewijzen met deadline.
- **US-1.7.2** Als toegewezen lid wil ik mijn taken zien op dashboard.
- **US-1.7.3** Als bestuur wil ik taken aan een concert koppelen.
- **US-1.7.4** Als bestuur wil ik checklists per concert.
- **US-1.7.5** Als beheerder wil ik checklist-templates.
- **US-1.7.6** Als toegewezen lid wil ik reminder 2 dagen voor deadline.

## Database schema

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    association_id TEXT NOT NULL REFERENCES associations(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
    priority TEXT DEFAULT 'normal',
    due_date DATETIME,
    assigned_user_id TEXT REFERENCES users(id),
    related_concert_id TEXT REFERENCES concerts(id),
    related_rehearsal_id TEXT REFERENCES rehearsal_instances(id),
    parent_task_id TEXT REFERENCES tasks(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    completed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE TABLE task_comments (...)
CREATE TABLE task_templates (...)
CREATE TABLE task_template_items (...)
```

## Acceptance criteria

1. Task aanmaken met titel, deadline, assignee.
2. Assignee ziet task op dashboard.
3. Concert-detail toont checklist van gerelateerde taken.
4. Template "Concert checklist" maakt automatisch taken aan.
5. Reminder-mail 2 dagen voor deadline.

---

# 2.1 Tour module

> **Effort: L (4–5 weken)**

Voor verenigingen die concertreizen of festivals doen. Tours zijn aaneenschakelingen van repetities + concerten + reizen + accommodatie + equipment.

---

# 2.2 Probenphasen / Projects

> **Effort: M (2 weken)**

Projecten groeperen: reeks repetities + concerten + specifieke deelnemerspool + setlist. Voorbeelden: "WMC 2026", "Kerstconcert-cyclus".

---

# 2.3 Resource booking

> **Effort: M (2 weken)**

Boekingen voor gedeelde resources: repetitielokalen, slagwerk-instrumenten, geluidsinstallatie, bus.

---

# 2.4 Posts / news module

> **Effort: M (2.5 weken)**

Nieuwsberichten binnen Tutti met embed-optie voor externe website. Concert-aankondigingen, ledenupdates, mijlpalen.

---

# 2.5 Performance histories

> **Effort: S (1 week)**

"Wanneer hebben we *Pirates of the Caribbean* voor het laatst gespeeld?" Tracking van uitgevoerde werken per concert.

---

# 2.6 Calendar embedding + Info-Screen

> **Effort: M (2 weken)**

Publieke kalender embed voor website + lobby-scherm met komende events. ICS-feeds voor Outlook/Google Calendar.

---

# 2.7 Workflow automation / Routines

> **Effort: L (4–5 weken)**

Automatische workflows met triggers, condities en acties:
- 30 dagen voor concert: reminder-mail
- Nieuw lid: welkomst-mail + agenda-uitnodigingen
- VOG verloopt: waarschuwing naar admin

---

# 2.8 Equipment / instrument inventory

> **Effort: M (2 weken)**

Inventaris van instrumenten en equipment: pauken, marimba, lessenaars, microfoons. Met aankoopwaarde, afschrijving, uitleenregistratie.

---

# 2.9 Outfits-module

> **Effort: XS (3 dagen)**

Outfit-definities ("Concert-zwart", "Vrolijk shirt") die aan concerten gekoppeld kunnen worden.

---

# 2.10 Wiki module

> **Effort: M (2 weken)**

Interne wiki voor notulen, draaiboeken, procedures. Markdown editor met versiegeschiedenis en per-pagina permissions.

---

# 2.11 OpenAPI/Swagger + client libraries

> **Effort: M (2 weken)**

Formele API-documentatie met Swagger UI. Gegenereerde TypeScript en PHP clients voor third-party integraties.

---

# Bijlage A: Fasering

## Fase A — Foundation (3 maanden)
- 1.4 Granular per-user privacy *(M)*
- 1.5 External contacts *(M)*
- 1.2 Custom fields *(M)*

## Fase B — Communication (3 maanden)
- 1.1 Polls module *(M)*
- 1.6 Email bulk-mailing *(S–M)*
- 1.7 Tasks module *(S)*
- 2.4 Posts/news module *(M)*

## Fase C — Finance + API (3 maanden)
- 1.3 Boekhouding-module *(XL)*
- 2.11 OpenAPI/Swagger *(M)*

## Fase D — Operations (3 maanden)
- 2.1 Tour module *(L)*
- 2.2 Projects *(M)*
- 2.3 Resource booking *(M)*
- 2.8 Equipment inventory *(M)*

## Fase E — Automation + Content (3 maanden)
- 2.7 Workflow automation *(L)*
- 2.5 Performance histories *(S)*
- 2.6 Calendar embedding *(M)*
- 2.10 Wiki module *(M)*
- 2.9 Outfits module *(XS)*

---

# Bijlage B: Cross-cutting refactors

Deze refactors helpen meerdere features:

| Refactor | Effort | Beschrijving |
|----------|--------|--------------|
| **Migration framework** | XS | Incrementele schema-changes met up/down SQL |
| **Generic file-upload** | S | Storage abstraction, mime-type validatie |
| **Notification service** | S | Email + push + in-app met preferences |
| **Audit log uitbreiden** | XS | Voor-en-na waardes, entity filters |
| **Rich-text editor** | S | Tiptap standaardisatie voor posts/mail/wiki |
| **Permission framework** | M | Permission tags, roles als bundles |

---

# Bijlage C: Effort summary

| Feature | Size | Weken |
|---------|------|-------|
| **Fase 1 (HOOG)** | | |
| 1.1 Polls | M | 2-3 |
| 1.2 Custom fields | M | 2-3 |
| 1.3 Boekhouding | XL | 8+ |
| 1.4 Privacy | M | 3 |
| 1.5 External contacts | M | 2 |
| 1.6 Mail bulk | S–M | 1.5 |
| 1.7 Tasks | S | 1 |
| **Fase 2 (MIDDEN)** | | |
| 2.1 Tour | L | 4-5 |
| 2.2 Projects | M | 2 |
| 2.3 Resource booking | M | 2 |
| 2.4 Posts | M | 2.5 |
| 2.5 Performance histories | S | 1 |
| 2.6 Calendar embed | M | 2 |
| 2.7 Routines | L | 4-5 |
| 2.8 Equipment | M | 2 |
| 2.9 Outfits | XS | 0.5 |
| 2.10 Wiki | M | 2 |
| 2.11 OpenAPI | M | 2 |
| **Cross-cutting** | | |
| Migrations | XS | 0.5 |
| File-upload | S | 1 |
| Notifications | S | 1 |
| Audit log | XS | 0.5 |
| Rich-text | S | 1 |
| Permissions | M | 2 |
| **TOTAAL** | | **~52 weken** |
