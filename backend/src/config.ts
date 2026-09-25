import dotenv from 'dotenv';
import { z } from 'zod/v4';
import { MAAK_GEHEIM_MET, waaromGeheimOnveilig, waaromVersleutelgeheimOnveilig } from './utils/geheimen';

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

  // Sleutel voor opgeslagen geheimen (koppelingswachtwoorden, tokens, MFA).
  // Los van JWT_SECRET, zodat het vervangen van het ene het andere niet
  // onbruikbaar maakt. Verplicht in productie; zie utils/encryption.ts.
  ENCRYPTION_SECRET: z.preprocess((waarde) => (waarde === '' ? undefined : waarde), z.string().optional()),

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
 * Waarom dit JWT-geheim in productie niet deugt, of `null` als het deugt.
 * De eisen staan in utils/geheimen.ts en gelden ook voor ENCRYPTION_SECRET.
 */
export function waaromJwtGeheimOnveilig(geheim: string | undefined): string | null {
  return waaromGeheimOnveilig('JWT_SECRET', geheim);
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
    const reden =
      waaromJwtGeheimOnveilig(env.JWT_SECRET) ?? waaromVersleutelgeheimOnveilig(env.ENCRYPTION_SECRET, env.JWT_SECRET);
    if (reden) {
      throw new Error(
        `${reden}. In productie is een willekeurig geheim verplicht; maak er een met: ${MAAK_GEHEIM_MET}`,
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
