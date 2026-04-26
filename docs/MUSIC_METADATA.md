# Music Metadata Standards

Dit document beschrijft de open muziek metadata standaarden die Tutti ondersteunt.

---

## MusicXML 4.0

MusicXML is de standaard voor uitwisseling van muzieknotatie. Tutti ondersteunt de metadata-elementen uit MusicXML voor het verrijken van de muziekbibliotheek.

### Ondersteunde elementen

#### Work Element (`<work>`)
| Element | Beschrijving | Database veld |
|---------|--------------|---------------|
| `<work-number>` | Opus nummer of catalogusnummer (bijv. "Op. 67", "K. 545") | `music_metadata.work_number` |
| `<work-title>` | Titel van het complete werk | `music_titles.title` |

#### Movement (`<movement-number>`, `<movement-title>`)
| Element | Beschrijving | Database veld |
|---------|--------------|---------------|
| `<movement-number>` | Deelnummer binnen het werk | `music_metadata.movement_number` |
| `<movement-title>` | Titel van het deel | `music_metadata.movement_title` |

#### Identification Element (`<identification>`)
| Element | Beschrijving | Database veld |
|---------|--------------|---------------|
| `<creator type="composer">` | Componist | `music_titles.composer` |
| `<creator type="arranger">` | Arrangeur | `music_titles.arranger` |
| `<creator type="lyricist">` | Tekstschrijver | `music_metadata.lyricist` |
| `<creator type="poet">` | Dichter (voor liederen) | `music_metadata.lyricist` |
| `<rights>` | Copyright informatie | `music_metadata.rights` |
| `<source>` | Bron (bijv. uitgever, editie) | `music_metadata.source` |
| `<encoding><software>` | Software die het bestand maakte | `music_metadata.encoding_software` |
| `<encoding><encoding-date>` | Datum van encoding | `music_metadata.encoding_date` |

#### Part List (`<part-list>`)
| Element | Beschrijving | Database veld |
|---------|--------------|---------------|
| `<score-part><part-name>` | Naam van de partij | `music_metadata.parts` (JSONB) |
| `<score-part><part-abbreviation>` | Afkorting | `music_metadata.parts` (JSONB) |
| `<score-instrument>` | Instrument details | `music_metadata.parts` (JSONB) |

### Voorbeeld MusicXML header

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-number>Op. 67</work-number>
    <work-title>Symphony No. 5</work-title>
  </work>
  <movement-number>1</movement-number>
  <movement-title>Allegro con brio</movement-title>
  <identification>
    <creator type="composer">Ludwig van Beethoven</creator>
    <creator type="arranger">Jan de Vries</creator>
    <rights>Public Domain</rights>
    <encoding>
      <software>MuseScore 4.0</software>
      <encoding-date>2024-01-15</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Flute 1</part-name>
      <part-abbreviation>Fl. 1</part-abbreviation>
    </score-part>
    <score-part id="P2">
      <part-name>Clarinet in Bb</part-name>
      <part-abbreviation>Cl.</part-abbreviation>
    </score-part>
  </part-list>
  <!-- ... notation data ... -->
