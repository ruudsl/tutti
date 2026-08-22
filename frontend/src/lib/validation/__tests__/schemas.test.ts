/**
 * Tests voor de gedeelde Zod-schema's van de formulieren.
 *
 * Een schema staat op de grens tussen wat de gebruiker typt en wat er in de
 * database belandt, en het kan op twee manieren stuk zijn:
 *
 *   - te ruim: een naam van alleen spaties, een bedrag dat stilletjes nul
 *     wordt, een `javascript:`-adres dat later als link wordt gerenderd. Dat
 *     ziet niemand tijdens het invullen; het komt er pas uit als de gegevens
 *     al binnen zijn.
 *   - te streng: een geldige invoer die geweigerd wordt. De gebruiker ziet dan
 *     een foutmelding die nergens op slaat en heeft geen manier om er langs te
 *     komen.
 *
 * Beide kanten staan hieronder. Waar het huidige gedrag scherpe kanten heeft
 * die bewust zo blijven, staat dat er als VASTGELEGD GEDRAG bij.
 */
import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  passwordSchema,
  optionalPasswordSchema,
  nameSchema,
  optionalTextSchema,
  requiredTextSchema,
  urlSchema,
  dateSchema,
  timeSchema,
  uuidSchema,
  uuidArraySchema,
  createUserSchema,
  updateUserSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  concertSchema,
  rehearsalSchema,
  equipmentSchema,
  musicListSchema,
  onboardingSchema,
  guestSchema,
  loanSchema,
} from '../schemas';
import type { z } from 'zod';

/** Kortweg: is deze waarde goedgekeurd? */
const mag = (schema: z.ZodType, waarde: unknown): boolean => schema.safeParse(waarde).success;

/** De foutcodes van de eerste ronde, om te toetsen waaróp iets afketst. */
const codes = (schema: z.ZodType, waarde: unknown): string[] => {
  const uitkomst = schema.safeParse(waarde);
  return uitkomst.success ? [] : uitkomst.error.issues.map((issue) => issue.code);
};

/** Het pad van de eerste fout, bijvoorbeeld ['endTime']. */
const eerstePad = (schema: z.ZodType, waarde: unknown): PropertyKey[] => {
  const uitkomst = schema.safeParse(waarde);
  return uitkomst.success ? [] : [...(uitkomst.error.issues[0]?.path ?? [])];
};

// =============================================================================
// Losse velden
// =============================================================================

describe('emailSchema', () => {
  it('laat een gewoon adres door', () => {
    expect(mag(emailSchema, 'ruud@slaats.net')).toBe(true);
    expect(mag(emailSchema, 'voor.achter+label@sub.domein.nl')).toBe(true);
  });

  it('meldt een leeg veld als leeg, niet als ongeldig adres', () => {
    // De volgorde telt: `validateField` pakt de eerste fout. Stond de
    // e-mailcheck vooraan, dan kreeg een gebruiker die het veld overslaat
    // "geen geldig e-mailadres" te zien in plaats van "verplicht".
    expect(codes(emailSchema, '')[0]).toBe('too_small');
  });

  it('weigert een adres zonder apenstaartje of zonder domein', () => {
    expect(mag(emailSchema, 'ruud')).toBe(false);
    expect(mag(emailSchema, 'ruud@')).toBe(false);
    expect(mag(emailSchema, 'ruud@slaats')).toBe(false);
    expect(mag(emailSchema, '@slaats.net')).toBe(false);
  });

  it('haalt spaties eromheen weg in plaats van het adres af te keuren', () => {
    // Een uit een e-mail geplakt adres draagt bijna altijd een spatie mee. Die
    // spatie is niet te zien in het invoerveld, dus "geen geldig e-mailadres"
    // is voor de gebruiker een raadsel waar hij niet uitkomt.
    expect(emailSchema.parse('  ruud@slaats.net  ')).toBe('ruud@slaats.net');
  });

  it('weigert een spatie midden in het adres', () => {
    expect(mag(emailSchema, 'ruud slaats@slaats.net')).toBe(false);
  });

  it('weigert null, undefined en een getal met een typefout', () => {
    expect(codes(emailSchema, null)).toEqual(['invalid_type']);
    expect(codes(emailSchema, undefined)).toEqual(['invalid_type']);
    expect(codes(emailSchema, 42)).toEqual(['invalid_type']);
  });
});

