import axios from 'axios';
import crypto from 'crypto';
import db from '../database/connection';
import logger from '../utils/logger';

// WhatsApp Business API / Twilio WhatsApp configuration (env var fallback)
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID_ENV = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN_ENV = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(32).toString('hex');

// Twilio WhatsApp alternative (env var fallback)
const TWILIO_ACCOUNT_SID_ENV = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN_ENV = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM_ENV = process.env.TWILIO_WHATSAPP_FROM; // e.g., 'whatsapp:+14155238886'

export interface WhatsAppMessage {
    to: string; // Phone number with country code (e.g., +31612345678)
    templateName?: string;
    templateLanguage?: string;
    templateParams?: string[];
    text?: string; // For simple text messages (non-template)
}

export interface WhatsAppDeliveryStatus {
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    errorMessage?: string;
}

export type WhatsAppConfig =
    | { provider: 'meta'; phoneNumberId: string; accessToken: string; apiUrl: string }
    | { provider: 'twilio'; accountSid: string; authToken: string; whatsappFrom: string };

/**
 * Resolve the WhatsApp configuration for a given association (or env fallback).
 * Returns null if no configuration is available.
 */
export function getWhatsAppConfig(associationId?: string): WhatsAppConfig | null {
    if (associationId) {
        try {
            const row = db.prepare(`
                SELECT whatsapp_provider, whatsapp_enabled,
                       whatsapp_phone_number_id, whatsapp_access_token,
                       twilio_account_sid, twilio_auth_token, twilio_whatsapp_from
                FROM associations
                WHERE id = ?
            `).get(associationId) as {
                whatsapp_provider: string | null;
                whatsapp_enabled: number;
                whatsapp_phone_number_id: string | null;
                whatsapp_access_token: string | null;
                twilio_account_sid: string | null;
                twilio_auth_token: string | null;
                twilio_whatsapp_from: string | null;
            } | undefined;

            if (row && row.whatsapp_enabled) {
                if (
                    row.whatsapp_provider === 'meta' &&
                    row.whatsapp_phone_number_id &&
                    row.whatsapp_access_token
                ) {
                    return {
                        provider: 'meta',
                        phoneNumberId: row.whatsapp_phone_number_id,
                        accessToken: row.whatsapp_access_token,
                        apiUrl: WHATSAPP_API_URL,
                    };
                }

                if (
                    row.whatsapp_provider === 'twilio' &&
                    row.twilio_account_sid &&
                    row.twilio_auth_token &&
                    row.twilio_whatsapp_from
                ) {
                    return {
                        provider: 'twilio',
                        accountSid: row.twilio_account_sid,
                        authToken: row.twilio_auth_token,
                        whatsappFrom: row.twilio_whatsapp_from,
                    };
                }
            }
        } catch (error) {
            logger.debug('getWhatsAppConfig: DB lookup failed, falling back to env', error);
        }
    }

    // Fall back to environment variables — prefer Meta if both are set
    if (WHATSAPP_PHONE_NUMBER_ID_ENV && WHATSAPP_ACCESS_TOKEN_ENV) {
        return {
            provider: 'meta',
            phoneNumberId: WHATSAPP_PHONE_NUMBER_ID_ENV,
            accessToken: WHATSAPP_ACCESS_TOKEN_ENV,
            apiUrl: WHATSAPP_API_URL,
        };
    }

    if (TWILIO_ACCOUNT_SID_ENV && TWILIO_AUTH_TOKEN_ENV && TWILIO_WHATSAPP_FROM_ENV) {
        return {
            provider: 'twilio',
            accountSid: TWILIO_ACCOUNT_SID_ENV,
            authToken: TWILIO_AUTH_TOKEN_ENV,
            whatsappFrom: TWILIO_WHATSAPP_FROM_ENV,
        };
    }

    return null;
}

/**
 * Check if WhatsApp is configured.
 * - With associationId: true if DB config for that association OR env vars are set.
 * - Without associationId: true if ANY association has it configured OR env vars are set.
 */
