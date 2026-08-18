# 4. Monorepo Structure

Date: 2024-01-15

## Status

Accepted

## Context

The Tutti application consists of two main components:

- **Backend**: Express.js API server with TypeScript
- **Frontend**: React SPA with TypeScript

We needed to decide how to organize these codebases:

- **Separate repositories**: Each component in its own Git repository
- **Monorepo**: Both components in a single repository

Considerations:

- Small team (1-3 developers)
- Tight coupling between frontend and backend (shared types, API contracts)
- Single deployment target (Render/Vercel or Docker)
- Need for shared tooling (linting, formatting, TypeScript config)

## Decision

We chose a monorepo structure using npm workspaces, with `backend/` and `frontend/` as workspace packages.

```
tutti/
├── backend/         # Express API (workspace)
│   ├── src/
│   └── package.json
├── frontend/        # React SPA (workspace)
│   ├── src/
│   └── package.json
├── docs/            # Documentation
├── e2e/             # End-to-end tests
├── package.json     # Root package.json with workspaces
└── ...
```

Reasons for this decision:

1. **Atomic commits**: Changes to both frontend and backend in a single commit
2. **Shared tooling**: ESLint, Prettier, and TypeScript configured once
3. **Easier refactoring**: Rename an API endpoint and update the frontend in one PR
4. **Simpler CI/CD**: Single pipeline for the entire application
5. **npm workspaces**: Native npm support without additional tooling (no Lerna, Nx, etc.)
6. **Shared types**: Can share TypeScript types between frontend and backend (future improvement)

## Consequences

### Positive

- Simpler development workflow (one repo to clone, one PR for related changes)
- Coordinated versioning (backend and frontend versions stay in sync)
- Easier to run end-to-end tests (both services in same repo)
- Shared development dependencies (ESLint, Prettier, TypeScript)
- Single source of truth for documentation

### Negative

- Larger repository size (all history for both components)
- CI runs may be slower (though can be optimized with caching)
- Both components must use compatible Node.js version
- Potential for tighter coupling than necessary

### Implementation Details

- npm workspaces manage dependencies
- Root `package.json` contains scripts to run both components
- `npm run dev` starts both frontend and backend concurrently
- Separate `Dockerfile` for each component for production builds
- Shared `.prettierrc` and `eslint.config.mjs` at root