describe('passwordSchema', () => {
  it('eist minstens acht tekens', () => {
    expect(mag(passwordSchema, 'zeven12')).toBe(false);
    expect(mag(passwordSchema, 'geheim12')).toBe(true);
  });

  it('telt in tekens, niet in bytes: acht spaties gelden ook', () => {
    // VASTGELEGD GEDRAG: er zit geen enkele eis aan de samenstelling. Alleen
    // de lengte telt, dus '        ' is een geldig wachtwoord.
    expect(mag(passwordSchema, '        ')).toBe(true);
  });

  it('weigert een leeg veld en een niet-tekst', () => {
    expect(mag(passwordSchema, '')).toBe(false);
    expect(mag(passwordSchema, null)).toBe(false);
    expect(mag(passwordSchema, 12345678)).toBe(false);
  });
});

describe('optionalPasswordSchema', () => {
  it('laat leeg en weggelaten door: in een wijzigformulier hoeft het niet', () => {
    expect(mag(optionalPasswordSchema, '')).toBe(true);
    expect(mag(optionalPasswordSchema, undefined)).toBe(true);
  });

  it('houdt de lengte-eis overeind zodra er wél iets staat', () => {
    expect(mag(optionalPasswordSchema, 'kort')).toBe(false);
    expect(mag(optionalPasswordSchema, 'geheim12')).toBe(true);
  });

  it('meldt een te kort wachtwoord als te kort en niet als "ongeldige keuze"', () => {
    // De constructie `.optional().or(z.literal(''))` is een unie. Als die als
    // unie zou afketsen, kreeg de gebruiker een onbruikbare melding in plaats
    // van "minimaal 8 tekens".
    expect(codes(optionalPasswordSchema, 'kort')).toContain('too_small');
  });
});

describe('nameSchema', () => {
  it('laat een gewone naam door, ook met streepje, apostrof of accent', () => {
    expect(mag(nameSchema, 'Ruud')).toBe(true);
    expect(mag(nameSchema, "van 't Hoff-Sørensen")).toBe(true);
    expect(mag(nameSchema, 'José')).toBe(true);
  });

  it('weigert een lege naam', () => {
    expect(mag(nameSchema, '')).toBe(false);
  });

  it('weigert een naam van alleen spaties', () => {
    // Zonder trim glipt '   ' langs `min(1)` heen: in de ledenlijst staat dan
    // een lid zonder zichtbare naam, dat niet te zoeken en niet te sorteren is
    // en waarvan niemand meer weet wie het was.
    expect(mag(nameSchema, '   ')).toBe(false);
    expect(mag(nameSchema, '\t\n')).toBe(false);
  });

  it('bewaart de naam zonder spaties eromheen', () => {
    expect(nameSchema.parse('  Ruud  ')).toBe('Ruud');
  });

  it('houdt honderd tekens aan als bovengrens', () => {
    expect(mag(nameSchema, 'a'.repeat(100))).toBe(true);
    expect(codes(nameSchema, 'a'.repeat(101))).toEqual(['too_big']);
  });

  it('meet de lengte ná het trimmen', () => {
    expect(mag(nameSchema, ` ${'a'.repeat(100)} `)).toBe(true);
  });
});

describe('optionalTextSchema', () => {
  it('laat leeg en weggelaten door', () => {
    expect(mag(optionalTextSchema, '')).toBe(true);
    expect(mag(optionalTextSchema, undefined)).toBe(true);
  });

  it('kapt af bij vijfhonderd tekens', () => {
    expect(mag(optionalTextSchema, 'a'.repeat(500))).toBe(true);
    expect(mag(optionalTextSchema, 'a'.repeat(501))).toBe(false);
  });
});

describe('requiredTextSchema', () => {
  it('eist tekst en weigert alleen spaties', () => {
    expect(mag(requiredTextSchema, 'iets')).toBe(true);
    expect(mag(requiredTextSchema, '')).toBe(false);
    expect(mag(requiredTextSchema, '  ')).toBe(false);
  });

  it('kapt af bij vijfhonderd tekens', () => {
    expect(mag(requiredTextSchema, 'a'.repeat(500))).toBe(true);
    expect(mag(requiredTextSchema, 'a'.repeat(501))).toBe(false);
  });
});

