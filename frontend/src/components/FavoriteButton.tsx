import { useFavorites, useFavoriteStatus } from '../hooks/useFavorites';

interface FavoriteButtonProps {
  musicTitleId: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function FavoriteButton({ musicTitleId, size = 'md', showLabel = false }: FavoriteButtonProps) {
  const { toggleFavorite, isToggling, isFavorite: checkIsFavorite } = useFavorites();
  const { isFavorite: statusFavorite, isLoading } = useFavoriteStatus(musicTitleId);

  // Use the status from the hook if we have it, otherwise check from favorites list
  const isFavorite = statusFavorite || checkIsFavorite(musicTitleId);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await toggleFavorite(musicTitleId, isFavorite);
  };

  const sizes = {
    sm: { fontSize: '1rem', padding: '0.25rem' },
    md: { fontSize: '1.25rem', padding: '0.5rem' },
    lg: { fontSize: '1.5rem', padding: '0.75rem' },
  };

  return (
    <button
      onClick={handleClick}
      disabled={isToggling || isLoading}
      title={isFavorite ? 'Verwijderen uit favorieten' : 'Toevoegen aan favorieten'}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: isToggling ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        ...sizes[size],
        color: isFavorite ? 'var(--danger)' : 'var(--text-light)',
        transition: 'color 0.2s, transform 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      <span>{isFavorite ? '♥' : '♡'}</span>
      {showLabel && <span style={{ fontSize: '0.875rem' }}>{isFavorite ? 'Favoriet' : 'Favoriet'}</span>}
    </button>
  );
}
