# Component Library Overview

This document provides an overview of all React components in the Harmonie frontend.

## Directory Structure

```
frontend/src/components/
├── PdfAnnotation/          # PDF annotation system (see separate README)
├── charts/                 # Data visualization charts
├── __tests__/              # Component tests
└── *.tsx                   # Individual components
```

## Components by Category

### Layout Components

| Component | File | Description |
|-----------|------|-------------|
| Layout | `Layout.tsx` | Main application layout wrapper with navigation |
| ContextSidebar | `ContextSidebar.tsx` | Contextual sidebar for additional information |
| BottomSheet | `BottomSheet.tsx` | Mobile-friendly bottom sheet modal |
| Modal | `Modal.tsx` | Standard modal dialog container |
| AdaptiveModal | `AdaptiveModal.tsx` | Responsive modal that adapts to screen size |
| FormModal | `FormModal.tsx` | Modal with form handling built-in |
| ConfirmDialog | `ConfirmDialog.tsx` | Confirmation dialog for destructive actions |
| Breadcrumbs | `Breadcrumbs.tsx` | Navigation breadcrumb trail |

### Navigation Components

| Component | File | Description |
|-----------|------|-------------|
| GlobalSearch | `GlobalSearch.tsx` | Application-wide search functionality |
| QuickActions | `QuickActions.tsx` | Quick action buttons for common tasks |
| QuickActionsMenu | `QuickActionsMenu.tsx` | Dropdown menu for quick actions |
| FloatingActionButton | `FloatingActionButton.tsx` | Mobile FAB for primary actions |
| AssociationSwitcher | `AssociationSwitcher.tsx` | Switch between different associations |
| NotFound | `NotFound.tsx` | 404 page component |

### Form Components

| Component | File | Description |
|-----------|------|-------------|
| FileDropzone | `FileDropzone.tsx` | Drag-and-drop file upload area |
| ContactPicker | `ContactPicker.tsx` | Contact selection interface |
| GenrePicker | `GenrePicker.tsx` | Genre selection component |
| InstrumentPicker | `InstrumentPicker.tsx` | Musical instrument selection |
| CaptchaWidget | `CaptchaWidget.tsx` | CAPTCHA verification widget |
| CustomFields | `CustomFields.tsx` | Dynamic custom field editor |
| BulkSelection | `BulkSelection.tsx` | Bulk item selection interface |

### Data Display Components

| Component | File | Description |
|-----------|------|-------------|
| VirtualizedList | `VirtualizedList.tsx` | Virtualized list for large datasets |
| Pagination | `Pagination.tsx` | Page navigation controls |
| ResponsiveTable | `ResponsiveTable.tsx` | Table that adapts to screen size |
| SortDropdown | `SortDropdown.tsx` | Sort order selection dropdown |
| SortableList | `SortableList.tsx` | Drag-and-drop reorderable list |
| EmptyState | `EmptyState.tsx` | Empty state placeholder with CTA |
| RecentItems | `RecentItems.tsx` | Recently accessed items display |
| StreamingLinks | `StreamingLinks.tsx` | Music streaming service links |
| StreamingLinkEditor | `StreamingLinkEditor.tsx` | Editor for streaming links |
| TaskSummary | `TaskSummary.tsx` | Task overview display |

### Feedback Components

| Component | File | Description |
|-----------|------|-------------|
| ProgressBar | `ProgressBar.tsx` | Progress indicator bar |
| LoadingOverlay | `LoadingOverlay.tsx` | Full-screen loading overlay |
| Skeleton | `Skeleton.tsx` | Loading skeleton placeholders |
| ErrorBoundary | `ErrorBoundary.tsx` | React error boundary wrapper |
| SectionErrorBoundary | `SectionErrorBoundary.tsx` | Section-level error boundary |
| Tooltip | `Tooltip.tsx` | Hover tooltip component |
| NotificationCenter | `NotificationCenter.tsx` | Notification display and management |
| AriaLiveRegion | `AriaLiveRegion.tsx` | Accessibility live region announcements |

### User Interface Components

| Component | File | Description |
|-----------|------|-------------|
| Icon | `Icon.tsx` | Icon component with icon library |
| Avatar | `Avatar.tsx` | User avatar display |
| DarkModeToggle | `DarkModeToggle.tsx` | Dark/light theme toggle |
| LanguageSwitcher | `LanguageSwitcher.tsx` | Language selection dropdown |
| FavoriteButton | `FavoriteButton.tsx` | Favorite/bookmark toggle button |
| SwipeContainer | `SwipeContainer.tsx` | Touch swipe gesture container |
| LazyImage | `LazyImage.tsx` | Lazy-loaded image with placeholder |
| MarkdownPreview | `MarkdownPreview.tsx` | Markdown content renderer |

