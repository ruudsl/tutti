/**
 * Dutch date formatting utilities using Intl.DateTimeFormat
 */

const LOCALE = 'nl-NL';

/**
 * Format a date to Dutch format: "4 mei 2026"
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
 * Format a date with time: "4 mei 2026 om 14:30"
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
 * Format a date with short time: "4 mei 14:30"
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
 * Format time only: "14:30"
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
 * Format relative time in Dutch:
 * - "zojuist" (just now)
 * - "5 minuten geleden" (5 minutes ago)
 * - "2 uur geleden" (2 hours ago)
 * - "gisteren" (yesterday)
 * - "eergisteren" (day before yesterday)
 * - "3 dagen geleden" (3 days ago)
 * - "vorige week" (last week)
 * - "2 weken geleden" (2 weeks ago)
 * - "vorige maand" (last month)
 * - Date if older
 *
 * Also supports future dates:
 * - "over 5 minuten" (in 5 minutes)
 * - "morgen" (tomorrow)
 * - "overmorgen" (day after tomorrow)
 * - etc.
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
 * Format duration in minutes to readable Dutch string:
 * - "30 min" (30 minutes)
 * - "1 uur" (1 hour)
 * - "1 uur 30 min" (1 hour 30 minutes)
 * - "2 uur 15 min" (2 hours 15 minutes)
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
 * Format duration from seconds to readable Dutch string
 */
export function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  return formatDuration(seconds / 60);
}

/**
 * Format a date range: "4 - 6 mei 2026" or "4 mei - 2 juni 2026"
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
 * Get the day name in Dutch: "maandag", "dinsdag", etc.
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
