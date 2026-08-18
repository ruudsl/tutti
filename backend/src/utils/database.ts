import db from '../database/connection';
import logger from '../logging/logger';

// Track if we're already in a transaction (for nested transaction support)
let transactionDepth = 0;

/**
 * Execute multiple database operations in a transaction.
 * If any operation fails, all changes are rolled back.
 * Supports nested transactions by using savepoints for inner transactions.
 *
 * @example
 * const result = withTransaction(() => {
 *   db.prepare('DELETE FROM user_instruments WHERE user_id = ?').run(userId);
 *   db.prepare('INSERT INTO user_instruments ...').run(...);
 *   return { success: true };
 * });
 */
export function withTransaction<T>(fn: () => T): T {
  // Check if we're already in a transaction
  if (transactionDepth > 0) {
    // Nested transaction - use savepoint
    const savepointName = `sp_${transactionDepth}_${Date.now()}`;
    try {
      transactionDepth++;
      db.prepare(`SAVEPOINT ${savepointName}`).run();
      logger.debug(`Created savepoint ${savepointName} for nested transaction`);

      const result = fn();

      db.prepare(`RELEASE SAVEPOINT ${savepointName}`).run();
      logger.debug(`Released savepoint ${savepointName}`);
      return result;
    } catch (error) {
      // Rollback to savepoint
      try {
        db.prepare(`ROLLBACK TO SAVEPOINT ${savepointName}`).run();
        logger.warn(`Rolled back to savepoint ${savepointName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (rollbackError) {
        logger.error(`Failed to rollback to savepoint ${savepointName}`, {
          originalError: error instanceof Error ? error.message : String(error),
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      throw error;
    } finally {
      transactionDepth--;
    }
  }

  // Top-level transaction
  try {
    transactionDepth++;
    const transaction = db.transaction(fn);
    const result = transaction();
    logger.debug('Transaction committed successfully');
    return result;
  } catch (error) {
    logger.error('Transaction failed and rolled back', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    transactionDepth--;
  }
}

/**
 * Check if currently inside a transaction
 */
export function isInTransaction(): boolean {
  return transactionDepth > 0;
}

/**
 * Pagination helper
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function getPaginationParams(query: any): { offset: number; limit: number; page: number } {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 25));
  const offset = (page - 1) * limit;
  return { offset, limit, page };
}

export function createPaginatedResult<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Allowed table names for soft delete operations.
 * This whitelist prevents SQL injection through table name interpolation.
 */
const ALLOWED_SOFT_DELETE_TABLES = new Set([
  'users',
  'instruments',
  'orchestras',
  'music_lists',
  'music_pieces',
  'music_titles',
  'associations',
  'genres',
  'rehearsals',
  'concerts',
  'equipment',
  'uniform_items',
  'events',
  'posts',
  'polls',
  'tasks',
  'projects',
  'tours',
  'resources',
  'wiki_pages',
  'workflows',
]);

/**
 * Validate table name against whitelist to prevent SQL injection.
 * @throws Error if table name is not in the whitelist
 */
function validateTableName(table: string): void {
  if (!ALLOWED_SOFT_DELETE_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}. Table not in allowed list for soft delete operations.`);
  }
}

/**
 * Soft delete helpers
 */
export function softDelete(table: string, id: string): void {
  validateTableName(table);
  db.prepare(`UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function restore(table: string, id: string): void {
  validateTableName(table);
  db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id);
}

/**
 * Build WHERE clause excluding soft-deleted records
 */
export function excludeDeleted(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}deleted_at IS NULL`;
}
