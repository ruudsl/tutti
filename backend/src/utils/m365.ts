/**
 * M365/Microsoft Graph API utility functions
 * Shared between onboarding routes and schedulers
 */

import db from '../database/connection';
import logger from './logger';

export interface MicrosoftConfig {
  microsoft_client_id: string | null;
  microsoft_client_secret: string | null;
  microsoft_tenant_id: string | null;
  microsoft_enabled: number;
}

/**
 * Get Microsoft configuration for an association
 */
export function getMicrosoftConfig(associationId: string | null): MicrosoftConfig | null {
  if (!associationId) return null;
  const association = db
    .prepare(
      `
        SELECT microsoft_client_id, microsoft_client_secret, microsoft_tenant_id, microsoft_enabled
        FROM associations WHERE id = ?
    `,
    )
    .get(associationId) as MicrosoftConfig | undefined;

  if (
    !association ||
    !association.microsoft_enabled ||
    !association.microsoft_client_id ||
    !association.microsoft_tenant_id ||
    !association.microsoft_client_secret
  ) {
    return null;
  }
  return association;
}

/**
 * Get app-only access token for Microsoft Graph API
 */
export async function getAppAccessToken(msConfig: MicrosoftConfig): Promise<string> {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${msConfig.microsoft_tenant_id}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: msConfig.microsoft_client_id!,
        client_secret: msConfig.microsoft_client_secret!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    logger.error('Failed to get app access token', { status: tokenResponse.status, body: errorBody });
    throw new Error('Kan geen toegangstoken verkrijgen van Microsoft.');
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };
  return tokenData.access_token;
}

/**
 * Helper function to wait for a specified time
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try to set mailbox forwarding using Exchange Admin API (beta)
 * This sets forwardingSmtpAddress which is visible in M365 Admin under "Email forwarding"
 */
