import logger from '../utils/logger';

// hCaptcha configuration
const HCAPTCHA_SECRET_KEY = process.env.HCAPTCHA_SECRET_KEY || '';
const HCAPTCHA_SITE_KEY = process.env.HCAPTCHA_SITE_KEY || '';
const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';
const CAPTCHA_ENABLED = process.env.CAPTCHA_ENABLED !== 'false';

// Thresholds for requiring CAPTCHA
const HIGH_VALUE_ORDER_THRESHOLD = 100; // Euros
const SUSPICIOUS_IP_REQUEST_THRESHOLD = 5; // Requests per time window
const IP_TRACKING_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory IP tracking (for development/single-instance deployments)
// In production with multiple instances, use Redis or database
const ipRequestCounts = new Map<string, { count: number; firstRequest: number }>();

export interface CaptchaResult {
    success: boolean;
    error?: string;
    score?: number; // hCaptcha Enterprise feature
    challengeTimestamp?: string;
    hostname?: string;
}

interface HCaptchaResponse {
    success: boolean;
    challenge_ts?: string;
    hostname?: string;
    'error-codes'?: string[];
    score?: number;
    score_reason?: string[];
}

/**
 * Verify an hCaptcha token
 *
 * @param token - The hCaptcha response token from the client
 * @param ip - The IP address of the client (optional but recommended)
 * @returns CaptchaResult with success status and any errors
 */
export async function verifyCaptcha(token: string, ip: string): Promise<CaptchaResult> {
    // If CAPTCHA is disabled or no secret key configured, skip verification
    if (!CAPTCHA_ENABLED) {
        logger.debug('CAPTCHA verification skipped: disabled');
        return { success: true };
    }

    if (!HCAPTCHA_SECRET_KEY) {
        logger.warn('CAPTCHA verification skipped: no secret key configured');
        return { success: true };
    }

    if (!token) {
        return {
            success: false,
            error: 'CAPTCHA token is required'
        };
    }

    try {
        const params = new URLSearchParams();
        params.append('secret', HCAPTCHA_SECRET_KEY);
        params.append('response', token);
        if (ip) {
            params.append('remoteip', ip);
        }
        if (HCAPTCHA_SITE_KEY) {
            params.append('sitekey', HCAPTCHA_SITE_KEY);
        }

        const response = await fetch(HCAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            logger.error('hCaptcha API error', { status: response.status });
            return {
                success: false,
                error: 'CAPTCHA verification service unavailable'
            };
        }

        const data = await response.json() as HCaptchaResponse;

        if (data.success) {
            logger.debug('CAPTCHA verified successfully', {
                ip,
                hostname: data.hostname,
                challengeTs: data.challenge_ts
            });
            return {
                success: true,
                challengeTimestamp: data.challenge_ts,
                hostname: data.hostname,
                score: data.score,
            };
        }

        // Handle error codes
        const errorCodes = data['error-codes'] || [];
        const errorMessages: Record<string, string> = {
            'missing-input-secret': 'CAPTCHA configuration error',
            'invalid-input-secret': 'CAPTCHA configuration error',
            'missing-input-response': 'CAPTCHA token is required',
            'invalid-input-response': 'Invalid CAPTCHA token',
            'bad-request': 'Invalid CAPTCHA request',
            'invalid-or-already-seen-response': 'CAPTCHA token already used',
            'not-using-dummy-passcode': 'Test key only valid with test secret',
            'sitekey-secret-mismatch': 'CAPTCHA configuration mismatch',
        };

        const error = errorCodes.length > 0
            ? errorMessages[errorCodes[0]] || 'CAPTCHA verification failed'
            : 'CAPTCHA verification failed';

        logger.warn('CAPTCHA verification failed', { ip, errorCodes });
        return { success: false, error };

    } catch (err) {
        logger.error('CAPTCHA verification error:', err);
        return {
            success: false,
            error: 'CAPTCHA verification service unavailable'
        };
    }
}

/**
 * Determine if CAPTCHA should be required for a given request
 *
 * CAPTCHA is required when:
 * - Order total exceeds high-value threshold
 * - IP has made many requests recently (potential bot)
 * - CAPTCHA is globally enabled
 *
 * @param ip - The client IP address
 * @param orderTotal - The total order amount in euros
 * @returns Whether CAPTCHA should be required
 */
export function shouldRequireCaptcha(ip: string, orderTotal: number): boolean {
    // If CAPTCHA is disabled globally, never require it
    if (!CAPTCHA_ENABLED) {
        return false;
    }

    // If no secret key configured, can't verify anyway
    if (!HCAPTCHA_SECRET_KEY) {
        return false;
    }

    // High-value orders always require CAPTCHA
    if (orderTotal >= HIGH_VALUE_ORDER_THRESHOLD) {
        logger.debug('CAPTCHA required: high-value order', { ip, orderTotal });
        return true;
    }

    // Check for suspicious IP activity
    const now = Date.now();
    const ipData = ipRequestCounts.get(ip);

    if (ipData) {
        // Check if within tracking window
        if (now - ipData.firstRequest < IP_TRACKING_WINDOW_MS) {
            if (ipData.count >= SUSPICIOUS_IP_REQUEST_THRESHOLD) {
                logger.debug('CAPTCHA required: suspicious IP activity', {
                    ip,
                    requestCount: ipData.count
                });
                return true;
            }
        } else {
            // Reset counter if window has passed
            ipRequestCounts.delete(ip);
        }
    }

    // For normal cases, require CAPTCHA as a baseline protection
    return true;
}

/**
 * Track an IP address making a checkout request
 * Used for rate limiting and bot detection
 *
 * @param ip - The client IP address
 */
export function trackCheckoutRequest(ip: string): void {
    const now = Date.now();
    const ipData = ipRequestCounts.get(ip);

    if (ipData) {
        if (now - ipData.firstRequest < IP_TRACKING_WINDOW_MS) {
            ipData.count++;
        } else {
            // Reset if window has passed
            ipRequestCounts.set(ip, { count: 1, firstRequest: now });
        }
    } else {
        ipRequestCounts.set(ip, { count: 1, firstRequest: now });
    }

    // Cleanup old entries periodically (every 100 requests)
    if (ipRequestCounts.size > 100) {
        cleanupOldEntries();
    }
}

/**
 * Clean up expired IP tracking entries
 */
function cleanupOldEntries(): void {
    const now = Date.now();
    for (const [ip, data] of ipRequestCounts.entries()) {
        if (now - data.firstRequest >= IP_TRACKING_WINDOW_MS) {
            ipRequestCounts.delete(ip);
        }
    }
}

/**
 * Check if CAPTCHA is enabled globally
 */
export function isCaptchaEnabled(): boolean {
    return CAPTCHA_ENABLED && !!HCAPTCHA_SECRET_KEY;
}

/**
 * Get the hCaptcha site key for frontend
 */
export function getCaptchaSiteKey(): string | null {
    if (!CAPTCHA_ENABLED || !HCAPTCHA_SITE_KEY) {
        return null;
    }
    return HCAPTCHA_SITE_KEY;
}
