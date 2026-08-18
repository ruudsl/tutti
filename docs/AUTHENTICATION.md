# Authentication

This document describes the authentication flows and security features implemented in the Harmonie Muziek application.

## Overview

The application supports multiple authentication methods:

- Email/password login with optional MFA
- Microsoft Entra ID (Azure AD) SSO
- Social login (Google, Facebook) for guest checkout
- Password reset via email

## JWT Authentication

### Token Structure

Authentication uses JSON Web Tokens (JWT) with the following payload:

```typescript
interface UserPayload {
  id: string; // User UUID
  email: string; // User email
  role: string; // User role (admin, member, etc.)
  associationId: string | null; // Tenant/association ID
}
```

### Token Generation

```typescript
// backend/src/middleware/auth.ts
export function generateToken(user: {
  id: string;
  email: string;
  role: string;
  association_id: string | null;
}): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      associationId: user.association_id,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }, // Default: 7 days
  );
}
```

### Token Validation

```typescript
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

  if (!token) {
    return res.status(401).json({ error: 'Toegang geweigerd. Geen token opgegeven.' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token verlopen of ongeldig.' });
  }
}
```

### Optional Authentication

For routes that work with or without authentication:

```typescript
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1] || (req.query.token as string);

  if (!token) {
    return next(); // Continue without user context
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as UserPayload;
    req.user = decoded;
  } catch {
    // Ignore invalid tokens in optional auth
  }

  next();
}
```

## Login Flow

### Standard Login

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (success):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "member",
    "associationId": "association-uuid",
    "mfaEnabled": false
  }
}
```

### Login with MFA

If MFA is enabled, the initial login returns:

```json
{
  "requiresMfa": true,
  "message": "MFA verificatie vereist."
}
```

Then submit with MFA code:

```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "mfaCode": "123456"
}
```

### Rate Limiting

Login attempts are rate-limited:

- **5 attempts per 15 minutes per IP address**
- Returns 429 Too Many Requests when exceeded

## Multi-Factor Authentication (MFA)

### Setup Flow

1. **Generate MFA Secret**

```
POST /api/auth/mfa/setup
Authorization: Bearer <token>
```

Response:

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,...",
  "message": "Scan de QR code met je authenticator app en verifieer met een code."
}
```

2. **Verify and Enable MFA**

```
POST /api/auth/mfa/enable
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "123456"
}
```

### Disable MFA

Requires password confirmation:

```
POST /api/auth/mfa/disable
Authorization: Bearer <token>
Content-Type: application/json

{
  "password": "currentpassword",
  "code": "123456"  // Optional extra verification
}
```

### MFA Status

```
GET /api/auth/mfa/status
Authorization: Bearer <token>
```

## Microsoft Entra ID (SSO)

### Configuration

Microsoft SSO is configured per association in the database:

```typescript
interface MicrosoftConfig {
  microsoft_client_id: string;
  microsoft_client_secret: string;
  microsoft_tenant_id: string;
  microsoft_enabled: boolean;
}
```

### SSO Flow

1. **Check Availability**

```
GET /api/auth/microsoft/enabled
```

2. **Initiate Login**

```
GET /api/auth/microsoft/login
```

Returns:

```json
{
  "authUrl": "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?..."
}
```

3. **Handle Callback**

```
POST /api/auth/microsoft/callback
Content-Type: application/json

{
  "code": "authorization-code",
  "state": "csrf-state-token"
}
```

### User Matching

The SSO flow matches Microsoft accounts to existing users:

1. First tries to match by `microsoft_id` (previously linked accounts)
2. Falls back to matching by email address
3. Links Microsoft account to existing user on first successful login
4. Returns error if no matching user found (no auto-provisioning)

### Admin Configuration

```
GET /api/auth/microsoft/config    # Get current config (admin only)
PUT /api/auth/microsoft/config    # Save config (admin only)
DELETE /api/auth/microsoft/config # Remove config (admin only)
```

## Social Login (Guest Checkout)

Social login is used for guest ticket purchases, not full account login.

### Google OAuth

1. **Check Availability**

```
GET /api/auth/social/google/enabled
```

