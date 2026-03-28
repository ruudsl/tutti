import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
function getEnvVar(name: string, defaultValue?: string): string {
    const value = process.env[name] || defaultValue;
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function getEnvNumber(name: string, defaultValue: number): number {
    const value = process.env[name];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
        throw new Error(`Environment variable ${name} must be a number`);
    }
    return parsed;
}

export const config = {
    // Server
    port: getEnvNumber('PORT', 3001),
    nodeEnv: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production',

    // CORS
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

    // JWT
    jwtSecret: getEnvVar('JWT_SECRET', 'harmonie-dev-secret-change-in-production'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

    // Database
    dbPath: process.env.DB_PATH || './data/harmonie.db',

    // Uploads
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: getEnvNumber('MAX_FILE_SIZE', 50 * 1024 * 1024), // 50MB

    // Rate limiting
    rateLimitWindowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 minutes
    rateLimitMaxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 1000),
    authRateLimitMaxRequests: getEnvNumber('AUTH_RATE_LIMIT_MAX_REQUESTS', 10), // Stricter for auth

    // CSRF Protection
    csrfEnabled: process.env.CSRF_ENABLED === 'true',
    csrfCookieName: process.env.CSRF_COOKIE_NAME || 'csrf_token',
    csrfHeaderName: process.env.CSRF_HEADER_NAME || 'x-csrf-token',

    // IP Whitelisting
    ipWhitelistEnabled: process.env.IP_WHITELIST_ENABLED === 'true',
    adminAllowedIps: process.env.ADMIN_ALLOWED_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [],

    // CSP Reporting
    cspReportUri: process.env.CSP_REPORT_URI || '',

    // CDN Configuration
    cdnEnabled: process.env.CDN_ENABLED === 'true',
    cdnBaseUrl: process.env.CDN_BASE_URL || '',
    cdnStaticPath: process.env.CDN_STATIC_PATH || '/static',
};

// Warn in development about default JWT secret
if (config.isDevelopment && config.jwtSecret === 'harmonie-dev-secret-change-in-production') {
    console.warn('⚠️  Using default JWT secret. Set JWT_SECRET in production!');
}

export default config;
