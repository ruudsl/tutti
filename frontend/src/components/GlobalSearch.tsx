import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSearch, useSearchCategoryLabels, SearchResult, SearchFilters } from '../hooks/useSearch';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

// Icons for each result type
const typeIcons: Record<string, string> = {
  music: '\u266A',
  member: '\u263A',
  orchestra: '\u266B',
  list: '\u2630',
  rehearsal: '\u2315',
  settings: '\u2699',
};

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const categoryLabels = useSearchCategoryLabels();

  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);

  const {
    query,
    setQuery,
    results,
    groupedResults,
    suggestions,
    recentSearches,
    isLoading,
    selectedIndex,
    handleKeyDown,
    getSelectedResult,
    saveRecentSearch,
    deleteRecentSearch,
    clearRecentSearches,
    setSelectedIndex,
  } = useSearch('', filters);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Handle escape key and clicks outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDownGlobal);
    return () => document.removeEventListener('keydown', handleKeyDownGlobal);
  }, [isOpen, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedItem = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Handle result selection
  const handleSelect = useCallback(
    (result: SearchResult) => {
      saveRecentSearch(query);
      navigate(result.path);
      onClose();
    },
    [query, navigate, onClose, saveRecentSearch],
  );

  // Handle Enter key
  const handleEnter = useCallback(() => {
    const selected = getSelectedResult();
    if (selected) {
      handleSelect(selected);
    } else if (results.length > 0) {
      handleSelect(results[0]);
    }
  }, [getSelectedResult, handleSelect, results]);

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    inputRef.current?.focus();
  };

  // Handle recent search click
  const handleRecentClick = (recent: { query: string }) => {
    setQuery(recent.query);
    inputRef.current?.focus();
  };

  // Handle filter change
  const handleFilterChange = (key: keyof SearchFilters, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  // Het nummer waaronder een resultaat bij de toetsenbordbediening bekend
  // staat, is zijn plek in `results` - de ongegroepeerde volgorde zoals de
  // server hem stuurde. `handleKeyDown` telt daarin, en `getSelectedResult`
  // zoekt daarin op.
  //
  // Hier stond een teller die tijdens het tekenen meeliep. Omdat de lijst per
  // soort gegroepeerd getekend wordt, is die tekenvolgorde een andere dan die
  // van `results` zodra de server twee soorten door elkaar teruggeeft. De
  // gebruiker zag dan rij A oplichten en kwam na Enter op pagina B uit.
  const flatIndex = (result: SearchResult) => results.indexOf(result);

  if (!isOpen) return null;

  const hasResults = results.length > 0;
  const showRecent = !query && recentSearches.length > 0;
  const showSuggestions = query && suggestions.length > 0 && !hasResults && !isLoading;

  return (
    <div className="global-search-overlay" onClick={onClose} role="presentation">
      <div
        className="global-search-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title', 'Zoeken')}
      >
        {/* Search header */}
        <div className="global-search-header">
          <div className="global-search-input-wrapper">
            <span className="global-search-icon" aria-hidden="true">
              {isLoading ? '\u231B' : '\u2315'}
            </span>
            <input
              ref={inputRef}
              type="text"
              className="global-search-input"
              placeholder={t('search.placeholder', 'Zoek muziek, leden, lijsten...')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                handleKeyDown(e);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleEnter();
                }
              }}
              aria-label={t('search.label', 'Zoeken')}
              aria-describedby="search-description"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
            />
            <div className="global-search-shortcuts">
              <kbd>ESC</kbd>
              <span>{t('search.close', 'sluiten')}</span>
            </div>
          </div>
          <span id="search-description" className="sr-only">
            {t('search.description', 'Gebruik pijltoetsen om te navigeren, Enter om te selecteren')}
          </span>

          {/* Filter toggle */}
          <button
            className="global-search-filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            title={t('search.filters', 'Filters')}
          >
            <span aria-hidden="true">{showFilters ? '\u25B2' : '\u25BC'}</span>
            {t('search.filters', 'Filters')}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="global-search-filters">
            <div className="filter-group">
              <label htmlFor="filter-type">{t('search.filterType', 'Type')}</label>
              <select
                id="filter-type"
                value={filters.type || ''}
                onChange={(e) => handleFilterChange('type', e.target.value)}
              >
                <option value="">{t('search.allTypes', 'Alle types')}</option>
                <option value="music">{t('search.typeMusic', 'Muziek')}</option>
                <option value="member">{t('search.typeMember', 'Leden')}</option>
                <option value="list">{t('search.typeList', 'Lijsten')}</option>
                <option value="orchestra">{t('search.typeOrchestra', 'Orkesten')}</option>
                <option value="rehearsal">{t('search.typeRehearsal', 'Repetities')}</option>
              </select>
            </div>
          </div>
        )}

        {/* Search body */}
        <div className="global-search-body" ref={resultsRef}>
          {/* Recent searches */}
          {showRecent && (
            <div className="global-search-section">
              <div className="global-search-section-header">
                <h3>{t('search.recentSearches', 'Recente zoekopdrachten')}</h3>
                <button className="global-search-clear" onClick={clearRecentSearches}>
                  {t('search.clearAll', 'Alles wissen')}
                </button>
              </div>
              <ul className="global-search-recent-list" role="listbox">
                {recentSearches.map((recent) => (
                  <li key={recent.id} className="global-search-recent-item">
                    <button className="global-search-recent-query" onClick={() => handleRecentClick(recent)}>
                      <span className="recent-icon" aria-hidden="true">
                        {'\u23F3'}
                      </span>
                      {recent.query}
                    </button>
                    <button
                      className="global-search-recent-delete"
                      onClick={() => deleteRecentSearch(recent.id)}
                      aria-label={t('search.deleteRecent', 'Verwijderen')}
                    >
                      {'\u2715'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {showSuggestions && (
            <div className="global-search-section">
              <h3>{t('search.suggestions', 'Suggesties')}</h3>
              <ul className="global-search-suggestions" role="listbox">
                {suggestions.map((suggestion, index) => (
                  <li key={index}>
                    <button className="global-search-suggestion" onClick={() => handleSuggestionClick(suggestion)}>
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="global-search-loading" role="status" aria-live="polite">
              <span className="loading-spinner" aria-hidden="true"></span>
              {t('search.searching', 'Zoeken...')}
            </div>
          )}

          {/* No results */}
          {query && !isLoading && !hasResults && !showSuggestions && (
            <div className="global-search-empty" role="status" aria-live="polite">
              <span className="empty-icon" aria-hidden="true">
                {'\u2049'}
              </span>
              <p>{t('search.noResults', 'Geen resultaten gevonden')}</p>
              <p className="empty-hint">{t('search.tryDifferent', 'Probeer een andere zoekterm')}</p>
            </div>
          )}

          {/* Results grouped by type */}
          {hasResults && (
            <div className="global-search-results" role="listbox" aria-label={t('search.results', 'Zoekresultaten')}>
              {Object.entries(groupedResults).map(([type, typeResults]) => (
                <div key={type} className="global-search-section">
                  <h3 className="global-search-category">
                    <span className="category-icon" aria-hidden="true">
                      {typeIcons[type] || '\u2022'}
                    </span>
                    {categoryLabels[type as keyof typeof categoryLabels]?.label || type}
                  </h3>
                  <ul className="global-search-result-list">
                    {typeResults.map((result) => {
                      const index = flatIndex(result);
                      const isSelected = index === selectedIndex;
                      return (
                        <li
                          key={result.id}
                          data-index={index}
                          className={`global-search-result ${isSelected ? 'selected' : ''}`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <button
                            className="global-search-result-btn"
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() => setSelectedIndex(index)}
                          >
                            <span className="result-icon" aria-hidden="true">
                              {typeIcons[result.type] || '\u2022'}
                            </span>
                            <div className="result-content">
                              <span className="result-title">{result.title}</span>
                              {result.subtitle && <span className="result-subtitle">{result.subtitle}</span>}
                            </div>
                            <span className="result-type-badge">{result.type}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search footer */}
        <div className="global-search-footer">
          <div className="global-search-hints">
            <span>
              <kbd>{'\u2191'}</kbd>
              <kbd>{'\u2193'}</kbd> {t('search.navigate', 'navigeren')}
            </span>
            <span>
              <kbd>Enter</kbd> {t('search.select', 'selecteren')}
            </span>
            <span>
              <kbd>ESC</kbd> {t('search.close', 'sluiten')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to manage global search state
export function useGlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input (except when already open)
      if (
        !isOpen &&
        (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement)
      ) {
        return;
      }

      // Cmd+K or Ctrl+K to toggle search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
        return;
      }

      // "/" to open search (when not typing)
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        open();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, open, toggle]);

  return { isOpen, open, close, toggle };
}

export default GlobalSearch;
