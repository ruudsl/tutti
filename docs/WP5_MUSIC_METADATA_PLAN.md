# WP5: Open Music Metadata - Stappenplan

**Doorlooptijd:** 4-5 weken (75 uur)  
**Afhankelijkheden:** Geen

---

## Week 1: Research & Database Schema (15 uur)

### 1.1 Research MusicXML standaard (4 uur)

- [ ] Analyseer MusicXML 4.0 specification (W3C)
- [ ] Identificeer relevante metadata velden voor orkestbeheer:
  - `work-title`, `work-number`, `movement-title`, `movement-number`
  - `creator` (composer, arranger, lyricist)
  - `rights`, `publisher`, `source`
  - `part-list` (instrumentatie)
  - `identification` (encoding date, software)
- [ ] Documenteer welke velden we ondersteunen vs. negeren
- [ ] Verzamel 5-10 voorbeeld MusicXML bestanden voor testing

### 1.2 Research JSKOS vocabularies (4 uur)

- [ ] Bestudeer JSKOS specificatie (https://gbv.github.io/jskos/)
- [ ] Identificeer relevante vocabularies:
  - **IAML Medium of Performance** - instrumentatie
  - **LCSH Music Genre/Form** - genres
  - **GND Musikalische Ausgabeform** - uitgavevorm
- [ ] Bepaal of we vocabularies lokaal cachen of extern bevragen
- [ ] Documenteer JSON-LD context voor onze implementatie

### 1.3 Database schema uitbreiding (7 uur)

- [ ] Ontwerp `music_metadata` tabel:
  ```sql
  CREATE TABLE music_metadata (
    id UUID PRIMARY KEY,
    music_title_id UUID REFERENCES music_titles(id),
    musicxml_work_number VARCHAR(100),
    movement_number INTEGER,
    movement_title VARCHAR(255),
    composer VARCHAR(255),
    arranger VARCHAR(255),
    lyricist VARCHAR(255),
    publisher VARCHAR(255),
    copyright TEXT,
    duration_seconds INTEGER,
    difficulty_level VARCHAR(50),
    instrumentation JSONB,  -- JSKOS references
    genres JSONB,           -- JSKOS references
    source_url TEXT,
    musicxml_raw TEXT,      -- Originele MusicXML voor round-trip
    created_at TIMESTAMP,
    updated_at TIMESTAMP
  );
  ```
- [ ] Ontwerp `vocabulary_cache` tabel voor JSKOS:
  ```sql
  CREATE TABLE vocabulary_cache (
    uri VARCHAR(500) PRIMARY KEY,
    vocabulary_id VARCHAR(100),
    pref_label JSONB,       -- {"nl": "...", "en": "...", "de": "..."}
    alt_labels JSONB,
    broader JSONB,
    narrower JSONB,
    fetched_at TIMESTAMP
  );
  ```
- [ ] Schrijf Prisma/TypeORM migratie
- [ ] Voer migratie uit op development database

---

## Week 2: MusicXML Parser & Import (18 uur)

### 2.1 MusicXML parser implementatie (10 uur)

- [ ] Installeer XML parsing library (`fast-xml-parser` of `xml2js`)
- [ ] Maak `MusicXMLParser` service:
  ```typescript
  interface ParsedMusicXML {
    workTitle: string;
    workNumber?: string;
    movementTitle?: string;
    movementNumber?: number;
    creators: { type: string; name: string }[];
    rights?: string;
    parts: { id: string; name: string; instrument?: string }[];
    raw: string;
  }
  ```
- [ ] Implementeer parsing van `<work>` element
- [ ] Implementeer parsing van `<identification>` element
- [ ] Implementeer parsing van `<part-list>` voor instrumentatie
- [ ] Valideer tegen MusicXML schema (optioneel, XSD)
- [ ] Unit tests voor parser met diverse MusicXML bestanden

### 2.2 Import functionaliteit (5 uur)

- [ ] Maak upload endpoint: `POST /api/music-titles/:id/musicxml`
- [ ] Valideer bestandstype en grootte (max 10MB)
- [ ] Parse en extraheer metadata
- [ ] Sla op in `music_metadata` tabel
- [ ] Link instrumentatie aan bestaande JSKOS vocabularies
- [ ] Foutafhandeling voor corrupte/ongeldige MusicXML

### 2.3 Batch import (3 uur)

- [ ] CLI script voor bulk import: `npm run import:musicxml <directory>`
- [ ] Progress logging en error rapport
- [ ] Dry-run optie voor preview

---

## Week 3: JSKOS Integratie (15 uur)

### 3.1 JSKOS client service (6 uur)

- [ ] Maak `JskosService` voor vocabulary lookups:
  ```typescript
  interface JskosService {
    searchConcepts(vocabulary: string, query: string): Promise<Concept[]>;
    getConcept(uri: string): Promise<Concept>;
    getHierarchy(uri: string): Promise<Concept[]>;
  }
  ```
- [ ] Implementeer caching in `vocabulary_cache` tabel
- [ ] Configureer externe JSKOS endpoints (lobid.org, bartoc.org)
- [ ] Fallback voor offline werking (gebruik cache)
- [ ] Rate limiting voor externe API calls

### 3.2 Instrumentatie vocabulary (5 uur)

- [ ] Importeer IAML Medium of Performance vocabulary
- [ ] Maak mapping van instrument namen naar JSKOS URIs
- [ ] Autocomplete endpoint: `GET /api/vocabularies/instruments?q=`
- [ ] Meertalige labels (NL/EN/DE)
- [ ] Link bestaande `music_titles.instrumentation` aan JSKOS

### 3.3 Genre/stijl vocabulary (4 uur)

- [ ] Importeer relevante genre vocabularies
- [ ] Autocomplete endpoint: `GET /api/vocabularies/genres?q=`
- [ ] Hiërarchische browse: `GET /api/vocabularies/genres/tree`
- [ ] Filter muziekstukken op genre

---

## Week 4: API Endpoints & Export (15 uur)

### 4.1 REST API voor metadata (6 uur)

- [ ] `GET /api/music-titles/:id/metadata` - Volledige metadata
- [ ] `PATCH /api/music-titles/:id/metadata` - Update metadata
- [ ] `GET /api/music-titles/:id/musicxml` - Export als MusicXML
- [ ] `GET /api/music-titles/search?composer=&genre=&instrument=`
- [ ] OpenAPI/Swagger documentatie voor nieuwe endpoints

### 4.2 MusicXML export (5 uur)

- [ ] Maak `MusicXMLGenerator` service
- [ ] Genereer valide MusicXML 4.0 uit database metadata
- [ ] Behoud originele MusicXML indien beschikbaar (round-trip)
- [ ] Bulk export: `GET /api/orchestras/:id/repertoire.xml`
- [ ] Download als ZIP met meerdere bestanden

### 4.3 Interoperabiliteit endpoints (4 uur)

- [ ] `GET /api/orchestras/:id/repertoire.json` - JSON-LD met JSKOS
- [ ] `GET /api/shared/repertoire` - Publiek endpoint voor federatie
- [ ] CORS configuratie voor cross-origin toegang
- [ ] API key authenticatie voor externe consumers

---

## Week 5: Migratie, Frontend & Documentatie (12 uur)

### 5.1 Migratie bestaande data (4 uur)

- [ ] Analyseer bestaande `music_titles` data
- [ ] Script om componist/arrangeur te extraheren uit titels
- [ ] Match instrumentatie strings naar JSKOS URIs
- [ ] Validatie rapport: wat kon niet gematcht worden?
- [ ] Dry-run en productie migratie

### 5.2 Frontend integratie (5 uur)

- [ ] Metadata tab toevoegen aan muziekstuk detail pagina
- [ ] MusicXML upload component met drag & drop
- [ ] Instrumentatie picker met autocomplete
- [ ] Genre selector met hiërarchie
- [ ] Export knop (MusicXML download)

### 5.3 Documentatie (3 uur)

- [ ] `docs/MUSIC_METADATA.md` - Overzicht van ondersteunde standaarden
- [ ] API documentatie in Swagger/OpenAPI
- [ ] Handleiding voor import/export workflows
- [ ] Voorbeeldcode voor externe integraties
- [ ] Update ROADMAP.md met voltooide taken

---

## Technische Specificaties

### MusicXML velden mapping

| MusicXML Element                           | Database veld                         | Type    |
| ------------------------------------------ | ------------------------------------- | ------- |
| `work/work-title`                          | `music_titles.title`                  | VARCHAR |
| `work/work-number`                         | `music_metadata.musicxml_work_number` | VARCHAR |
| `identification/creator[@type='composer']` | `music_metadata.composer`             | VARCHAR |
| `identification/creator[@type='arranger']` | `music_metadata.arranger`             | VARCHAR |
| `identification/rights`                    | `music_metadata.copyright`            | TEXT    |
| `part-list/score-part`                     | `music_metadata.instrumentation`      | JSONB   |

### JSKOS Vocabularies

| Vocabulary | URI Prefix                                        | Gebruik             |
| ---------- | ------------------------------------------------- | ------------------- |
| IAML MoP   | `http://iflastandards.info/ns/unimarc/terms/mop/` | Instrumenten        |
| LCGFT      | `http://id.loc.gov/authorities/genreForms/`       | Genres              |
| GND        | `https://d-nb.info/gnd/`                          | Componisten, werken |

### API Response voorbeeld

```json
{
  "id": "uuid",
  "title": "Symphony No. 5",
  "metadata": {
    "workNumber": "Op. 67",
    "composer": {
      "name": "Ludwig van Beethoven",
      "gndUri": "https://d-nb.info/gnd/118508288"
    },
    "instrumentation": [
      {
        "uri": "http://iflastandards.info/ns/unimarc/terms/mop/scc",
        "label": { "en": "Clarinet", "nl": "Klarinet", "de": "Klarinette" },
        "count": 2
      }
    ],
    "genres": [
      {
        "uri": "http://id.loc.gov/authorities/genreForms/gf2014026971",
        "label": { "en": "Symphonies" }
      }
    ]
  }
}
```

---

## Risico's & Mitigatie

| Risico                                            | Impact          | Mitigatie                                               |
| ------------------------------------------------- | --------------- | ------------------------------------------------------- |
| MusicXML bestanden zijn zeldzaam bij verenigingen | Lage adoptie    | Focus op handmatige metadata invoer, MusicXML als bonus |
| JSKOS endpoints zijn traag of offline             | Slechte UX      | Agressieve caching, lokale fallback                     |
| Vocabularies missen specifieke instrumenten       | Incomplete data | Custom vocabulary extensie met `notation:` prefix       |
| Complexiteit van MusicXML overschat               | Scope creep     | Alleen metadata elementen, geen notatie parsing         |

---

## Definition of Done

- [ ] MusicXML import werkt voor standaard bestanden
- [ ] JSKOS autocomplete werkt voor instrumenten en genres
- [ ] Metadata is zichtbaar en bewerkbaar in frontend
- [ ] Export genereert valide MusicXML
- [ ] Minimaal 80% test coverage voor nieuwe code
- [ ] API documentatie is compleet
- [ ] Bestaande data is gemigreerd

---

_Document versie: 1.0_  
_Aangemaakt: 2026-04-26_
