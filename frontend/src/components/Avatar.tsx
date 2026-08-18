import { useState, useMemo } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

interface AvatarProps {
  /** Full name to extract initials from */
  name: string;
  /** Profile photo URL (optional) */
  src?: string | null;
  /** Alt text for image (defaults to name) */
  alt?: string;
  /** Size variant */
  size?: AvatarSize;
  /** Online status indicator */
  status?: AvatarStatus;
  /** Additional CSS class */
  className?: string;
  /** Make avatar interactive (adds hover effects) */
  interactive?: boolean;
  /** Click handler for interactive avatars */
  onClick?: () => void;
}

/**
 * Generate a consistent color from a string (name).
 * Returns a hue value for HSL color.
 */
function generateColorFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Return hue between 0-360, avoiding red (danger color) range
  const hue = (Math.abs(hash) % 300) + 30; // Skip 0-30 (reds) and 330-360 (reds)
  return hue > 330 ? hue - 300 : hue;
}

/**
 * Extract initials from a name.
 * - "Jan de Vries" → "JV"
 * - "Anna" → "A"
 * - "Jan Willem van der Berg" → "JB"
 */
function getInitials(name: string): string {
  if (!name) return '?';

  // Common Dutch prefixes to skip
  const skipWords = ['de', 'van', 'der', 'het', 'den', 'ter', 'te', 'ten'];

  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => !skipWords.includes(word.toLowerCase()));

  if (words.length === 0) {
    // If all words were skipped, use first letter of original name
    return name.charAt(0).toUpperCase();
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // First and last significant word
  const first = words[0].charAt(0).toUpperCase();
  const last = words[words.length - 1].charAt(0).toUpperCase();
  return first + last;
}

/**
 * Avatar component that displays a user's profile photo or their initials
 * as a fallback with a consistent color based on their name.
 *
 * @example
 * ```tsx
 * // With photo
 * <Avatar name="Jan de Vries" src="/photos/jan.jpg" size="lg" />
 *
 * // Initials fallback
 * <Avatar name="Jan de Vries" size="md" />
 *
 * // With status indicator
 * <Avatar name="Anna Bakker" status="online" />
 *
 * // Interactive avatar
 * <Avatar
 *   name="Piet Jansen"
 *   src="/photos/piet.jpg"
 *   interactive
 *   onClick={() => openProfile(userId)}
 * />
 * ```
 */
export function Avatar({
  name,
  src,
  alt,
  size = 'md',
  status,
  className = '',
  interactive = false,
  onClick,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const initials = useMemo(() => getInitials(name), [name]);
  const hue = useMemo(() => generateColorFromName(name), [name]);

  const showImage = src && !imageError;

  // Generate background color for initials
  const backgroundColor = `hsl(${hue}, 45%, 55%)`;
  const darkBackgroundColor = `hsl(${hue}, 35%, 40%)`;

  const handleImageError = () => {
    setImageError(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (interactive && onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  const interactiveProps = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: handleKeyDown,
        'aria-label': `Bekijk profiel van ${name}`,
      }
    : {};

  return (
    <div
      className={`avatar avatar-${size} ${interactive ? 'avatar-interactive' : ''} ${className}`}
      style={
        showImage
          ? undefined
          : {
              backgroundColor,
              color: 'white',
            }
      }
      title={name}
      {...interactiveProps}
    >
      {showImage ? (
        <img src={src} alt={alt || name} onError={handleImageError} loading="lazy" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}

      {status && <span className={`avatar-status avatar-status-${status}`} aria-label={getStatusLabel(status)} />}

      {/* Dark mode background color override via CSS custom property */}
      <style>{`
        [data-theme="dark"] .avatar-${size}[style*="background-color: hsl(${hue}"] {
          background-color: ${darkBackgroundColor} !important;
        }
      `}</style>
    </div>
  );
}

/**
 * Get Dutch status label for accessibility
 */
function getStatusLabel(status: AvatarStatus): string {
  const labels: Record<AvatarStatus, string> = {
    online: 'Online',
    offline: 'Offline',
    busy: 'Niet storen',
    away: 'Afwezig',
  };
  return labels[status];
}

/**
 * Avatar group component for showing multiple avatars with overlap
 */
interface AvatarGroupProps {
  /** Array of avatar data */
  avatars: Array<{
    name: string;
    src?: string | null;
  }>;
  /** Maximum avatars to show before +N indicator */
  max?: number;
  /** Size for all avatars */
  size?: AvatarSize;
  /** Additional CSS class */
  className?: string;
}

export function AvatarGroup({ avatars, max = 4, size = 'sm', className = '' }: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div
      className={`avatar-group ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {visibleAvatars.map((avatar, index) => (
        <div
          key={index}
          style={{
            marginLeft: index === 0 ? 0 : '-8px',
            zIndex: visibleAvatars.length - index,
            position: 'relative',
          }}
        >
          <Avatar name={avatar.name} src={avatar.src} size={size} className="avatar-group-item" />
        </div>
      ))}

      {remainingCount > 0 && (
        <div
          className={`avatar avatar-${size}`}
          style={{
            marginLeft: '-8px',
            backgroundColor: 'var(--text-muted)',
            color: 'white',
            zIndex: 0,
            position: 'relative',
            fontSize: size === 'sm' ? '0.625rem' : undefined,
          }}
          title={`En nog ${remainingCount} anderen`}
        >
          <span>+{remainingCount}</span>
        </div>
      )}
    </div>
  );
}

export default Avatar;
