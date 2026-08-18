/**
 * Tests for the e-mail template suite.
 *
 * Every template exists in nl/en/de. The selector functions in
 * templates/emails/index.ts pick a variant, so the tests run each template
 * across all three languages and exercise the optional-field branches
 * (deadline, location, program, assignedBy, ...) that make up most of the
 * conditional logic in the templates.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveEmailLanguage,
  getPasswordResetEmail,
  getWelcomeEmail,
  getRehearsalReminderEmail,
  getConcertReminderEmail,
  getAvailabilityRequestEmail,
  getPollNotificationEmail,
  getTaskAssignmentEmail,
  getAccountVerificationEmail,
  EmailContent,
  EmailLanguage,
} from '../../templates/emails';

const LANGUAGES: EmailLanguage[] = ['nl', 'en', 'de'];

/** Every rendered e-mail must have all three parts filled in. */
function expectWellFormed(content: EmailContent) {
  expect(content.subject.trim().length).toBeGreaterThan(0);
  expect(content.text.trim().length).toBeGreaterThan(0);
  expect(content.html).toContain('<html>');
  expect(content.html).toContain('</html>');
}

describe('resolveEmailLanguage', () => {
  it.each([
    ['en', 'en'],
    ['de', 'de'],
    ['nl', 'nl'],
  ])('keeps supported language %s', (input, expected) => {
    expect(resolveEmailLanguage(input)).toBe(expected);
  });

  it.each([[undefined], [null], [''], ['fr'], ['EN'], ['nl-NL']])('falls back to Dutch for %s', (input) => {
    expect(resolveEmailLanguage(input as string | null | undefined)).toBe('nl');
  });
});

describe('password reset e-mail', () => {
  const data = { userName: 'Ruud', resetUrl: 'https://tutti.test/reset?token=abc' };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getPasswordResetEmail(data, language);

    expectWellFormed(content);
    expect(content.text).toContain('Ruud');
    expect(content.text).toContain(data.resetUrl);
    expect(content.html).toContain(data.resetUrl);
  });

  it('defaults to Dutch without a language', () => {
    expect(getPasswordResetEmail(data)).toEqual(getPasswordResetEmail(data, 'nl'));
  });

  it('produces a different subject per language', () => {
    const subjects = LANGUAGES.map((l) => getPasswordResetEmail(data, l).subject);
    expect(new Set(subjects).size).toBe(3);
  });
});

describe('welcome e-mail', () => {
  const data = {
    userName: 'Ruud',
    associationName: 'Harmonie Sint Cecilia',
    loginUrl: 'https://tutti.test/login',
  };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getWelcomeEmail(data, language);

    expectWellFormed(content);
    expect(content.subject).toContain(data.associationName);
    expect(content.text).toContain(data.loginUrl);
  });
});

describe('rehearsal reminder e-mail', () => {
  const base = {
    userName: 'Ruud',
    rehearsalDate: '2026-09-15',
    startTime: '20:00',
  };

  it.each(LANGUAGES)('renders the minimal variant in %s', (language) => {
    const content = getRehearsalReminderEmail(base, language);

    expectWellFormed(content);
    expect(content.text).toContain('20:00');
  });

  it.each(LANGUAGES)('includes the time range when an end time is given (%s)', (language) => {
    const content = getRehearsalReminderEmail({ ...base, endTime: '22:00' }, language);

    expect(content.text).toContain('20:00 - 22:00');
  });

  it.each(LANGUAGES)('includes location and orchestra when given (%s)', (language) => {
    const content = getRehearsalReminderEmail({ ...base, location: 'Dorpshuis', orchestraName: 'A-orkest' }, language);

    expect(content.text).toContain('Dorpshuis');
    expect(content.text).toContain('A-orkest');
    expect(content.html).toContain('Dorpshuis');
  });

  it.each(LANGUAGES)('lists the programme when pieces are given (%s)', (language) => {
    const content = getRehearsalReminderEmail({ ...base, program: ['Also sprach Zarathustra', 'Bolero'] }, language);

    expect(content.text).toContain('Also sprach Zarathustra');
    expect(content.text).toContain('Bolero');
    expect(content.html).toContain('<li>Bolero</li>');
  });

  it('omits the programme block for an empty programme', () => {
    const content = getRehearsalReminderEmail({ ...base, program: [] }, 'nl');

    expect(content.html).not.toContain('<li>');
  });

  it('omits optional details when they are absent', () => {
    const content = getRehearsalReminderEmail(base, 'nl');

    expect(content.html).not.toContain('Dorpshuis');
    expect(content.text).not.toContain('undefined');
  });
});