describe('urlSchema', () => {
  it('laat leeg en weggelaten door: een adres is optioneel', () => {
    expect(mag(urlSchema, '')).toBe(true);
    expect(mag(urlSchema, undefined)).toBe(true);
  });

  it('laat http en https door', () => {
    expect(mag(urlSchema, 'https://harmonie.nl')).toBe(true);
    expect(mag(urlSchema, 'http://harmonie.nl/agenda?jaar=2026')).toBe(true);
  });

  it('weigert iets dat geen adres is', () => {
    expect(mag(urlSchema, 'harmonie.nl')).toBe(false);
    expect(mag(urlSchema, 'geen url')).toBe(false);
  });

  it('weigert een javascript:-adres', () => {
    // `z.string().url()` keurt élk schema goed, ook `javascript:`. Zo'n waarde
    // gaat door de database heen en komt er als href weer uit; een klik op de
    // "website" van een vereniging voert dan code uit in de sessie van wie er
    // klikt.
    expect(mag(urlSchema, 'javascript:alert(document.cookie)')).toBe(false);
    expect(mag(urlSchema, 'data:text/html,<script>alert(1)</script>')).toBe(false);
  });
});

describe('dateSchema', () => {
  it('laat een lege waarde door', () => {
    // VASTGELEGD GEDRAG: het schema kijkt alleen of een ingevulde datum te
    // lezen is. Verplicht stellen doet het formulier zelf.
    expect(mag(dateSchema, '')).toBe(true);
  });

  it('laat een leesbare datum door', () => {
    expect(mag(dateSchema, '2026-08-22')).toBe(true);
    expect(mag(dateSchema, '2026-08-22T20:00:00.000Z')).toBe(true);
  });

  it('weigert een datum die niet te lezen is', () => {
    expect(mag(dateSchema, 'morgenavond')).toBe(false);
    expect(mag(dateSchema, '2026-13-01')).toBe(false);
  });
});

describe('timeSchema', () => {
  it('laat een tijd met en zonder voorloopnul door', () => {
    expect(mag(timeSchema, '00:00')).toBe(true);
    expect(mag(timeSchema, '09:30')).toBe(true);
    expect(mag(timeSchema, '9:30')).toBe(true);
    expect(mag(timeSchema, '23:59')).toBe(true);
  });

  it('weigert een uur of minuut die niet bestaat', () => {
    expect(mag(timeSchema, '24:00')).toBe(false);
    expect(mag(timeSchema, '20:60')).toBe(false);
    expect(mag(timeSchema, '20:5')).toBe(false);
  });

  it('weigert een leeg veld en een andere schrijfwijze', () => {
    expect(mag(timeSchema, '')).toBe(false);
    expect(mag(timeSchema, '20.00')).toBe(false);
    expect(mag(timeSchema, '20:00:00')).toBe(false);
    expect(mag(timeSchema, '8 uur')).toBe(false);
  });
});

