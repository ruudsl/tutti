/**
 * Locale-aware Date Formatting Utilities
 *
 * Provides comprehensive date formatting functions using Intl.DateTimeFormat
 * with the locale of the active i18next language (nl-NL, en-GB or de-DE).
 * All functions handle invalid dates gracefully.
 *
 * @module utils/dateFormat
 */

import { currentLocale } from './locale';

export { currentLocale } from './locale';

/** Language-dependent word joining date and time (e.g. "4 mei 2026 om 14:30") */
const DATE_TIME_JOINERS: Record<string, string> = {
  'nl-NL': 'om',
  'en-GB': 'at',
  'de-DE': 'um',
};

/** Returns the date/time joiner word for the current locale */
function dateTimeJoiner(): string {
  return DATE_TIME_JOINERS[currentLocale()] ?? 'om';
}

/** Returns an Intl.RelativeTimeFormat for the current locale */
function relativeFormatter(): Intl.RelativeTimeFormat {
  return new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
}

/**
 * Formats a date to Dutch format.
 *
 * @description Converts a date to the format "day month year" in Dutch.
 * @param {Date | string | number} date - Date to format (Date object, ISO string, or timestamp)
 * @returns {string} Formatted date (e.g., "4 mei 2026") or "-" for invalid dates
 * @example
 * formatDate(new Date('2026-05-04')); // "4 mei 2026"
 * formatDate('2026-12-25');           // "25 december 2026"
 */
export function formatDate(date: Date | string | number): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  return new Intl.DateTimeFormat(currentLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a date with time in Dutch.
 *
 * @description Converts a date to the format "day month year om HH:MM" in Dutch.
 * @param {Date | string | number} date - Date to format
 * @returns {string} Formatted date and time (e.g., "4 mei 2026 om 14:30") or "-" for invalid dates
 * @example
 * formatDateTime('2026-05-04T14:30:00'); // "4 mei 2026 om 14:30"
 */
export function formatDateTime(date: Date | string | number): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  const dateStr = new Intl.DateTimeFormat(currentLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);

  const timeStr = new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

  return `${dateStr} ${dateTimeJoiner()} ${timeStr}`;
}

/**
 * Formats a date with short time (no year).
 *
 * @description Converts a date to a compact format with abbreviated month and time.
 * @param {Date | string | number} date - Date to format
 * @returns {string} Formatted date and time (e.g., "4 mei 14:30") or "-" for invalid dates
 * @example
 * formatDateTimeShort('2026-05-04T14:30:00'); // "4 mei 14:30"
 */
export function formatDateTimeShort(date: Date | string | number): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  const dateStr = new Intl.DateTimeFormat(currentLocale(), {
    day: 'numeric',
    month: 'short',
  }).format(d);

  const timeStr = new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

  return `${dateStr} ${timeStr}`;
}

/**
 * Formats time only (no date).
 *
 * @description Extracts and formats the time portion of a date in 24-hour format.
 * @param {Date | string | number} date - Date to extract time from
 * @returns {string} Formatted time (e.g., "14:30") or "-" for invalid dates
 * @example
 * formatTime('2026-05-04T14:30:00'); // "14:30"
 * formatTime(new Date());             // Current time
 */
export function formatTime(date: Date | string | number): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  return new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Formats a date as relative time in Dutch.
 *
 * @description Converts a date to a human-readable relative time string in Dutch.
 * Supports both past and future dates with appropriate phrasing.
 *
 * Past date examples:
 * - "zojuist" (just now)
 * - "5 minuten geleden" (5 minutes ago)
 * - "gisteren" (yesterday)
 * - "vorige week" (last week)
 *
 * Future date examples:
 * - "zo meteen" (in a moment)
 * - "over 5 minuten" (in 5 minutes)
 * - "morgen" (tomorrow)
 * - "volgende week" (next week)
 *
 * @param {Date | string | number} date - Date to format
 * @returns {string} Relative time string or formatted date for very old/far dates
 * @example
 * formatRelative(new Date()); // "zojuist"
 * formatRelative(new Date(Date.now() - 86400000)); // "gisteren"
 * formatRelative(new Date(Date.now() + 86400000)); // "morgen"
 */
