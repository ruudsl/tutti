import dotenv from 'dotenv';
import { z } from 'zod/v4';

// Load environment variables
dotenv.config();

/**
 * Zod schema for environment variable validation.
 * All required variables must be defined, optional ones have defaults.
 */
const envSchema = z.object({
  // Server configuration
  PORT: z.string().regex(/^\d+$/, 'PORT must be a number').optional().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),

  // Frontend URL (required in production for CORS)
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').optional(),

  // JWT configuration (required in production)
  // Een lege waarde telt als niet ingevuld: de voorbeeldbestanden laten
  // JWT_SECRET bewust leeg, zodat een vergeten geheim in productie de start
  // tegenhoudt en lokaal gewoon op het ontwikkelgeheim terugvalt.
  JWT_SECRET: z.preprocess(
    (waarde) => (waarde === '' ? undefined : waarde),
    z.string().min(32, 'JWT_SECRET must be at least 32 characters in production').optional(),
  ),
  JWT_EXPIRES_IN: z.string().optional().default('7d'),

  // Database
  DB_PATH: z.string().optional().default('./data/harmonie.db'),

  // Uploads
  UPLOAD_DIR: z.string().optional().default('./uploads'),
  MAX_FILE_SIZE: z.string().regex(/^\d+$/).optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).optional(),
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).optional(),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).optional(),

  // CSRF Protection
  CSRF_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  CSRF_COOKIE_NAME: z.string().optional().default('csrf_token'),
  CSRF_HEADER_NAME: z.string().optional().default('x-csrf-token'),

  // Het aantal proxy's vóór de applicatie. Alleen een getal: `true` laat
  // Express het meest linkse adres uit X-Forwarded-For geloven, en dat zet de
  // aanvrager er zelf in.
  TRUST_PROXY: z.string().regex(/^\d+$/, "TRUST_PROXY is het aantal proxy's vóór de applicatie").optional(),

  // IP Whitelisting
  IP_WHITELIST_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  ADMIN_ALLOWED_IPS: z.string().optional(),

  // CSP Reporting
  CSP_REPORT_URI: z.string().optional(),

  // CDN Configuration
  CDN_ENABLED: z.enum(['true', 'false']).optional().default('false'),
  CDN_BASE_URL: z.string().optional(),
  CDN_STATIC_PATH: z.string().optional().default('/static'),
});

/**
 * Geheimen die in de voorbeeldbestanden of de documentatie staan of stonden.
 * Wie `.env.example` kopieert en vergeet het geheim te vervangen, tekent
 * tokens met een sleutel die openbaar op GitHub staat: dan kan iedereen een
 * token maken voor elke gebruiker, ook voor een beheerder.
 */
const VOORBEELDGEHEIMEN = new Set([
  'harmonie-dev-secret-change-in-production',
  'your-very-secure-secret-key-change-this',
  'your-secret-key-change-in-production',
  'your-secure-random-string',
]);

/**
 * Een willekeurig geheim van 32 tekens of meer bevat vrijwel altijd tientallen
 * verschillende tekens. Minder dan dit wijst op iets als `'a'.repeat(32)` of
 * `abcabcabc…`: lang genoeg voor de lengte-eis, maar te raden.
 */
const MINIMAAL_VERSCHILLENDE_TEKENS = 10;

/**
 * Waarom dit JWT-geheim in productie niet deugt, of `null` als het deugt.
 *
 * Dit is geen sterktemeter; het vangt de gevallen die in de praktijk
 * voorkomen: een voorbeeldwaarde die niet is vervangen, en een eentonige
 * opvulling die alleen aan de lengte-eis voldoet.
 */
export function waaromJwtGeheimOnveilig(geheim: string | undefined): string | null {
  if (!geheim) {
    return 'JWT_SECRET ontbreekt';
  }
  if (geheim.length < 32) {
    return 'JWT_SECRET is korter dan 32 tekens';
  }
  if (VOORBEELDGEHEIMEN.has(geheim) || /change-?(this|me|in-production)/i.test(geheim)) {
    return 'JWT_SECRET is de voorbeeldwaarde uit .env.example of de documentatie';
  }
  if (new Set(geheim).size < MINIMAAL_VERSCHILLENDE_TEKENS) {
    return `JWT_SECRET bestaat uit minder dan ${MINIMAAL_VERSCHILLENDE_TEKENS} verschillende tekens en is te raden`;
  }
  return null;
}

