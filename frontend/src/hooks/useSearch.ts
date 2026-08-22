import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebounce } from './useDebounce';

export interface SearchResult {
  id: string;
  type: 'music' | 'member' | 'orchestra' | 'list' | 'rehearsal' | 'settings';
  title: string;
  subtitle?: string;
  path: string;
  icon: string;
  metadata?: Record<string, unknown>;
}

export interface RecentSearch {
  id: string;
  query: string;
  timestamp: string;
}

export interface SearchFilters {
  type?: string;
  orchestraId?: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

interface SuggestionsResponse {
  suggestions: string[];
}

interface RecentSearchesResponse {
  searches: RecentSearch[];
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('token');
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.statusText}`);
  }

  return response;
}

/**
 * @description Hook for full-text search with autocomplete, recent searches, and keyboard navigation.
 * Provides debounced search, result grouping by type, and manages search state.
 *
 * @param {string} initialQuery - Initial search query (default: '')
 * @param {SearchFilters} filters - Filter options (type, orchestraId)
 *
 * @returns {Object} Search state and controls
 * @returns {string} returns.query - Current search query
 * @returns {SearchResult[]} returns.results - Search results
 * @returns {Record<string, SearchResult[]>} returns.groupedResults - Results grouped by type
 * @returns {string[]} returns.suggestions - Autocomplete suggestions
 * @returns {RecentSearch[]} returns.recentSearches - User's recent searches
 * @returns {boolean} returns.isLoading - Whether search is in progress
 * @returns {string | null} returns.error - Error message if search failed
 * @returns {number} returns.selectedIndex - Currently selected result index
 * @returns {Function} returns.setQuery - Update search query
 * @returns {Function} returns.search - Trigger search manually
 * @returns {Function} returns.saveRecentSearch - Save a search to history
 * @returns {Function} returns.deleteRecentSearch - Delete a recent search
 * @returns {Function} returns.clearRecentSearches - Clear all recent searches
 * @returns {Function} returns.handleKeyDown - Keyboard navigation handler
 * @returns {Function} returns.getSelectedResult - Get currently selected result
 *
 * @example
 * ```tsx
 * function SearchDialog() {
 *   const {
 *     query, setQuery, results, groupedResults,
 *     isLoading, selectedIndex, handleKeyDown, getSelectedResult
 *   } = useSearch();
 *
 *   const handleSubmit = () => {
 *     const selected = getSelectedResult();
 *     if (selected) navigate(selected.path);
 *   };
 *
 *   return (
 *     <div onKeyDown={handleKeyDown}>
 *       <input
 *         value={query}
 *         onChange={(e) => setQuery(e.target.value)}
 *         onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
 *       />
 *       {isLoading ? <Spinner /> : (
 *         <SearchResults results={results} selectedIndex={selectedIndex} />
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSearch(initialQuery = '', filters: SearchFilters = {}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debouncedQuery = useDebounce(query, 200);
  const abortControllerRef = useRef<AbortController | null>(null);

  // `filters` is bij elke render een ander object: de standaardwaarde is een
  // vers `{}` en aanroepers geven doorgaans een letterlijk object mee. Stond
  // dat object rechtstreeks in de dependency-lijst van het zoek-effect, dan
  // draaide dat effect na iedere render opnieuw - en omdat het effect zelf
  // state zet, joeg het zichzelf eindeloos aan. Vergelijken op inhoud houdt
  // het bij een verzoek per daadwerkelijke filterwijziging.
  //
  // De sleutel wordt over het hele object gemaakt en niet over een handmatige
  // opsomming van velden. Dat scheelt een stille fout later: wie er een derde
  // filter bij zet, zou bij een opsomming zien dat die wel meegestuurd wordt
  // maar geen nieuwe zoekopdracht meer uitlokt. Sleutels worden gesorteerd
  // omdat JSON.stringify de invoegvolgorde aanhoudt en {type, orchestraId}
  // anders een andere sleutel geeft dan {orchestraId, type}.
  const filtersKey = JSON.stringify(
    Object.entries(filters)
      .filter(([, waarde]) => waarde !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const stableFilters = useMemo<SearchFilters>(
    () => ({ ...filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey],
  );

  // Fetch search results
  const search = useCallback(async (searchQuery: string, searchFilters: SearchFilters = {}) => {
    if (!searchQuery || searchQuery.length < 2) {
      // Alleen vervangen als er echt iets stond: een verse lege array zou een
      // render veroorzaken die niets toevoegt.
      setResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (searchFilters.type) params.append('type', searchFilters.type);
      if (searchFilters.orchestraId) params.append('orchestraId', searchFilters.orchestraId);

      const response = await fetchWithAuth(`${API_BASE}/search?${params.toString()}`, {
        signal: abortControllerRef.current.signal,
      });
      const data: SearchResponse = await response.json();
      setResults(data.results);
      setSelectedIndex(-1);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch autocomplete suggestions
  const fetchSuggestions = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await fetchWithAuth(`${API_BASE}/search/suggestions?q=${encodeURIComponent(searchQuery)}`);
      const data: SuggestionsResponse = await response.json();
      setSuggestions(data.suggestions);
    } catch {
      setSuggestions([]);
    }
  }, []);

  // Fetch recent searches
  const fetchRecentSearches = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/search/recent`);
      const data: RecentSearchesResponse = await response.json();
      setRecentSearches(data.searches);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  // Save a search to recent searches
  const saveRecentSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery || searchQuery.trim().length < 2) return;

      try {
        await fetchWithAuth(`${API_BASE}/search/recent`, {
          method: 'POST',
          body: JSON.stringify({ query: searchQuery }),
        });
        fetchRecentSearches();
      } catch {
        // Ignore errors when saving recent search
      }
    },
    [fetchRecentSearches],
  );

  // Delete a recent search
  const deleteRecentSearch = useCallback(async (id: string) => {
    try {
      await fetchWithAuth(`${API_BASE}/search/recent/${id}`, {
        method: 'DELETE',
      });
      setRecentSearches((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Ignore errors
    }
  }, []);

  // Clear all recent searches
  const clearRecentSearches = useCallback(async () => {
    try {
      await fetchWithAuth(`${API_BASE}/search/recent`, {
        method: 'DELETE',
      });
      setRecentSearches([]);
    } catch {
      // Ignore errors
    }
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const totalItems = results.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
          break;
        case 'Home':
          e.preventDefault();
          setSelectedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setSelectedIndex(totalItems - 1);
          break;
      }
    },
    [results.length],
  );

  // Get the currently selected result
  const getSelectedResult = useCallback((): SearchResult | null => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      return results[selectedIndex];
    }
    return null;
  }, [results, selectedIndex]);

  // Search when debounced query changes
  useEffect(() => {
    search(debouncedQuery, stableFilters);
    fetchSuggestions(debouncedQuery);
  }, [debouncedQuery, stableFilters, search, fetchSuggestions]);

  // Load recent searches on mount
  useEffect(() => {
    fetchRecentSearches();
  }, [fetchRecentSearches]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Group results by type
  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    if (!acc[result.type]) {
      acc[result.type] = [];
    }
    acc[result.type].push(result);
    return acc;
  }, {});

  return {
    // State
    query,
    results,
    groupedResults,
    suggestions,
    recentSearches,
    isLoading,
    error,
    selectedIndex,

    // Actions
    setQuery,
    search,
    saveRecentSearch,
    deleteRecentSearch,
    clearRecentSearches,
    handleKeyDown,
    getSelectedResult,
    setSelectedIndex,
  };
}

/**
 * @description Hook that returns localized labels and icons for search result categories.
 *
 * @returns {Record<string, {label: string, icon: string}>} Category labels and icons
 *
 * @example
 * ```tsx
 * function CategoryHeader({ type }: { type: string }) {
 *   const labels = useSearchCategoryLabels();
 *   const category = labels[type];
 *   return (
 *     <h3>
 *       <Icon name={category.icon} /> {category.label}
 *     </h3>
 *   );
 * }
 * ```
 */
export function useSearchCategoryLabels() {
  return {
    music: { label: 'Muziek', icon: 'music' },
    member: { label: 'Leden', icon: 'user' },
    orchestra: { label: 'Orkesten', icon: 'orchestra' },
    list: { label: 'Lijsten', icon: 'list' },
    rehearsal: { label: 'Repetities', icon: 'calendar' },
    settings: { label: 'Instellingen', icon: 'settings' },
  };
}
