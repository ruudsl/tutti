import db from '../database/connection';

/**
 * Execute multiple database operations in a transaction.
 * If any operation fails, all changes are rolled back.
 *
 * @example
 * const result = withTransaction(() => {
 *   db.prepare('DELETE FROM user_instruments WHERE user_id = ?').run(userId);
 *   db.prepare('INSERT INTO user_instruments ...').run(...);
 *   return { success: true };
 * });
 */
export function withTransaction<T>(fn: () => T): T {
    const transaction = db.transaction(fn);
    return transaction();
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

export function createPaginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
): PaginatedResult<T> {
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
 * Soft delete helpers
 */
export function softDelete(table: string, id: string): void {
    db.prepare(`UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
}

export function restore(table: string, id: string): void {
    db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id);
}

/**
 * Build WHERE clause excluding soft-deleted records
 */
export function excludeDeleted(alias?: string): string {
    const prefix = alias ? `${alias}.` : '';
    return `${prefix}deleted_at IS NULL`;
}