async function tryExchangeAdminForwarding(
  accessToken: string,
  userId: string,
  forwardingAddress: string,
): Promise<{ success: boolean; notSupported?: boolean; error?: string }> {
  try {
    const response = await fetch(`https://graph.microsoft.com/beta/admin/exchange/mailboxes/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        forwardingSmtpAddress: `smtp:${forwardingAddress}`,
        deliverToMailboxAndForward: true,
      }),
    });

    if (response.ok) {
      logger.info(`Email forwarding set via Exchange Admin API for user ${userId} to ${forwardingAddress}`);
      return { success: true };
    }

    const errorData = (await response.json()) as { error?: { code?: string; message?: string } };
    const errorCode = errorData.error?.code;
    const errorMessage = errorData.error?.message || 'Unknown error';

    // Check if the API is not available/supported
    if (response.status === 404 || errorCode === 'ResourceNotFound' || errorCode === 'UnknownError') {
      logger.info('Exchange Admin API not available, will use inbox rules fallback');
      return { success: false, notSupported: true, error: errorMessage };
    }

    logger.warn('Exchange Admin API forwarding failed', {
      error: errorMessage,
      code: errorCode,
      status: response.status,
    });
    return { success: false, notSupported: false, error: `${errorCode}: ${errorMessage}` };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('Error calling Exchange Admin API', { error: err });
    return { success: false, notSupported: true, error: errorMessage };
  }
}

/**
 * Create an inbox forwarding rule with retry logic (fallback method)
 * This creates a mail rule that forwards all incoming mail
 * Note: This is NOT visible in M365 Admin "Email forwarding" but works via Graph API
 */
async function createInboxForwardingRule(
  accessToken: string,
  userId: string,
  forwardingAddress: string,
  maxRetries: number = 5,
  initialDelayMs: number = 3000,
): Promise<{ success: boolean; error?: string }> {
  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const ruleResponse = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userId}/mailFolders/inbox/messageRules`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName: 'Forward all mail to private email',
            sequence: 1,
            isEnabled: true,
            conditions: {},
            actions: {
              forwardTo: [
                {
                  emailAddress: {
                    address: forwardingAddress,
                  },
                },
              ],
              stopProcessingRules: false,
            },
          }),
        },
      );

      if (ruleResponse.ok) {
        logger.info(`Email forwarding rule created for user ${userId} to ${forwardingAddress} (attempt ${attempt})`);
        return { success: true };
      }

      const errorData = (await ruleResponse.json()) as { error?: { code?: string; message?: string } };
      const errorCode = errorData.error?.code;
      const errorMessage = errorData.error?.message || 'Unknown error';
      lastError = `${errorCode}: ${errorMessage}`;

      // Check if it's a mailbox not ready error - these are worth retrying
      const isMailboxNotReady =
        errorCode === 'MailboxNotEnabledForRESTAPI' ||
        errorCode === 'ResourceNotFound' ||
        errorMessage?.includes('mailbox') ||
        errorMessage?.includes('Mailbox') ||
        ruleResponse.status === 404;

      if (isMailboxNotReady && attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        logger.info(`Mailbox not ready, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(delay);
        continue;
      }

      // Not a retryable error or max retries reached
      logger.warn(`Could not create forwarding rule after ${attempt} attempts`, {
        error: errorMessage,
        code: errorCode,
        status: ruleResponse.status,
      });
      return { success: false, error: lastError };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown error';
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`Error creating forwarding rule, retrying in ${delay}ms`, { error: err });
        await sleep(delay);
        continue;
      }
      logger.error('Failed to create forwarding rule after all retries', { error: err });
      return { success: false, error: lastError };
    }
  }
  return { success: false, error: lastError };
}

/**
 * Set up email forwarding for a user
 * First tries Exchange Admin API (visible in M365 Admin), then falls back to inbox rules
 * Returns success status and error message if failed
 */
export async function setupEmailForwarding(
  accessToken: string,
  userId: string,
  forwardingAddress: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // First set otherMails as a backup/reference
    const updateResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        otherMails: [forwardingAddress],
      }),
    });

    if (!updateResponse.ok) {
      // Het foutantwoord is niet altijd JSON: een gateway of proxy tussen ons
      // en Graph kan een HTML-pagina teruggeven. Zonder deze vangst gooit
      // .json() daar, valt de uitzondering in de buitenste catch, en wordt het
      // doorsturen helemaal niet meer geprobeerd - precies het tegenovergestelde
      // van wat de regel hieronder belooft.
      const errorData = (await updateResponse.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      logger.warn('Failed to set otherMails', {
        status: updateResponse.status,
        error: errorData.error?.message,
      });
      // Continue anyway - the forwarding is more important
    }

    // First, try the Exchange Admin API (beta) - this shows in M365 Admin
    const exchangeResult = await tryExchangeAdminForwarding(accessToken, userId, forwardingAddress);
    if (exchangeResult.success) {
      return { success: true };
    }

    // Always fall back to inbox rules when Exchange Admin API fails
    // Note: Inbox rules work but are NOT visible in M365 Admin "Email forwarding"
    // They are visible in Outlook Web -> Settings -> Mail -> Rules
    // We try this regardless of the error type (500, 400, 404, etc.) because:
    // 1. Exchange Admin API may fail temporarily while mailbox is being provisioned
    // 2. Inbox rules API often succeeds even when Exchange Admin API fails
    logger.info('Exchange Admin API failed, using inbox rules fallback for email forwarding', {
      wasNotSupported: exchangeResult.notSupported,
      exchangeError: exchangeResult.error,
    });
    const ruleResult = await createInboxForwardingRule(accessToken, userId, forwardingAddress);
    if (ruleResult.success) {
      return { success: true };
    }

    // If both methods failed, return false with error info
    logger.warn(
      'Email forwarding could not be set - both Exchange Admin API and inbox rules failed. Mailbox may need more time to provision.',
    );
    return {
      success: false,
      error: `Exchange Admin: ${exchangeResult.error || 'failed'}; Inbox Rules: ${ruleResult.error || 'failed'}`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Error setting up email forwarding', { error: err });
    return { success: false, error: errorMessage };
  }
}
