import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import config from '../config';
import logger from '../logging/logger';
import { maskeerEmail, maskeerGeheimen, maskeerVoorLog } from '../utils/maskeren';

// Extended config type for Sentry DSN
interface SentryConfig {
  sentryDsn?: string;
}

const extendedConfig = config as typeof config & SentryConfig;

/**
 * Wat er naar Sentry gaat, nagekeken met dezelfde regels als het logboek
 * (utils/maskeren.ts).
 *
 * Hier stond een eigen lijstje van vier veldnamen, alleen op het bovenste
 * niveau van de aanvraag. `{ spond: { password } }`, een `clientSecret` of
 * een token in de extra context of in een breadcrumb ging ongemoeid mee naar
 * een externe dienst. Een aanvraag die als tekst binnenkwam en geen JSON was
 * (een formulier) liet JSON.parse bovendien gooien, en dan ging de hele
 * melding verloren.
 */
export function filterSentryGebeurtenis<T extends Sentry.ErrorEvent>(event: T): T {
  const verzoek = event.request;
  if (verzoek) {
    if (verzoek.headers) verzoek.headers = maskeerGeheimen(verzoek.headers) as typeof verzoek.headers;
    if (verzoek.cookies) verzoek.cookies = maskeerGeheimen(verzoek.cookies) as typeof verzoek.cookies;
    if (typeof verzoek.query_string === 'object' && verzoek.query_string !== null) {
      verzoek.query_string = maskeerVoorLog(verzoek.query_string) as typeof verzoek.query_string;
    }
    if (verzoek.data !== undefined) {
      if (typeof verzoek.data === 'string') {
        try {
          verzoek.data = JSON.stringify(maskeerVoorLog(JSON.parse(verzoek.data)));
        } catch {
          // Geen JSON: dan weten we niet waar de geheimen staan. Niet meesturen.
          verzoek.data = '[weggelaten]';
        }
      } else {
        verzoek.data = maskeerVoorLog(verzoek.data);
      }
    }
  }

  if (event.extra) event.extra = maskeerVoorLog(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = maskeerVoorLog(event.contexts) as typeof event.contexts;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((kruimel) => ({
      ...kruimel,
      message: typeof kruimel.message === 'string' ? maskeerEmail(kruimel.message) : kruimel.message,
      data: kruimel.data ? (maskeerVoorLog(kruimel.data) as typeof kruimel.data) : kruimel.data,
    }));
  }
  if (event.user?.email) event.user.email = maskeerEmail(event.user.email);
  if (typeof event.message === 'string') event.message = maskeerEmail(event.message);

  return event;
}

/**
 * Initialize Sentry error monitoring
 * Only initializes if SENTRY_DSN is configured in environment
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN || extendedConfig.sentryDsn;

  if (!dsn) {
    logger.info('Sentry DSN not configured - error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: config.nodeEnv,
    release: process.env.npm_package_version || '1.0.0',

    // Performance monitoring
    tracesSampleRate: config.isProduction ? 0.1 : 1.0,

    // Enable debug mode in development
    debug: config.isDevelopment,

    // Integrations
    integrations: [
      // HTTP integration for tracing requests
      Sentry.httpIntegration(),
      // Express integration
      Sentry.expressIntegration(),
    ],

    // Geheimen en e-mailadressen eruit voordat iets de server verlaat
    beforeSend: (event) => filterSentryGebeurtenis(event),

    // Filter breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      // Don't record sensitive URLs
      if (breadcrumb.category === 'http' && breadcrumb.data?.url) {
        const sensitivePatterns = ['/auth/login', '/auth/reset-password'];
        if (sensitivePatterns.some((pattern) => breadcrumb.data?.url?.includes(pattern))) {
          return null;
        }
      }
      return breadcrumb;
    },
  });

  logger.info('Sentry error monitoring initialized', { environment: config.nodeEnv });
}

/**
 * Set user context for Sentry
 * Call this after authentication to track errors by user
 */
export function setUserContext(user: { id: string; email?: string; role?: string }): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}

/**
 * Clear user context (call on logout)
 */
export function clearUserContext(): void {
  Sentry.setUser(null);
}

/**
 * Add custom tags to Sentry events
 */
export function setTags(tags: Record<string, string>): void {
  Object.entries(tags).forEach(([key, value]) => {
    Sentry.setTag(key, value);
  });
}

/**
 * Capture an exception manually
 */
export function captureException(error: Error, context?: Record<string, any>): string {
  if (context) {
    Sentry.setContext('additional', context);
  }
  return Sentry.captureException(error);
}

/**
 * Capture a message manually
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): string {
  return Sentry.captureMessage(message, level);
}

/**
 * Express error handler middleware for Sentry
 * This should be added after all routes but before the main error handler
 */
export const sentryErrorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Add request context
  Sentry.setContext('request', {
    method: req.method,
    url: req.url,
    query: req.query,
    params: req.params,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Add user context if available
  const user = (req as any).user;
  if (user) {
    setUserContext({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }

  // Capture the exception
  Sentry.captureException(err);

  // Pass to the next error handler
  next(err);
};

/**
 * Setup Sentry Express error handler
 * This should be called to configure Sentry's Express integration
 */
export function setupSentryExpressErrorHandler(app: any): void {
  Sentry.setupExpressErrorHandler(app);
}

/**
 * Setup global unhandled rejection and exception handlers
 */
export function setupGlobalErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled Promise Rejection:', { reason: String(reason) });
    Sentry.captureException(error, {
      tags: { type: 'unhandledRejection' },
    });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', { message: error.message, stack: error.stack });
    Sentry.captureException(error, {
      tags: { type: 'uncaughtException' },
    });

    // Flush events before exit
    Sentry.close(2000).then(() => {
      process.exit(1);
    });
  });
}

/**
 * Flush pending Sentry events (useful before shutdown)
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
  return Sentry.close(timeout);
}

export { Sentry };