### PDF and Document Components

| Component | File | Description |
|-----------|------|-------------|
| PdfViewer | `PdfViewer.tsx` | PDF document viewer |
| PdfThumbnail | `PdfThumbnail.tsx` | PDF thumbnail preview |
| PdfPagePreview | `PdfPagePreview.tsx` | Single PDF page preview |
| PdfAnnotation/ | `PdfAnnotation/` | PDF annotation system (folder) |

### Music and Audio Components

| Component | File | Description |
|-----------|------|-------------|
| AudioRecorder | `AudioRecorder.tsx` | Audio recording interface |
| Metronome | `Metronome.tsx` | Metronome tool for practice |
| PitchPipe | `PitchPipe.tsx` | Pitch reference tool |
| Tuner | `Tuner.tsx` | Instrument tuner |
| PracticeTimer | `PracticeTimer.tsx` | Practice session timer |
| PracticeLogModal | `PracticeLogModal.tsx` | Practice session logging modal |
| MusicTools | `MusicTools.tsx` | Combined music tools panel |
| MusicXMLUpload | `MusicXMLUpload.tsx` | MusicXML file upload handler |
| ImslpSearch | `ImslpSearch.tsx` | IMSLP sheet music search |
| SwipeableMusicList | `SwipeableMusicList.tsx` | Swipeable music piece list |
| TitleMetadataModal | `TitleMetadataModal.tsx` | Music title metadata editor |
| SetlistBuilder | `SetlistBuilder.tsx` | Concert setlist builder |
| SetlistMode | `SetlistMode.tsx` | Setlist presentation mode |
| BluetoothPedalIndicator | `BluetoothPedalIndicator.tsx` | Bluetooth page-turn pedal status |

### Event and Planning Components

| Component | File | Description |
|-----------|------|-------------|
| AttendanceDashboard | `AttendanceDashboard.tsx` | Attendance tracking dashboard |
| CalendarSync | `CalendarSync.tsx` | Calendar synchronization settings |
| ProjectEventsSection | `ProjectEventsSection.tsx` | Project events listing |
| ProjectSetlistSection | `ProjectSetlistSection.tsx` | Project setlist management |
| TaskTemplatesDialog | `TaskTemplatesDialog.tsx` | Task template management |
| TourDayPlanningSection | `TourDayPlanningSection.tsx` | Tour day planning interface |
| TourTransportSection | `TourTransportSection.tsx` | Tour transportation management |
| ReplacementFinder | `ReplacementFinder.tsx` | Find replacement members |

### Seating and Venue Components

| Component | File | Description |
|-----------|------|-------------|
| SeatingEditor | `SeatingEditor.tsx` | Seating arrangement editor |
| SeatingChartVisualization | `SeatingChartVisualization.tsx` | Seating chart display |
| SeatSelector | `SeatSelector.tsx` | Individual seat selection |
| SeatHeatmap | `SeatHeatmap.tsx` | Seat availability heatmap |
| SeatingNotificationSettings | `SeatingNotificationSettings.tsx` | Seating change notifications |
| StageCanvas | `StageCanvas.tsx` | Stage layout canvas |
| SeatCardPrinter | `SeatCardPrinter.tsx` | Print seat assignment cards |

### Ticket and Sales Components

| Component | File | Description |
|-----------|------|-------------|
| TicketPurchase | `TicketPurchase.tsx` | Ticket purchasing interface |
| TicketDisplay | `TicketDisplay.tsx` | Ticket information display |
| SalesPredictionChart | `SalesPredictionChart.tsx` | Sales forecasting chart |

### Settings and Configuration Components

| Component | File | Description |
|-----------|------|-------------|
| BackupSettings | `BackupSettings.tsx` | Backup and restore interface |
| GoogleDriveSettings | `GoogleDriveSettings.tsx` | Google Drive integration settings |
| MfaSettings | `MfaSettings.tsx` | Multi-factor authentication setup |
| NotificationPreferences | `NotificationPreferences.tsx` | Notification settings |
| SessionsManager | `SessionsManager.tsx` | Active sessions management |
| CloudFilePicker | `CloudFilePicker.tsx` | Cloud storage file browser |

