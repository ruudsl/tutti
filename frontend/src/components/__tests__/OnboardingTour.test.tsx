/**
 * De rondleiding voor de beheerder moet de modules noemen.
 *
 * Modules staan standaard uit. Een beheerder die dat nergens te horen krijgt,
 * ziet alleen een klein menu en gaat ervan uit dat Tutti die onderdelen niet
 * heeft. De stap staat daarom vroeg in de rondleiding, meteen na het welkom,
 * want deze keuze bepaalt hoe de rest van de applicatie eruitziet.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import nl from '../../locales/nl.json';
import en from '../../locales/en.json';
import de from '../../locales/de.json';

const source = fs.readFileSync(path.join(__dirname, '../OnboardingTour.tsx'), 'utf-8');

/** De stappen van de beheerder-rondleiding, in volgorde, uit de bron. */
function adminStepKeys(): string[] {
  const start = source.indexOf('admin: [');
  const end = source.indexOf('music_committee: [');
  const block = source.slice(start, end);

  return [...block.matchAll(/titleKey: 'onboarding\.admin\.(\w+)\.title'/g)].map((m) => m[1]);
}

describe('rondleiding voor de beheerder', () => {
  it('noemt de modules', () => {
    expect(adminStepKeys()).toContain('modules');
  });

  it('doet dat meteen na het welkom', () => {
    const steps = adminStepKeys();

    expect(steps[0]).toBe('welcome');
    expect(steps[1]).toBe('modules');
  });

  it('stuurt de beheerder naar het modulescherm', () => {
    const start = source.indexOf("titleKey: 'onboarding.admin.modules.title'");
    const step = source.slice(start, source.indexOf('},', start));

    expect(step).toContain("navigateTo: '/modules'");
  });

  it.each([
    ['nl', nl],
    ['en', en],
    ['de', de],
  ])('heeft een titel en omschrijving in %s', (_lang, translations) => {
    const step = (translations as any).onboarding.admin.modules;

    expect(step.title.trim().length).toBeGreaterThan(0);
    expect(step.description.trim().length).toBeGreaterThan(20);
  });

  it('vertelt in alle talen dat er geen gegevens verloren gaan', () => {
    // Dit is de vraag die een beheerder bij een uit-schakelaar als eerste
    // stelt, dus het antwoord hoort in de tekst zelf te staan.
    expect(nl.onboarding.admin.modules.description).toMatch(/gegevens verloren/i);
    expect(en.onboarding.admin.modules.description).toMatch(/no data is ever lost/i);
    expect(de.onboarding.admin.modules.description).toMatch(/keine Daten verloren/i);
  });

  it.each([
    ['nl', nl],
    ['en', en],
    ['de', de],
  ])('heeft in %s een vertaling voor elke stap uit de bron', (_lang, translations) => {
    const admin = (translations as any).onboarding.admin;

    for (const key of adminStepKeys()) {
      expect(admin[key], `ontbrekende vertaling: onboarding.admin.${key}`).toBeDefined();
    }
  });
});
