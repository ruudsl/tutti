import { describe, it, expect, vi } from 'vitest';
import { ApiError, errors, asyncHandler, errorHandler, notFoundHandler } from '../errorHandler';
import { Request, Response, NextFunction } from 'express';

function mockResponse(): Response {
    const res: Partial<Response> = {
        status: vi.fn().mockReturnThis() as any,
        json: vi.fn().mockReturnThis() as any,
    };
    return res as Response;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
    return {
        method: 'GET',
        path: '/test',
        body: {},
        ...overrides,
    } as Request;
}

describe('ApiError', () => {
    it('creates error with status code and message', () => {
        const error = new ApiError(404, 'Not found');
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe('Not found');
        expect(error.isOperational).toBe(true);
    });

    it('can be marked as non-operational', () => {
        const error = new ApiError(500, 'Internal error', false);
        expect(error.isOperational).toBe(false);
    });

    it('is an instance of Error', () => {
        const error = new ApiError(400, 'Bad request');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApiError);
    });
});

describe('errors factory', () => {
    it('creates badRequest error', () => {
        const err = errors.badRequest();
        expect(err.statusCode).toBe(400);
    });

    it('creates unauthorized error', () => {
        const err = errors.unauthorized();
        expect(err.statusCode).toBe(401);
    });

    it('creates forbidden error', () => {
        const err = errors.forbidden();
        expect(err.statusCode).toBe(403);
    });

    it('creates notFound error', () => {
        const err = errors.notFound();
        expect(err.statusCode).toBe(404);
    });

    it('creates conflict error', () => {
        const err = errors.conflict();
        expect(err.statusCode).toBe(409);
    });

    it('creates internal error (non-operational)', () => {
        const err = errors.internal();
        expect(err.statusCode).toBe(500);
        expect(err.isOperational).toBe(false);
    });

    it('accepts custom messages', () => {
        const err = errors.badRequest('Custom message');
        expect(err.message).toBe('Custom message');
    });
});

describe('asyncHandler', () => {
    it('calls the handler function', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);
        const wrapped = asyncHandler(handler);
        const req = mockRequest();
        const res = mockResponse();
        const next = vi.fn();

        await wrapped(req, res, next);
        expect(handler).toHaveBeenCalledWith(req, res, next);
    });

    it('catches errors and passes to next', async () => {
        const error = new Error('Test error');
        const handler = vi.fn().mockRejectedValue(error);
        const wrapped = asyncHandler(handler);
        const req = mockRequest();
        const res = mockResponse();
        const next = vi.fn();

        await wrapped(req, res, next);
        expect(next).toHaveBeenCalledWith(error);
    });
});

describe('errorHandler', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    it('handles ApiError with correct status', () => {
        const err = new ApiError(422, 'Validation failed');
        const req = mockRequest();
        const res = mockResponse();
        const next = vi.fn();

        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith({ error: 'Validation failed' });
    });

    it('handles UNIQUE constraint errors as 409', () => {
        const err = new Error('UNIQUE constraint failed: users.email');
        const req = mockRequest();
        const res = mockResponse();
        const next = vi.fn();

        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('handles FOREIGN KEY constraint errors as 400', () => {
        const err = new Error('FOREIGN KEY constraint failed');
        const req = mockRequest();
        const res = mockResponse();
        const next = vi.fn();

        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles unknown errors as 500', () => {
        const err = new Error('Something went wrong');
        const req = mockRequest();
        const res = mockResponse();
        const next = vi.fn();

        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe('notFoundHandler', () => {
    it('returns 404 with route info', () => {
        const req = mockRequest({ method: 'POST', path: '/api/unknown' });
        const res = mockResponse();

        notFoundHandler(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Route POST /api/unknown niet gevonden.',
        });
    });
});
