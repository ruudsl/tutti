# Error Handling

This guide covers error handling patterns used throughout the Harmonie application, including backend error classes, frontend error boundaries, and monitoring integration.

## Backend Error Handling

### ApiError Class

The `ApiError` class (`backend/src/middleware/errorHandler.ts`) is the standard way to throw errors in the API:

```typescript
import { ApiError, errors } from '../middleware/errorHandler';

// Throw with custom message
throw new ApiError(400, 'Invalid email format');

// Use predefined error factories
throw errors.notFound('User not found');
throw errors.unauthorized('Session expired');
throw errors.forbidden('Admin access required');
throw errors.badRequest('Missing required field');
throw errors.conflict('Email already exists');
throw errors.internal('Database connection failed');
```

### ApiError Properties

```typescript
class ApiError extends Error {
  statusCode: number; // HTTP status code
  message: string; // Error message
  isOperational: boolean; // true = expected error, false = programming error
}
```

### Predefined Error Factories

| Factory                 | Status Code | Default Message       |
| ----------------------- | ----------- | --------------------- |
| `errors.badRequest()`   | 400         | "Ongeldige aanvraag." |
| `errors.unauthorized()` | 401         | "Niet geautoriseerd." |
| `errors.forbidden()`    | 403         | "Geen toegang."       |
| `errors.notFound()`     | 404         | "Niet gevonden."      |
| `errors.conflict()`     | 409         | "Conflict."           |
| `errors.internal()`     | 500         | "Interne serverfout." |

### Async Handler Wrapper

Use `asyncHandler` to automatically catch Promise rejections:

```typescript
import { asyncHandler } from '../middleware/errorHandler';

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await findUser(req.params.id);
    if (!user) {
      throw errors.notFound('User not found');
    }
    res.json(user);
  }),
);
```

### Error Middleware

The central error handler (`errorHandler`) processes all errors:

```typescript
// Handles:
// 1. ApiError instances -> returns appropriate status code
// 2. ZodError (validation) -> 400 with validation details
// 3. SQLite constraint errors -> 400/409 with user-friendly message
// 4. Unknown errors -> 500 Internal Server Error
```

### Automatic Error Transformations

| Error Type             | HTTP Status  | Response                                      |
| ---------------------- | ------------ | --------------------------------------------- |
| `ApiError`             | As specified | `{ error: message }`                          |
| `ZodError`             | 400          | `{ error: "Validatiefout.", details: [...] }` |
| UNIQUE constraint      | 409          | `{ error: "Dit item bestaat al." }`           |
| FOREIGN KEY constraint | 400          | `{ error: "Ongeldige referentie." }`          |
| Other errors           | 500          | `{ error: "Interne serverfout." }`            |

## Frontend Error Handling

### Error Boundary Component

The main `ErrorBoundary` (`frontend/src/components/ErrorBoundary.tsx`) catches React rendering errors:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary';

<ErrorBoundary
  onError={(error, errorInfo) => {
    // Log to analytics or monitoring service
  }}
  onReport={(error) => {
    // Open error report dialog
  }}
  showReportButton
>
  <App />
</ErrorBoundary>;
```

#### ErrorBoundary Props

| Prop               | Type                         | Description                        |
| ------------------ | ---------------------------- | ---------------------------------- |
| `children`         | ReactNode                    | Components to wrap                 |
| `fallback`         | ReactNode                    | Custom fallback UI                 |
| `onError`          | `(error, errorInfo) => void` | Error callback                     |
| `onReport`         | `(error, errorInfo) => void` | Report button callback             |
| `showReportButton` | boolean                      | Show report button (default: true) |
| `onRetry`          | `() => void`                 | Custom retry handler               |

### Section Error Boundary

For isolating errors to specific UI sections (`frontend/src/components/SectionErrorBoundary.tsx`):

```tsx
import { SectionErrorBoundary } from './components/SectionErrorBoundary';

<SectionErrorBoundary sectionName="Music Player" compact>
  <MusicPlayer />
</SectionErrorBoundary>;

// Or use the HOC
import { withSectionErrorBoundary } from './components/SectionErrorBoundary';

const SafeMusicPlayer = withSectionErrorBoundary(MusicPlayer, 'Music Player');
```

#### SectionErrorBoundary Props

| Prop          | Type                                      | Description                       |
| ------------- | ----------------------------------------- | --------------------------------- |
| `sectionName` | string                                    | Section name for display          |
| `compact`     | boolean                                   | Minimal error display             |
| `showRetry`   | boolean                                   | Show retry button (default: true) |
| `onError`     | `(error, errorInfo, sectionName) => void` | Error callback                    |

### Toast Notifications

Use toast notifications for user feedback (`frontend/src/utils/toast.ts`):

```typescript
import { showSuccess, showError, showPromise } from '../utils/toast';

// Success notification
showSuccess('Changes saved');

// Error notification
showError('Failed to save changes');

// Promise-based (loading -> success/error)
await showPromise(saveData(), {
  loading: 'Saving...',
  success: 'Saved successfully',
  error: 'Failed to save',
});
```

Toast functions include screen reader announcements for accessibility.

### API Error Handling

The frontend uses utilities in `frontend/src/utils/errors.ts` and `frontend/src/utils/errorHandling.ts`:

```typescript
import { getErrorMessage, getErrorCode, getLocalizedErrorMessage } from '../utils/errors';

