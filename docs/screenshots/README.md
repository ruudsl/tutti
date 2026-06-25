# Screenshots Documentation

This directory contains screenshots used in Harmonie's documentation, marketing materials, and help guides.

## What Screenshots Should Be Captured

Screenshots should showcase the key features and user interfaces of the Harmonie application. They serve multiple purposes:

- **Documentation**: Help users understand how to use the application
- **Marketing**: Showcase features on the website and promotional materials
- **Support**: Aid in troubleshooting and user guidance
- **Development**: Visual reference for UI consistency

## Naming Convention

Screenshots should follow this naming pattern:

```
[feature]-[variant]-[breakpoint].png
```

### Components:

- **feature**: The main feature or page name (lowercase, kebab-case)
  - Examples: `dashboard`, `music-library`, `rehearsal-calendar`
- **variant**: Optional state or view variant
  - Examples: `empty`, `filled`, `hover`, `modal-open`
- **breakpoint**: Device/viewport size
  - `desktop` (1920x1080 or 1440x900)
  - `tablet` (1024x768)
  - `mobile` (375x812)

### Examples:

```
dashboard-desktop.png
dashboard-mobile.png
music-library-empty-desktop.png
concert-management-modal-open-desktop.png
login-desktop.png
login-mobile.png
```

## Resolution Requirements

### Desktop Screenshots
- **Primary resolution**: 1920x1080 (Full HD)
- **Alternative**: 1440x900 (common laptop resolution)
- **Format**: PNG (for UI screenshots with text)
- **DPI**: 2x (Retina) preferred, 1x acceptable

### Tablet Screenshots
- **Resolution**: 1024x768
- **Format**: PNG
- **DPI**: 2x preferred

### Mobile Screenshots
- **Resolution**: 375x812 (iPhone X/11/12/13/14 viewport)
- **Alternative**: 390x844 (iPhone 12/13/14 Pro)
- **Format**: PNG
- **DPI**: 3x preferred for mobile

### General Guidelines
- Maximum file size: 2MB per screenshot
- Use PNG for UI with text (lossless)
- Use WebP for documentation site (smaller file size)
- No personal or sensitive data visible in screenshots
- Use demo/sample data, not real user information

## How to Update Screenshots

### Prerequisites
1. Ensure you have access to a development or staging environment
2. Use a consistent browser (Chrome recommended) with DevTools
3. Disable browser extensions that may affect the UI
4. Use the demo/seed data for consistent content

### Steps to Capture Screenshots

1. **Set up the environment**
   ```bash
   # Start the development server
   npm run dev
   
   # Or use the staging environment
   # https://staging.harmonie-app.nl
   ```

2. **Configure the browser**
   - Open Chrome DevTools (F12)
   - Use Device Toolbar (Ctrl+Shift+M) for responsive views
   - Set the viewport to the required resolution
   - Set device pixel ratio in DevTools settings

3. **Prepare the view**
   - Log in with the demo account
   - Navigate to the feature/page
   - Ensure all data is loaded
   - Set any required state (modals, selections, etc.)

4. **Capture the screenshot**
   - Use DevTools: Three dots menu > Capture screenshot
   - Or use the keyboard shortcut (varies by OS)
   - For full-page screenshots: Capture full size screenshot

5. **Post-processing (if needed)**
   - Crop to remove unnecessary whitespace
   - Optimize file size (use tools like ImageOptim, TinyPNG)
   - Ensure consistent dimensions within each category

6. **Save and commit**
   ```bash
   # Save to docs/screenshots/ with proper naming
   mv screenshot.png docs/screenshots/dashboard-desktop.png
   
   # Commit the changes
   git add docs/screenshots/
   git commit -m "docs: update [feature] screenshots"
   ```

### Automated Screenshot Capture (Future)

Consider setting up automated screenshot capture using:
- Playwright or Puppeteer scripts
- Storybook with Chromatic
- Percy or similar visual testing tools

## Recommended Screenshots

The following screenshots should be maintained for comprehensive documentation:

### Core Pages

| Screenshot | Desktop | Mobile | Description |
|------------|---------|--------|-------------|
| Dashboard | Required | Required | Main dashboard with statistics and overview |
| Music Library | Required | Required | List of music pieces with search/filter |
| Rehearsal Calendar | Required | Required | Calendar view with rehearsal events |
| Concert Management | Required | Optional | Concert planning and management interface |
| Ticket Sales | Required | Optional | Ticket sales overview and management |
| Stage Designer | Required | N/A | Interactive stage layout designer |
| Settings | Required | Required | Application settings page |
| Login | Required | Required | Authentication page |

### Mobile PWA Views

| Screenshot | Description |
|------------|-------------|
| PWA Home Screen | App installed on home screen |
| PWA Splash Screen | Loading/splash screen |
| PWA Offline State | Offline indicator or fallback UI |
| PWA Navigation | Mobile navigation menu |

### Feature States

| Screenshot | Description |
|------------|-------------|
| Empty States | Pages with no data (onboarding experience) |
| Error States | Error messages and fallback UI |
| Loading States | Skeleton loaders or spinners |
| Modal Dialogs | Important modals (confirmation, forms) |

## Current Screenshots

The following screenshots are currently available:

- `dashboard.png` - Dashboard overview with stats
- `music-pieces.png` - Music pieces list/table
- `upload.png` - Upload page with drag and drop
- `music-lists.png` - Music list manager (3-column view)
- `instrumentbeheer.png` - Instrument management
- `tools.png` - Tools/utilities page

## Maintenance

- Review screenshots quarterly or after major UI changes
- Update screenshots when features are added or modified
- Archive old screenshots in a separate branch if needed for reference
- Keep this README updated with any new screenshot requirements
