import { Router, Request, Response } from 'express';
import os from 'os';
import fs from 'fs';
import path from 'path';
import db from '../database/connection';
import config from '../config';
import logger from '../logging/logger';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Types for health check responses
interface ServiceStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message?: string;
    latency?: number;
    details?: Record<string, any>;
}

interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
}

interface DetailedHealthCheckResponse extends HealthCheckResponse {
    services: {
        database: ServiceStatus;
        disk: ServiceStatus;
        memory: ServiceStatus;
    };
    system: {
        platform: string;
        arch: string;
        nodeVersion: string;
        cpuCount: number;
        hostname: string;
        loadAverage: number[];
    };
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceStatus> {
    const startTime = Date.now();
    try {
        // Simple query to check database connectivity
        const result = db.prepare('SELECT 1 as test').get();
        const latency = Date.now() - startTime;

        if (result && result.test === 1) {
            // Get some database stats
            const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
            const pieceCount = db.prepare('SELECT COUNT(*) as count FROM music_pieces').get();

            return {
                status: 'healthy',
                latency,
                details: {
                    userCount: userCount?.count || 0,
                    pieceCount: pieceCount?.count || 0,
                },
            };
        }

        return {
            status: 'unhealthy',
            message: 'Database query returned unexpected result',
            latency,
        };
    } catch (error) {
        const latency = Date.now() - startTime;
        logger.error('Database health check failed', { error: (error as Error).message });
        return {
            status: 'unhealthy',
            message: (error as Error).message,
            latency,
        };
    }
}

/**
 * Check disk space
 */
function checkDiskSpace(): ServiceStatus {
    try {
        const dataDir = path.resolve(config.dbPath, '..');
        const uploadDir = path.resolve(config.uploadDir);

        // Get disk stats (Linux/Mac specific, may need adjustment for Windows)
        const stats = fs.statfsSync(dataDir);
        const totalSpace = stats.bsize * stats.blocks;
        const freeSpace = stats.bsize * stats.bfree;
        const usedSpace = totalSpace - freeSpace;
        const usedPercentage = (usedSpace / totalSpace) * 100;

        // Get directory sizes
        let dataDirSize = 0;
        let uploadDirSize = 0;

        try {
            if (fs.existsSync(dataDir)) {
                dataDirSize = getDirectorySize(dataDir);
            }
        } catch {
            // Ignore errors reading directory size
        }

        try {
            if (fs.existsSync(uploadDir)) {
                uploadDirSize = getDirectorySize(uploadDir);
            }
        } catch {
            // Ignore errors reading directory size
        }

        const status: 'healthy' | 'degraded' | 'unhealthy' =
            usedPercentage > 95 ? 'unhealthy' :
            usedPercentage > 85 ? 'degraded' : 'healthy';

        return {
            status,
            message: status !== 'healthy' ? `Disk usage at ${usedPercentage.toFixed(1)}%` : undefined,
            details: {
                totalSpaceGB: (totalSpace / (1024 * 1024 * 1024)).toFixed(2),
                freeSpaceGB: (freeSpace / (1024 * 1024 * 1024)).toFixed(2),
                usedPercentage: usedPercentage.toFixed(1),
                dataDirSizeMB: (dataDirSize / (1024 * 1024)).toFixed(2),
                uploadDirSizeMB: (uploadDirSize / (1024 * 1024)).toFixed(2),
            },
        };
    } catch (error) {
        logger.error('Disk space check failed', { error: (error as Error).message });
        return {
            status: 'unhealthy',
            message: (error as Error).message,
        };
    }
}

/**
 * Get total size of a directory recursively
 */
function getDirectorySize(dirPath: string): number {
    let totalSize = 0;
    try {
        const items = fs.readdirSync(dirPath);
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            if (stats.isFile()) {
                totalSize += stats.size;
            } else if (stats.isDirectory()) {
                totalSize += getDirectorySize(itemPath);
            }
        }
    } catch {
        // Ignore permission errors
    }
    return totalSize;
}

/**
 * Check memory usage
 */
function checkMemory(): ServiceStatus {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usedPercentage = (usedMemory / totalMemory) * 100;

    // Process memory
    const processMemory = process.memoryUsage();

    const status: 'healthy' | 'degraded' | 'unhealthy' =
        usedPercentage > 95 ? 'unhealthy' :
        usedPercentage > 85 ? 'degraded' : 'healthy';

    return {
        status,
        message: status !== 'healthy' ? `Memory usage at ${usedPercentage.toFixed(1)}%` : undefined,
        details: {
            totalMemoryMB: (totalMemory / (1024 * 1024)).toFixed(0),
            freeMemoryMB: (freeMemory / (1024 * 1024)).toFixed(0),
            usedPercentage: usedPercentage.toFixed(1),
            processHeapUsedMB: (processMemory.heapUsed / (1024 * 1024)).toFixed(0),
            processHeapTotalMB: (processMemory.heapTotal / (1024 * 1024)).toFixed(0),
            processRssMB: (processMemory.rss / (1024 * 1024)).toFixed(0),
        },
    };
}

/**
 * Calculate overall health status from individual service statuses
 */
function calculateOverallStatus(services: Record<string, ServiceStatus>): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(services).map(s => s.status);

    if (statuses.includes('unhealthy')) {
        return 'unhealthy';
    }
    if (statuses.includes('degraded')) {
        return 'degraded';
    }
    return 'healthy';
}

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', (req: Request, res: Response) => {
    const response: HealthCheckResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.nodeEnv,
    };

    res.status(200).json(response);
});

/**
 * @swagger
 * /api/health/detailed:
 *   get:
 *     summary: Detailed health check with all service statuses
 *     tags: [Health]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed health status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin only
 */
router.get('/detailed', authenticateToken, requireRole('admin'), asyncHandler(async (req: Request, res: Response) => {
    const databaseStatus = await checkDatabase();
    const diskStatus = checkDiskSpace();
    const memoryStatus = checkMemory();

    const services = {
        database: databaseStatus,
        disk: diskStatus,
        memory: memoryStatus,
    };

    const overallStatus = calculateOverallStatus(services);

    const response: DetailedHealthCheckResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.nodeEnv,
        services,
        system: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cpuCount: os.cpus().length,
            hostname: os.hostname(),
            loadAverage: os.loadavg(),
        },
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(response);
}));

export default router;
