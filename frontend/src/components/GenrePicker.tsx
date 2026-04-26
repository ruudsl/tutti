/**
 * Genre Picker Component (WP5)
 *
 * Multi-select component for selecting genres from JSKOS vocabulary.
 */

import { useState, useRef, useEffect } from 'react';
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: genresData, isLoading } = useGenres();
  const genres = genresData?.genres || [];

  const lang = i18n.language === 'nl' ? 'nl' : i18n.language === 'de' ? 'de' : 'en';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredGenres = filter
    ? genres.filter(g => {
        const label = (g.labels[lang] || g.label || '').toLowerCase();
        return label.includes(filter.toLowerCase());
      })
    : genres;

  const selectedGenres = genres.filter(g => value.includes(g.uri));

  const handleToggle = (uri: string) => {
    if (value.includes(uri)) {
      onChange(value.filter(u => u !== uri));
    } else {
      onChange([...value, uri]);
    }
  };

  const handleRemove = (uri: string) => {
    onChange(value.filter(u => u !== uri));
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
      <div className="relative" ref={dropdownRef}>
        <button
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

        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg">
            {/* Filter input */}
            <div className="p-2 border-b border-base-300">
              <input
                type="text"
                className="input input-sm input-bordered w-full"
                placeholder={t('metadata.filterGenres')}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                autoFocus
              />
            </div>

            {/* Genre list */}
            <ul className="max-h-60 overflow-y-auto p-1">
              {isLoading ? (
                <li className="px-4 py-2 text-center">
                  <span className="loading loading-spinner loading-sm" />
                </li>
              ) : filteredGenres.length === 0 ? (
                <li className="px-4 py-2 text-base-content/60">{t('metadata.noResults')}</li>
              ) : (
                filteredGenres.map((genre) => {
                  const isSelected = value.includes(genre.uri);
                  return (
                    <li key={genre.uri}>
                      <label className="flex items-center gap-2 px-3 py-2 hover:bg-base-200 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={isSelected}
                          onChange={() => handleToggle(genre.uri)}
                        />
                        <span>{genre.labels[lang] || genre.label}</span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Actions */}
            <div className="p-2 border-t border-base-300 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onChange([])}
              >
                {t('common.clear')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsOpen(false)}
              >
                {t('common.done')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