export function formatRelative(date: Date | string | number): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  // Future dates (negative diff)
  if (diffMs < 0) {
    // De eenheden voor de toekomst worden opnieuw uitgerekend vanuit het
    // absolute verschil, en niet als Math.abs() van de waarden hierboven.
    //
    // Math.floor rondt naar beneden, dus bij een negatief verschil rondt het
    // van nul af: floor(-25/24) is -2, niet -1. Math.abs() daarvan gaf 2, en
    // daarmee las een moment 25 uur vooruit als "overmorgen" in plaats van
    // "morgen", acht dagen vooruit als "over 2 weken", en negentig seconden
    // vooruit als "over 2 minuten". De tak `futureDiffMin < 1` was zelfs
    // onbereikbaar: elk negatief verschil, ook van een milliseconde, leverde
    // minstens 1 op, dus "nu" kwam nooit uit deze tak.
    //
    // Het verleden had dat probleem niet: daar is het verschil positief en
    // rondt Math.floor naar nul toe. Deze vier regels maken de toekomst
    // symmetrisch met het verleden.
    const aheadSec = Math.floor(-diffMs / 1000);
    const futureDiffMin = Math.floor(aheadSec / 60);
    const futureDiffHours = Math.floor(futureDiffMin / 60);
    const futureDiffDays = Math.floor(futureDiffHours / 24);
    const futureDiffWeeks = Math.floor(futureDiffDays / 7);

    const rtf = relativeFormatter();
    if (futureDiffMin < 1) return rtf.format(0, 'second');
    if (futureDiffMin < 60) return rtf.format(futureDiffMin, 'minute');
    if (futureDiffHours < 24) return rtf.format(futureDiffHours, 'hour');
    if (futureDiffDays < 7) return rtf.format(futureDiffDays, 'day');
    if (futureDiffWeeks < 4) return rtf.format(futureDiffWeeks, 'week');
    return formatDate(d);
  }

  // Past dates
  const rtf = relativeFormatter();
  if (diffSec < 60) return rtf.format(0, 'second');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHours < 24) return rtf.format(-diffHours, 'hour');
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
  if (diffWeeks < 4) return rtf.format(-diffWeeks, 'week');
  if (diffMonths < 12) return rtf.format(-diffMonths, 'month');

  // Older than a year - show full date
  return formatDate(d);
}