</score-partwise>
```

### Niet-ondersteunde elementen

Tutti importeert **alleen metadata**, niet de muzieknotatie zelf. De volgende elementen worden genegeerd:
- `<part>` (muzieknotatie)
- `<measure>` (maten)
- `<note>` (noten)
- `<defaults>` (layout instellingen)
- `<credit>` (pagina teksten)

---

## JSKOS Vocabularies

JSKOS (JSON for Knowledge Organization Systems) is een JSON-LD formaat voor thesauri en classificatiesystemen. Tutti gebruikt JSKOS voor gestandaardiseerde vocabularies.

### Ondersteunde vocabularies

#### 1. Instrumenten (IAML Medium of Performance)
Gebaseerd op de UNIMARC codes voor muziekinstrumenten.

```json
{
  "uri": "http://iflastandards.info/ns/unimarc/terms/mop/sca",
  "prefLabel": {
    "en": "Flute",
    "nl": "Fluit",
    "de": "Flöte"
  },
  "broader": [{
    "uri": "http://iflastandards.info/ns/unimarc/terms/mop/s",
    "prefLabel": {"en": "Woodwinds"}
  }]
}
```

**Hoofdcategorieën:**
| Code | Instrument familie |
|------|-------------------|
| `s` | Houtblazers (Woodwinds) |
| `b` | Koperblazers (Brass) |
| `p` | Slagwerk (Percussion) |
| `t` | Strijkers (Strings) |
| `k` | Keyboards |

#### 2. Genres (LCGFT - Library of Congress Genre/Form Terms)
Voor muziekgenres en vormen.

```json
{
  "uri": "http://id.loc.gov/authorities/genreForms/gf2014026951",
  "prefLabel": {
    "en": "Marches"
  },
  "broader": [{
    "uri": "http://id.loc.gov/authorities/genreForms/gf2014026891",
    "prefLabel": {"en": "Instrumental music"}
  }]
}
```

**Veelgebruikte genres voor harmonieorkesten:**
| URI suffix | Genre |
|------------|-------|
| `gf2014026951` | Marches |
| `gf2014027048` | Overtures |
| `gf2014027188` | Suites |
| `gf2014027245` | Waltzes |
| `gf2014026971` | Symphonies |
| `gf2014026870` | Fanfares |

#### 3. Componisten (GND - Gemeinsame Normdatei)
Duitse nationale autoriteitsbestand, ook voor internationale componisten.

```json
{
  "uri": "https://d-nb.info/gnd/118508288",
  "prefLabel": {
    "de": "Beethoven, Ludwig van"
  },
  "altLabel": [
    "Ludwig van Beethoven",
    "Beethoven"
  ],
  "dateOfBirth": "1770",
  "dateOfDeath": "1827"
}
```

### Lokale extensies

Voor instrumenten of termen die niet in standaard vocabularies voorkomen, gebruiken we een lokaal prefix:

```json
{
  "uri": "tutti:instrument/flugelhorn",
  "prefLabel": {
    "en": "Flugelhorn",
    "nl": "Bugel",
    "de": "Flügelhorn"
  },
  "inScheme": [{
    "uri": "tutti:scheme/instruments"
  }]
}
```

---

## Database Schema

### music_metadata tabel

Uitbreiding op `music_titles` voor MusicXML-specifieke metadata.

```sql
CREATE TABLE music_metadata (
    id TEXT PRIMARY KEY,
    music_title_id TEXT NOT NULL UNIQUE,
    
    -- MusicXML work info
    work_number TEXT,           -- "Op. 67", "K. 545"
    movement_number INTEGER,
    movement_title TEXT,
    
    -- Additional creators
    lyricist TEXT,
    
    -- Rights and source
    rights TEXT,                -- Copyright info
    source TEXT,                -- Publisher, edition
    
    -- Encoding info
    encoding_software TEXT,
    encoding_date DATE,
    
    -- Structured data (JSONB)
    parts JSONB,                -- Instrumentation from part-list
    
    -- Original MusicXML for round-trip
    musicxml_raw TEXT,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE
);
```

### vocabulary_cache tabel

Cache voor externe JSKOS vocabularies.

```sql
CREATE TABLE vocabulary_cache (
    uri TEXT PRIMARY KEY,
    vocabulary_type TEXT NOT NULL,  -- 'instrument', 'genre', 'composer'
    
    -- Labels (multilingual)
    pref_label JSONB NOT NULL,      -- {"en": "...", "nl": "...", "de": "..."}
    alt_labels JSONB,               -- ["alias1", "alias2"]
    
    -- Hierarchy
    broader JSONB,                  -- Parent concepts
    narrower JSONB,                 -- Child concepts
    
    -- Extra metadata
    notation TEXT,                  -- Short code (e.g., "sca" for flute)
    definition JSONB,               -- Scope notes
    
    -- Cache management
    source_url TEXT,                -- Where we fetched this from
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);
```

### music_title_instruments tabel

Koppeling tussen muziekstukken en instrumenten uit vocabulary.

```sql
CREATE TABLE music_title_instruments (
    music_title_id TEXT NOT NULL,
    instrument_uri TEXT NOT NULL,
    count INTEGER DEFAULT 1,        -- Aantal van dit instrument
    is_optional BOOLEAN DEFAULT 0,  -- Optionele partij
    notes TEXT,                     -- "1st chair only", "cued in Trumpet"
    
    PRIMARY KEY (music_title_id, instrument_uri),
    FOREIGN KEY (music_title_id) REFERENCES music_titles(id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_uri) REFERENCES vocabulary_cache(uri) ON DELETE CASCADE
);
```

---

## API Endpoints

### Metadata

| Method | Endpoint | Beschrijving |
|--------|----------|--------------|
| `GET` | `/api/music-titles/:id/metadata` | Volledige metadata ophalen |
| `PATCH` | `/api/music-titles/:id/metadata` | Metadata bijwerken |
| `POST` | `/api/music-titles/:id/musicxml` | MusicXML uploaden en parsen |
| `GET` | `/api/music-titles/:id/musicxml` | MusicXML exporteren |

### Vocabularies

| Method | Endpoint | Beschrijving |
|--------|----------|--------------|
| `GET` | `/api/vocabularies/instruments?q=` | Instrumenten zoeken |
| `GET` | `/api/vocabularies/instruments/tree` | Instrumenten hiërarchie |
| `GET` | `/api/vocabularies/genres?q=` | Genres zoeken |
| `GET` | `/api/vocabularies/genres/tree` | Genre hiërarchie |

### Interoperabiliteit

| Method | Endpoint | Beschrijving |
|--------|----------|--------------|
| `GET` | `/api/orchestras/:id/repertoire.json` | Repertoire als JSON-LD |
| `GET` | `/api/orchestras/:id/repertoire.xml` | Repertoire als MusicXML bundle |

---

## Referenties

- [MusicXML 4.0 Specification](https://www.w3.org/2021/06/musicxml40/)
- [JSKOS Data Format](https://gbv.github.io/jskos/)
- [IAML Medium of Performance](http://iflastandards.info/ns/unimarc/terms/mop/)
- [Library of Congress Genre/Form Terms](http://id.loc.gov/authorities/genreForms.html)
- [GND - Gemeinsame Normdatei](https://www.dnb.de/gnd)

---

---

## CLI Scripts

### MusicXML Batch Import

```bash
# Preview import (dry run)
npm run import:musicxml ./musicxml --association abc123 --dry-run

# Import and create new titles for unmatched files
npm run import:musicxml ./musicxml --association abc123 --create --verbose
```

### JSKOS Migration

```bash
# Preview migration (dry run)
npm run migrate:jskos --dry-run

# Run migration for specific association
npm run migrate:jskos --association abc123 --verbose
```

---

## Frontend Componenten

### InstrumentPicker

Autocomplete component voor het selecteren van instrumenten.

```tsx
import { InstrumentPicker } from '../components/InstrumentPicker';

<InstrumentPicker
  value={selectedInstruments}
  onChange={setSelectedInstruments}
/>
```

### GenrePicker

Multi-select component voor genres.

```tsx
import { GenrePicker } from '../components/GenrePicker';

<GenrePicker
  value={selectedGenreUris}
  onChange={setSelectedGenreUris}
/>
```

### MusicXMLUpload

Drag & drop component voor MusicXML uploads.

```tsx
import { MusicXMLUpload } from '../components/MusicXMLUpload';

<MusicXMLUpload
  titleId={titleId}
  hasExistingData={hasMetadata}
  onSuccess={() => refetch()}
/>
```

---

*Document versie: 1.1*  
*Laatst bijgewerkt: 2026-04-26*
