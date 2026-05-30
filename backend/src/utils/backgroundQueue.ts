import { EventEmitter } from 'events';
import logger from '../logging/logger';

/**
 * Job status types
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Job definition
 */
export interface Job<T = unknown, R = unknown> {
    id: string;
    type: string;
    data: T;
    status: JobStatus;
    result?: R;
    error?: string;
    createdAt: Date;
    startedAt?: Date;
    completedAt?: Date;
    retryCount: number;
    maxRetries: number;
}

/**
 * Job handler function type
 */
export type JobHandler<T = unknown, R = unknown> = (data: T) => Promise<R>;

/**
 * Queue options
 */
export interface QueueOptions {
    maxConcurrent?: number;
    maxRetries?: number;
    retryDelay?: number;
}

/**
 * Simple in-memory background queue for processing heavy operations
 * like PDF manipulation, report generation, etc.
 */
export class BackgroundQueue extends EventEmitter {
    private jobs: Map<string, Job> = new Map();
    private handlers: Map<string, JobHandler> = new Map();
    private processing: Set<string> = new Set();
    private queue: string[] = [];
    private maxConcurrent: number;
    private maxRetries: number;
    private retryDelay: number;
    private isRunning: boolean = false;

    constructor(options: QueueOptions = {}) {
        super();
        this.maxConcurrent = options.maxConcurrent ?? 2;
        this.maxRetries = options.maxRetries ?? 3;
        this.retryDelay = options.retryDelay ?? 1000;
    }

    /**
     * Register a handler for a job type
     */
    registerHandler<T, R>(type: string, handler: JobHandler<T, R>): void {
        this.handlers.set(type, handler as JobHandler);
        logger.info(`Registered handler for job type: ${type}`);
    }

    /**
     * Add a job to the queue
     */
    enqueue<T>(type: string, data: T, options?: { maxRetries?: number }): string {
        const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const job: Job<T> = {
            id,
            type,
            data,
            status: 'pending',
            createdAt: new Date(),
            retryCount: 0,
            maxRetries: options?.maxRetries ?? this.maxRetries,
        };

        this.jobs.set(id, job as Job);
        this.queue.push(id);

        logger.info(`Job enqueued: ${id}`, { type, jobId: id });
        this.emit('job:enqueued', job);

        // Start processing if not already running
        this.processQueue();

        return id;
    }

    /**
     * Get job status by ID
     */
    getJob(id: string): Job | undefined {
        return this.jobs.get(id);
    }

    /**
     * Get all jobs of a specific type
     */
    getJobsByType(type: string): Job[] {
        return Array.from(this.jobs.values()).filter(job => job.type === type);
    }

    /**
     * Get queue statistics
     */
    getStats(): {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        total: number;
    } {
        let pending = 0, processing = 0, completed = 0, failed = 0;

        this.jobs.forEach(job => {
            switch (job.status) {
                case 'pending': pending++; break;
                case 'processing': processing++; break;
                case 'completed': completed++; break;
                case 'failed': failed++; break;
            }
        });

        return { pending, processing, completed, failed, total: this.jobs.size };
    }

    /**
     * Clear completed and failed jobs older than specified age
     */
    cleanup(maxAgeMs: number = 3600000): number {
        const now = Date.now();
        let removed = 0;
        const idsToDelete: string[] = [];

        this.jobs.forEach((job, id) => {
            if (job.status === 'completed' || job.status === 'failed') {
                const completedAt = job.completedAt?.getTime() ?? job.createdAt.getTime();
                if (now - completedAt > maxAgeMs) {
                    idsToDelete.push(id);
                }
            }
        });

        for (const id of idsToDelete) {
            this.jobs.delete(id);
            removed++;
        }

        if (removed > 0) {
            logger.info(`Cleaned up ${removed} old jobs from queue`);
        }
        return removed;
    }

    /**
     * Process the queue
     */
    private async processQueue(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
                const jobId = this.queue.shift();
                if (!jobId) continue;

                const job = this.jobs.get(jobId);
                if (!job || job.status !== 'pending') continue;

                // Process job without awaiting (run concurrently)
                this.processJob(job);
            }
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Process a single job
     */
    private async processJob(job: Job): Promise<void> {
        const handler = this.handlers.get(job.type);
        if (!handler) {
            job.status = 'failed';
            job.error = `No handler registered for job type: ${job.type}`;
            job.completedAt = new Date();
            logger.error(`No handler for job type: ${job.type}`, { jobId: job.id });
            this.emit('job:failed', job);
            return;
        }

        this.processing.add(job.id);
        job.status = 'processing';
        job.startedAt = new Date();
        this.emit('job:started', job);

        logger.info(`Processing job: ${job.id}`, { type: job.type, attempt: job.retryCount + 1 });

        try {
            const result = await handler(job.data);
            job.status = 'completed';
            job.result = result;
            job.completedAt = new Date();

            logger.info(`Job completed: ${job.id}`, {
                type: job.type,
                duration: job.completedAt.getTime() - (job.startedAt?.getTime() ?? 0)
            });
            this.emit('job:completed', job);
        } catch (error) {
            job.retryCount++;
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (job.retryCount < job.maxRetries) {
                // Schedule retry
                job.status = 'pending';
                logger.warn(`Job failed, scheduling retry: ${job.id}`, {
                    type: job.type,
                    attempt: job.retryCount,
                    maxRetries: job.maxRetries,
                    error: errorMessage
                });

                setTimeout(() => {
                    this.queue.push(job.id);
                    this.processQueue();
                }, this.retryDelay * job.retryCount);
            } else {
                job.status = 'failed';
                job.error = errorMessage;
                job.completedAt = new Date();

                logger.error(`Job failed permanently: ${job.id}`, {
                    type: job.type,
                    attempts: job.retryCount,
                    error: errorMessage
                });
                this.emit('job:failed', job);
            }
        } finally {
            this.processing.delete(job.id);
            // Continue processing queue
            this.processQueue();
        }
    }
}

// Singleton queue instance for the application
export const backgroundQueue = new BackgroundQueue({
    maxConcurrent: 2,
    maxRetries: 3,
    retryDelay: 2000,
});

// Cleanup old jobs every hour
setInterval(() => {
    backgroundQueue.cleanup(3600000); // 1 hour
}, 3600000);

// Export job types for type safety
export const JOB_TYPES = {
    PDF_MERGE: 'pdf:merge',
    PDF_SPLIT: 'pdf:split',
    PDF_ROTATE: 'pdf:rotate',
    PDF_SPLIT_A3: 'pdf:split-a3',
    REPORT_GENERATE: 'report:generate',
    EXPORT_DATA: 'export:data',
    BULK_IMPORT: 'bulk:import',
} as const;

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];
