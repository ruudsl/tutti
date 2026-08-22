/**
 * Email Forwarding Retry Scheduler
 *
 * Automatically retries setting up email forwarding for users whose
 * mailboxes weren't ready during initial onboarding.
 *
 * Retry strategy:
 * - Checks every 2 minutes for pending tasks
 * - Uses exponential backoff: 5min, 15min, 45min, 2h, 6h
 * - Maximum 10 retry attempts over ~9 hours
 * - After max retries, marks task as failed (requires manual intervention)
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../database/connection';
import logger from '../utils/logger';
import { getMicrosoftConfig, getAppAccessToken, setupEmailForwarding } from '../utils/m365';

// Check every 2 minutes
const CHECK_INTERVAL_MS = 2 * 60 * 1000;

// Maximum retry attempts
const MAX_RETRY_ATTEMPTS = 10;

// Retry delays in milliseconds (exponential backoff)
// 5min, 15min, 45min, 2h, 4h, 6h, 6h, 6h, 6h, 6h
const RETRY_DELAYS_MS = [
  5 * 60 * 1000, // 5 minutes
  15 * 60 * 1000, // 15 minutes
  45 * 60 * 1000, // 45 minutes
  2 * 60 * 60 * 1000, // 2 hours
  4 * 60 * 60 * 1000, // 4 hours
  6 * 60 * 60 * 1000, // 6 hours
  6 * 60 * 60 * 1000, // 6 hours
  6 * 60 * 60 * 1000, // 6 hours
  6 * 60 * 60 * 1000, // 6 hours
  6 * 60 * 60 * 1000, // 6 hours
];

interface PendingTask {
  id: string;
  user_id: string;
  association_id: string;
  metadata: string;
}

interface TaskMetadata {
  privateEmail: string;
  retryCount: number;
  lastAttempt: string;
  nextRetryAfter: string;
  lastError?: string;
}

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  microsoft_id: string;
  private_email: string;
}

let schedulerRunning = false;
let timeoutHandle: NodeJS.Timeout | null = null;

function getNextRetryDelay(retryCount: number): number {
  const index = Math.min(retryCount, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}

function formatDuration(ms: number): string {
  if (ms < 60 * 1000) {
    return `${Math.round(ms / 1000)} seconden`;
  } else if (ms < 60 * 60 * 1000) {
    return `${Math.round(ms / (60 * 1000))} minuten`;
  } else {
    return `${Math.round(ms / (60 * 60 * 1000))} uur`;
  }
}

async function processTask(task: PendingTask): Promise<void> {
  let metadata: TaskMetadata;
  try {
    metadata = JSON.parse(task.metadata);
  } catch {
    logger.error('Invalid task metadata', { taskId: task.id });
    return;
  }

  // Check if it's time to retry
  const now = new Date();
  const nextRetryAfter = new Date(metadata.nextRetryAfter);
  if (now < nextRetryAfter) {
    // Not yet time to retry
    return;
  }

  // Get user info
  const user = db
    .prepare(
      `
        SELECT id, email, first_name, last_name, microsoft_id, private_email
        FROM users WHERE id = ?
    `,
    )
    .get(task.user_id) as User | undefined;

  if (!user) {
    logger.warn('User not found for email forwarding retry', { userId: task.user_id });
    // Delete the task since user doesn't exist
    db.prepare('DELETE FROM onboarding_tasks WHERE id = ?').run(task.id);
    return;
  }

  if (!user.microsoft_id) {
    logger.warn('User has no Microsoft ID, cannot set email forwarding', { userId: user.id });
    return;
  }

  if (!user.private_email) {
    logger.info('User no longer has private email, removing pending task', { userId: user.id });
    db.prepare('DELETE FROM onboarding_tasks WHERE id = ?').run(task.id);
    return;
  }

  // Get Microsoft config
  const msConfig = getMicrosoftConfig(task.association_id);
  if (!msConfig) {
    logger.warn('Microsoft not configured for association', { associationId: task.association_id });
    return;
  }

  logger.info('Attempting email forwarding retry', {
    userId: user.id,
    email: user.email,
    privateEmail: user.private_email,
    attempt: metadata.retryCount + 1,
    maxAttempts: MAX_RETRY_ATTEMPTS,
  });

  try {
    // Get access token
    const accessToken = await getAppAccessToken(msConfig);

    // Try to set up email forwarding
    const result = await setupEmailForwarding(accessToken, user.microsoft_id, user.private_email);

    if (result.success) {
      // Success! Update the task to completed
      logger.info('Email forwarding successfully set up by scheduler', {
        userId: user.id,
        email: user.email,
        privateEmail: user.private_email,
        afterAttempts: metadata.retryCount + 1,
      });

      db.prepare(
        `
                UPDATE onboarding_tasks
                SET task_type = 'email_forwarding',
                    status = 'completed',
                    metadata = ?,
                    completed_at = CURRENT_TIMESTAMP,
                    error_message = NULL
                WHERE id = ?
            `,
      ).run(
        JSON.stringify({
          privateEmail: user.private_email,
          method: 'scheduler_retry',
          totalAttempts: metadata.retryCount + 1,
        }),
        task.id,
      );
    } else {
      // Failed - update retry count and schedule next attempt
      const newRetryCount = metadata.retryCount + 1;

      if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
        // Max retries reached - mark as failed
        logger.warn('Email forwarding failed after max retry attempts', {
          userId: user.id,
          email: user.email,
          attempts: newRetryCount,
          lastError: result.error,
        });

        db.prepare(
          `
                    UPDATE onboarding_tasks
                    SET status = 'failed',
                        metadata = ?,
                        error_message = ?
                    WHERE id = ?
                `,
        ).run(
          JSON.stringify({
            ...metadata,
            retryCount: newRetryCount,
            lastAttempt: now.toISOString(),
            lastError: result.error,
          }),
          `Na ${newRetryCount} pogingen mislukt. Laatste fout: ${result.error || 'onbekend'}. Probeer handmatig via ledenlijst.`,
          task.id,
        );
      } else {
        // Schedule next retry
        const nextDelay = getNextRetryDelay(newRetryCount);
        const nextRetry = new Date(now.getTime() + nextDelay);

        logger.info('Email forwarding retry failed, scheduling next attempt', {
          userId: user.id,
          email: user.email,
          attempt: newRetryCount,
          nextRetryIn: formatDuration(nextDelay),
          nextRetryAt: nextRetry.toISOString(),
          error: result.error,
        });

        db.prepare(
          `
                    UPDATE onboarding_tasks
                    SET metadata = ?
                    WHERE id = ?
                `,
        ).run(
          JSON.stringify({
            ...metadata,
            retryCount: newRetryCount,
            lastAttempt: now.toISOString(),
            nextRetryAfter: nextRetry.toISOString(),
            lastError: result.error,
          }),
          task.id,
        );
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error during email forwarding retry', {
      error: errorMessage,
      userId: user.id,
    });

    // Update retry count on error
    const newRetryCount = metadata.retryCount + 1;
    const nextDelay = getNextRetryDelay(newRetryCount);
    const nextRetry = new Date(now.getTime() + nextDelay);

    db.prepare(
      `
            UPDATE onboarding_tasks
            SET metadata = ?
            WHERE id = ?
        `,
    ).run(
      JSON.stringify({
        ...metadata,
        retryCount: newRetryCount,
        lastAttempt: now.toISOString(),
        nextRetryAfter: nextRetry.toISOString(),
        lastError: errorMessage,
      }),
      task.id,
    );
  }
}

/**
 * Eén ronde: alle openstaande taken langs.
 *
 * Losgetrokken uit checkAndProcessPendingTasks zodat een ronde rechtstreeks
 * aan te roepen is zonder de lus te starten. De wachttijd tussen twee taken
 * (bedoeld om de Graph-API niet te overladen) is een parameter geworden met
 * dezelfde standaardwaarde als voorheen; een aanroeper die geen echte API
 * raakt kan er 0 van maken.
 */
