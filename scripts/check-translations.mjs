#!/usr/bin/env node
/**
 * Check translation files (en/de/nl) for:
 *  1. Key-set differences between locales (missing/extra keys vs en.json)
 *  2. Suspicious untranslated values: en === de for values longer than 8
 *     characters that are not on the allowlist of terms that are
 *     legitimately identical in German.
 *
 * Usage:
 *   node scripts/check-translations.mjs           # report only, exit 0
 *   node scripts/check-translations.mjs --strict  # exit 1 when issues found
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const strict = process.argv.includes('--strict');
const localesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src', 'locales');

const MIN_LENGTH = 9; // values shorter than this are not flagged

// Terms that are legitimately identical in English and German.
const ALLOWLIST = new Set(
  [
    'Name (A-Z)',
    'Name (Z-A)',
    'Dashboard',
    'Administrator',
    'Instrument',
    'Changelog',
    'Navigation',
    'Workflows',
    'Downloads',
    'Monospace',
    'Repertoire',
    'Standards',
    'Organisation',
    'Transport',
    'Soundcheck',
    'Super Admin',
    'Enterprise',
    'Sponsoring',
    'Bancontact',
    'Apple Pay',
    'Google Pay',
    'Client Secret',
    'Microsoft 365 / Entra ID',
    'Meta WhatsApp Business API',
    'Tempo: {{bpm}} BPM',
    'Version {{number}}',
    'Option 1\nOption 2\nOption 3',
  ].map((s) => s.toLowerCase()),
);

function load(locale) {
  return JSON.parse(readFileSync(join(localesDir, `${locale}.json`), 'utf8'));
}

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

const en = flatten(load('en'));
const de = flatten(load('de'));
const nl = flatten(load('nl'));

let issues = 0;

function reportKeyDiff(name, target) {
  const enKeys = new Set(Object.keys(en));
  const targetKeys = new Set(Object.keys(target));
  const missing = [...enKeys].filter((k) => !targetKeys.has(k));
  const extra = [...targetKeys].filter((k) => !enKeys.has(k));
  if (missing.length === 0 && extra.length === 0) {
    console.log(`[ok] ${name}: key set matches en (${enKeys.size} keys)`);
    return;
  }
  issues += missing.length + extra.length;
  if (missing.length > 0) {
    console.log(`[!!] ${name}: ${missing.length} key(s) missing (present in en):`);
    for (const k of missing) console.log(`       - ${k}`);
  }
  if (extra.length > 0) {
    console.log(`[!!] ${name}: ${extra.length} extra key(s) (absent in en):`);
    for (const k of extra) console.log(`       - ${k}`);
  }
}

reportKeyDiff('de', de);
reportKeyDiff('nl', nl);

const suspicious = [];
for (const [key, value] of Object.entries(en)) {
  if (typeof value !== 'string') continue;
  if (de[key] !== value) continue;
  if (value.length < MIN_LENGTH) continue;
  if (ALLOWLIST.has(value.trim().toLowerCase())) continue;
  if (/^https?:\/\//.test(value.trim())) continue;
  suspicious.push(key);
}

if (suspicious.length === 0) {
  console.log('[ok] de: no suspicious identical en==de values');
} else {
  issues += suspicious.length;
  console.log(`[!!] de: ${suspicious.length} suspicious identical en==de value(s) (possibly untranslated):`);
  for (const k of suspicious) console.log(`       - ${k}: ${JSON.stringify(en[k])}`);
}

if (issues > 0) {
  console.log(`\n${issues} issue(s) found.`);
  process.exit(strict ? 1 : 0);
} else {
  console.log('\nAll translation checks passed.');
}