/**
 * Formats a duration in minutes to a readable Dutch string.
 *
 * @description Converts minutes to a human-readable format with hours and minutes.
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "30 min", "1 uur", "2 uur 15 min") or "-" for invalid input
 * @example
 * formatDuration(30);  // "30 min"
 * formatDuration(60);  // "1 uur"
 * formatDuration(135); // "2 uur 15 min"
 */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '-';

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hours} uur`;
  }

  return `${hours} uur ${mins} min`;
}

/**
 * Formats a duration in seconds to a readable Dutch string.
 *
 * @description Converts seconds to minutes, then formats using formatDuration.
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1 uur 30 min") or "-" for invalid input
 * @example
 * formatDurationSeconds(1800);  // "30 min"
 * formatDurationSeconds(5400);  // "1 uur 30 min"
 */
export function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  return formatDuration(seconds / 60);
}

/**
 * Formats a date range in Dutch.
 *
 * @description Creates a compact date range string, intelligently handling same month/year cases.
 * @param {Date | string | number} start - Start date
 * @param {Date | string | number} end - End date
 * @returns {string} Formatted range (e.g., "4 - 6 mei 2026", "4 mei - 2 juni 2026") or "-" for invalid dates
 * @example
 * formatDateRange('2026-05-04', '2026-05-06'); // "4 - 6 mei 2026"
 * formatDateRange('2026-05-04', '2026-06-02'); // "4 mei - 2 juni 2026"
 * formatDateRange('2026-05-04', '2027-06-02'); // "4 mei 2026 - 2 juni 2027"
 */
export function formatDateRange(start: Date | string | number, end: Date | string | number): string {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!isValidDate(startDate) || !isValidDate(endDate)) return '-';

  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const sameYear = startDate.getFullYear() === endDate.getFullYear();

  if (sameMonth && sameYear) {
    // Same month: "4 - 6 mei 2026"
    const day1 = startDate.getDate();
    const day2 = endDate.getDate();
    const monthYear = new Intl.DateTimeFormat(currentLocale(), {
      month: 'long',
      year: 'numeric',
    }).format(endDate);
    return `${day1} - ${day2} ${monthYear}`;
  }

  if (sameYear) {
    // Same year, different month: "4 mei - 2 juni 2026"
    const start1 = new Intl.DateTimeFormat(currentLocale(), {
      day: 'numeric',
      month: 'long',
    }).format(startDate);
    const end1 = new Intl.DateTimeFormat(currentLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(endDate);
    return `${start1} - ${end1}`;
  }

  // Different years: "4 mei 2026 - 2 juni 2027"
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

/**
 * Gets the day name in Dutch.
 *
 * @description Returns the weekday name in the specified style.
 * @param {Date | string | number} date - Date to get day name from
 * @param {'long' | 'short' | 'narrow'} [style='long'] - Name format: 'long' for full name, 'short' for abbreviated, 'narrow' for initial
 * @returns {string} Day name (e.g., "maandag", "ma", "M") or "-" for invalid dates
 * @example
 * getDayName('2026-05-04');          // "maandag"
 * getDayName('2026-05-04', 'short'); // "ma"
 * getDayName('2026-05-04', 'narrow'); // "M"
 */
export function getDayName(date: Date | string | number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  return new Intl.DateTimeFormat(currentLocale(), { weekday: style }).format(d);
}

/**
 * Gets the month name in Dutch.
 *
 * @description Returns the month name in the specified style.
 * @param {Date | string | number} date - Date to get month name from
 * @param {'long' | 'short' | 'narrow'} [style='long'] - Name format: 'long' for full name, 'short' for abbreviated, 'narrow' for initial
 * @returns {string} Month name (e.g., "januari", "jan", "J") or "-" for invalid dates
 * @example
 * getMonthName('2026-05-04');          // "mei"
 * getMonthName('2026-05-04', 'short'); // "mei"
 * getMonthName('2026-01-04', 'narrow'); // "J"
 */
export function getMonthName(date: Date | string | number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  return new Intl.DateTimeFormat(currentLocale(), { month: style }).format(d);
}

/**
 * Checks if a date is today.
 *
 * @description Compares the given date to the current date (ignoring time).
 * @param {Date | string | number} date - Date to check
 * @returns {boolean} True if the date is today, false otherwise or for invalid dates
 * @example
 * isToday(new Date()); // true
 * isToday('2020-01-01'); // false
 */
export function isToday(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!isValidDate(d)) return false;

  const today = new Date();
  return (
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
  );
}

/**
 * Checks if a date is tomorrow.
 *
 * @description Compares the given date to tomorrow's date (ignoring time).
 * @param {Date | string | number} date - Date to check
 * @returns {boolean} True if the date is tomorrow, false otherwise or for invalid dates
 * @example
 * isTomorrow(new Date(Date.now() + 86400000)); // true
 */
export function isTomorrow(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!isValidDate(d)) return false;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  );
}

/**
 * Checks if a date is yesterday.
 *
 * @description Compares the given date to yesterday's date (ignoring time).
 * @param {Date | string | number} date - Date to check
 * @returns {boolean} True if the date is yesterday, false otherwise or for invalid dates
 * @example
 * isYesterday(new Date(Date.now() - 86400000)); // true
 */
export function isYesterday(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!isValidDate(d)) return false;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * Zet een datum om naar de waarde van een `<input type="date">`.
 *
 * @description Levert JJJJ-MM-DD in de tijdzone van de gebruiker, niet in UTC.
 *
 * Op het eerste gezicht doet `new Date().toISOString().split('T')[0]` hetzelfde,
 * en negen van de tien keer klopt dat ook. Alleen rekent `toISOString()` in UTC.
 * In Nederland loopt de klok een of twee uur voor, dus tussen middernacht en
 * 01:00 (zomertijd 02:00) staat daar de dag ervóór. Een formulier dat op
 * 1 januari om half een geopend wordt, stelt dan 31 december voor - een andere
 * dag, een andere maand en een ander boekjaar.
 *
 * @param {Date} [date=new Date()] - Datum om om te zetten; standaard vandaag
 * @returns {string} Datum als JJJJ-MM-DD, of "" voor een ongeldige datum
 * @example
 * toDateInputValue(new Date(2026, 0, 1)); // "2026-01-01"
 */
export function toDateInputValue(date: Date = new Date()): string {
  if (!isValidDate(date)) return '';

  const jaar = date.getFullYear();
  const maand = String(date.getMonth() + 1).padStart(2, '0');
  const dag = String(date.getDate()).padStart(2, '0');
  return `${jaar}-${maand}-${dag}`;
}

/**
 * Telt hele dagen op bij een datum, in kalenderdagen.
 *
 * @description Rekent met `setDate`, niet met een aantal milliseconden. Dertig
 * keer 24 uur optellen komt rond de overgang naar of van zomertijd een uur
 * naast de kalender uit, en dat scheelt bij een vervaldatum een hele dag.
 *
 * @param {Date} date - Begindatum
 * @param {number} days - Aantal dagen erbij (mag negatief)
 * @returns {Date} Nieuwe datum; de meegegeven datum blijft ongemoeid
 */
export function addDays(date: Date, days: number): Date {
  const resultaat = new Date(date.getTime());
  resultaat.setDate(resultaat.getDate() + days);
  return resultaat;
}

// Helper functions

/**
 * Converts various date formats to a Date object.
 * @param {Date | string | number} date - Input date
 * @returns {Date} Date object
 * @private
 */
function toDate(date: Date | string | number): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

/**
 * Checks if a Date object represents a valid date.
 * @param {Date} date - Date to validate
 * @returns {boolean} True if the date is valid
 * @private
 */
function isValidDate(date: Date): boolean {
  return !isNaN(date.getTime());
}
