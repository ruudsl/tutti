import { useState, useEffect, CSSProperties, ImgHTMLAttributes, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLazyLoad } from '../hooks/useLazyLoad';

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'onError'> {
  /**
   * The image source URL.
   */
  src: string;
  /**
   * Alternative text for the image (accessibility).
   */
  alt: string;
  /**
   * Optional placeholder image or data URL to show while loading.
   * If not provided, a grey placeholder will be shown.
   */
  placeholder?: string;
  /**
   * Optional blur placeholder (low-res base64 image for blur-up effect).
   */
  blurPlaceholder?: string;
  /**
   * Width of the image (helps prevent layout shift).
   */
  width?: number | string;
  /**
   * Height of the image (helps prevent layout shift).
   */
  height?: number | string;
  /**
   * Aspect ratio (e.g., "16/9", "4/3", "1/1").
   * Used to maintain space while loading if width/height not provided.
   */
  aspectRatio?: string;
  /**
   * Background color for the placeholder.
   */
  placeholderColor?: string;
  /**
   * IntersectionObserver root margin for preloading.
   */
  rootMargin?: string;
  /**
   * Callback when image loads successfully.
   */
  onLoad?: () => void;
  /**
   * Callback when image fails to load.
   */
  onError?: () => void;
  /**
   * Custom styles for the container.
   */
  containerStyle?: CSSProperties;
  /**
   * Custom className for the container.
   */
  containerClassName?: string;
  /**
   * Object-fit CSS property for the image.
   */
  objectFit?: CSSProperties['objectFit'];
  /**
   * Whether to show a loading spinner.
   */
  showSpinner?: boolean;
}

type ImageLoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * LazyImage component that defers image loading until the element enters the viewport.
 * Features:
 * - Uses IntersectionObserver for efficient lazy loading
 * - Supports placeholder images and blur-up effect
 * - Prevents layout shift with aspect ratio or explicit dimensions
 * - Smooth fade-in animation when image loads
 *
 * @example
 * <LazyImage
 *   src="/images/large-photo.jpg"
 *   alt="Photo description"
 *   aspectRatio="16/9"
 *   placeholderColor="#f0f0f0"
 * />
 */
export const LazyImage = memo(function LazyImage({
  src,
  alt,
  placeholder,
  blurPlaceholder,
  width,
  height,
  aspectRatio,
  placeholderColor = 'var(--border, #e5e7eb)',
  rootMargin = '100px',
  onLoad,
  onError,
  containerStyle,
  containerClassName,
  objectFit = 'cover',
  showSpinner = false,
  className,
  style,
  ...imgProps
}: LazyImageProps) {
  const { t } = useTranslation();
  const { ref, isVisible } = useLazyLoad({ rootMargin });
  const [loadState, setLoadState] = useState<ImageLoadState>('idle');

  // Start loading when element becomes visible
  useEffect(() => {
    if (isVisible && loadState === 'idle') {
      setLoadState('loading');
    }
  }, [isVisible, loadState]);

  const handleLoad = () => {
    setLoadState('loaded');
    onLoad?.();
  };

  const handleError = () => {
    setLoadState('error');
    onError?.();
  };

  // Container styles to prevent layout shift
  const containerStyles: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: width ?? '100%',
    height: height ?? (aspectRatio ? 'auto' : '100%'),
    aspectRatio: !height ? aspectRatio : undefined,
    backgroundColor: placeholderColor,
    ...containerStyle,
  };

  // Image styles
  const imageStyles: CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit,
    opacity: loadState === 'loaded' ? 1 : 0,
    transition: 'opacity 0.3s ease-in-out',
    ...style,
  };

  // Placeholder/blur styles
  const placeholderStyles: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit,
    filter: blurPlaceholder ? 'blur(10px)' : 'none',
    transform: blurPlaceholder ? 'scale(1.1)' : 'none', // Prevent blur edges
    opacity: loadState === 'loaded' ? 0 : 1,
    transition: 'opacity 0.3s ease-in-out',
  };

  // Spinner styles
  const spinnerStyles: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '24px',
    height: '24px',
    border: '2px solid var(--border, #e5e7eb)',
    borderTopColor: 'var(--primary, #3b82f6)',
    borderRadius: '50%',
    animation: 'lazy-image-spin 0.8s linear infinite',
    opacity: loadState === 'loading' ? 1 : 0,
    transition: 'opacity 0.2s ease-in-out',
  };

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={containerClassName}
      style={containerStyles}
    >
      {/* Placeholder/blur image */}
      {(placeholder || blurPlaceholder) && loadState !== 'loaded' && (
        <img
          src={blurPlaceholder || placeholder}
          alt=""
          aria-hidden="true"
          style={placeholderStyles}
        />
      )}

      {/* Loading spinner */}
      {showSpinner && loadState === 'loading' && (
        <>
          <style>
            {`
              @keyframes lazy-image-spin {
                from { transform: translate(-50%, -50%) rotate(0deg); }
                to { transform: translate(-50%, -50%) rotate(360deg); }
              }
            `}
          </style>
          <div style={spinnerStyles} aria-hidden="true" />
        </>
      )}

      {/* Actual image - only render after visibility detected */}
      {loadState !== 'idle' && (
        <img
          {...imgProps}
          src={src}
          alt={alt}
          className={className}
          style={imageStyles}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy" // Native lazy loading as fallback
          decoding="async"
        />
      )}

      {/* Error state */}
      {loadState === 'error' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--text-light, #6b7280)',
            fontSize: '0.75rem',
            textAlign: 'center',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ margin: '0 auto 4px' }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>{t('lazyImage.notLoaded')}</span>
        </div>
      )}
    </div>
  );
});

/**
 * Simple lazy loading wrapper for any image without placeholder features.
 * Use when you don't need placeholder/blur effects.
 */
export const SimpleLazyImage = memo(function SimpleLazyImage({
  src,
  alt,
  rootMargin = '100px',
  ...imgProps
}: Omit<LazyImageProps, 'placeholder' | 'blurPlaceholder' | 'containerStyle' | 'containerClassName' | 'showSpinner'>) {
  const { ref, isVisible } = useLazyLoad({ rootMargin });

  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>} style={{ display: 'inline-block' }}>
      {isVisible ? (
        <img
          {...imgProps}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          style={{
            display: 'inline-block',
            width: imgProps.width ?? 'auto',
            height: imgProps.height ?? 'auto',
            backgroundColor: 'var(--border, #e5e7eb)',
          }}
          aria-hidden="true"
        />
      )}
    </span>
  );
});

export default LazyImage;
