# 3. PWA-First Approach

Date: 2024-01-15

## Status
Accepted

## Context
Musicians in concert bands and brass bands need to access their sheet music and rehearsal schedules on various devices. Common scenarios include:
- Viewing PDF sheet music on tablets during rehearsals
- Checking the rehearsal schedule on mobile phones
- Accessing concert programs backstage (often with poor connectivity)

We needed to decide how to deliver the mobile experience:
- **Native iOS/Android apps**: Best performance and device integration, but requires separate codebases, app store submissions, and ongoing maintenance
- **React Native / Flutter**: Cross-platform native apps, still requires app store management
- **Progressive Web App (PWA)**: Single codebase, works on all platforms, installable, offline capable

Key considerations:
- Small development team with limited resources
- Users are not tech-savvy (amateur musicians, often older demographics)
- Offline access is important (rehearsal venues may have poor connectivity)
- Need to access PDFs, which works well in browsers
- No need for native device features (camera, GPS, etc.) beyond basic web APIs

## Decision
We chose a PWA-first approach using Vite PWA plugin with Workbox for service worker management.

Reasons for this decision:
1. **Single codebase**: One React application serves all platforms
2. **No app store**: Users can install directly from the browser, avoiding app store fees and review processes
3. **Instant updates**: No waiting for app store approval; users get updates immediately
4. **Offline support**: Service workers enable offline access to sheet music and schedules
5. **Lower maintenance**: No need to maintain separate iOS and Android codebases
6. **Web standards**: Built on open standards that improve over time

## Consequences

### Positive
- Faster development velocity with single codebase
- No app store fees or approval delays
- Works on any device with a modern browser
- Offline caching for PDFs and API responses
- Installable on home screen with app-like experience
- Automatic updates without user intervention
- Easier for non-technical users (no need to find app in store)

### Negative
- iOS Safari has limitations for PWAs (no push notifications until recently, limited background sync)
- Less visibility than being in app stores
- Some users may not understand how to "install" a PWA
- Cannot use some native features (though we don't need them)
- Storage quotas are browser-controlled

### Implementation Details
- Workbox for service worker generation and caching strategies
- Precaching: App shell, fonts, icons
- Runtime caching: API responses (stale-while-revalidate), PDFs (cache-first)
- IndexedDB for React Query cache persistence
- Offline fallback page for uncached routes
- Web Push notifications for rehearsal reminders (where supported)