describe('uuidSchema en uuidArraySchema', () => {
  it('laat een echte uuid door en weigert een losse tekst', () => {
    expect(mag(uuidSchema, '3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(mag(uuidSchema, 'abc')).toBe(false);
    expect(mag(uuidSchema, '')).toBe(false);
  });

  it('geeft een lege lijst als er niets gekozen is', () => {
    expect(uuidArraySchema.parse(undefined)).toEqual([]);
  });

  it('wijst de fout aan bij het element dat niet klopt', () => {
    const lijst = ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'geen-uuid'];
    expect(eerstePad(uuidArraySchema, lijst)).toEqual([1]);
  });
});

// =============================================================================
// Gebruikers
// =============================================================================

describe('createUserSchema', () => {
  const geldig = {
    email: 'ruud@slaats.net',
    password: 'geheim12',
    firstName: 'Ruud',
    lastName: 'Slaats',
  };

  it('vult rol en lijsten aan als ze niet zijn meegegeven', () => {
    const uitkomst = createUserSchema.parse(geldig);
    expect(uitkomst.role).toBe('member');
    expect(uitkomst.instrumentIds).toEqual([]);
    expect(uitkomst.orchestraIds).toEqual([]);
  });

  it('eist een wachtwoord bij een nieuwe gebruiker', () => {
    expect(eerstePad(createUserSchema, { ...geldig, password: undefined })).toEqual(['password']);
    expect(eerstePad(createUserSchema, { ...geldig, password: '' })).toEqual(['password']);
  });

  it('weigert een rol die niet bestaat', () => {
    expect(mag(createUserSchema, { ...geldig, role: 'voorzitter' })).toBe(false);
    expect(mag(createUserSchema, { ...geldig, role: 'conductor' })).toBe(true);
  });

  it('wijst de eerste fout aan op het veld waar hij hoort', () => {
    expect(eerstePad(createUserSchema, { ...geldig, firstName: '' })).toEqual(['firstName']);
  });
});

describe('updateUserSchema', () => {
  const geldig = {
    email: 'ruud@slaats.net',
    firstName: 'Ruud',
    lastName: 'Slaats',
  };

  it('laat het wachtwoordveld leeg: bij wijzigen hoeft het niet mee', () => {
    expect(mag(updateUserSchema, { ...geldig, password: '' })).toBe(true);
    expect(mag(updateUserSchema, geldig)).toBe(true);
  });

  it('houdt de lengte-eis overeind als er wél een nieuw wachtwoord staat', () => {
    expect(eerstePad(updateUserSchema, { ...geldig, password: 'kort' })).toEqual(['password']);
  });
});

// =============================================================================
// Inloggen en wachtwoorden
// =============================================================================

describe('loginSchema', () => {
  const geldig = { email: 'ruud@slaats.net', password: 'wat dan ook' };

  it('eist alleen dat het wachtwoord niet leeg is', () => {
    // Bewust géén min(8): een oud, korter wachtwoord moet gewoon kunnen
    // inloggen. Anders sluit een aangescherpte eis bestaande leden buiten.
    expect(mag(loginSchema, { ...geldig, password: 'x' })).toBe(true);
    expect(eerstePad(loginSchema, { ...geldig, password: '' })).toEqual(['password']);
  });

  it('laat de tweestapscode weg of leeg zolang die niet gevraagd is', () => {
    expect(mag(loginSchema, geldig)).toBe(true);
    expect(mag(loginSchema, { ...geldig, mfaCode: '' })).toBe(true);
  });

  it('eist zes cijfers zodra er een code staat', () => {
    expect(mag(loginSchema, { ...geldig, mfaCode: '123456' })).toBe(true);
    expect(mag(loginSchema, { ...geldig, mfaCode: '12345' })).toBe(false);
    expect(mag(loginSchema, { ...geldig, mfaCode: '1234567' })).toBe(false);
    expect(mag(loginSchema, { ...geldig, mfaCode: 'abcdef' })).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('vraagt alleen om een geldig adres', () => {
    expect(mag(forgotPasswordSchema, { email: 'ruud@slaats.net' })).toBe(true);
    expect(mag(forgotPasswordSchema, { email: '' })).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  it('laat twee gelijke wachtwoorden door', () => {
    expect(mag(resetPasswordSchema, { password: 'geheim12', confirmPassword: 'geheim12' })).toBe(true);
  });

  it('hangt de fout aan het bevestigingsveld, niet aan het eerste veld', () => {
    // Anders wijst de melding naar het veld dat de gebruiker goed heeft
    // ingevuld en zoekt hij zich suf.
    expect(eerstePad(resetPasswordSchema, { password: 'geheim12', confirmPassword: 'anders12' })).toEqual([
      'confirmPassword',
    ]);
  });

  it('controleert eerst de lengte en pas daarna de gelijkheid', () => {
    const uitkomst = resetPasswordSchema.safeParse({ password: 'kort', confirmPassword: 'kort' });
    expect(uitkomst.success).toBe(false);
    expect(uitkomst.error?.issues[0]?.path).toEqual(['password']);
  });
});

describe('changePasswordSchema', () => {
  it('eist het huidige wachtwoord', () => {
    expect(
      eerstePad(changePasswordSchema, {
        currentPassword: '',
        newPassword: 'geheim12',
        confirmPassword: 'geheim12',
      }),
    ).toEqual(['currentPassword']);
  });

  it('vergelijkt het nieuwe wachtwoord met de bevestiging', () => {
    expect(
      mag(changePasswordSchema, {
        currentPassword: 'oud',
        newPassword: 'geheim12',
        confirmPassword: 'geheim12',
      }),
    ).toBe(true);
    expect(
      eerstePad(changePasswordSchema, {
        currentPassword: 'oud',
        newPassword: 'geheim12',
        confirmPassword: 'anders12',
      }),
    ).toEqual(['confirmPassword']);
  });

  it('staat toe dat het nieuwe wachtwoord gelijk is aan het oude', () => {
    // VASTGELEGD GEDRAG: er is geen controle op hergebruik. Wie zijn oude
    // wachtwoord opnieuw invult, krijgt geen waarschuwing.
    expect(
      mag(changePasswordSchema, {
        currentPassword: 'geheim12',
        newPassword: 'geheim12',
        confirmPassword: 'geheim12',
      }),
    ).toBe(true);
  });
});

// =============================================================================
// Concerten en repetities
// =============================================================================

describe('concertSchema', () => {
  const geldig = { name: 'Nieuwjaarsconcert', date: '2026-01-10' };

  it('vraagt om een naam en een datum', () => {
    expect(mag(concertSchema, geldig)).toBe(true);
    expect(eerstePad(concertSchema, { ...geldig, name: '' })).toEqual(['name']);
    expect(eerstePad(concertSchema, { ...geldig, date: '' })).toEqual(['date']);
  });

  it('laat de overige velden leeg of weg', () => {
    expect(
      mag(concertSchema, { ...geldig, endDate: '', location: '', venueType: '', description: '', notes: '' }),
    ).toBe(true);
  });

  it('houdt tweehonderd tekens aan voor naam en locatie', () => {
    expect(mag(concertSchema, { ...geldig, name: 'n'.repeat(200) })).toBe(true);
    expect(eerstePad(concertSchema, { ...geldig, name: 'n'.repeat(201) })).toEqual(['name']);
    expect(eerstePad(concertSchema, { ...geldig, location: 'l'.repeat(201) })).toEqual(['location']);
  });

  it('houdt tweeduizend tekens aan voor omschrijving en notities', () => {
    expect(mag(concertSchema, { ...geldig, description: 'd'.repeat(2000) })).toBe(true);
    expect(eerstePad(concertSchema, { ...geldig, notes: 'n'.repeat(2001) })).toEqual(['notes']);
  });

  it('kijkt niet of de einddatum na de begindatum ligt', () => {
    // VASTGELEGD GEDRAG: anders dan bij een repetitie is er geen controle op
    // de volgorde van de datums.
    expect(mag(concertSchema, { ...geldig, date: '2026-01-10', endDate: '2025-01-01' })).toBe(true);
  });
});

describe('rehearsalSchema', () => {
  const geldig = { date: '2026-01-10', startTime: '20:00', endTime: '22:00' };

  it('laat een gewone avondrepetitie door', () => {
    expect(mag(rehearsalSchema, geldig)).toBe(true);
  });

  it('laat een ochtendrepetitie zonder voorloopnul door', () => {
    // `timeSchema` staat '9:00' toe, maar de eindtijdcontrole vergeleek twee
    // tekenreeksen: '9:00' < '10:00' is onwaar, want '9' komt ná '1' in het
    // alfabet. Een repetitie van 9:00 tot 10:00 werd daardoor geweigerd met
    // "End time must be after start time" - een melding waar de gebruiker
    // niets aan kan doen, want zijn tijden kloppen. Alleen een voorloopnul
    // typen hielp, en dat verzint niemand.
    expect(mag(rehearsalSchema, { ...geldig, startTime: '9:00', endTime: '10:00' })).toBe(true);
    expect(mag(rehearsalSchema, { ...geldig, startTime: '9:30', endTime: '12:00' })).toBe(true);
    expect(mag(rehearsalSchema, { ...geldig, startTime: '8:00', endTime: '9:00' })).toBe(true);
  });

  it('weigert een eindtijd die vóór de begintijd ligt', () => {
    expect(eerstePad(rehearsalSchema, { ...geldig, startTime: '22:00', endTime: '20:00' })).toEqual(['endTime']);
    expect(eerstePad(rehearsalSchema, { ...geldig, startTime: '10:00', endTime: '9:00' })).toEqual(['endTime']);
  });

  it('weigert een repetitie van nul minuten', () => {
    expect(eerstePad(rehearsalSchema, { ...geldig, startTime: '20:00', endTime: '20:00' })).toEqual(['endTime']);
    expect(eerstePad(rehearsalSchema, { ...geldig, startTime: '9:00', endTime: '09:00' })).toEqual(['endTime']);
  });

  it('vergelijkt op minuten binnen hetzelfde uur', () => {
    expect(mag(rehearsalSchema, { ...geldig, startTime: '20:05', endTime: '20:45' })).toBe(true);
    expect(mag(rehearsalSchema, { ...geldig, startTime: '20:45', endTime: '20:05' })).toBe(false);
  });

  it('meldt een ontbrekende tijd op het veld zelf', () => {
    expect(eerstePad(rehearsalSchema, { ...geldig, startTime: '' })).toEqual(['startTime']);
    expect(eerstePad(rehearsalSchema, { ...geldig, endTime: 'kwart voor acht' })).toEqual(['endTime']);
  });

  it('laat orkest, soort en notities leeg', () => {
    expect(mag(rehearsalSchema, { ...geldig, orchestraId: '', type: '', notes: '' })).toBe(true);
  });
});

// =============================================================================
// Instrumentarium
// =============================================================================

describe('equipmentSchema', () => {
  const geldig = { instrumentType: 'Bugel' };

  it('zet de status op beschikbaar als er niets gekozen is', () => {
    expect(equipmentSchema.parse(geldig).status).toBe('available');
  });

  it('eist een soort instrument', () => {
    expect(eerstePad(equipmentSchema, { instrumentType: '' })).toEqual(['instrumentType']);
  });

  it('rekent een ingetypt bouwjaar om naar een getal', () => {
    expect(equipmentSchema.parse({ ...geldig, yearOfManufacture: '1985' }).yearOfManufacture).toBe(1985);
  });

  it('houdt het bouwjaar tussen 1800 en 2100', () => {
    expect(mag(equipmentSchema, { ...geldig, yearOfManufacture: 1800 })).toBe(true);
    expect(mag(equipmentSchema, { ...geldig, yearOfManufacture: 2100 })).toBe(true);
    expect(mag(equipmentSchema, { ...geldig, yearOfManufacture: 1799 })).toBe(false);
    expect(mag(equipmentSchema, { ...geldig, yearOfManufacture: 2101 })).toBe(false);
    expect(mag(equipmentSchema, { ...geldig, yearOfManufacture: 1985.5 })).toBe(false);
  });

  it('laat het bouwjaar leeg als null, maar niet als lege tekst', () => {
    // VASTGELEGD GEDRAG: `z.coerce.number()` maakt van '' een 0, en 0 valt
    // buiten 1800-2100. Een leeggemaakt bouwjaarveld moet dus als null worden
    // doorgegeven, niet als lege tekst, anders krijgt de gebruiker
    // "waarde moet minimaal 1800 zijn" bij een veld dat hij juist leeghaalde.
    expect(mag(equipmentSchema, { ...geldig, yearOfManufacture: null })).toBe(true);
    expect(eerstePad(equipmentSchema, { ...geldig, yearOfManufacture: '' })).toEqual(['yearOfManufacture']);
  });

  it('maakt van een leeg bedrag stilletjes nul euro', () => {
    // BEKEND MANKEMENT: `z.coerce.number().min(0)` laat '' door als 0, want
    // Number('') is 0 en 0 haalt de ondergrens. Een leeggelaten aanschafprijs
    // komt daardoor als "€ 0,00" in de lijst te staan in plaats van als
    // "onbekend" - en in het overzicht van de verzekerde waarde telt dat
    // instrument dan voor niets mee.
    expect(equipmentSchema.parse({ ...geldig, purchasePrice: '' }).purchasePrice).toBe(0);
    expect(equipmentSchema.parse({ ...geldig, currentValue: '' }).currentValue).toBe(0);
    expect(equipmentSchema.parse({ ...geldig, purchasePrice: null }).purchasePrice).toBeNull();
  });

  it('weigert een negatief bedrag', () => {
    expect(eerstePad(equipmentSchema, { ...geldig, purchasePrice: -1 })).toEqual(['purchasePrice']);
  });

  it('weigert een bedrag dat geen getal is', () => {
    expect(eerstePad(equipmentSchema, { ...geldig, purchasePrice: 'duur' })).toEqual(['purchasePrice']);
  });

  it('houdt het onderhoudsinterval tussen één en honderdtwintig maanden', () => {
    expect(mag(equipmentSchema, { ...geldig, maintenanceIntervalMonths: 1 })).toBe(true);
    expect(mag(equipmentSchema, { ...geldig, maintenanceIntervalMonths: 120 })).toBe(true);
    expect(mag(equipmentSchema, { ...geldig, maintenanceIntervalMonths: 0 })).toBe(false);
    expect(mag(equipmentSchema, { ...geldig, maintenanceIntervalMonths: 121 })).toBe(false);
  });

  it('weigert een status die niet bestaat', () => {
    expect(mag(equipmentSchema, { ...geldig, status: 'kwijt' })).toBe(false);
    expect(mag(equipmentSchema, { ...geldig, status: 'on_loan' })).toBe(true);
  });
});

// =============================================================================
// Muzieklijsten, aanmelden en uitleen
// =============================================================================

describe('musicListSchema', () => {
  const geldig = { name: 'Voorjaarsconcert', orchestraId: 'orkest-1' };

  it('zet het soort lijst op regulier', () => {
    expect(musicListSchema.parse(geldig).listType).toBe('regular');
  });

  it('eist een naam en een orkest', () => {
    expect(eerstePad(musicListSchema, { ...geldig, name: '' })).toEqual(['name']);
    expect(eerstePad(musicListSchema, { ...geldig, orchestraId: '' })).toEqual(['orchestraId']);
  });

  it('laat concertdatum en -locatie leeg als null', () => {
    expect(mag(musicListSchema, { ...geldig, concertDate: null, concertLocation: null })).toBe(true);
  });

  it('weigert een soort lijst die niet bestaat', () => {
    expect(mag(musicListSchema, { ...geldig, listType: 'repetitie' })).toBe(false);
  });
});

describe('onboardingSchema', () => {
  const geldig = { firstName: 'Ruud', lastName: 'Slaats', email: 'ruud@slaats.net' };

  it('zet de vinkjes standaard uit', () => {
    const uitkomst = onboardingSchema.parse(geldig);
    expect(uitkomst.createM365Account).toBe(false);
    expect(uitkomst.addToPercussionGroup).toBe(false);
  });

  it('laat het privéadres leeg', () => {
    expect(mag(onboardingSchema, { ...geldig, privateEmail: '' })).toBe(true);
    expect(mag(onboardingSchema, { ...geldig, privateEmail: 'geen adres' })).toBe(false);
  });
});

describe('guestSchema', () => {
  const geldig = { name: 'Genodigde', email: 'gast@voorbeeld.nl', ticketCount: 2 };

  it('rekent een ingetypt aantal om naar een getal', () => {
    expect(guestSchema.parse({ ...geldig, ticketCount: '3' }).ticketCount).toBe(3);
  });

  it('houdt het aantal kaarten tussen één en twintig', () => {
    expect(mag(guestSchema, { ...geldig, ticketCount: 1 })).toBe(true);
    expect(mag(guestSchema, { ...geldig, ticketCount: 20 })).toBe(true);
    expect(eerstePad(guestSchema, { ...geldig, ticketCount: 0 })).toEqual(['ticketCount']);
    expect(eerstePad(guestSchema, { ...geldig, ticketCount: 21 })).toEqual(['ticketCount']);
    expect(eerstePad(guestSchema, { ...geldig, ticketCount: 1.5 })).toEqual(['ticketCount']);
  });

  it('eist een naam en een adres van de genodigde', () => {
    expect(eerstePad(guestSchema, { ...geldig, name: '' })).toEqual(['name']);
    expect(eerstePad(guestSchema, { ...geldig, email: '' })).toEqual(['email']);
  });
});

describe('loanSchema', () => {
  const geldig = { musicTitleId: 'titel-1', borrowerName: 'Fanfare Sint Cecilia' };

  it('eist het uitgeleende stuk en de naam van de lener', () => {
    expect(mag(loanSchema, geldig)).toBe(true);
    expect(eerstePad(loanSchema, { ...geldig, musicTitleId: '' })).toEqual(['musicTitleId']);
    expect(eerstePad(loanSchema, { ...geldig, borrowerName: '' })).toEqual(['borrowerName']);
  });

  it('laat het adres van de lener leeg, maar keurt onzin af', () => {
    expect(mag(loanSchema, { ...geldig, borrowerEmail: '' })).toBe(true);
    expect(eerstePad(loanSchema, { ...geldig, borrowerEmail: 'geen adres' })).toEqual(['borrowerEmail']);
  });

  it('laat de verwachte retourdatum leeg', () => {
    expect(mag(loanSchema, { ...geldig, expectedReturn: '' })).toBe(true);
  });
});
