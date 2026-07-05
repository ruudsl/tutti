/**
 * Formatting Utilities Module
 *
 * Provides functions for formatting durations, dates, file sizes, and currency.
 *
 * @module utils/format
 */

import { currentLocale } from './locale';

/**
 * Formats a duration from seconds to a human-readable string.
 *
 * @description Converts seconds to mm:ss format, or h:mm:ss for durations of an hour or more.
 * Returns '-' for zero or invalid values.
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string (e.g., "3:45" or "1:23:45")
 * @example
 * formatDuration(185);  // "3:05"
 * formatDuration(3725); // "1:02:05"
 * formatDuration(0);    // "-"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parses a duration string to seconds.
 *
 * @description Converts a time string in mm:ss or h:mm:ss format to total seconds.
 * Returns 0 for invalid or empty input.
 * @param {string} str - Duration string to parse
 * @returns {number} Duration in seconds
 * @example
 * parseDuration("3:05");    // 185
 * parseDuration("1:02:05"); // 3725
 * parseDuration("");        // 0
 */
export function parseDuration(str: string): number {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Formats a date to Dutch locale string.
 *
 * @description Converts a date to a human-readable Dutch format with full month name.
 * @param {string | Date} date - Date to format (ISO string or Date object)
 * @returns {string} Formatted date (e.g., "4 mei 2026")
 * @example
 * formatDate(new Date('2026-05-04')); // "4 mei 2026"
 * formatDate('2026-12-25');           // "25 december 2026"
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString(currentLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Formats a date as relative time in Dutch.
 *
 * @description Converts a date to a human-readable relative time string.
 * Falls back to full date format for dates older than a week.
 * @param {string | Date} date - Date to format
 * @returns {string} Relative time string (e.g., "zojuist", "5 minuten geleden", "3 dagen geleden")
 * @example
 * formatRelativeTime(new Date()); // "zojuist"
 * formatRelativeTime(new Date(Date.now() - 3600000)); // "1 uur geleden"
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  if (diffMins < 1) return rtf.format(0, 'second');
  if (diffMins < 60) return rtf.format(-diffMins, 'minute');
  if (diffHours < 24) return rtf.format(-diffHours, 'hour');
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
  return formatDate(date);
}

/**
 * Truncates text to a maximum length with ellipsis.
 *
 * @description Cuts text at the specified length and adds "..." if truncated.
 * Returns original text if within limit.
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length including ellipsis
 * @returns {string} Truncated text with ellipsis or original text
 * @example
 * truncate("Hello World", 8);  // "Hello..."
 * truncate("Hello", 10);       // "Hello"
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Formats a file size to a human-readable string.
 *
 * @description Converts bytes to the most appropriate unit (B, KB, MB, GB).
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (e.g., "1.5 MB", "256 KB")
 * @example
 * formatFileSize(1024);       // "1 KB"
 * formatFileSize(1536000);    // "1.5 MB"
 * formatFileSize(0);          // "0 B"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Formats a currency amount to Dutch Euro format.
 *
 * @description Converts a number to a localized currency string using Dutch formatting.
 * Returns '-' for null or undefined values.
 * @param {number | null | undefined} amount - Amount to format
 * @param {string} [currency='EUR'] - Currency code (ISO 4217)
 * @returns {string} Formatted currency string (e.g., "EUR 25,00")
 * @example
 * formatCurrency(25.50);        // "EUR 25,50"
 * formatCurrency(1000);         // "EUR 1.000,00"
 * formatCurrency(null);         // "-"
 * formatCurrency(100, 'USD');   // "USD 100,00"
 */
export function formatCurrency(amount: number | null | undefined, currency = 'EUR'): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat(currentLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
