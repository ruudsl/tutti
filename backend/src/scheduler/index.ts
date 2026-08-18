/**
 * Central registry for background schedulers.
 *
 * Each scheduler keeps its own recursive setTimeout handle and exposes a
 * stop function that clears it. This module collects those stop functions
 * so the graceful shutdown handler can stop everything in one call.
 *
 * Note: scheduler/backup.ts is intentionally not managed here.
 */

import { stopScheduler as stopSeatingNotificationsScheduler } from './seating-notifications';
import { stopScheduler as stopEmailForwardingScheduler } from './email-forwarding-retry';
import { stopScheduler as stopGdprCleanupScheduler } from './gdpr-cleanup';

const schedulerStopFunctions: Array<() => void> = [
  stopSeatingNotificationsScheduler,
  stopEmailForwardingScheduler,
  stopGdprCleanupScheduler,
];

/**
 * Stop all registered schedulers (clears their pending timeouts).
 * Safe to call multiple times.
 */
export function stopAllSchedulers(): void {
  for (const stop of schedulerStopFunctions) {
    try {
      stop();
    } catch (err) {
      // A failing stop function should never block shutdown
      console.error('Failed to stop scheduler:', err);
    }
  }
}
