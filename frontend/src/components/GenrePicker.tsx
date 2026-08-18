/**
 * Genre Picker Component (WP5)
 *
 * Multi-select component for selecting genres from JSKOS vocabulary.
 */

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useGenres } from '../hooks/useVocabulary';
import { Icon } from './Icon';

interface GenrePickerProps {
  value: string[]; // Array of genre URIs
  onChange: (uris: string[]) => void;
  disabled?: boolean;
}

export function GenrePicker({ value, onChange, disabled }: GenrePickerProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const { data: genresData, isLoading } = useGenres();
  const genres = genresData?.genres || [];

  const lang = i18n.language === 'nl' ? 'nl' : i18n.language === 'de' ? 'de' : 'en';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
      });
    }
  }, [isOpen]);

  const filteredGenres = filter
    ? genres.filter((g) => {
        const label = (g.labels[lang] || g.label || '').toLowerCase();
        return label.includes(filter.toLowerCase());
      })
    : genres;

  const selectedGenres = genres.filter((g) => value.includes(g.uri));

  const handleToggle = (uri: string) => {
    if (value.includes(uri)) {
      onChange(value.filter((u) => u !== uri));
    } else {
      onChange([...value, uri]);
    }
  };

  const handleRemove = (uri: string) => {
    onChange(value.filter((u) => u !== uri));
  };

  return (
    <div className="space-y-2">
      {/* Selected genres */}
      {selectedGenres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedGenres.map((genre) => (
            <div key={genre.uri} className="badge badge-secondary badge-lg gap-1">
              <span>{genre.labels[lang] || genre.label}</span>
              <button
                type="button"
                onClick={() => handleRemove(genre.uri)}
                className="hover:text-error"
                disabled={disabled}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dropdown */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-outline w-full justify-between"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || isLoading}
        >
          <span className="flex items-center gap-2">
            <Icon name="music" size={16} />
            {t('metadata.selectGenres')}
          </span>
          <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={16} />
        </button>

        {isOpen &&
          createPortal(
            <div ref={dropdownRef} style={dropdownStyle}>
              {/* Filter input */}
              <div style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <input
                  type="text"
                  className="input input-sm input-bordered w-full"
                  placeholder={t('metadata.filterGenres')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  autoFocus
                  style={{ backgroundColor: '#fff' }}
                />
              </div>

              {/* Genre list */}
              <ul
                style={{
                  maxHeight: '15rem',
                  overflowY: 'auto',
                  padding: '0.25rem',
                  margin: 0,
                  listStyle: 'none',
                  backgroundColor: '#fff',
                }}
              >
                {isLoading ? (
                  <li style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                    <span className="loading loading-spinner loading-sm" />
                  </li>
                ) : filteredGenres.length === 0 ? (
                  <li style={{ padding: '0.5rem 1rem', color: '#6b7280' }}>{t('metadata.noResults')}</li>
                ) : (
                  filteredGenres.map((genre) => {
                    const isSelected = value.includes(genre.uri);
                    return (
                      <li key={genre.uri}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            backgroundColor: '#fff',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#fff')}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(genre.uri)}
                            style={{ width: '1rem', height: '1rem' }}
                          />
                          <span>{genre.labels[lang] || genre.label}</span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>

              {/* Actions */}
              <div
                style={{
                  padding: '0.5rem',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                }}
              >
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>
                  {t('common.clear')}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setIsOpen(false)}>
                  {t('common.done')}
                </button>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}