export function isWhatsAppConfigured(associationId?: string): boolean {
    if (associationId) {
        return getWhatsAppConfig(associationId) !== null;
    }

    // No associationId: check env vars first
    if (
        (WHATSAPP_PHONE_NUMBER_ID_ENV && WHATSAPP_ACCESS_TOKEN_ENV) ||
        (TWILIO_ACCOUNT_SID_ENV && TWILIO_AUTH_TOKEN_ENV && TWILIO_WHATSAPP_FROM_ENV)
    ) {
        return true;
    }

    // Check if any association has WhatsApp enabled
    try {
        const row = db.prepare(`
            SELECT 1 FROM associations
            WHERE whatsapp_enabled = 1
              AND whatsapp_provider IS NOT NULL
              AND (
                (whatsapp_provider = 'meta'   AND whatsapp_phone_number_id IS NOT NULL AND whatsapp_access_token IS NOT NULL)
                OR
                (whatsapp_provider = 'twilio' AND twilio_account_sid IS NOT NULL AND twilio_auth_token IS NOT NULL AND twilio_whatsapp_from IS NOT NULL)
              )
            LIMIT 1
        `).get();
        return !!row;
    } catch (error) {
        logger.debug('isWhatsAppConfigured: DB lookup failed', error);
        return false;
    }
}

/**
 * Send a WhatsApp message using Meta WhatsApp Business API
 */
