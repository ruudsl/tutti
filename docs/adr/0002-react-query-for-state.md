# 2. Use React Query for Server State Management

Date: 2024-01-15

## Status

Accepted

## Context

Modern React applications need to manage two types of state:

- **Client state**: UI state like modals, form inputs, theme preferences
- **Server state**: Data that lives on the server and needs to be synchronized

Traditional approaches like Redux or MobX treat all state the same, requiring:

- Manual cache management
- Loading state handling
- Error state handling
- Refetching logic
- Optimistic updates
- Cache invalidation

This leads to significant boilerplate code and complexity. The Tutti application is heavily server-driven: music libraries, user lists, rehearsal schedules, and attendance data all come from the backend API.

Options considered:

- **Redux + Redux Toolkit**: Comprehensive state management, but requires significant setup for async operations
- **MobX**: Reactive state management, but same challenges with server state
- **React Query (TanStack Query)**: Purpose-built for server state with built-in caching, synchronization, and background updates
- **SWR**: Similar to React Query but with fewer features

## Decision

We chose TanStack Query (React Query) v5 for managing server state, with React Context for minimal client state (authentication).

Reasons for this decision:

1. **Built-in caching**: Automatic caching with configurable stale times
2. **Background refetching**: Data stays fresh without manual intervention
3. **Optimistic updates**: Better UX for mutations
4. **Pagination and infinite scroll**: Native support for these patterns
5. **DevTools**: Excellent debugging experience
6. **Offline support**: Pairs well with our PWA requirements through cache persistence
7. **Less boilerplate**: No action creators, reducers, or selectors needed

## Consequences

### Positive

- Drastically reduced boilerplate for data fetching
- Automatic loading and error states
- Built-in retry logic for failed requests
- Cache persistence to IndexedDB for offline support
- Better user experience with stale-while-revalidate pattern
- Easier to reason about data flow (data comes from hooks, not global store)
- Simpler testing (mock the API, not the store)

### Negative

- Learning curve for developers familiar with Redux
- Cache invalidation can be tricky for complex relationships
- Less centralized view of application state
- Some patterns (like undo/redo) are harder without a global store

### Implementation Details

- Stale time: 5 minutes for most queries
- Cache time: 30 minutes
- Refetch on window focus enabled
- Cache persisted to IndexedDB using `@tanstack/query-sync-storage-persister`
- Mutations invalidate related queries automatically
