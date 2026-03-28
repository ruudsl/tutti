import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Fetch search results
  const search = useCallback(async (searchQuery: string, searchFilters: SearchFilters = {}) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
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

      const response = await fetchWithAuth(
        `${API_BASE}/search?${params.toString()}`,
        { signal: abortControllerRef.current.signal }
      );
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
      const response = await fetchWithAuth(
        `${API_BASE}/search/suggestions?q=${encodeURIComponent(searchQuery)}`
      );
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
  const saveRecentSearch = useCallback(async (searchQuery: string) => {
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
  }, [fetchRecentSearches]);

  // Delete a recent search
  const deleteRecentSearch = useCallback(async (id: string) => {
    try {
      await fetchWithAuth(`${API_BASE}/search/recent/${id}`, {
        method: 'DELETE',
      });
      setRecentSearches(prev => prev.filter(s => s.id !== id));
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
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const totalItems = results.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
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
  }, [results.length]);

  // Get the currently selected result
  const getSelectedResult = useCallback((): SearchResult | null => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      return results[selectedIndex];
    }
    return null;
  }, [results, selectedIndex]);

  // Search when debounced query changes
  useEffect(() => {
    search(debouncedQuery, filters);
    fetchSuggestions(debouncedQuery);
  }, [debouncedQuery, filters, search, fetchSuggestions]);

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

// Hook for category labels
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
