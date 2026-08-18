import { ReactNode } from 'react';
import { Icon, IconName } from './Icon';

export type EmptyStateVariant = 'no-items' | 'no-results' | 'error' | 'no-access';

interface EmptyStateProps {
  /** The variant determines the default icon and message */
  variant?: EmptyStateVariant;
  /** Custom icon name (overrides variant default) */
  icon?: IconName;
  /** Main message to display */
  title?: string;
  /** Description text below the title */
  description?: string;
  /** Action button text */
  actionLabel?: string;
  /** Action button click handler */
  onAction?: () => void;
  /** Custom content to render instead of action button */
  children?: ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const variantDefaults: Record<EmptyStateVariant, { icon: IconName; title: string; description: string }> = {
  'no-items': {
    icon: 'folder',
    title: 'Nog geen items',
    description: 'Er zijn nog geen items toegevoegd aan deze lijst.',
  },
  'no-results': {
    icon: 'search',
    title: 'Geen resultaten',
    description: 'We konden geen resultaten vinden die overeenkomen met je zoekopdracht.',
  },
  error: {
    icon: 'warning',
    title: 'Er ging iets mis',
    description: 'Er is een fout opgetreden bij het laden van de gegevens.',
  },
  'no-access': {
    icon: 'lock',
    title: 'Geen toegang',
    description: 'Je hebt geen toegang tot deze inhoud.',
  },
};

const sizeConfig = {
  sm: { iconSize: 32, titleClass: 'empty-state-title-sm', gap: '0.75rem' },
  md: { iconSize: 48, titleClass: 'empty-state-title-md', gap: '1rem' },
  lg: { iconSize: 64, titleClass: 'empty-state-title-lg', gap: '1.25rem' },
};

/**
 * EmptyState component for displaying friendly messages when lists are empty
 * or when errors occur. Supports multiple variants with customizable content.
 *
 * @example
 * ```tsx
 * // Basic usage with variant
 * <EmptyState variant="no-items" />
 *
 * // With custom message and action
 * <EmptyState
 *   variant="no-items"
 *   title="Geen muziekstukken"
 *   description="Voeg je eerste muziekstuk toe om te beginnen."
 *   actionLabel="Muziekstuk toevoegen"
 *   onAction={() => navigate('/music/new')}
 * />
 *
 * // Custom icon
 * <EmptyState
 *   icon="music"
 *   title="Nog geen nummers"
 *   description="Upload je eerste nummer om te beginnen met oefenen."
 * />
 * ```
 */
export function EmptyState({
  variant = 'no-items',
  icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className = '',
  size = 'md',
}: EmptyStateProps) {
  const defaults = variantDefaults[variant];
  const config = sizeConfig[size];

  const displayIcon = icon ?? defaults.icon;
  const displayTitle = title ?? defaults.title;
  const displayDescription = description ?? defaults.description;

  const isError = variant === 'error';
  const isNoAccess = variant === 'no-access';

  return (
    <div
      className={`empty-state empty-state-${size} ${className}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <div
        className={`empty-state-icon ${isError ? 'empty-state-icon-error' : ''} ${isNoAccess ? 'empty-state-icon-locked' : ''}`}
        aria-hidden="true"
      >
        <Icon name={displayIcon} size={config.iconSize} />
      </div>

      <h3 className={`empty-state-title ${config.titleClass}`}>{displayTitle}</h3>

      {displayDescription && <p className="empty-state-description">{displayDescription}</p>}

      {children}

      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary empty-state-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
