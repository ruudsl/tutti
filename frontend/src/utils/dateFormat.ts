/**
 * Dutch Date Formatting Utilities
 *
 * Provides comprehensive date formatting functions using Intl.DateTimeFormat
 * with Dutch (nl-NL) locale. All functions handle invalid dates gracefully.
 *
 * @module utils/dateFormat
 */

/** Dutch locale code for date formatting */
const LOCALE = 'nl-NL';

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

  return new Intl.DateTimeFormat(LOCALE, {
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

  const dateStr = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);

  const timeStr = new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);

  return `${dateStr} om ${timeStr}`;
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

  const dateStr = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
  }).format(d);

  const timeStr = new Intl.DateTimeFormat(LOCALE, {
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

  return new Intl.DateTimeFormat(LOCALE, {
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
    const futureDiffMin = Math.abs(diffMin);
    const futureDiffHours = Math.abs(diffHours);
    const futureDiffDays = Math.abs(diffDays);
    const futureDiffWeeks = Math.abs(diffWeeks);

    if (futureDiffMin < 1) return 'zo meteen';
    if (futureDiffMin < 60) return `over ${futureDiffMin} ${futureDiffMin === 1 ? 'minuut' : 'minuten'}`;
    if (futureDiffHours < 24) return `over ${futureDiffHours} ${futureDiffHours === 1 ? 'uur' : 'uur'}`;
    if (futureDiffDays === 1) return 'morgen';
    if (futureDiffDays === 2) return 'overmorgen';
    if (futureDiffDays < 7) return `over ${futureDiffDays} dagen`;
    if (futureDiffWeeks === 1) return 'volgende week';
    if (futureDiffWeeks < 4) return `over ${futureDiffWeeks} weken`;
    return formatDate(d);
  }

  // Past dates
  if (diffSec < 60) return 'zojuist';
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minuut' : 'minuten'} geleden`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'uur' : 'uur'} geleden`;
  if (diffDays === 1) return 'gisteren';
  if (diffDays === 2) return 'eergisteren';
  if (diffDays < 7) return `${diffDays} dagen geleden`;
  if (diffWeeks === 1) return 'vorige week';
  if (diffWeeks < 4) return `${diffWeeks} weken geleden`;
  if (diffMonths === 1) return 'vorige maand';
  if (diffMonths < 12) return `${diffMonths} maanden geleden`;

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
    const monthYear = new Intl.DateTimeFormat(LOCALE, {
      month: 'long',
      year: 'numeric',
    }).format(endDate);
    return `${day1} - ${day2} ${monthYear}`;
  }

  if (sameYear) {
    // Same year, different month: "4 mei - 2 juni 2026"
    const start1 = new Intl.DateTimeFormat(LOCALE, {
      day: 'numeric',
      month: 'long',
    }).format(startDate);
    const end1 = new Intl.DateTimeFormat(LOCALE, {
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

  return new Intl.DateTimeFormat(LOCALE, { weekday: style }).format(d);
}

/**
 * Get the month name in Dutch: "januari", "februari", etc.
 */
export function getMonthName(date: Date | string | number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  const d = toDate(date);
  if (!isValidDate(d)) return '-';

  return new Intl.DateTimeFormat(LOCALE, { month: style }).format(d);
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!isValidDate(d)) return false;

  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if a date is tomorrow
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
 * Check if a date is yesterday
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

// Helper functions

function toDate(date: Date | string | number): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

function isValidDate(date: Date): boolean {
  return !isNaN(date.getTime());
}