export async function processPendingTasks(delayBetweenTasksMs: number = 1000): Promise<void> {
  try {
    // Find all pending email forwarding tasks
    const pendingTasks = db
      .prepare(
        `
            SELECT id, user_id, association_id, metadata
            FROM onboarding_tasks
            WHERE task_type = 'email_forwarding_pending' AND status = 'pending'
        `,
      )
      .all() as PendingTask[];

    if (pendingTasks.length > 0) {
      logger.debug('Found pending email forwarding tasks', { count: pendingTasks.length });
    }

    // Process each task (but not in parallel to avoid rate limiting)
    for (const task of pendingTasks) {
      await processTask(task);
      // Small delay between tasks to avoid overwhelming the API
      if (delayBetweenTasksMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenTasksMs));
      }
    }
  } catch (err) {
    logger.error('Error in email forwarding retry scheduler', { error: err });
  }
}

async function checkAndProcessPendingTasks(): Promise<void> {
  if (!schedulerRunning) return;

  await processPendingTasks();

  // Schedule next check
  if (schedulerRunning) {
    timeoutHandle = setTimeout(checkAndProcessPendingTasks, CHECK_INTERVAL_MS);
  }
}

export function startScheduler(): void {
  if (schedulerRunning) {
    logger.warn('Email forwarding retry scheduler already running');
    return;
  }

  schedulerRunning = true;
  logger.info('Email forwarding retry scheduler started');

  // Start checking after a short delay (30 seconds to let the system initialize)
  timeoutHandle = setTimeout(checkAndProcessPendingTasks, 30 * 1000);
}

export function stopScheduler(): void {
  schedulerRunning = false;
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  logger.info('Email forwarding retry scheduler stopped');
}

/**
 * Manually trigger a retry for a specific user
 * Useful for the admin UI
 */
export async function triggerRetryForUser(userId: string): Promise<{ success: boolean; message: string }> {
  const task = db
    .prepare(
      `
        SELECT id, user_id, association_id, metadata
        FROM onboarding_tasks
        WHERE user_id = ? AND task_type IN ('email_forwarding_pending', 'email_forwarding_retry') AND status IN ('pending', 'failed')
        ORDER BY created_at DESC
        LIMIT 1
    `,
    )
    .get(userId) as PendingTask | undefined;

  if (!task) {
    return { success: false, message: 'Geen openstaande email forwarding taak gevonden voor deze gebruiker.' };
  }

  // Reset the next retry time to now
  try {
    const metadata = JSON.parse(task.metadata) as TaskMetadata;
    metadata.nextRetryAfter = new Date().toISOString();

    db.prepare(
      `
            UPDATE onboarding_tasks
            SET status = 'pending', metadata = ?
            WHERE id = ?
        `,
    ).run(JSON.stringify(metadata), task.id);

    // Process immediately
    await processTask({ ...task, metadata: JSON.stringify(metadata) });

    // Check if it succeeded
    const updatedTask = db.prepare('SELECT status FROM onboarding_tasks WHERE id = ?').get(task.id) as
      { status: string } | undefined;

    if (updatedTask?.status === 'completed') {
      return { success: true, message: 'Email forwarding is succesvol ingesteld.' };
    } else {
      return {
        success: false,
        message:
          'Email forwarding kon niet worden ingesteld. De mailbox is mogelijk nog niet gereed. Automatische retry is gepland.',
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message: `Fout bij retry: ${errorMessage}` };
  }
}
