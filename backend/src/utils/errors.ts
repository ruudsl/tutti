/**
 * Shared custom error classes.
 *
 * Note: ApiError lives in ../middleware/errorHandler.ts. Errors defined here
 * must not depend on Express so they can be used anywhere (e.g. multer
 * fileFilter callbacks).
 */

/**
 * Thrown when an uploaded file fails validation (e.g. wrong mime type).
 * The central error handler maps this to a 400 response.
 */
export class FileValidationError extends Error {
    constructor(message = 'Alleen PDF bestanden zijn toegestaan.') {
        super(message);
        this.name = 'FileValidationError';
        Error.captureStackTrace(this, this.constructor);
    }
}
