/**
 * Tests voor de vertaallaag onder de formuliervalidatie.
 *
 * Zod schrijft zijn meldingen in het Engels ("Too small: expected string to
 * have >=8 characters"). `createI18nErrorMap` zet die om naar de taal van de
 * gebruiker. Gaat dat mis, dan staat er onder een Nederlands invoerveld een
 * Engelse zin die over tekens en types gaat - de gebruiker weet dan wel dát er
 * iets fout is, maar niet wát.
 *
 * De omzetting hangt aan de foutcode én de herkomst (`origin`) van de fout:
 * dezelfde code `too_small` betekent bij tekst "te kort", bij een getal "te
 * laag" en bij een lijst "te weinig gekozen". Verwissel je die, dan krijgt
 * iemand die één instrument te weinig aanvinkt te horen dat zijn invoer te
 * kort is.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { createI18nErrorMap, validateField } from '../utils';
import { timeSchema, rehearsalSchema, resetPasswordSchema, nameSchema, emailSchema } from '../schemas';

/**
 * Een nagebootste i18next-vertaalfunctie.
 *
 * Geeft de sleutel terug tussen vierkante haken, met de meegegeven waarden
 * erachter. Zo is in een assertie te zien wélke sleutel is opgevraagd en welke
 * getallen erin gaan - precies wat er misgaat als min en max verwisseld raken.
 */
function nepVertaler(): TFunction & { sleutels: string[] } {
  const sleutels: string[] = [];
  const t = (sleutel: string, opties?: unknown) => {
    sleutels.push(sleutel);
    if (typeof opties === 'object' && opties !== null) {
      const waarden = Object.entries(opties as Record<string, unknown>)
        .filter(([naam]) => naam !== 'defaultValue')
        .map(([naam, waarde]) => `${naam}=${String(waarde)}`);
      return waarden.length > 0 ? `[${sleutel} ${waarden.join(' ')}]` : `[${sleutel}]`;
    }
    return `[${sleutel}]`;
  };
  return Object.assign(t as unknown as TFunction, { sleutels });
}

/** De vertaalde melding van de eerste fout die `schema` op `waarde` geeft. */
function melding(schema: z.ZodType, waarde: unknown, t: TFunction): string | undefined {
  const uitkomst = schema.safeParse(waarde, { error: createI18nErrorMap(t) });
  return uitkomst.success ? undefined : uitkomst.error.issues[0]?.message;
}

