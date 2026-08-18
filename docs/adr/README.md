# Architecture Decision Records (ADRs)

## What are ADRs?

Architecture Decision Records (ADRs) are documents that capture important architectural decisions made during the development of a software project. Each ADR describes a single decision, including the context that led to the decision, the decision itself, and the consequences (both positive and negative) of that decision.

ADRs help teams:

- **Document rationale**: Understand why certain decisions were made
- **Onboard new team members**: Quickly get up to speed on architectural choices
- **Avoid repeating discussions**: Reference past decisions instead of re-debating them
- **Track architectural evolution**: See how the system has changed over time

## How to Create a New ADR

1. **Create a new file** in this directory with the naming convention:

   ```
   NNNN-short-title.md
   ```

   Where `NNNN` is a four-digit sequential number (e.g., `0007-add-caching-layer.md`)

2. **Use the template** below for the content

3. **Set the status** to `Proposed` initially, then update to `Accepted`, `Deprecated`, or `Superseded` as appropriate

4. **Commit the ADR** along with any related code changes

## Template Format

```markdown
# [Number]. [Title]

Date: YYYY-MM-DD

## Status

Proposed | Accepted | Deprecated | Superseded by [ADR-NNNN](NNNN-title.md)

## Context

[What is the issue that we're seeing that is motivating this decision or change?]

## Decision

[What is the change that we're proposing and/or doing?]

## Consequences

[What becomes easier or more difficult to do because of this change?]
```

## Current ADRs

| ADR                                   | Title                            | Status   |
| ------------------------------------- | -------------------------------- | -------- |
| [0001](0001-use-sqlite.md)            | Use SQLite as Database           | Accepted |
| [0002](0002-react-query-for-state.md) | Use React Query for Server State | Accepted |
| [0003](0003-pwa-first-approach.md)    | PWA-First Approach               | Accepted |
| [0004](0004-monorepo-structure.md)    | Monorepo Structure               | Accepted |
| [0005](0005-jwt-authentication.md)    | JWT-Based Authentication         | Accepted |
| [0006](0006-i18n-strategy.md)         | Internationalization Strategy    | Accepted |

## References

- [Michael Nygard's original ADR article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR GitHub organization](https://adr.github.io/)
