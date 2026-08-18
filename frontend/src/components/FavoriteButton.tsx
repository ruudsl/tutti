import { useTranslation } from 'react-i18next';
import { useFavorites, useFavoriteStatus } from '../hooks/useFavorites';
import { Icon } from './Icon';

interface FavoriteButtonProps {
  musicTitleId: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function FavoriteButton({ musicTitleId, size = 'md', showLabel = false }: FavoriteButtonProps) {
  const { t } = useTranslation();
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
    sm: { iconSize: 16, padding: '0.25rem' },
    md: { iconSize: 20, padding: '0.5rem' },
    lg: { iconSize: 24, padding: '0.75rem' },
  };

  return (
    <button
      onClick={handleClick}
      disabled={isToggling || isLoading}
      title={isFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: isToggling ? 'wait' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: sizes[size].padding,
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
      <Icon name="heart" size={sizes[size].iconSize} className={isFavorite ? 'is-favorite' : ''} />
      {showLabel && <span style={{ fontSize: '0.875rem' }}>{t('favorites.favorite')}</span>}
    </button>
  );
}
