import fs from 'fs';
import winston from 'winston';
import path from 'path';
import config from '../config';

const logDir = path.join(__dirname, '../../logs');

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })
);

// Custom format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
    level: config.isDevelopment ? 'debug' : 'info',
    defaultMeta: { service: 'harmonie-api' },
    transports: [
        // Console transport (always enabled)
        new winston.transports.Console({
            format: consoleFormat,
        }),
    ],
});

// Add file transports in production
if (config.isProduction) {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // Error log file
    logger.add(new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
    }));

    // Combined log file
    logger.add(new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
    }));
}

// Helper functions for common logging patterns
export const logRequest = (method: string, path: string, userId?: string) => {
    logger.info(`${method} ${path}`, { userId });
};

export const logError = (error: Error, context?: Record<string, any>) => {
    logger.error(error.message, { stack: error.stack, ...context });
};

export const logAuth = (action: string, userId: string, success: boolean) => {
    logger.info(`Auth: ${action}`, { userId, success });
};

export const logDb = (operation: string, table: string, recordId?: string) => {
    logger.debug(`DB: ${operation} on ${table}`, { recordId });
};

export default logger;
