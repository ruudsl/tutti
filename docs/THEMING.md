# Theming Guide

This guide explains how to customize the appearance of Harmonie, including colors, typography, dark mode, and branding.

## Table of Contents

1. [CSS Custom Properties](#css-custom-properties)
2. [Color Customization](#color-customization)
3. [Dark Mode Support](#dark-mode-support)
4. [Logo and Branding](#logo-and-branding)
5. [Font Customization](#font-customization)
6. [Component Styling](#component-styling)
7. [Advanced Customization](#advanced-customization)

---

## CSS Custom Properties

Harmonie uses CSS custom properties (CSS variables) for all design tokens. This makes it easy to customize the appearance by overriding these variables.

### Design Token Categories

The design system is organized into these categories:

- **Colors**: Primary, secondary, semantic colors
- **Surfaces**: Backgrounds, cards, overlays
- **Text**: Text colors with WCAG contrast
- **Borders & Shadows**: Border colors and elevation shadows
- **Typography**: Font families, sizes, weights
- **Spacing**: Consistent spacing scale (8pt grid)
- **Radius**: Border radius for different elements
- **Transitions**: Animation timing and easing
- **Z-Index**: Layering scale

### All Available Properties

```css
:root {
  /* === Colors (2026 palette: indigo core with violet accent) === */
  --primary: #4f46e5;           /* Main brand color */
  --primary-dark: #4338ca;      /* Darker variant for hover/active */
  --primary-light: rgba(79, 70, 229, 0.1); /* Light tint for backgrounds */
  --accent: #8b5cf6;            /* Accent color (purple) */
  --gradient-brand: linear-gradient(135deg, #4f46e5 0%, #8b5cf6 100%);
  
  --secondary: #64748b;         /* Secondary/muted color */
  --success: #10b981;           /* Success states */
  --success-light: rgba(16, 185, 129, 0.1);
  --danger: #ef4444;            /* Error/destructive actions */
  --danger-light: rgba(239, 68, 68, 0.1);
  --warning: #f59e0b;           /* Warning states */
  --warning-light: rgba(245, 158, 11, 0.1);
  --info: #3b82f6;              /* Informational */
  --info-light: rgba(59, 130, 246, 0.1);

  /* === Surfaces === */
  --background: #f7f7fb;        /* Page background */
  --surface: #ffffff;           /* Card/panel background */
  --surface-hover: #f1f1f7;     /* Hover state for surfaces */
  --surface-glass: rgba(255, 255, 255, 0.72); /* Glassmorphism effect */
  --glass-blur: saturate(180%) blur(16px);

  /* === Text (WCAG 2.1 AA compliant) === */
  --text: #1a1d2e;              /* Primary text (AAA on white) */
  --text-light: #45495e;        /* Secondary text (AA on white) */
  --text-muted: #696e85;        /* Muted/placeholder text (AA on white) */

  /* === Borders & Shadows === */
  --border: #e6e6ef;            /* Default border */
  --border-strong: #cdcdde;     /* Stronger border for emphasis */
  --shadow: 0 1px 2px rgba(23, 23, 42, 0.05), 0 1px 4px rgba(23, 23, 42, 0.04);
  --shadow-md: 0 2px 4px rgba(23, 23, 42, 0.05), 0 6px 16px rgba(23, 23, 42, 0.06);
  --shadow-lg: 0 4px 8px rgba(23, 23, 42, 0.06), 0 12px 28px rgba(23, 23, 42, 0.09);
  --shadow-xl: 0 8px 16px rgba(23, 23, 42, 0.08), 0 24px 48px rgba(23, 23, 42, 0.12);
  --focus-ring: 0 0 0 3px rgba(79, 70, 229, 0.35);

  /* === Typography === */
  --font-family: 'Inter', 'Inter Variable', -apple-system, BlinkMacSystemFont, 
                 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  --font-size-base: 16px;
  --font-size-xs: 0.75rem;      /* 12px */
  --font-size-sm: 0.875rem;     /* 14px */
  --font-size-md: 1rem;         /* 16px */
  --font-size-lg: 1.125rem;     /* 18px */
  --font-size-xl: 1.25rem;      /* 20px */
  --font-size-2xl: 1.5rem;      /* 24px */
  --font-size-3xl: 2rem;        /* 32px */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --line-height-tight: 1.25;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.6;

  /* === Spacing (8pt grid, 4pt for fine adjustments) === */
  --space-0: 0;
  --space-1: 0.25rem;           /* 4px */
  --space-2: 0.5rem;            /* 8px */
  --space-3: 0.75rem;           /* 12px */
  --space-4: 1rem;              /* 16px */
  --space-5: 1.25rem;           /* 20px */
  --space-6: 1.5rem;            /* 24px */
  --space-8: 2rem;              /* 32px */
  --space-10: 2.5rem;           /* 40px */
  --space-12: 3rem;             /* 48px */
  --space-16: 4rem;             /* 64px */
  --space-20: 5rem;             /* 80px */

  /* === Border Radius (iOS HIG aligned) === */
  --radius: 0.875rem;           /* 14px - cards, panels */
  --radius-sm: 0.625rem;        /* 10px - buttons, inputs */
  --radius-lg: 1rem;            /* 16px - modals, large surfaces */
  --radius-xl: 1.25rem;         /* 20px - sheets, prominent containers */
  --radius-full: 9999px;        /* Fully rounded (pills) */

  /* === Touch Target (iOS HIG: 44x44pt minimum) === */
  --tap-target: 44px;

  /* === Transitions (iOS HIG easing) === */
  --ease-out: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-in-out: cubic-bezier(0.42, 0, 0.58, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-fast: 150ms var(--ease-out);
  --transition-normal: 250ms var(--ease-out);
  --transition-slow: 350ms var(--ease-out);

  /* === Z-Index Scale === */
  --z-dropdown: 50;
  --z-sticky: 100;
  --z-overlay: 200;
  --z-modal: 300;
  --z-toast: 400;
}
```

---

## Color Customization

### Changing the Primary Color

To change the brand color throughout the application, override the primary color variables:

```css
/* Custom theme - Green brand color */
:root {
  --primary: #059669;
  --primary-dark: #047857;
  --primary-light: rgba(5, 150, 105, 0.1);
  --accent: #10b981;
  --gradient-brand: linear-gradient(135deg, #059669 0%, #10b981 100%);
  --focus-ring: 0 0 0 3px rgba(5, 150, 105, 0.35);
}
```

### Creating a Complete Color Theme

For a cohesive theme, update all related colors:

```css
/* Example: Blue theme */
:root {
  /* Primary colors */
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --primary-light: rgba(37, 99, 235, 0.1);
  --accent: #3b82f6;
  --gradient-brand: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
  
  /* Update focus ring to match */
  --focus-ring: 0 0 0 3px rgba(37, 99, 235, 0.35);
  
  /* Optional: adjust backgrounds for cohesion */
  --background: #f8fafc;
}
```

### Association-Specific Theming

Associations can set their brand colors in the admin panel. These are applied via inline styles:

```html
<style>
  :root {
    --primary: var(--association-primary, #4f46e5);
    --primary-dark: var(--association-primary-dark, #4338ca);
  }
</style>
```

---

## Dark Mode Support

### Automatic Dark Mode

Harmonie supports automatic dark mode based on system preferences:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0f172a;
    --surface: #1e293b;
    --surface-hover: #334155;
    --text: #f1f5f9;
    --text-light: #cbd5e1;
    --text-muted: #94a3b8;
    --border: #334155;
    --border-strong: #475569;
    /* ... other dark mode overrides */
  }
}
```

### Manual Dark Mode Toggle

Users can toggle dark mode manually. The `data-theme` attribute is added to the root element:

```css
/* Dark mode via attribute */
[data-theme="dark"] {
  --background: #0f172a;
  --surface: #1e293b;
  --surface-hover: #334155;
  --surface-glass: rgba(30, 41, 59, 0.72);
  
  --text: #f1f5f9;
  --text-light: #cbd5e1;
  --text-muted: #94a3b8;
  
  --border: #334155;
  --border-strong: #475569;
  
  /* Shadows are more subtle in dark mode */
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 8px 16px rgba(0, 0, 0, 0.35);
}
```

### Dark Mode for Specific Components

Some components have specific dark mode styles:

```css
/* Sidebar in dark mode */
[data-theme="dark"] .app-sidebar {
  background: var(--surface);
}

[data-theme="dark"] .sidebar-direct-link:hover,
[data-theme="dark"] .sidebar-sub-link:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Login card in dark mode */
[data-theme="dark"] .login-card {
  background: rgba(30, 41, 59, 0.72);
  border-color: rgba(255, 255, 255, 0.08);
}
```

### Preserving User Preference

Dark mode preference is stored in local storage and a cookie for server-side rendering:

```javascript
// Get current theme
const theme = localStorage.getItem('theme') || 'system';

// Set theme
localStorage.setItem('theme', 'dark');
document.documentElement.setAttribute('data-theme', 'dark');
```

---

## Logo and Branding

### Application Logo

The logo is displayed in the sidebar and login page. To customize:

1. **Replace logo files:**
   ```
   frontend/public/logo.svg        # Main logo (sidebar)
   frontend/public/logo-light.svg  # Logo for dark backgrounds
   frontend/public/logo-icon.svg   # Icon-only version (mobile)
   ```

2. **Or configure via environment/database:**
   ```env
   # Frontend environment
   VITE_LOGO_URL=/custom-logo.svg
   VITE_APP_NAME="My Orchestra"
   ```

### PWA Icons

For Progressive Web App support, update the manifest icons:

```
frontend/public/icon-192.png
frontend/public/icon-512.png
frontend/public/apple-touch-icon.png
```

Update `manifest.json`:
```json
{
  "name": "My Orchestra",
  "short_name": "Orchestra",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#4f46e5",
  "background_color": "#f7f7fb"
}
```

### Favicon

Replace the favicon in `frontend/public/`:
```
frontend/public/favicon.ico
frontend/public/favicon.svg
```

### Per-Association Branding

Associations can upload their logo in Admin > Settings > Branding. The logo is stored in:
```
uploads/association-logos/{association-id}/logo.png
```

---

## Font Customization

### Default Font Stack

Harmonie uses Inter as the primary font with system font fallbacks:

```css
--font-family: 'Inter', 'Inter Variable', -apple-system, BlinkMacSystemFont, 
               'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
```

### Using a Custom Font

1. **Import the font** (in `index.html` or CSS):
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
   ```

2. **Override the font variable:**
   ```css
   :root {
     --font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
   }
   ```

### Self-Hosting Fonts

For privacy/GDPR compliance, self-host fonts:

1. Download font files (WOFF2 format recommended)
2. Place in `frontend/public/fonts/`
3. Add @font-face declarations:

```css
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/CustomFont-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/CustomFont-Medium.woff2') format('woff2');
  font-weight: 500;
  font-display: swap;
}

@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/CustomFont-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}

@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/CustomFont-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}

:root {
  --font-family: 'CustomFont', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

### Adjusting Font Sizes

Override the font size scale:

```css
:root {
  --font-size-base: 15px;       /* Slightly smaller base */
  --font-size-xs: 0.7333rem;    /* 11px */
  --font-size-sm: 0.8667rem;    /* 13px */
  /* ... adjust others as needed */
}
```

---

## Component Styling

### Buttons

```css
/* Custom button style */
.btn-primary {
  background: var(--gradient-brand);
  border-radius: var(--radius-full);  /* Pill-shaped buttons */
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}
```

### Cards

```css
/* Custom card style */
.card {
  border-radius: var(--radius-lg);
  border: none;
  box-shadow: var(--shadow-md);
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
/* Custom input style */
.form-control {
  border-radius: var(--radius-full);
  padding: 0.75rem 1.25rem;
  border: 2px solid var(--border);
}

.form-control:focus {
  border-color: var(--primary);
  box-shadow: var(--focus-ring);
}
```

### Tables

```css
/* Striped tables */
.table tr:nth-child(even) {
  background: var(--background);
}

/* Borderless tables */
.table.borderless th,
.table.borderless td {
  border: none;
}
```

---

## Advanced Customization

### Creating a Theme File

Create a separate CSS file for your theme:

```css
/* custom-theme.css */

/* Color overrides */
:root {
  --primary: #7c3aed;
  --primary-dark: #6d28d9;
  --primary-light: rgba(124, 58, 237, 0.1);
  --accent: #a78bfa;
  --gradient-brand: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%);
}

/* Component customizations */
.btn {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: var(--font-weight-semibold);
}

.card {
  border: 2px solid var(--border);
}

/* Custom animations */
@keyframes custom-fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.modal {
  animation: custom-fade-in 200ms var(--ease-out);
}
```

Import in your main CSS:
```css
@import './custom-theme.css';
```

### CSS-in-JS Theming

If using styled-components or similar:

```typescript
// theme.ts
export const theme = {
  colors: {
    primary: '#4f46e5',
    primaryDark: '#4338ca',
    primaryLight: 'rgba(79, 70, 229, 0.1)',
    // ...
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    // ...
  },
  // ...
};
```

### Responsive Adjustments

The design adapts to different screen sizes:

```css
/* Mobile adjustments */
@media (max-width: 768px) {
  :root {
    --font-size-base: 15px;
    --space-4: 0.875rem;
  }
  
  .card {
    border-radius: var(--radius);
  }
}

/* Large screens */
@media (min-width: 1440px) {
  .main-content {
    max-width: 1400px;
  }
}
```

### Print Styles

For print-friendly output:

```css
@media print {
  :root {
    --background: white;
    --surface: white;
    --text: black;
    --shadow: none;
  }
  
  .app-sidebar,
  .mobile-bottom-tabs,
  .btn {
    display: none !important;
  }
  
  .main-content {
    max-width: none;
    padding: 0;
  }
}
```

### Reduced Motion

For users who prefer reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Best Practices

### 1. Maintain WCAG Contrast

When changing colors, ensure text contrast meets WCAG 2.1 AA standards:
- Normal text: 4.5:1 contrast ratio
- Large text (18px+ or 14px+ bold): 3:1 contrast ratio

Tools:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Colorable](https://colorable.jxnblk.com/)

### 2. Test Both Themes

Always test customizations in both light and dark mode.

### 3. Use Semantic Variables

Instead of hardcoding colors:
```css
/* Bad */
.alert { background: #fee2e2; color: #991b1b; }

/* Good */
.alert { background: var(--danger-light); color: var(--danger); }
```

### 4. Respect the 8pt Grid

Keep spacing consistent with the 8pt grid system:
```css
/* Good - uses spacing scale */
.custom-component {
  padding: var(--space-4) var(--space-6);
  margin-bottom: var(--space-8);
}

/* Avoid - arbitrary values */
.custom-component {
  padding: 13px 27px;
  margin-bottom: 35px;
}
```

### 5. Test Touch Targets

Ensure all interactive elements meet the 44x44px minimum tap target:
```css
.btn, .nav-link, .checkbox-item {
  min-height: var(--tap-target);
  min-width: var(--tap-target);
}
```

---

## Reference Files

- Main stylesheet: `frontend/src/index.css`
- Theme additions: `frontend/src/styles/theme-2026.css`
- Component styles: `frontend/src/components/*.css`
- Page-specific styles: `frontend/src/pages/*.css`
