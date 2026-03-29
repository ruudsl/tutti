import { useEffect, useRef, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';

// hCaptcha types
declare global {
    interface Window {
        hcaptcha?: {
            render: (container: string | HTMLElement, params: HCaptchaRenderParams) => string;
            reset: (widgetId: string) => void;
            remove: (widgetId: string) => void;
            getResponse: (widgetId: string) => string;
            execute: (widgetId: string, params?: { async: boolean }) => Promise<{ response: string; key: string }>;
        };
        onHCaptchaLoaded?: () => void;
    }
}

interface HCaptchaRenderParams {
    sitekey: string;
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'chalexpired-callback'?: () => void;
    'error-callback'?: (error: Error) => void;
    theme?: 'light' | 'dark';
    size?: 'normal' | 'compact' | 'invisible';
    tabindex?: number;
    hl?: string;
}

interface CaptchaWidgetProps {
    /** The hCaptcha site key */
    siteKey: string;
    /** Callback when CAPTCHA is verified successfully */
    onVerify: (token: string) => void;
    /** Callback when CAPTCHA token expires */
    onExpire?: () => void;
    /** Callback when an error occurs */
    onError?: (error: Error) => void;
    /** CAPTCHA theme (follows system preference by default) */
    theme?: 'light' | 'dark' | 'auto';
    /** Widget size */
    size?: 'normal' | 'compact' | 'invisible';
    /** Language code (e.g., 'nl', 'en') - uses browser language by default */
    language?: string;
    /** Additional CSS class name */
    className?: string;
}

const HCAPTCHA_SCRIPT_ID = 'hcaptcha-script';
const HCAPTCHA_SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js';

/**
 * Check if hCaptcha script is already loaded
 */
function isHCaptchaLoaded(): boolean {
    return typeof window !== 'undefined' && !!window.hcaptcha;
}

/**
 * Load hCaptcha script dynamically
 */
function loadHCaptchaScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        // Already loaded
        if (isHCaptchaLoaded()) {
            resolve();
            return;
        }

        // Check if script tag already exists
        const existingScript = document.getElementById(HCAPTCHA_SCRIPT_ID);
        if (existingScript) {
            // Script is loading, wait for it
            window.onHCaptchaLoaded = () => resolve();
            return;
        }

        // Create and load script
        const script = document.createElement('script');
        script.id = HCAPTCHA_SCRIPT_ID;
        script.src = `${HCAPTCHA_SCRIPT_URL}?onload=onHCaptchaLoaded&render=explicit`;
        script.async = true;
        script.defer = true;

        window.onHCaptchaLoaded = () => resolve();

        script.onerror = () => {
            reject(new Error('Failed to load hCaptcha script'));
        };

        document.head.appendChild(script);
    });
}

/**
 * Get the preferred theme based on system settings
 */
function getPreferredTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * CaptchaWidget - A wrapper component for hCaptcha
 *
 * This component provides CAPTCHA verification using hCaptcha,
 * a privacy-friendly alternative to reCAPTCHA.
 *
 * Usage:
 * ```tsx
 * <CaptchaWidget
 *   siteKey="your-site-key"
 *   onVerify={(token) => setCaptchaToken(token)}
 *   onExpire={() => setCaptchaToken(null)}
 * />
 * ```
 */
export default function CaptchaWidget({
    siteKey,
    onVerify,
    onExpire,
    onError,
    theme = 'auto',
    size = 'normal',
    language,
    className = '',
}: CaptchaWidgetProps) {
    const { t, i18n } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const isRenderedRef = useRef(false);
    const containerId = useId();

    // Determine actual theme
    const actualTheme = theme === 'auto' ? getPreferredTheme() : theme;

    // Determine language
    const actualLanguage = language || i18n.language.split('-')[0] || 'en';

    // Handle successful verification
    const handleVerify = useCallback((token: string) => {
        onVerify(token);
    }, [onVerify]);

    // Handle token expiration
    const handleExpire = useCallback(() => {
        onExpire?.();
    }, [onExpire]);

    // Handle errors
    const handleError = useCallback((error: Error) => {
        console.error('hCaptcha error:', error);
        onError?.(error);
    }, [onError]);

    // Reset the CAPTCHA
    const reset = useCallback(() => {
        if (window.hcaptcha && widgetIdRef.current) {
            window.hcaptcha.reset(widgetIdRef.current);
        }
    }, []);

    // Expose reset function via ref (if needed by parent)
    useEffect(() => {
        // Store reset function on container element for external access
        if (containerRef.current) {
            (containerRef.current as HTMLDivElement & { resetCaptcha?: () => void }).resetCaptcha = reset;
        }
    }, [reset]);

    // Load and render hCaptcha
    useEffect(() => {
        let mounted = true;

        const initializeCaptcha = async () => {
            try {
                await loadHCaptchaScript();

                if (!mounted || !containerRef.current || !window.hcaptcha) {
                    return;
                }

                // Don't render if already rendered
                if (isRenderedRef.current) {
                    return;
                }

                // Render the widget
                widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
                    sitekey: siteKey,
                    callback: handleVerify,
                    'expired-callback': handleExpire,
                    'chalexpired-callback': handleExpire,
                    'error-callback': handleError,
                    theme: actualTheme,
                    size: size,
                    hl: actualLanguage,
                });

                isRenderedRef.current = true;
            } catch (error) {
                if (mounted) {
                    handleError(error instanceof Error ? error : new Error('Failed to initialize CAPTCHA'));
                }
            }
        };

        initializeCaptcha();

        return () => {
            mounted = false;
            // Clean up widget on unmount
            if (window.hcaptcha && widgetIdRef.current) {
                try {
                    window.hcaptcha.remove(widgetIdRef.current);
                } catch {
                    // Ignore errors during cleanup
                }
            }
            isRenderedRef.current = false;
            widgetIdRef.current = null;
        };
    }, [siteKey, actualTheme, actualLanguage, size, handleVerify, handleExpire, handleError]);

    return (
        <div
            className={`captcha-widget ${className}`.trim()}
            style={{ minHeight: size === 'compact' ? '70px' : '78px' }}
        >
            <div
                ref={containerRef}
                id={containerId}
                aria-label={t('captcha.verificationRequired', 'Please complete the CAPTCHA verification')}
            />
            <noscript>
                <p className="captcha-noscript-warning" style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>
                    {t('captcha.javascriptRequired', 'JavaScript is required to complete the CAPTCHA verification.')}
                </p>
            </noscript>
        </div>
    );
}

/**
 * Hook to manage CAPTCHA state
 */
export function useCaptcha() {
    const tokenRef = useRef<string | null>(null);

    const setToken = useCallback((token: string | null) => {
        tokenRef.current = token;
    }, []);

    const getToken = useCallback(() => tokenRef.current, []);

    const clearToken = useCallback(() => {
        tokenRef.current = null;
    }, []);

    return {
        setToken,
        getToken,
        clearToken,
    };
}