try {
  await api.post('/users', data);
} catch (error) {
  // Get user-friendly message
  const message = getErrorMessage(error);

  // Get error code for handling specific cases
  const code = getErrorCode(error);
  if (code === 'UNAUTHORIZED') {
    // Redirect to login
  }

  // Get localized message with i18n
  const localizedMessage = getLocalizedErrorMessage(error, t, 'en');
}
```

#### Error Codes

| Code               | Description              |
| ------------------ | ------------------------ |
| `UNAUTHORIZED`     | 401 - Session expired    |
| `FORBIDDEN`        | 403 - Access denied      |
| `NOT_FOUND`        | 404 - Resource not found |
| `CONFLICT`         | 409 - Duplicate entry    |
| `VALIDATION_ERROR` | 422 - Invalid input      |
| `SERVER_ERROR`     | 5xx - Server error       |
| `NETWORK_ERROR`    | No response              |
| `TIMEOUT`          | Request timeout          |

### Error Handler Factory

Create reusable error handlers:

```typescript
import { createErrorHandler } from '../utils/errorHandling';

const handleError = createErrorHandler('UserForm', t, 'en');

try {
  await saveUser();
} catch (error) {
  const message = handleError(error);
  showError(message);
}
```

## Logging Practices

### Backend Logging

Use the Winston logger (`backend/src/logging/logger.ts`):

```typescript
import logger, { logError, logAuth, logSecurity } from '../logging/logger';

// General logging
logger.info('Server started', { port: 3001 });
logger.warn('Deprecated API called', { endpoint: '/v1/users' });
logger.error('Database error', { error: err.message });
logger.debug('Query executed', { sql: query, duration: 15 });

// Structured logging helpers
logError(error, { userId: '123', action: 'save' });
logAuth('login', userId, true, { ip: req.ip });
logSecurity('rate-limit-exceeded', { ip: req.ip, endpoint: '/api/auth' });
```

### Log Levels

| Level   | Use Case                           |
| ------- | ---------------------------------- |
| `error` | Errors requiring attention         |
| `warn`  | Potential issues, deprecated usage |
| `info`  | Important events (startup, auth)   |
| `debug` | Development debugging (dev only)   |

### Log Files (Production)

| File                | Contents              |
| ------------------- | --------------------- |
| `logs/error.log`    | Error-level logs only |
| `logs/combined.log` | All log levels        |
| `logs/access.log`   | HTTP request logs     |

Log files are rotated at 10MB with 5-10 file retention.

## Sentry Integration

### Setup

Sentry is initialized in `backend/src/monitoring/sentry.ts`:

```typescript
import { initSentry, setupGlobalErrorHandlers } from './monitoring/sentry';

// Initialize Sentry (requires SENTRY_DSN env var)
initSentry();

// Set up global handlers for uncaught errors
setupGlobalErrorHandlers();
```

### Manual Error Capture

```typescript
import { captureException, captureMessage, setUserContext } from './monitoring/sentry';

// Set user context after authentication
setUserContext({ id: user.id, email: user.email, role: user.role });

// Capture exception with context
captureException(error, { orderId: '123', action: 'checkout' });

// Capture message
captureMessage('Payment provider timeout', 'warning');
```

### Express Integration

```typescript
import express from 'express';
import { sentryErrorHandler, setupSentryExpressErrorHandler } from './monitoring/sentry';

const app = express();

// Routes...

// Add Sentry error handler before your error middleware
app.use(sentryErrorHandler);
app.use(errorHandler);

// Or use the built-in Express integration
setupSentryExpressErrorHandler(app);
```

### Data Filtering

Sentry automatically filters sensitive data:

**Redacted Headers:**

- `authorization`
- `cookie`
- `x-csrf-token`

**Redacted Body Fields:**

- `password`
- `token`
- `secret`
- `apiKey`

**Excluded Breadcrumbs:**

- `/auth/login`
- `/auth/reset-password`

### Performance Monitoring

Sentry tracks performance in production:

- Traces sample rate: 10% (production), 100% (development)
- HTTP request tracing
- Express middleware timing

## Best Practices

### 1. Use Specific Error Types

```typescript
// Good: Specific error with context
throw errors.notFound(`User ${userId} not found`);

// Avoid: Generic errors
throw new Error('Not found');
```

### 2. Handle Errors at Boundaries

```typescript
// API route handler
router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    try {
      const order = await createOrder(req.body);
      res.json(order);
    } catch (error) {
      // Transform domain errors to API errors
      if (error instanceof InsufficientStockError) {
        throw errors.badRequest(error.message);
      }
      throw error; // Let error middleware handle unknown errors
    }
  }),
);
```

### 3. Include Context in Logs

```typescript
// Good: Rich context
logger.error('Order creation failed', {
  orderId,
  userId: req.user.id,
  items: order.items.length,
  error: error.message,
});

// Avoid: Minimal information
logger.error('Error creating order');
```

### 4. Use Error Boundaries Strategically

```tsx
// Wrap independent sections separately
<Layout>
  <SectionErrorBoundary sectionName="Sidebar">
    <Sidebar />
  </SectionErrorBoundary>

  <SectionErrorBoundary sectionName="Main Content">
    <MainContent />
  </SectionErrorBoundary>
</Layout>
```

### 5. Provide User-Friendly Messages

```typescript
// Backend: Return translatable error codes
throw new ApiError(400, 'INVALID_EMAIL_FORMAT');

// Frontend: Map to localized messages
const message = t(`errors.${errorCode}`, { defaultValue: 'An error occurred' });
```