describe('concert reminder e-mail', () => {
  const base = {
    userName: 'Ruud',
    concertName: 'Nieuwjaarsconcert',
    concertDate: '2027-01-09',
  };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getConcertReminderEmail(base, language);

    expectWellFormed(content);
    expect(content.subject).toContain('Nieuwjaarsconcert');
  });

  it('includes location and start time when given', () => {
    const content = getConcertReminderEmail({ ...base, location: 'De Schalm', startTime: '15:00' }, 'nl');

    expect(content.text).toContain('De Schalm');
    expect(content.text).toContain('15:00');
  });

  it('does not leak undefined for missing optional fields', () => {
    const content = getConcertReminderEmail(base, 'de');

    expect(content.text).not.toContain('undefined');
    expect(content.html).not.toContain('undefined');
  });
});

describe('availability request e-mail', () => {
  const base = {
    userName: 'Ruud',
    eventName: 'Zomerserenade',
    eventDate: '2026-07-04',
    respondUrl: 'https://tutti.test/availability/1',
  };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getAvailabilityRequestEmail(base, language);

    expectWellFormed(content);
    expect(content.subject).toContain('Zomerserenade');
    expect(content.html).toContain(base.respondUrl);
  });

  it('mentions the deadline when one is given', () => {
    const withDeadline = getAvailabilityRequestEmail({ ...base, deadline: '2026-06-20' }, 'nl');
    const without = getAvailabilityRequestEmail(base, 'nl');

    expect(withDeadline.text.length).toBeGreaterThan(without.text.length);
  });
});

describe('poll notification e-mail', () => {
  const base = {
    userName: 'Ruud',
    pollTitle: 'Nieuwe repetitiedag',
    pollUrl: 'https://tutti.test/polls/1',
  };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getPollNotificationEmail(base, language);

    expectWellFormed(content);
    expect(content.subject).toContain('Nieuwe repetitiedag');
    expect(content.html).toContain(base.pollUrl);
  });

  it('mentions the deadline when one is given', () => {
    const withDeadline = getPollNotificationEmail({ ...base, deadline: '2026-06-20' }, 'en');
    const without = getPollNotificationEmail(base, 'en');

    expect(withDeadline.text.length).toBeGreaterThan(without.text.length);
  });
});

describe('task assignment e-mail', () => {
  const base = {
    userName: 'Ruud',
    taskTitle: 'Podium opbouwen',
    taskUrl: 'https://tutti.test/tasks/1',
  };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getTaskAssignmentEmail(base, language);

    expectWellFormed(content);
    expect(content.subject).toContain('Podium opbouwen');
  });

  it.each(LANGUAGES)('names the assigner when known (%s)', (language) => {
    const content = getTaskAssignmentEmail({ ...base, assignedBy: 'Dirigent' }, language);

    expect(content.text).toContain('Dirigent');
    expect(content.html).toContain('<strong>Dirigent</strong>');
  });

  it.each(LANGUAGES)('shows the deadline when given (%s)', (language) => {
    const content = getTaskAssignmentEmail({ ...base, deadline: '2026-08-01' }, language);

    expect(content.html).toContain('<div class="detail-row">');
  });

  it('renders no deadline row without a deadline', () => {
    const content = getTaskAssignmentEmail(base, 'nl');

    expect(content.html).not.toContain('<div class="detail-row">');
  });
});

describe('account verification e-mail', () => {
  const data = { userName: 'Ruud', verificationUrl: 'https://tutti.test/verify?token=xyz' };

  it.each(LANGUAGES)('renders in %s', (language) => {
    const content = getAccountVerificationEmail(data, language);

    expectWellFormed(content);
    expect(content.text).toContain(data.verificationUrl);
    expect(content.html).toContain(data.verificationUrl);
  });
});
