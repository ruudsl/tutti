# Monitoring and Logging

This guide covers the monitoring, logging, and observability features in Harmonie, including health checks, Sentry error tracking, audit logging, and log configuration.

## Health Check Endpoints

### Basic Health Check

```
GET /api/health
```

Returns basic service status for load balancers and uptime monitors:

```json
{
  "status": "healthy",
  "timestamp": "2026-06-25T12:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production"
}
```

| Field         | Description                           |
| ------------- | ------------------------------------- |
| `status`      | `healthy`, `degraded`, or `unhealthy` |
| `timestamp`   | Current server time (ISO 8601)        |
| `uptime`      | Server uptime in seconds              |
| `version`     | Application version from package.json |
| `environment` | `development`, `production`, etc.     |

### Detailed Health Check

```
GET /api/health/detailed
Authorization: Bearer <admin-token>
```

Returns comprehensive system status (admin only):

```json
{
  "status": "healthy",
  "timestamp": "2026-06-25T12:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "services": {
    "database": {
      "status": "healthy",
      "latency": 5,
      "details": {
        "userCount": 150,
        "pieceCount": 2500
      }
    },
    "disk": {
      "status": "healthy",
      "details": {
        "totalSpaceGB": "100.00",
        "freeSpaceGB": "45.00",
        "usedPercentage": "55.0",
        "dataDirSizeMB": "250.50",
        "uploadDirSizeMB": "1024.75"
      }
    },
    "memory": {
      "status": "healthy",
      "details": {
        "totalMemoryMB": "8192",
        "freeMemoryMB": "4096",
        "usedPercentage": "50.0",
        "processHeapUsedMB": "128",
        "processHeapTotalMB": "256",
        "processRssMB": "180"
      }
    }
  },
  "system": {
    "platform": "linux",
    "arch": "x64",
    "nodeVersion": "v20.10.0",
    "cpuCount": 4,
    "hostname": "app-server-1",
    "loadAverage": [0.5, 0.7, 0.8]
  }
}
```

### Status Thresholds

| Service  | Degraded  | Unhealthy         |
| -------- | --------- | ----------------- |
| Disk     | >85% used | >95% used         |
| Memory   | >85% used | >95% used         |
| Database | -         | Connection failed |

### HTTP Response Codes

| Status    | Code |
| --------- | ---- |
| healthy   | 200  |
| degraded  | 200  |
| unhealthy | 503  |

## Sentry Error Tracking

### Configuration

Set the `SENTRY_DSN` environment variable to enable Sentry:

```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Initialization

```typescript
import { initSentry, setupGlobalErrorHandlers } from './monitoring/sentry';

// Initialize at application startup
initSentry();

// Set up handlers for uncaught errors
setupGlobalErrorHandlers();
```

### Sentry Configuration Options

```typescript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: config.nodeEnv,
  release: process.env.npm_package_version,

  // Performance monitoring
  tracesSampleRate: config.isProduction ? 0.1 : 1.0,

  // Debug mode in development
  debug: config.isDevelopment,
});
```

### User Context

Track errors by user:

```typescript
import { setUserContext, clearUserContext } from './monitoring/sentry';

// After authentication
setUserContext({
  id: user.id,
  email: user.email,
  role: user.role,
});

// On logout
clearUserContext();
```

### Manual Capture

```typescript
import { captureException, captureMessage, setTags } from './monitoring/sentry';

// Capture exception with context
captureException(error, {
  orderId: '123',
  paymentMethod: 'card',
});

// Capture message
captureMessage('External API timeout', 'warning');

// Set tags for all events
setTags({
  feature: 'ticket-sales',
  customer: 'premium',
});
```

### Express Integration

```typescript
import { sentryErrorHandler, setupSentryExpressErrorHandler } from './monitoring/sentry';

const app = express();

// Option 1: Manual middleware
app.use(sentryErrorHandler);

// Option 2: Built-in integration
setupSentryExpressErrorHandler(app);
```

### Data Filtering

Sentry automatically redacts sensitive information:

**Filtered Headers:**

- `authorization`
- `cookie`
- `x-csrf-token`

**Filtered Body Fields:**

- `password`
- `token`
- `secret`
- `apiKey`

**Excluded Breadcrumbs:**

- URLs containing `/auth/login`
- URLs containing `/auth/reset-password`

### Graceful Shutdown

Flush pending events before shutdown:

```typescript
import { flushSentry } from './monitoring/sentry';

process.on('SIGTERM', async () => {
  await flushSentry(2000); // 2 second timeout
  process.exit(0);
});
```

## Audit Logging

### Overview

The audit log system tracks user actions on entities for compliance and debugging.

### Logged Actions

| Action   | Description     |
| -------- | --------------- |
| `create` | Entity created  |
| `update` | Entity modified |
| `delete` | Entity deleted  |
| `login`  | User logged in  |
| `logout` | User logged out |
| `upload` | File uploaded   |

### Creating Audit Logs

```typescript
import { logAuditEvent, logAuditUpdate } from './routes/audit-logs';

// Simple event
logAuditEvent(
  userId,
  'create',
  'music_piece',
  pieceId,
  'Symphony No. 5',
  { title: 'Symphony No. 5', composer: 'Beethoven' },
  req.ip,
  req.get('user-agent'),
);

// Update with automatic field change tracking
logAuditUpdate(
  userId,
  'user',
  user.id,
  user.email,
  oldUserData,
  newUserData,
  ['name', 'email', 'role'], // Fields to track (optional)
  req.ip,
  req.get('user-agent'),
);
```

### Field-Level Change Tracking

```typescript
import { computeFieldChanges } from './routes/audit-logs';

