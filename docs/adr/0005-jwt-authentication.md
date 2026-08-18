# 5. JWT-Based Authentication

Date: 2024-01-15

## Status

Accepted

## Context

The Tutti application needs to authenticate users and authorize their actions based on roles (admin, music_committee, member, etc.). We needed to choose an authentication strategy:

- **Session-based authentication**: Server stores session data, client sends session ID cookie
- **JWT (JSON Web Tokens)**: Stateless tokens containing user claims, client sends token in header
- **OAuth/OIDC**: Delegated authentication to third-party providers

Considerations:

- Multi-tenant architecture (users belong to associations)
- Role-based access control needed
- PWA with offline support
- Simple self-hosting requirements
- Support for optional MFA (TOTP)

## Decision

We chose JWT-based authentication with access tokens stored in memory and refresh tokens in httpOnly cookies.

Architecture:

1. User logs in with email/password (+ optional TOTP)
2. Server returns short-lived access token (15 min) and sets httpOnly refresh token cookie (7 days)
3. Frontend stores access token in memory (not localStorage to prevent XSS)
4. Access token includes: user ID, association ID, role, email
5. Refresh token endpoint provides new access token when needed

Reasons for this decision:

1. **Stateless**: No server-side session storage needed, simplifies deployment
2. **Scalable**: Any server instance can validate tokens without shared session store
3. **Offline-friendly**: Token validation can happen offline (for cached data display)
4. **Multi-tenant ready**: Association ID in token enables tenant filtering
5. **Self-contained**: All authorization info in the token reduces database lookups
6. **Simple hosting**: No Redis or session store needed for self-hosted instances

## Consequences

### Positive

- No server-side session storage required
- Tokens are self-contained with user and tenant information
- Works well with RESTful API design
- Easy to implement role-based access control
- Supports horizontal scaling without shared state
- Simpler self-hosting (no Redis needed)

### Negative

- Cannot instantly revoke tokens (must wait for expiry)
- Token payload increases request size
- Must carefully handle token storage to prevent XSS
- Refresh token rotation adds complexity
- JWTs can be decoded (though not modified) by anyone

### Security Mitigations

- Short access token expiry (15 minutes)
- httpOnly, Secure, SameSite cookies for refresh tokens
- HTTPS required in production
- Token blacklist for critical security events (password change)
- MFA support via TOTP (optional per user)
- Rate limiting on authentication endpoints

### Implementation Details

- `jsonwebtoken` library for token signing/verification
- `bcryptjs` for password hashing
- `otplib` for TOTP MFA
- Access token in memory, refresh token in cookie
- Middleware extracts user and association from token
- All API queries filter by association_id from token
