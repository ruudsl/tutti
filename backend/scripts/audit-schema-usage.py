"""
Audit: spreken de route-bestanden alleen tabellen en kolommen aan die echt bestaan,
en zijn alle routes bereikbaar?

De twee faalwijzen die bij polls boven water kwamen:
  1. SQL tegen een tabel of kolom die nergens is aangemaakt -> 500 bij elk gebruik
  2. een letterlijke route die na een /:param-route staat -> afgevangen, 404
"""

import json
import re
import sys
from pathlib import Path

REPO = Path('/home/user/tutti')
SCHEMA = json.load(open('/tmp/claude-0/-home-user-tutti/e0bfb839-735d-5bc8-a017-e42682d4226f/scratchpad/schema.json'))
TABLES = {t.lower(): {c.lower() for c in cols} for t, cols in SCHEMA.items()}

# Feature -> route-bestand(en), volgens de statusregels in docs/ROADMAP.md
FEATURES = {
    '1.1 Polls': ['polls.ts'],
    '1.2 Custom fields': ['custom-fields.ts'],
    '1.3 Boekhouding': ['accounting.ts'],
    '1.4 Granular privacy': ['privacy-settings.ts'],
    '1.5 External contacts': ['contacts.ts'],
    '1.6 Email bulk-mailing': ['email-campaigns.ts'],
    '1.7 Tasks': ['tasks.ts'],
    '2.1 Tour': ['tours.ts'],
    '2.2 Projects': ['projects.ts'],
    '2.3 Resource booking': ['resources.ts'],
    '2.4 Posts': ['posts.ts'],
    '2.5 Performance histories': ['performances.ts'],
    '2.6 Calendar + Info-Screen': ['calendar.ts'],
    '2.7 Workflow automation': ['workflows.ts'],
    '2.8 Equipment inventory': ['equipment.ts'],
    '2.9 Outfits': ['outfits.ts'],
    '2.10 Wiki': ['wiki.ts'],
    '2.11 OpenAPI': [],  # geen eigen route-bestand
}

# SQL-sleutelwoorden die geen tabelnaam zijn
NOISE = {
    'select', 'where', 'and', 'or', 'as', 'on', 'set', 'values', 'from', 'join',
    'left', 'inner', 'outer', 'group', 'order', 'by', 'limit', 'offset', 'having',
    'case', 'when', 'then', 'else', 'end', 'union', 'all', 'distinct', 'into',
    'insert', 'update', 'delete', 'not', 'null', 'is', 'in', 'exists', 'count',
}

TABLE_RE = re.compile(r'\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)', re.I)
INSERT_RE = re.compile(r'INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)', re.I | re.S)
ROUTE_RE = re.compile(r"router\.(get|post|put|patch|delete)\(\s*\n?\s*'([^']+)'", re.I)


def sql_strings(source: str):
    """Alle template literals en gewone strings die op SQL lijken."""
    for m in re.finditer(r'`([^`]*)`', source, re.S):
        body = m.group(1)
        if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b', body, re.I):
            yield body
    for m in re.finditer(r"'([^']{20,})'", source):
        body = m.group(1)
        if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE)\b', body, re.I):
            yield body


def audit_file(path: Path):
    source = path.read_text(encoding='utf-8')
    missing_tables, missing_columns = set(), []

    for sql in sql_strings(source):
        for name in TABLE_RE.findall(sql):
            low = name.lower()
            if low in NOISE or low in TABLES:
                continue
            # aliassen en subquery-namen overslaan
            if len(low) <= 3 and low not in TABLES:
                continue
            missing_tables.add(name)

        for table, collist in INSERT_RE.findall(sql):
            low = table.lower()
            if low not in TABLES:
                continue
            for col in collist.split(','):
                col = col.strip().strip('`"[]').lower()
                if not col or not re.fullmatch(r'[a-z_][a-z0-9_]*', col):
                    continue
                if col not in TABLES[low]:
                    missing_columns.append(f'{table}.{col}')

    # routevolgorde: letterlijk pad na een /:param-pad met hetzelfde aantal segmenten
    shadowed = []
    seen_param = {}
    for method, route in ROUTE_RE.findall(source):
        segments = [s for s in route.split('/') if s]
        key = (method.lower(), len(segments))
        if any(s.startswith(':') for s in segments):
            seen_param.setdefault(key, []).append(route)
        elif key in seen_param:
            for earlier in seen_param[key]:
                earlier_segments = [s for s in earlier.split('/') if s]
                if all(e.startswith(':') or e == s for e, s in zip(earlier_segments, segments)):
                    shadowed.append(f'{method.upper()} {route}  (afgevangen door {earlier})')
                    break

    return sorted(missing_tables), sorted(set(missing_columns)), shadowed


problems = 0
for feature, files in FEATURES.items():
    findings = []
    for fname in files:
        path = REPO / 'backend' / 'src' / 'routes' / fname
        if not path.exists():
            findings.append(f'  ONTBREEKT: {fname}')
            continue
        tables, columns, shadowed = audit_file(path)
        for t in tables:
            findings.append(f'  tabel bestaat niet: {t}   ({fname})')
        for c in columns:
            findings.append(f'  kolom bestaat niet: {c}   ({fname})')
        for s in shadowed:
            findings.append(f'  route onbereikbaar: {s}   ({fname})')

    status = 'OK' if not findings else f'{len(findings)} BEVINDING(EN)'
    print(f'{feature:32} {status}')
    for f in findings:
        print(f)
        problems += 1

print(f'\nTotaal aantal bevindingen: {problems}')
sys.exit(0)
