import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface SocialLoginButtonsProps {
    onSuccess?: (data: SocialLoginResult) => void;
    onError?: (error: string) => void;
    returnUrl?: string;
    disabled?: boolean;
}

export interface SocialLoginResult {
    token: string;
    user: {
        email: string;
        name: string;
        firstName?: string;
        lastName?: string;
        authProvider: 'google' | 'facebook';
    };
    returnUrl?: string;
}

interface ProviderStatus {
    enabled: boolean;
    name: string;
}

interface ProvidersResponse {
    providers: {
        google: ProviderStatus;
        facebook: ProviderStatus;
    };
}

/**
 * Social login buttons for guest checkout
 * Supports Google and Facebook OAuth for quick authentication
 */
export default function SocialLoginButtons({
    onSuccess,
    onError,
    returnUrl,
    disabled = false,
}: SocialLoginButtonsProps) {
    const { t } = useTranslation();
    const [loadingProvider, setLoadingProvider] = useState<'google' | 'facebook' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [providers, setProviders] = useState<ProvidersResponse['providers'] | null>(null);
    const [providersLoading, setProvidersLoading] = useState(true);

    // Fetch available providers on mount
    useEffect(() => {
        const fetchProviders = async () => {
            try {
                const { data } = await axios.get<ProvidersResponse>(`${API_BASE}/auth/social/providers`);
                setProviders(data.providers);
            } catch {
                // If fetch fails, assume both are disabled
                setProviders({
                    google: { enabled: false, name: 'Google' },
                    facebook: { enabled: false, name: 'Facebook' },
                });
            } finally {
                setProvidersLoading(false);
            }
        };
        fetchProviders();
    }, []);

    const handleSocialLogin = async (provider: 'google' | 'facebook') => {
        if (disabled || loadingProvider) return;

        setLoadingProvider(provider);
        setError(null);

        try {
            // Get the OAuth URL from the backend
            const params = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
            const { data } = await axios.get<{ authUrl: string }>(`${API_BASE}/auth/social/${provider}${params}`);

            // Open popup window for OAuth
            const width = 500;
            const height = 600;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                data.authUrl,
                `${provider}Login`,
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
            );

            if (!popup) {
                throw new Error(t('socialLogin.popupBlocked'));
            }

            // Listen for messages from the popup
            const handleMessage = async (event: MessageEvent) => {
                // Verify origin for security
                if (event.origin !== window.location.origin) return;

                if (event.data?.type === 'social-auth-success') {
                    window.removeEventListener('message', handleMessage);
                    popup.close();
                    setLoadingProvider(null);

                    const result: SocialLoginResult = event.data.payload;
                    if (onSuccess) {
                        onSuccess(result);
                    }
                } else if (event.data?.type === 'social-auth-error') {
                    window.removeEventListener('message', handleMessage);
                    popup.close();
                    setLoadingProvider(null);

                    const errorMessage = event.data.error || t('socialLogin.error');
                    setError(errorMessage);
                    if (onError) {
                        onError(errorMessage);
                    }
                }
            };

            window.addEventListener('message', handleMessage);

            // Also poll for popup close (user might close it manually)
            const pollTimer = setInterval(() => {
                if (popup.closed) {
                    clearInterval(pollTimer);
                    window.removeEventListener('message', handleMessage);
                    setLoadingProvider(null);
                }
            }, 500);
        } catch (err) {
            setLoadingProvider(null);
            const errorMessage = err instanceof Error ? err.message : t('socialLogin.error');
            setError(errorMessage);
            if (onError) {
                onError(errorMessage);
            }
        }
    };

    // Don't render if providers are loading or none are enabled
    if (providersLoading) {
        return null;
    }

    const hasEnabledProviders = providers?.google.enabled || providers?.facebook.enabled;
    if (!hasEnabledProviders) {
        return null;
    }

    return (
        <div className="social-login-buttons">
            {error && (
                <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    {error}
                </div>
            )}

            <div className="social-login-divider" style={{
                display: 'flex',
                alignItems: 'center',
                margin: '1.5rem 0',
                gap: '1rem',
            }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
                <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>
                    {t('socialLogin.orContinueWith')}
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
                {providers?.google.enabled && (
                    <button
                        type="button"
                        className="btn btn-social btn-google"
                        onClick={() => handleSocialLogin('google')}
                        disabled={disabled || loadingProvider !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            backgroundColor: '#fff',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--border-radius)',
                            cursor: disabled || loadingProvider ? 'not-allowed' : 'pointer',
                            opacity: disabled || (loadingProvider && loadingProvider !== 'google') ? 0.6 : 1,
                            transition: 'background-color 0.2s, box-shadow 0.2s',
                            width: '100%',
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled && !loadingProvider) {
                                e.currentTarget.style.backgroundColor = '#f8f9fa';
                                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#fff';
                            e.currentTarget.style.boxShadow = 'none';
                        }}
                    >
                        {loadingProvider === 'google' ? (
                            <span className="spinner" style={{ width: '20px', height: '20px' }} />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                        )}
                        <span style={{ color: '#333', fontWeight: 500 }}>
                            {loadingProvider === 'google' ? t('common.loading') : t('socialLogin.continueWithGoogle')}
                        </span>
                    </button>
                )}

                {providers?.facebook.enabled && (
                    <button
                        type="button"
                        className="btn btn-social btn-facebook"
                        onClick={() => handleSocialLogin('facebook')}
                        disabled={disabled || loadingProvider !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            backgroundColor: '#1877f2',
                            border: 'none',
                            borderRadius: 'var(--border-radius)',
                            cursor: disabled || loadingProvider ? 'not-allowed' : 'pointer',
                            opacity: disabled || (loadingProvider && loadingProvider !== 'facebook') ? 0.6 : 1,
                            transition: 'background-color 0.2s',
                            width: '100%',
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled && !loadingProvider) {
                                e.currentTarget.style.backgroundColor = '#166fe5';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#1877f2';
                        }}
                    >
                        {loadingProvider === 'facebook' ? (
                            <span className="spinner" style={{ width: '20px', height: '20px', borderTopColor: '#fff' }} />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path fill="#fff" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                        )}
                        <span style={{ color: '#fff', fontWeight: 500 }}>
                            {loadingProvider === 'facebook' ? t('common.loading') : t('socialLogin.continueWithFacebook')}
                        </span>
                    </button>
                )}
            </div>

            <p style={{
                textAlign: 'center',
                fontSize: '0.75rem',
                color: 'var(--text-light)',
                marginTop: '1rem',
            }}>
                {t('socialLogin.disclaimer')}
            </p>
        </div>
    );
}

/**
 * Hook to handle social auth callback in a popup window
 * Use this in the callback page component
 */
export function useSocialAuthCallback() {
    const handleCallback = async (code: string, state: string, provider: 'google' | 'facebook') => {
        try {
            const { data } = await axios.get<SocialLoginResult>(
                `${API_BASE}/auth/social/${provider}/callback?code=${code}&state=${state}`
            );

            // Send success message to opener window
            if (window.opener) {
                window.opener.postMessage({
                    type: 'social-auth-success',
                    payload: data,
                }, window.location.origin);
            }
        } catch (err) {
            // Send error message to opener window
            if (window.opener) {
                const errorMessage = axios.isAxiosError(err)
                    ? err.response?.data?.error || err.message
                    : 'Authentication failed';
                window.opener.postMessage({
                    type: 'social-auth-error',
                    error: errorMessage,
                }, window.location.origin);
            }
        }
    };

    return { handleCallback };
}