describe('createI18nErrorMap', () => {
  describe('een ontbrekende of verkeerde waarde', () => {
    it('noemt null en undefined "verplicht", niet "verkeerd type"', () => {
      // Voor de gebruiker is een leeg veld iets anders dan een verkeerd
      // ingevuld veld. "Ongeldig type" zegt hem niets; "verplicht" wel.
      const t = nepVertaler();
      expect(melding(z.string(), null, t)).toBe('[errors.required]');
      expect(melding(z.string(), undefined, t)).toBe('[errors.required]');
    });

    it('noemt een waarde van de verkeerde soort wél een verkeerd type', () => {
      const t = nepVertaler();
      expect(melding(z.string(), 42, t)).toBe('[errors.invalidType]');
      expect(melding(z.number(), 'tekst', t)).toBe('[errors.invalidType]');
    });
  });

  describe('te klein', () => {
    it('noemt een lege verplichte tekst "verplicht" in plaats van "te kort"', () => {
      // `min(1)` is de manier waarop een verplicht tekstveld wordt opgeschreven.
      // "Minimaal 1 teken vereist" is een rare zin voor een leeg veld.
      const t = nepVertaler();
      expect(melding(z.string().min(1), '', t)).toBe('[errors.required]');
    });

    it('geeft bij een echte ondergrens het aantal tekens mee', () => {
      const t = nepVertaler();
      expect(melding(z.string().min(8), 'kort', t)).toBe('[errors.minLength min=8]');
    });

    it('scheidt een te laag getal van een te korte tekst', () => {
      const t = nepVertaler();
      expect(melding(z.number().min(1800), 1799, t)).toBe('[errors.minValue min=1800]');
    });

    it('scheidt een te korte lijst van een te korte tekst', () => {
      const t = nepVertaler();
      expect(melding(z.array(z.string()).min(2), ['fluit'], t)).toBe('[errors.minItems min=2]');
    });

    it('valt terug op een leesbare zin bij een herkomst die niet is voorzien', () => {
      const t = nepVertaler();
      const gemaakt = melding(z.date().min(new Date('2026-01-01')), new Date('2020-01-01'), t);
      expect(gemaakt).toBeTruthy();
      expect(t.sleutels).toEqual([]);
    });
  });

  describe('te groot', () => {
    it('geeft bij tekst de bovengrens mee', () => {
      const t = nepVertaler();
      expect(melding(z.string().max(100), 'a'.repeat(101), t)).toBe('[errors.maxLength max=100]');
    });

    it('scheidt een te hoog getal van een te lange tekst', () => {
      const t = nepVertaler();
      expect(melding(z.number().max(20), 21, t)).toBe('[errors.maxValue max=20]');
    });

    it('scheidt een te lange lijst van een te lange tekst', () => {
      const t = nepVertaler();
      expect(melding(z.array(z.string()).max(1), ['a', 'b'], t)).toBe('[errors.maxItems max=1]');
    });
  });

  describe('een verkeerde schrijfwijze', () => {
    it('herkent e-mail, adres, id en datum elk apart', () => {
      const t = nepVertaler();
      expect(melding(z.string().email(), 'geen adres', t)).toBe('[errors.invalidEmail]');
      expect(melding(z.string().url(), 'geen adres', t)).toBe('[errors.invalidUrl]');
      expect(melding(z.string().uuid(), 'geen id', t)).toBe('[errors.invalidUuid]');
      expect(melding(z.iso.datetime(), 'geen datum', t)).toBe('[errors.invalidDate]');
    });

    it('houdt een los patroon algemeen', () => {
      const t = nepVertaler();
      expect(melding(z.string().regex(/^\d+$/), 'abc', t)).toBe('[errors.invalidFormat]');
    });
  });

  it('noemt een keuze buiten de lijst een ongeldige keuze', () => {
    const t = nepVertaler();
    expect(melding(z.enum(['member', 'admin']), 'voorzitter', t)).toBe('[errors.invalidSelection]');
  });

  describe('eigen controles', () => {
    it('laat een eigen melding uit het schema staan', () => {
      const t = nepVertaler();
      expect(
        melding(
          z.string().refine(() => false, { message: 'Kapot' }),
          'x',
          t,
        ),
      ).toBe('Kapot');
    });

    it('valt bij een controle zónder melding terug op Engelse standaardtekst', () => {
      // BEKEND MANKEMENT: een `.refine()` waar de schrijver geen tekst bij zet
      // levert "Validation failed" op. Die zin komt niet langs de vertaling en
      // staat dus in het Engels onder een Nederlands formulier.
      const t = nepVertaler();
      expect(
        melding(
          z.string().refine(() => false),
          'x',
          t,
        ),
      ).toBe('Validation failed');
    });

    it('bereikt de vertaalstap voor een sleutel in het schema niet', () => {
      // BEKEND MANKEMENT: `createI18nErrorMap` heeft een tak die een melding
      // als 'errors.iets' alsnog wil vertalen, maar Zod raadpleegt de
      // foutkaart helemaal niet zodra een controle zijn eigen melding
      // meebrengt. Die tak is dus onbereikbaar: de gebruiker ziet de kale
      // sleutel. `validateField` vangt dat hieronder alsnog op, maar een
      // formulier dat via zodResolver loopt niet.
      const t = nepVertaler();
      expect(
        melding(
          z.string().refine(() => false, { message: 'errors.required' }),
          'x',
          t,
        ),
      ).toBe('errors.required');
      expect(t.sleutels).toEqual([]);
    });
  });

  describe("de schema's uit schemas.ts", () => {
    it("laat de vaste Engelse meldingen van de schema's ongemoeid", () => {
      // BEKEND MANKEMENT: `timeSchema`, `rehearsalSchema` en
      // `resetPasswordSchema` dragen een vaste Engelse tekst. Die gaat langs de
      // vertaling heen, dus een Nederlands of Duits lid krijgt hem in het
      // Engels te zien. Voor 'Passwords do not match' bestaat de sleutel
      // errors.passwordMismatch al in alle drie de talen; hij wordt alleen niet
      // gebruikt.
      const t = nepVertaler();
      expect(melding(timeSchema, '99:99', t)).toBe('Invalid time format (HH:mm)');
      expect(melding(rehearsalSchema, { date: '2026-01-01', startTime: '20:00', endTime: '19:00' }, t)).toBe(
        'End time must be after start time',
      );
      expect(melding(resetPasswordSchema, { password: 'geheim12', confirmPassword: 'anders12' }, t)).toBe(
        'Passwords do not match',
      );
    });

    it('vertaalt de meldingen die Zod zelf maakt wél', () => {
      const t = nepVertaler();
      expect(melding(nameSchema, '', t)).toBe('[errors.required]');
      expect(melding(nameSchema, 'a'.repeat(101), t)).toBe('[errors.maxLength max=100]');
      expect(melding(emailSchema, 'geen adres', t)).toBe('[errors.invalidEmail]');
    });
  });

  it('geeft altijd een tekst terug, nooit undefined', () => {
    // De foutkaart is het laatste vangnet: geeft hij niets terug, dan staat er
    // een leeg foutvlak onder het veld en denkt de gebruiker dat hij niets
    // fout deed.
    const t = nepVertaler();
    const kaart = createI18nErrorMap(t);
    const gemaakt = kaart({ code: 'invalid_key', message: undefined } as never);
    expect(typeof gemaakt === 'string' ? gemaakt : gemaakt?.message).toBeTruthy();
  });
});

