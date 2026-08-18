import winston from 'winston';
import path from 'path';
import fs from 'fs';
import config from '../config';

const logDir = path.join(__dirname, '../../logs');

// Ensure log directory exists in production
if (config.isProduction && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for console output (colorized, human-readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

// Custom format for file output (JSON for log aggregation)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Create logger instance
const logger = winston.createLogger({
  level: config.isDevelopment ? 'debug' : 'info',
  defaultMeta: {
    service: 'harmonie-api',
    environment: config.nodeEnv,
  },
  transports: [
    // Console transport (always enabled)
    new winston.transports.Console({
      format: config.isDevelopment ? consoleFormat : fileFormat,
    }),
  ],
});

// Add file transports in production
if (config.isProduction) {
  // Error log file - only error level and above
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  );

  // Combined log file - all levels
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),
  );

  // Access log file - info level only for request logs
  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'access.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),
  );
}

// Helper functions for structured logging

/**
 * Log an HTTP request
 */
export const logRequest = (
  method: string,
  path: string,
  userId?: string,
  statusCode?: number,
  duration?: number,
): void => {
  logger.info(`${method} ${path}`, {
    type: 'request',
    userId,
    statusCode,
    duration,
  });
};

/**
 * Log an error with context
 */
export const logError = (error: Error, context?: Record<string, any>): void => {
  logger.error(error.message, {
    type: 'error',
    stack: error.stack,
    name: error.name,
    ...context,
  });
};

/**
 * Log authentication events
 */
export const logAuth = (action: string, userId: string, success: boolean, details?: Record<string, any>): void => {
  const level = success ? 'info' : 'warn';
  logger[level](`Auth: ${action}`, {
    type: 'auth',
    userId,
    success,
    ...details,
  });
};

/**
 * Log database operations
 */
export const logDb = (operation: string, table: string, recordId?: string, duration?: number): void => {
  logger.debug(`DB: ${operation} on ${table}`, {
    type: 'database',
    operation,
    table,
    recordId,
    duration,
  });
};

/**
 * Log security events
 */
export const logSecurity = (event: string, details: Record<string, any>): void => {
  logger.warn(`Security: ${event}`, {
    type: 'security',
    event,
    ...details,
  });
};

/**
 * Log performance metrics
 */
export const logPerformance = (metric: string, value: number, unit: string, details?: Record<string, any>): void => {
  logger.info(`Performance: ${metric}`, {
    type: 'performance',
    metric,
    value,
    unit,
    ...details,
  });
};

/**
 * Log startup events
 */
export const logStartup = (message: string, details?: Record<string, any>): void => {
  logger.info(`Startup: ${message}`, {
    type: 'startup',
    ...details,
  });
};

/**
 * Create a child logger with additional context
 */
export const createChildLogger = (context: Record<string, any>): winston.Logger => {
  return logger.child(context);
};

export default logger;