async function sendMetaWhatsAppMessage(
    message: WhatsAppMessage,
    config: Extract<WhatsAppConfig, { provider: 'meta' }>,
): Promise<string | null> {
    try {
        const url = `${config.apiUrl}/${config.phoneNumberId}/messages`;

        const payload: Record<string, any> = {
            messaging_product: 'whatsapp',
            to: message.to.replace(/[^0-9]/g, ''), // Remove non-numeric characters
        };

        if (message.templateName) {
            // Template message (for notifications outside 24-hour window)
            payload.type = 'template';
            payload.template = {
                name: message.templateName,
                language: {
                    code: message.templateLanguage || 'en',
                },
            };

            if (message.templateParams && message.templateParams.length > 0) {
                payload.template.components = [{
                    type: 'body',
                    parameters: message.templateParams.map(param => ({
                        type: 'text',
                        text: param,
                    })),
                }];
            }
        } else if (message.text) {
            // Simple text message (only within 24-hour window)
            payload.type = 'text';
            payload.text = {
                body: message.text,
            };
        } else {
            logger.error('WhatsApp message must have either templateName or text');
            return null;
        }

        const response = await axios.post(url, payload, {
            headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const messageId = response.data.messages?.[0]?.id;
        logger.info(`WhatsApp message sent successfully: ${messageId}`);
        return messageId;
    } catch (error: any) {
        logger.error('Failed to send WhatsApp message via Meta API:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Send a WhatsApp message using Twilio
 */
async function sendTwilioWhatsAppMessage(
    message: WhatsAppMessage,
    config: Extract<WhatsAppConfig, { provider: 'twilio' }>,
): Promise<string | null> {
    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

        const formattedTo = message.to.startsWith('whatsapp:')
            ? message.to
            : `whatsapp:${message.to}`;

        let body: string;
        if (message.templateName) {
            // Twilio uses ContentSid for templates, but for simplicity we'll use body
            body = message.templateParams?.join(' ') || message.templateName;
        } else {
            body = message.text || '';
        }

        const params = new URLSearchParams({
            From: config.whatsappFrom,
            To: formattedTo,
            Body: body,
        });

        const response = await axios.post(url, params.toString(), {
            auth: {
                username: config.accountSid,
                password: config.authToken,
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const messageId = response.data.sid;
        logger.info(`WhatsApp message sent successfully via Twilio: ${messageId}`);
        return messageId;
    } catch (error: any) {
        logger.error('Failed to send WhatsApp message via Twilio:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Send a WhatsApp message (auto-detects provider from config)
 */
export async function sendWhatsAppMessage(
    message: WhatsAppMessage,
    associationId?: string,
): Promise<string | null> {
    const config = getWhatsAppConfig(associationId);

    if (!config) {
        logger.warn('No WhatsApp provider configured');
        return null;
    }

    if (config.provider === 'meta') {
        return sendMetaWhatsAppMessage(message, config);
    }

    return sendTwilioWhatsAppMessage(message, config);
}

/**
 * Send a notification via WhatsApp
 */
export async function sendWhatsAppNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    associationId?: string,
): Promise<boolean> {
    // Get user's WhatsApp channel info
    const channel = db.prepare(`
        SELECT channel_id, verified FROM user_notification_channels
        WHERE user_id = ? AND channel_type = 'whatsapp' AND verified = 1
    `).get(userId) as { channel_id: string; verified: number } | undefined;

    if (!channel) {
        logger.debug(`No verified WhatsApp channel for user ${userId}`);
        return false;
    }

    const messageId = await sendWhatsAppMessage(
        {
            to: channel.channel_id,
            templateName: 'harmonie_notification',
            templateLanguage: 'nl',
            templateParams: [title, body],
        },
        associationId,
    );

    return messageId !== null;
}

/**
 * Generate a verification code for WhatsApp number linking
 */
export function generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send WhatsApp verification code
 */
export async function sendVerificationCode(
    phoneNumber: string,
    code: string,
    associationId?: string,
): Promise<boolean> {
    const messageId = await sendWhatsAppMessage(
        {
            to: phoneNumber,
            templateName: 'harmonie_verification',
            templateLanguage: 'nl',
            templateParams: [code],
        },
        associationId,
    );

    return messageId !== null;
}

/**
 * Handle webhook verification (GET request from WhatsApp)
 */
export function verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        logger.info('WhatsApp webhook verified');
        return challenge;
    }
    logger.warn('WhatsApp webhook verification failed');
    return null;
}

/**
 * Parse webhook payload for delivery status
 */
export function parseWebhookPayload(payload: any): WhatsAppDeliveryStatus | null {
    try {
        // Meta WhatsApp Business API webhook format
        const entry = payload.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const status = value?.statuses?.[0];

        if (status) {
            return {
                messageId: status.id,
                status: status.status as 'sent' | 'delivered' | 'read' | 'failed',
                timestamp: status.timestamp,
                errorMessage: status.errors?.[0]?.message,
            };
        }

        // Twilio webhook format
        if (payload.MessageSid && payload.MessageStatus) {
            const twilioStatusMap: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
                'queued': 'sent',
                'sent': 'sent',
                'delivered': 'delivered',
                'read': 'read',
                'failed': 'failed',
                'undelivered': 'failed',
            };

            return {
                messageId: payload.MessageSid,
                status: twilioStatusMap[payload.MessageStatus] || 'sent',
                timestamp: new Date().toISOString(),
                errorMessage: payload.ErrorMessage,
            };
        }

        return null;
    } catch (error) {
        logger.error('Failed to parse WhatsApp webhook payload:', error);
        return null;
    }
}

/**
 * Handle incoming message from WhatsApp (for future use)
 */
export function parseIncomingMessage(payload: any): { from: string; text: string } | null {
    try {
        // Meta WhatsApp Business API format
        const entry = payload.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;
        const message = value?.messages?.[0];

        if (message) {
            return {
                from: message.from,
                text: message.text?.body || '',
            };
        }

        // Twilio format
        if (payload.From && payload.Body) {
            return {
                from: payload.From.replace('whatsapp:', ''),
                text: payload.Body,
            };
        }

        return null;
    } catch (error) {
        logger.error('Failed to parse incoming WhatsApp message:', error);
        return null;
    }
}

export default {
    getWhatsAppConfig,
    isWhatsAppConfigured,
    sendWhatsAppMessage,
    sendWhatsAppNotification,
    generateVerificationCode,
    sendVerificationCode,
    verifyWebhook,
    parseWebhookPayload,
    parseIncomingMessage,
};