const changes = computeFieldChanges(oldData, newData);
// Returns: [{ field: 'name', oldValue: 'John', newValue: 'Jane' }, ...]
```

Sensitive fields are automatically redacted:

- `password`
- `passwordHash`
- `token`
- `secret`
- `apiKey`

### Querying Audit Logs

```
GET /api/audit-logs
Authorization: Bearer <admin-token>
```

**Query Parameters:**

| Parameter    | Type   | Description                            |
| ------------ | ------ | -------------------------------------- |
| `page`       | number | Page number (default: 1)               |
| `pageSize`   | number | Items per page (default: 25, max: 100) |
| `action`     | string | Filter by action type                  |
| `entityType` | string | Filter by entity type                  |
| `userId`     | string | Filter by user ID                      |
| `dateFrom`   | date   | Start date filter                      |
| `dateTo`     | date   | End date filter                        |

**Response:**

```json
{
  "logs": [
    {
      "id": "log_123",
      "userId": "user_456",
      "userName": "John Doe",
      "action": "update",
      "entityType": "user",
      "entityId": "user_789",
      "entityName": "jane@example.com",
      "changes": {
        "fields": [{ "field": "role", "oldValue": "member", "newValue": "admin" }],
        "metadata": {
          "trackedFields": "all",
          "changeCount": 1
        }
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "createdAt": "2026-06-25T12:00:00.000Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 25
}
```

## Log Levels and Configuration

### Winston Logger

The application uses Winston for structured logging (`backend/src/logging/logger.ts`).

### Log Levels

| Level   | Priority | Use Case                             |
| ------- | -------- | ------------------------------------ |
| `error` | 0        | Errors requiring immediate attention |
| `warn`  | 1        | Potential issues, deprecated usage   |
| `info`  | 2        | Important events (startup, auth)     |
| `debug` | 3        | Development debugging                |

### Environment-Based Configuration

| Environment | Default Level | Console Format            | File Logging |
| ----------- | ------------- | ------------------------- | ------------ |
| Development | `debug`       | Colorized, human-readable | No           |
| Production  | `info`        | JSON                      | Yes          |

### Log Files (Production)

| File                | Level | Max Size | Max Files |
| ------------------- | ----- | -------- | --------- |
| `logs/error.log`    | error | 10MB     | 5         |
| `logs/combined.log` | all   | 10MB     | 5         |
| `logs/access.log`   | info  | 10MB     | 10        |

Files are automatically rotated when they reach max size.

### Structured Logging Helpers

```typescript
import logger, {
  logRequest,
  logError,
  logAuth,
  logDb,
  logSecurity,
  logPerformance,
  logStartup,
} from './logging/logger';

// HTTP requests
logRequest('GET', '/api/users', userId, 200, 45);

// Errors with context
logError(error, { userId, action: 'checkout' });

// Authentication events
logAuth('login', userId, true, { method: '2fa' });
logAuth('login', userId, false, { reason: 'invalid_password' });

// Database operations
logDb('SELECT', 'users', userId, 12);

// Security events
logSecurity('rate-limit-exceeded', { ip, endpoint });
logSecurity('suspicious-activity', { userId, action });

// Performance metrics
logPerformance('query_time', 150, 'ms', { table: 'users' });

// Startup events
logStartup('Server started', { port: 3001, env: 'production' });
```

### Child Loggers

Create loggers with additional context:

```typescript
import { createChildLogger } from './logging/logger';

const orderLogger = createChildLogger({ module: 'orders' });
orderLogger.info('Order created', { orderId: '123' });
// Output includes: { module: 'orders', orderId: '123', ... }
```

### Request Logging Middleware

```typescript
import { requestIdMiddleware, requestLoggerMiddleware } from './logging/requestLogger';

app.use(requestIdMiddleware); // Adds unique request ID
app.use(requestLoggerMiddleware); // Logs incoming requests
```

## Log Output Formats

### Console (Development)

```
12:00:00 info: Server started on port 3001 {"environment":"development"}
12:00:01 debug: DB: SELECT on users {"duration":5}
12:00:02 warn: Deprecated API called {"endpoint":"/v1/users"}
```

### JSON (Production/File)

```json
{
  "level": "info",
  "message": "Server started on port 3001",
  "timestamp": "2026-06-25 12:00:00",
  "service": "harmonie-api",
  "environment": "production"
}
```

## Best Practices

### 1. Log at Appropriate Levels

```typescript
// error: Application failures
logger.error('Database connection failed', { error: err.message });

// warn: Potential issues
logger.warn('API rate limit approaching', { usage: '90%' });

// info: Significant events
logger.info('User registered', { userId });

// debug: Development details
logger.debug('Cache miss', { key: 'user_123' });
```

### 2. Include Relevant Context

```typescript
// Good: Rich context
logger.error('Payment failed', {
  orderId,
  userId,
  amount,
  provider: 'stripe',
  errorCode: 'card_declined',
});

// Avoid: Minimal information
logger.error('Payment failed');
```

### 3. Avoid Sensitive Data

```typescript
// Good: Redact sensitive data
logger.info('Password reset requested', { email: user.email });

// Avoid: Including secrets
logger.info('Login', { password: user.password }); // Never!
```

### 4. Use Structured Data

```typescript
// Good: Structured for querying
logger.info('Request completed', {
  type: 'request',
  method: 'POST',
  path: '/api/orders',
  statusCode: 201,
  duration: 150,
});

// Avoid: String interpolation
logger.info(`POST /api/orders completed in 150ms with 201`);
```

### 5. Monitor Health Regularly

```bash
# Basic health check (load balancer)
curl http://localhost:3001/api/health

# Detailed health check (monitoring)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:3001/api/health/detailed
```

### 6. Set Up Alerts

Configure alerts in Sentry and monitoring tools for:

- Error rate spikes
- Health check failures
- Memory/disk threshold breaches
- Authentication failures
- Security events