2. **Get Auth URL**

```
GET /api/auth/social/google?returnUrl=/tickets/concert-123
```

3. **Handle Callback**

```
GET /api/auth/social/google/callback?code=...&state=...
```

Returns guest checkout token:

```json
{
  "token": "eyJ...",
  "user": {
    "email": "user@gmail.com",
    "name": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "authProvider": "google"
  },
  "returnUrl": "/tickets/concert-123"
}
```

### Facebook OAuth

Similar flow to Google:

```
GET /api/auth/social/facebook/enabled
GET /api/auth/social/facebook?returnUrl=/tickets/concert-123
GET /api/auth/social/facebook/callback?code=...&state=...
```

### Guest Checkout Token

Guest tokens are short-lived (30 minutes) and only valid for ticket purchases:

```typescript
interface GuestCheckoutToken {
  type: 'guest_checkout';
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  authProvider: 'google' | 'facebook';
  exp: number;
}
```

## Password Reset

### Request Reset

```
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Security features:**

- Rate limited: 3 requests per hour per email
- Returns success even for non-existent emails (prevents enumeration)
- Invalidates any existing reset tokens for the user
- Token expires after 1 hour

### Validate Token

```
GET /api/auth/reset-password/validate?token=<token>
```

### Reset Password

```
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "<reset-token>",
  "newPassword": "newpassword123"
}
```

## Session Management

### Active Sessions

Users can view and manage their active sessions:

```
GET /api/sessions
Authorization: Bearer <token>
```

Response:

```json
[
  {
    "id": "session-uuid",
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "lastActive": "2024-01-15T10:30:00Z",
    "createdAt": "2024-01-01T08:00:00Z",
    "expiresAt": "2024-01-22T08:00:00Z",
    "isCurrent": true
  }
]
```

### Revoke Session

```
DELETE /api/sessions/:id
Authorization: Bearer <token>
```

### Revoke All Other Sessions

```
DELETE /api/sessions/all
Authorization: Bearer <token>
```

Revokes all sessions except the current one.

## Role-Based Access Control

### Available Roles

1. **admin** - Full system access
2. **music_committee** - Music library management
3. **conductor** - Rehearsal and concert management
4. **section_leader** - Section-specific management
5. **member** - Basic member access

### Role Hierarchy

```typescript
const roleHierarchy: Record<string, number> = {
  admin: 5,
  music_committee: 4,
  conductor: 3,
  section_leader: 2,
  member: 1,
};
```

### Role Middleware

```typescript
// Require specific role
router.get('/admin-only', authenticateToken, requireRole('admin'), handler);

// Require minimum role level
router.get('/conductor-plus', authenticateToken, requireMinRole('conductor'), handler);

// Section leader with instrument check
router.put(
  '/sections/:id',
  authenticateToken,
  requireSectionLeader((req) => req.params.instrumentId),
  handler,
);
```

## Frontend Integration

### Storing Token

```typescript
// On successful login
localStorage.setItem('token', response.token);

// In API calls
const token = localStorage.getItem('token');
fetch('/api/endpoint', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Auth Context

```typescript
// frontend/src/context/AuthContext.tsx
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

// Usage
const { user, isAuthenticated, login, logout } = useAuth();
```

### Protected Routes

```tsx
// Redirect to login if not authenticated
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
```

## Security Considerations

### Token Storage

- JWT tokens are stored in `localStorage`
- Consider `httpOnly` cookies for enhanced security in future versions

### CSRF Protection

- State parameter used in OAuth flows
- CSRF middleware available (can be enabled via `CSRF_ENABLED` env var)

### Password Requirements

- Minimum 8 characters
- Validated on both client and server

### Rate Limiting

- Login: 5 attempts per 15 minutes per IP
- Password reset: 3 requests per hour per email

### Audit Logging

- Login events are logged with IP and user agent
- Password changes logged
- MFA enable/disable logged
- Session revocations logged

### Token Expiry

- Default JWT expiry: 7 days (configurable via `JWT_EXPIRES_IN`)
- Password reset tokens: 1 hour
- Guest checkout tokens: 30 minutes
- OAuth state tokens: 10 minutes
