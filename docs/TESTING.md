# Testing Guide

This document describes the testing strategy, tools, and practices used in the Harmonie Muziek application.

## Test Stack

### Frontend Testing

- **Vitest** - Fast unit test runner with native ESM support
- **React Testing Library** - Testing utilities focused on user behavior
- **jest-dom** - Custom DOM element matchers
- **jsdom** - DOM implementation for Node.js

### Backend Testing

- **Vitest** - Unit and integration testing
- **In-memory SQLite** - Isolated test database
- **Mocked dependencies** - Email, logging, and audit trails

### End-to-End Testing

- **Playwright** - Cross-browser E2E testing

## Running Tests

### All Tests

```bash
# Run all unit tests (frontend + backend)
npm run test

# Run all tests including E2E
npm run test:all
```

### Frontend Tests

```bash
# Run frontend tests once
npm run test:frontend

# Run in watch mode
npm run test:watch --workspace=frontend
```

### Backend Tests

```bash
# Run backend tests once
npm run test:backend

# Run in watch mode
npm run test:watch --workspace=backend

# Run with coverage
npm run test:coverage --workspace=backend

# Run integration tests only
npm run test:integration --workspace=backend
```

### E2E Tests

```bash
# Run E2E tests headless
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run with browser visible
npm run test:e2e:headed
```

## Configuration Files

### Frontend (`frontend/vitest.config.ts`)

```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
```

### Backend (`backend/vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    fileParallelism: false, // Sequential to avoid DB conflicts
    isolate: true,
  },
});
```

## Writing Unit Tests

### Frontend Component Test

```typescript
// src/components/__tests__/Pagination.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Pagination } from '../Pagination';

describe('Pagination', () => {
  it('renders page numbers correctly', () => {
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={vi.fn()}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('calls onPageChange when clicking a page', () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={onPageChange}
      />
    );

    fireEvent.click(screen.getByText('3'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
```

### Frontend Hook Test

```typescript
// src/hooks/__tests__/useDebounce.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('test', 500));
    expect(result.current).toBe('test');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('updated');
  });
});
```

### Backend Route Test

```typescript
// src/__tests__/routes/auth.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { testDb } from '../setup';

describe('Auth Routes', () => {
  beforeEach(async () => {
    await testDb.reset();
  });

  it('should login with valid credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('email', 'test@example.com');
  });

  it('should reject invalid credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(response.status).toBe(401);
  });
});
```

## Writing Integration Tests

Integration tests verify that multiple components work together correctly.

```typescript
// src/__tests__/integration/tenant-isolation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { testDb } from '../setup';

describe('Tenant Isolation', () => {
  let association1Token: string;
  let association2Token: string;

  beforeEach(async () => {
    await testDb.reset();
    // Create two separate associations with users
    // ...setup code...
  });

  it('should not allow access to other association data', async () => {
    // User from association 1 tries to access association 2 data
    const response = await request(app).get('/api/orchestras').set('Authorization', `Bearer ${association1Token}`);

    // Should only see their own orchestras
    expect(response.body).not.toContainEqual(expect.objectContaining({ associationId: 'association-2-id' }));
  });
});
```

## Test Setup Files

### Frontend Setup (`frontend/src/test/setup.ts`)

```typescript
import '@testing-library/jest-dom';
```

### Backend Setup (`backend/src/__tests__/setup.ts`)

Key features:

- Mocks the database module with an in-memory SQLite instance
- Mocks email utilities to prevent actual email sending
- Mocks logging to reduce test noise
- Mocks audit logging
- Resets database state before each test

```typescript
// Mock email utility
vi.mock('../utils/email', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

beforeEach(async () => {
  await testDb.reset(); // Clean state for each test
});
```

## Code Coverage

```bash
# Generate coverage report
npm run test:coverage

# Coverage is collected for backend tests
# Reports are generated in coverage/ directory
```

## CI/CD Testing

Tests are run automatically in the CI/CD pipeline:

1. **Lint Check** - ESLint validates code style
2. **Type Check** - TypeScript compiler checks types
3. **Unit Tests** - Frontend and backend unit tests
4. **Integration Tests** - Backend integration tests
5. **E2E Tests** - Playwright end-to-end tests (on merge to main)

### Running CI Checks Locally

```bash
# Lint
npm run lint

# All tests
npm run test:all

# Format check
npm run format
```

## Best Practices

### General

1. Keep tests focused on a single behavior
2. Use descriptive test names that explain the expected behavior
3. Arrange-Act-Assert pattern for test structure
4. Avoid testing implementation details

### Frontend

1. Test user interactions, not implementation
2. Use `screen.getByRole()` over `getByTestId()` when possible
3. Mock API calls at the fetch/axios level
4. Test accessibility where relevant

### Backend

1. Use the test database setup for route tests
2. Reset database state in `beforeEach`
3. Test both success and error cases
4. Verify authorization and tenant isolation

### Mocking

```typescript
// Mock a module
vi.mock('../api', () => ({
  fetchUsers: vi.fn().mockResolvedValue([]),
}));

// Mock a function
const onSubmit = vi.fn();

// Spy on a method
vi.spyOn(console, 'error').mockImplementation(() => {});
```

## Test File Organization

```
frontend/src/
  components/
    __tests__/
      Pagination.test.tsx
  hooks/
    __tests__/
      useDebounce.test.ts
      useFavorites.test.ts
  lib/
    __tests__/
      pdfCache.test.ts
  utils/
    __tests__/
      format.test.ts
      errors.test.ts

backend/src/
  __tests__/
    setup.ts
    testDb.ts
    testUtils.ts
    routes/
      auth.test.ts
      users.test.ts
      orchestras.test.ts
    integration/
      tenant-isolation.test.ts
    services/
      musicxml.test.ts
  middleware/
    __tests__/
      auth.test.ts
      errorHandler.test.ts
  routes/
    __tests__/
      notifications.test.ts
      spond.test.ts
```