/**
 * Validate environment variables against the schema.
 * Throws detailed errors if validation fails.
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Zod v4 uses z.prettifyError for formatting
    const errorMessage = z.prettifyError(result.error);
    throw new Error(`Environment validation failed:\n${errorMessage}`);
  }

  const env = result.data;
  const isProduction = env.NODE_ENV === 'production';

  // Additional production-specific validations
  if (isProduction) {
    const reden = waaromJwtGeheimOnveilig(env.JWT_SECRET);
    if (reden) {
      throw new Error(
        `${reden}. In productie is een willekeurig geheim verplicht; maak er een met: openssl rand -base64 48`,
      );
    }
    if (!env.FRONTEND_URL) {
      throw new Error('FRONTEND_URL must be set in production for CORS configuration');
    }
  }

  return env;
}

// Validate on module load
const validatedEnv = validateEnv();

// Helper to parse numbers with defaults
function getEnvNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  // Server
  port: getEnvNumber(validatedEnv.PORT, 3001),
  nodeEnv: validatedEnv.NODE_ENV || 'development',
  isDevelopment: validatedEnv.NODE_ENV !== 'production',
  isProduction: validatedEnv.NODE_ENV === 'production',

  // CORS
  frontendUrl: validatedEnv.FRONTEND_URL || 'http://localhost:5173',

  // JWT
  jwtSecret: (() => {
    if (validatedEnv.JWT_SECRET) {
      return validatedEnv.JWT_SECRET;
    }
    if (validatedEnv.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable must be set in production');
    }
    return 'harmonie-dev-secret-change-in-production';
  })(),
  jwtExpiresIn: validatedEnv.JWT_EXPIRES_IN || '7d',

  // Database
  dbPath: validatedEnv.DB_PATH || './data/harmonie.db',

  // Uploads
  uploadDir: validatedEnv.UPLOAD_DIR || './uploads',
  maxFileSize: getEnvNumber(validatedEnv.MAX_FILE_SIZE, 50 * 1024 * 1024), // 50MB

  // Rate limiting
  rateLimitWindowMs: getEnvNumber(validatedEnv.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 minutes
  rateLimitMaxRequests: getEnvNumber(validatedEnv.RATE_LIMIT_MAX_REQUESTS, 1000),
  authRateLimitMaxRequests: getEnvNumber(validatedEnv.AUTH_RATE_LIMIT_MAX_REQUESTS, 10), // Stricter for auth

  // CSRF Protection
  csrfEnabled: validatedEnv.CSRF_ENABLED === 'true',
  csrfCookieName: validatedEnv.CSRF_COOKIE_NAME || 'csrf_token',
  csrfHeaderName: validatedEnv.CSRF_HEADER_NAME || 'x-csrf-token',

  // Render, nginx uit docker-compose.yml en Traefik uit docker-compose.prod.yml
  // zijn elk precies één proxy. Wie daar zelf nog iets vóór zet (Cloudflare,
  // een load balancer) verhoogt dit, anders krijgen alle bezoekers het adres
  // van die buitenste proxy. Zie docs/SELF_HOSTING.md.
  trustProxy: getEnvNumber(validatedEnv.TRUST_PROXY, validatedEnv.NODE_ENV === 'production' ? 1 : 0),

  // IP Whitelisting
  ipWhitelistEnabled: validatedEnv.IP_WHITELIST_ENABLED === 'true',
  adminAllowedIps:
    validatedEnv.ADMIN_ALLOWED_IPS?.split(',')
      .map((ip) => ip.trim())
      .filter(Boolean) || [],

  // CSP Reporting
  cspReportUri: validatedEnv.CSP_REPORT_URI || '',

  // CDN Configuration
  cdnEnabled: validatedEnv.CDN_ENABLED === 'true',
  cdnBaseUrl: validatedEnv.CDN_BASE_URL || '',
  cdnStaticPath: validatedEnv.CDN_STATIC_PATH || '/static',
};

// Warn in development about default JWT secret
if (config.isDevelopment && config.jwtSecret === 'harmonie-dev-secret-change-in-production') {
  console.warn('Warning: Using default JWT secret. Set JWT_SECRET in production!');
}

export default config;