### Administration Components

| Component | File | Description |
|-----------|------|-------------|
| ResourceCategoriesManager | `ResourceCategoriesManager.tsx` | Resource category management |
| ResourceAvailabilitySection | `ResourceAvailabilitySection.tsx` | Resource availability display |
| PostCategoriesManager | `PostCategoriesManager.tsx` | Post/news category management |
| EquipmentStats | `EquipmentStats.tsx` | Equipment statistics display |
| GdprExport | `GdprExport.tsx` | GDPR data export functionality |
| ReportIssueModal | `ReportIssueModal.tsx` | Issue reporting modal |

### PWA and Offline Components

| Component | File | Description |
|-----------|------|-------------|
| InstallPrompt | `InstallPrompt.tsx` | PWA installation prompt |
| PWAUpdatePrompt | `PWAUpdatePrompt.tsx` | PWA update notification |
| OfflineIndicator | `OfflineIndicator.tsx` | Offline status indicator |
| OfflineManager | `OfflineManager.tsx` | Offline data management |
| OfflineScanner | `OfflineScanner.tsx` | Offline QR/barcode scanner |
| SyncStatusIndicator | `SyncStatusIndicator.tsx` | Data sync status display |

### Onboarding and Help Components

| Component | File | Description |
|-----------|------|-------------|
| OnboardingTour | `OnboardingTour.tsx` | New user onboarding tour |
| KeyboardShortcutsHelp | `KeyboardShortcutsHelp.tsx` | Keyboard shortcuts reference |
| AccessibilityInfo | `AccessibilityInfo.tsx` | Accessibility information |
| PrivacyConsentGate | `PrivacyConsentGate.tsx` | Privacy consent management |

### Social and Authentication Components

| Component | File | Description |
|-----------|------|-------------|
| SocialLoginButtons | `SocialLoginButtons.tsx` | Social media login options |
| SectionChat | `SectionChat.tsx` | Section-based chat interface |

### Data Visualization Components

| Component | File | Description |
|-----------|------|-------------|
| DashboardWidgets | `DashboardWidgets.tsx` | Dashboard widget collection |
| ConcertPosterGenerator | `ConcertPosterGenerator.tsx` | Concert poster creation tool |

### Chart Components (charts/)

| Component | File | Description |
|-----------|------|-------------|
| AttendanceGauge | `charts/AttendanceGauge.tsx` | Attendance gauge visualization |
| AttendanceLineChart | `charts/AttendanceLineChart.tsx` | Attendance trends line chart |
| DayOfWeekHeatmap | `charts/DayOfWeekHeatmap.tsx` | Activity by day heatmap |
| SectionBarChart | `charts/SectionBarChart.tsx` | Section comparison bar chart |

## Component Types

### Reusable Components

These components are designed for reuse across the application:

- `Modal`, `ConfirmDialog`, `BottomSheet` - Dialog containers
- `Tooltip`, `Icon`, `Avatar` - UI primitives
- `Pagination`, `VirtualizedList`, `SortableList` - Data handling
- `FileDropzone`, `LazyImage` - File/media handling
- `ErrorBoundary`, `Skeleton`, `ProgressBar` - Feedback
- All chart components

### Page-Specific Components

These components are tied to specific features:

- `AttendanceDashboard` - Attendance tracking page
- `SeatingEditor`, `SeatingChartVisualization` - Seating management
- `SetlistBuilder`, `SetlistMode` - Setlist functionality
- `TicketPurchase`, `TicketDisplay` - Ticketing system
- `BackupSettings`, `MfaSettings` - Settings pages
- PDF annotation components

### Layout Components

Used for page structure:

- `Layout` - Main app shell
- `ContextSidebar` - Supplementary content
- `Breadcrumbs` - Navigation aid

## Testing

Component tests are located in `__tests__/`:

- `Pagination.test.tsx` - Pagination component tests

## Usage Guidelines

1. **Import components** from their individual files:
   ```tsx
   import { Modal } from '../components/Modal';
   import Pagination from '../components/Pagination';
   ```

2. **Chart components** have a barrel export:
   ```tsx
   import { AttendanceGauge, SectionBarChart } from '../components/charts';
   ```

3. **PDF Annotation** has its own entry point:
   ```tsx
   import { PdfAnnotator } from '../components/PdfAnnotation';
   ```

4. **Follow existing patterns** for new components - check similar components for conventions
