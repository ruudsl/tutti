# Custom React Hooks

This document describes all custom React hooks available in the Harmonie Muziek application. Hooks are located in `frontend/src/hooks/`.

## Table of Contents

- [Data Fetching Hooks](#data-fetching-hooks)
- [UI State Hooks](#ui-state-hooks)
- [Form Hooks](#form-hooks)
- [Mobile/PWA Hooks](#mobilepwa-hooks)
- [Offline Support Hooks](#offline-support-hooks)
- [Navigation Hooks](#navigation-hooks)
- [Utility Hooks](#utility-hooks)

---

## Data Fetching Hooks

These hooks wrap React Query for data fetching and mutations.

### useUsers

Manage user data with CRUD operations.

```typescript
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../hooks/useUsers';

// Fetch all users
const { data: users, isLoading } = useUsers({ role: 'member' });

// Paginated users
const { data } = useUsersPaginated({ page: 1, limit: 25 });

// Infinite scroll
const { data, fetchNextPage, hasNextPage } = useUsersInfinite();

// Mutations
const createUser = useCreateUser();
const updateUser = useUpdateUser();
const deleteUser = useDeleteUser();
```

### useConcerts

Concert management with program, media, and attendance.

```typescript
import { useConcerts, useConcert, useCreateConcert } from '../hooks/useConcerts';

// List concerts with filters
const { data: concerts } = useConcerts({ year: '2024', concertType: 'concert' });

// Single concert details
const { data: concert } = useConcert(concertId);

// Concert program management
const addItem = useAddConcertProgramItem();
const reorder = useReorderConcertProgram();

// Attendance tracking
const addAttendance = useAddConcertAttendanceBulk();
```

### useMusicPieces

Music library management.

```typescript
import { useMusicPieces, useMusicTitles } from '../hooks/useMusicPieces';

const { data: pieces } = useMusicPieces({ search: 'Mozart' });
const { data: titles } = useMusicTitles({ orchestraId });
```

### useMusicLists

Manage music lists (setlists, practice lists).

```typescript
import { useMusicLists, useMusicList, useCreateMusicList } from '../hooks/useMusicLists';

const { data: lists } = useMusicLists(orchestraId);
const { data: list } = useMusicList(listId);
```

### useOrchestras

Orchestra management.

```typescript
import { useOrchestras, useOrchestra } from '../hooks/useOrchestras';

const { data: orchestras } = useOrchestras();
const { data: orchestra } = useOrchestra(orchestraId);
```

### useInstruments

Instrument reference data.

```typescript
import { useInstruments } from '../hooks/useInstruments';

const { data: instruments } = useInstruments();
```

### useGenres

Music genre management.

```typescript
import { useGenres } from '../hooks/useGenres';

const { data: genres } = useGenres();
```

### useFavorites

User's favorite music pieces.

```typescript
import { useFavorites, useFavoriteStatus } from '../hooks/useFavorites';

const { favorites, toggleFavorite, isFavorite, isToggling } = useFavorites();
const { isFavorite: isFav } = useFavoriteStatus(musicTitleId);

// Toggle a favorite
await toggleFavorite(musicTitleId, isFavorite(musicTitleId));
```

### useNotifications

User notifications.

```typescript
import { useNotifications } from '../hooks/useNotifications';

const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
```

### useTickets

Ticket sales and management.

```typescript
import { useTickets, useMyTickets, useTicketStats } from '../hooks/useTickets';

const { data: tickets } = useTickets(concertId);
const { data: myTickets } = useMyTickets();
const { data: stats } = useTicketStats(concertId);
```

### useEquipment

Equipment inventory management.

```typescript
import { useEquipment, useEquipmentTypes } from '../hooks/useEquipment';

const { data: equipment } = useEquipment({ category: 'percussion' });
const { data: types } = useEquipmentTypes();
```

### useUniforms

Uniform inventory and assignments.

```typescript
import { useUniforms, useUniformSets } from '../hooks/useUniforms';

const { data: uniforms } = useUniforms();
const { data: sets } = useUniformSets();
```

### useEvents

Event calendar.

```typescript
import { useEvents } from '../hooks/useEvents';

const { data: events } = useEvents({ from: startDate, to: endDate });
```

### useRehearsalForm

Rehearsal creation/editing form state.

```typescript
import { useRehearsalForm } from '../hooks/useRehearsalForm';

const { form, setField, validate, reset } = useRehearsalForm(initialData);
```

### useAudioRecordings

Audio recording management for practice.

```typescript
import { useAudioRecordings } from '../hooks/useAudioRecordings';

const { recordings, upload, deleteRecording } = useAudioRecordings(musicPieceId);
```

### usePractice

Practice session tracking.

```typescript
import { usePractice, usePracticeLogs } from '../hooks/usePractice';

const { logPractice, stats } = usePractice();
const { data: logs } = usePracticeLogs(musicTitleId);
```

### usePracticeSchedules

Practice schedule management.

```typescript
import { usePracticeSchedules } from '../hooks/usePracticeSchedules';

const { schedules, createSchedule, updateSchedule } = usePracticeSchedules();
```

### useInstrumentAssets

Instrument asset tracking.

```typescript
import { useInstrumentAssets } from '../hooks/useInstrumentAssets';

const { data: assets } = useInstrumentAssets(instrumentId);
```

### useExternalMusicians

Guest/external musician management.

```typescript
import { useExternalMusicians } from '../hooks/useExternalMusicians';

const { data: externals } = useExternalMusicians();
```

### useReplacementRequests

Replacement/substitute requests.

```typescript
import { useReplacementRequests } from '../hooks/useReplacementRequests';

const { requests, createRequest, respondToRequest } = useReplacementRequests();
```

### useStageLayouts

Stage layout management.

```typescript
import { useStageLayouts } from '../hooks/useStageLayouts';

const { layouts, createLayout, updateLayout } = useStageLayouts();
```

### useSeasons

Season planning.

```typescript
import { useSeasons } from '../hooks/useSeasons';

const { data: seasons, currentSeason } = useSeasons();
```

### useHolidays

Holiday calendar.

```typescript
import { useHolidays } from '../hooks/useHolidays';

const { holidays } = useHolidays(year);
```

### useAttendanceAnalytics

Attendance statistics and reporting.

```typescript
import { useAttendanceAnalytics } from '../hooks/useAttendanceAnalytics';

const { data: analytics } = useAttendanceAnalytics({ from, to, orchestraId });
```

### useVocabulary

Custom vocabulary/terminology management.

```typescript
import { useVocabulary } from '../hooks/useVocabulary';

const { vocabulary, updateTerm } = useVocabulary();
```

### useDashboardWidgets

Dashboard widget configuration.

```typescript
import { useDashboardWidgets } from '../hooks/useDashboardWidgets';

const { widgets, reorderWidgets, toggleWidget } = useDashboardWidgets();
```

### useSectionChat

Section-specific chat functionality.

```typescript
import { useSectionChat } from '../hooks/useSectionChat';

const { messages, sendMessage, isLoading } = useSectionChat(sectionId);
```

### useMultiAssociation

Multi-association membership support.

```typescript
import { useMultiAssociation } from '../hooks/useMultiAssociation';

const { associations, currentAssociation, switchAssociation } = useMultiAssociation();
```

### useSpondIntegration

Spond calendar integration.

```typescript
import { useSpondIntegration } from '../hooks/useSpondIntegration';

const { isConnected, syncEvents, disconnect } = useSpondIntegration();
```

---

## UI State Hooks

### useDarkMode

Dark mode preference with system detection.

```typescript
import { useDarkMode } from '../hooks/useDarkMode';

const { isDark, mode, toggleDarkMode, setDarkMode } = useDarkMode();

// mode can be: 'light' | 'dark' | 'system'
toggleDarkMode(); // Cycles through: light -> dark -> system -> light
setDarkMode('dark');
```

### useTheme

Dynamic theme customization.

```typescript
import { useTheme } from '../hooks/useTheme';

const { theme, setTheme, primaryColor, setPrimaryColor } = useTheme();
```

### useIsMobile

Responsive breakpoint detection.

```typescript
import { useIsMobile, useMediaQuery } from '../hooks/useIsMobile';

const isMobile = useIsMobile(); // Default: < 768px
const isMobile = useIsMobile(640); // Custom breakpoint

const isLargeScreen = useMediaQuery('(min-width: 1024px)');
```

### useDocumentTitle

Set document title with i18n support.

```typescript
import { useDocumentTitle } from '../hooks/useDocumentTitle';

useDocumentTitle('pages.concerts.title'); // Uses i18n key
```

### useLazyLoad

Lazy loading for components/images.

```typescript
import { useLazyLoad } from '../hooks/useLazyLoad';

const { ref, isVisible } = useLazyLoad();

<div ref={ref}>
  {isVisible && <HeavyComponent />}
</div>
```

### useUploadProgress

File upload progress tracking.

```typescript
import { useUploadProgress } from '../hooks/useUploadProgress';

const { progress, upload, isUploading, error } = useUploadProgress();

await upload(file, '/api/upload');
```

### useAsyncAction

Async operation state management.

```typescript
import { useAsyncAction } from '../hooks/useAsyncAction';

const { execute, isLoading, error, data } = useAsyncAction(asyncFn);

await execute(params);
```

### useRecentViews

Track recently viewed items.

```typescript
import { useRecentViews } from '../hooks/useRecentViews';

const { recentItems, trackView } = useRecentViews('music');

trackView(musicPieceId);
```

### useRecentItems

Generic recent items tracking.

```typescript
import { useRecentItems } from '../hooks/useRecentItems';

const { items, addItem, clearItems } = useRecentItems('searches', 10);
```

---

## Form Hooks

### useFormValidation

Accessible form validation with focus management.

```typescript
import { useFormValidation } from '../hooks/useFormValidation';

const { focusFirstError, setFieldError, clearErrors, hasError, getError } = useFormValidation({
  announceErrors: true,
  scrollToError: true,
});

const handleSubmit = (e) => {
  e.preventDefault();
  clearErrors();

  const errors = validate(formData);
  if (errors.length > 0) {
    focusFirstError(errors); // Focuses first error field, announces to screen readers
    return;
  }
  // Submit...
};
```

### useDebounce

Debounce values and callbacks.

```typescript
import { useDebounce, useDebouncedCallback } from '../hooks/useDebounce';

// Debounce a value
const debouncedSearch = useDebounce(searchTerm, 300);

// Debounce a callback
const debouncedSave = useDebouncedCallback((data) => {
  saveData(data);
}, 500);
```

---

## Mobile/PWA Hooks

### usePWAInstall

PWA installation prompt.

```typescript
import { usePWAInstall } from '../hooks/usePWAInstall';

const { canInstall, isInstalled, isDismissed, promptInstall, dismissPrompt } = usePWAInstall();

if (canInstall) {
  return <Button onClick={promptInstall}>Install App</Button>;
}
```

### useSwipeGesture

Touch swipe gesture detection.

```typescript
import { useSwipeGesture } from '../hooks/useSwipeGesture';

const { ref, bind } = useSwipeGesture({
  onSwipeLeft: () => nextPage(),
  onSwipeRight: () => prevPage(),
  onSwipeMove: (deltaX, deltaY, velocity) => {
    // Update UI during swipe
  },
}, {
  threshold: 50,
  preventScrollOnHorizontalSwipe: true,
});

<div ref={ref}>
  {/* Swipeable content */}
</div>
```

### usePullToRefresh

Pull-to-refresh for mobile.

```typescript
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const { ref, isPulling, isRefreshing, progress, pullDistance } = usePullToRefresh({
  onRefresh: async () => {
    await refetch();
  },
  threshold: 80,
  maxPull: 150,
});

<div ref={ref}>
  {isRefreshing && <Spinner />}
  {isPulling && <PullIndicator progress={progress} />}
  <Content />
</div>
```

### useHapticFeedback

Haptic feedback for touch interactions.

```typescript
import { useHapticFeedback } from '../hooks/useHapticFeedback';

const { haptic, hapticOnClick, isSupported } = useHapticFeedback();

// Trigger haptic manually
haptic('success');  // Patterns: 'light', 'medium', 'heavy', 'success', 'warning', 'error', 'selection'

// Add to click handler
<Button onClick={hapticOnClick('light')}>Tap me</Button>
```

### useBluetoothPedal

Bluetooth foot pedal support for page turning.

```typescript
import { useBluetoothPedal } from '../hooks/useBluetoothPedal';

const { isConnected, connect, disconnect, onPageTurn } = useBluetoothPedal();

useEffect(() => {
  return onPageTurn((direction) => {
    if (direction === 'next') nextPage();
    else prevPage();
  });
}, []);
```

---

## Offline Support Hooks

### useOffline

Network status and offline data sync.

```typescript
import { useOffline, useOfflineData } from '../hooks/useOffline';

const {
  isOnline,
  isOffline,
  pendingChanges,
  conflicts,
  hasConflicts,
  isSyncing,
  forceSync,
  resolveConflict,
  clearOfflineData,
} = useOffline();

// Offline-first data loading
const { data, isLoading, error, isFromCache } = useOfflineData(
  fetchOnline, // Function to fetch from server
  getCached, // Function to get from IndexedDB
  cacheData, // Function to save to IndexedDB
  [dependency], // Deps array
);
```

### useOfflineMutation

Queue mutations while offline.

```typescript
import { useOfflineMutation, usePendingMutationsCount } from '../hooks/useOfflineMutation';

const mutation = useOfflineMutation((data) => api.updateItem(data), {
  onSuccess: (data) => showSuccess('Saved'),
  onError: (error) => showError(error.message),
  invalidateKeys: [['items']],
  mutationKey: 'updateItem',
});

// Check pending offline mutations
const pendingCount = usePendingMutationsCount();
```

### useOfflineData

Offline-first data fetching with caching.

```typescript
import { useOfflineData } from '../hooks/useOfflineData';

const { data, isLoading, isFromCache } = useOfflineData(musicPieceId);
```

---

## Navigation Hooks

### useKeyboardShortcuts

Global keyboard shortcuts.

```typescript
import { useKeyboardShortcuts, useShortcutEvent } from '../hooks/useKeyboardShortcuts';

// Register shortcuts (includes default navigation shortcuts)
const shortcuts = useKeyboardShortcuts([
  {
    key: 'd',
    ctrl: true,
    action: () => toggleDebug(),
    description: 'Toggle debug mode',
    category: 'general',
  },
]);

// Listen for shortcut events
useShortcutEvent('save', () => {
  handleSave();
});

// Default shortcuts:
// ? - Show help
// Escape - Close modal
// Ctrl+K - Open search
// Ctrl+N - New item
// Ctrl+S - Save
// G H - Go to home
// G M - Go to my music
// G S - Go to settings
// etc.
```

### useSearch

Global search functionality.

```typescript
import { useSearch, useSearchCategoryLabels } from '../hooks/useSearch';

const {
  query,
  setQuery,
  results,
  groupedResults,
  suggestions,
  recentSearches,
  isLoading,
  selectedIndex,
  handleKeyDown,
  getSelectedResult,
  saveRecentSearch,
  deleteRecentSearch,
} = useSearch('', { type: 'music' });
```

### usePrefetch

Prefetch data on hover for faster navigation.

```typescript
import { usePrefetch } from '../hooks/usePrefetch';

const { onMouseEnter, onMouseLeave, onClick, onFocus } = usePrefetch(
  '/music-pieces/123',
  () => queryClient.prefetchQuery(['musicPiece', 123], fetchMusicPiece),
  { delay: 100 }
);

<a
  href="/music-pieces/123"
  onMouseEnter={onMouseEnter}
  onMouseLeave={onMouseLeave}
  onClick={onClick}
>
  View Music Piece
</a>
```

---

## Utility Hooks

### useAttendance

Attendance tracking and reporting.

```typescript
import { useAttendance, useMyAttendance } from '../hooks/useAttendance';

// For admins: view all attendance
const { members, filters, updateFilters, sortedMembers } = useAttendance();

// For members: my attendance status
const { status, updateAttendance, canSyncToSpond } = useMyAttendance();
```

### useWebSocket

Real-time WebSocket connection.

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

const {
  isConnected,
  emit,
  subscribe,
  // Chat
  sendChatMessage,
  setTyping,
  onChatMessage,
  onTyping,
  // Seating
  updateSeating,
  onSeatingUpdate,
  // Notifications
  onNotification,
  // Presence
  updatePresence,
} = useWebSocket();

// Subscribe to events
useEffect(() => {
  const unsubscribe = onChatMessage((message) => {
    setMessages((prev) => [...prev, message]);
  });
  return unsubscribe;
}, []);
```

---

## Hook Dependencies

Most data fetching hooks depend on:

- `@tanstack/react-query` for caching and state
- `../lib/queryClient` for query keys and configuration
- `../api` for API calls

UI hooks typically use:

- React's built-in hooks (`useState`, `useEffect`, `useCallback`, etc.)
- `react-router-dom` for navigation
- `react-i18next` for translations

---

## Creating New Hooks

When creating new hooks, follow these patterns:

1. **Data Fetching**: Use React Query with proper query keys
2. **State Management**: Use `useState` with `useCallback` for stability
3. **Side Effects**: Clean up in `useEffect` return function
4. **TypeScript**: Export proper types for return values

Example template:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { fetchData, mutateData } from '../api';
import { showSuccess, showError } from '../utils/toast';

export function useMyHook(id: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.myData(id),
    queryFn: () => fetchData(id),
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: mutateData,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myData(id) });
      showSuccess('Success');
    },
    onError: (error) => {
      showError(error.message);
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    mutate: mutation.mutateAsync,
    isMutating: mutation.isPending,
  };
}
```
