import axios from 'axios';
import crypto from 'crypto';
import db from '../database/connection';
import logger from '../utils/logger';

// WhatsApp Business API / Twilio WhatsApp configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || crypto.randomBytes(32).toString('hex');

// Twilio WhatsApp alternative
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM; // e.g., 'whatsapp:+14155238886'

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

/**
 * Check if WhatsApp is configured
 */
export function isWhatsAppConfigured(): boolean {
    // Check for Meta WhatsApp Business API
    if (WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN) {
        return true;
    }
    // Check for Twilio WhatsApp
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
        return true;
    }
    return false;
}

/**
 * Send a WhatsApp message using Meta WhatsApp Business API
 */
async function sendMetaWhatsAppMessage(message: WhatsAppMessage): Promise<string | null> {
    if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
        logger.warn('Meta WhatsApp Business API not configured');
        return null;
    }

    try {
        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        let payload: Record<string, any> = {
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
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
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
async function sendTwilioWhatsAppMessage(message: WhatsAppMessage): Promise<string | null> {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
        logger.warn('Twilio WhatsApp not configured');
        return null;
    }

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

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
            From: TWILIO_WHATSAPP_FROM,
            To: formattedTo,
            Body: body,
        });

        const response = await axios.post(url, params.toString(), {
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN,
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
 * Send a WhatsApp message (auto-detects provider)
 */
export async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<string | null> {
    // Prefer Meta WhatsApp Business API
    if (WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN) {
        return sendMetaWhatsAppMessage(message);
    }

    // Fall back to Twilio
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) {
        return sendTwilioWhatsAppMessage(message);
    }

    logger.warn('No WhatsApp provider configured');
    return null;
}

/**
 * Send a notification via WhatsApp
 */
export async function sendWhatsAppNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>
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

    const messageId = await sendWhatsAppMessage({
        to: channel.channel_id,
        templateName: 'harmonie_notification',
        templateLanguage: 'nl',
        templateParams: [title, body],
    });

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
export async function sendVerificationCode(phoneNumber: string, code: string): Promise<boolean> {
    const messageId = await sendWhatsAppMessage({
        to: phoneNumber,
        templateName: 'harmonie_verification',
        templateLanguage: 'nl',
        templateParams: [code],
    });

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
    isWhatsAppConfigured,
    sendWhatsAppMessage,
    sendWhatsAppNotification,
    generateVerificationCode,
    sendVerificationCode,
    verifyWebhook,
    parseWebhookPayload,
    parseIncomingMessage,
};