describe('validateField', () => {
  it('geeft undefined bij een goede waarde', () => {
    expect(validateField(nameSchema, 'Ruud')).toBeUndefined();
    expect(validateField(z.number().min(0), 3)).toBeUndefined();
  });

  it('geeft één melding terug, ook als er meer fouten zijn', () => {
    // Onder een invoerveld past één zin. Kwamen er twee terug, dan stond er
    // een opsomming waar de gebruiker doorheen moet lezen.
    const t = nepVertaler();
    const schema = z.object({ naam: z.string().min(1), leeftijd: z.number().min(0) });
    const uitkomst = validateField(schema, { naam: '', leeftijd: -1 }, t);
    expect(typeof uitkomst).toBe('string');
    expect(uitkomst).toBe('[errors.required]');
  });

  it('werkt zonder vertaalfunctie en geeft dan de Engelse tekst van Zod', () => {
    const uitkomst = validateField(z.string().min(8), 'kort');
    expect(uitkomst).toContain('8');
  });

  it('gebruikt de vertaalfunctie zodra die er is', () => {
    const t = nepVertaler();
    expect(validateField(z.string().min(8), 'kort', t)).toBe('[errors.minLength min=8]');
    expect(t.sleutels).toContain('errors.minLength');
  });

  it('vertaalt een melding die als vertaalsleutel in het schema staat', () => {
    // De schrijver van een schema mag volgens de documentatie van deze module
    // een sleutel als melding meegeven. Zod slaat de foutkaart dan over, dus
    // zonder deze stap kreeg de gebruiker letterlijk 'errors.passwordMismatch'
    // onder zijn wachtwoordveld te zien.
    const t = nepVertaler();
    const schema = z.string().refine(() => false, { message: 'errors.passwordMismatch' });
    expect(validateField(schema, 'x', t)).toBe('[errors.passwordMismatch]');
  });

  it('laat een gewone melding met rust', () => {
    const t = nepVertaler();
    const schema = z.string().refine(() => false, { message: 'Deze datum is al bezet' });
    expect(validateField(schema, 'x', t)).toBe('Deze datum is al bezet');
    expect(t.sleutels).toEqual([]);
  });

  it('laat een sleutel staan als er geen vertaalfunctie is', () => {
    const schema = z.string().refine(() => false, { message: 'errors.passwordMismatch' });
    expect(validateField(schema, 'x')).toBe('errors.passwordMismatch');
  });

  it('valt niet om op een schema dat alles goedkeurt', () => {
    expect(validateField(z.unknown(), undefined)).toBeUndefined();
    expect(validateField(z.unknown(), null)).toBeUndefined();
  });

  it('meldt de eerste fout van een samengesteld schema', () => {
    const t = nepVertaler();
    const uitkomst = validateField(rehearsalSchema, { date: '', startTime: '20:00', endTime: '22:00' }, t);
    expect(uitkomst).toBe('[errors.required]');
  });

  it('roept de vertaalfunctie niet aan als er niets fout is', () => {
    const t = vi.fn() as unknown as TFunction;
    expect(validateField(nameSchema, 'Ruud', t)).toBeUndefined();
    expect(t).not.toHaveBeenCalled();
  });
});
