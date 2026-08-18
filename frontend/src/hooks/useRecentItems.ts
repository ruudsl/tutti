import { useMemo } from 'react';
import { useRecentViews, RecentView } from './useRecentViews';

export type ItemCategory = 'music' | 'lists' | 'rehearsals' | 'all';

export interface RecentItem {
  id: string;
  type: RecentView['itemType'];
  itemId: string;
  title: string;
  viewedAt: Date;
  category: ItemCategory;
  path: string;
  icon: string;
}

// Map item types to categories
const typeToCategory: Record<RecentView['itemType'], ItemCategory> = {
  music_piece: 'music',
  music_title: 'music',
  music_list: 'lists',
  rehearsal: 'rehearsals',
  concert: 'rehearsals',
};

// Map item types to paths
const typeToPaths: Record<RecentView['itemType'], (itemId: string) => string> = {
  music_piece: (id) => `/music-pieces/${id}`,
  music_title: (id) => `/titles/${id}`,
  music_list: (id) => `/lists/${id}`,
  rehearsal: (id) => `/rehearsals/${id}`,
  concert: (id) => `/concerts/${id}`,
};

// Map item types to icons
const typeToIcon: Record<RecentView['itemType'], string> = {
  music_piece:
    'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', // music note
  music_title:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', // document
  music_list: 'M4 6h16M4 10h16M4 14h16M4 18h16', // list
  rehearsal: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', // calendar
  concert: 'M15 5l-5 5-5-5m10 4l-5 5-5-5', // stage/concert
};

// Map category to translation key
export const categoryTranslationKeys: Record<ItemCategory, string> = {
  all: 'recentItems.categories.all',
  music: 'recentItems.categories.music',
  lists: 'recentItems.categories.lists',
  rehearsals: 'recentItems.categories.rehearsals',
};

// Map item type to translation key
export const itemTypeTranslationKeys: Record<RecentView['itemType'], string> = {
  music_piece: 'recentItems.types.musicPiece',
  music_title: 'recentItems.types.musicTitle',
  music_list: 'recentItems.types.musicList',
  rehearsal: 'recentItems.types.rehearsal',
  concert: 'recentItems.types.concert',
};

const DEFAULT_LIMIT = 10;

export function useRecentItems(category: ItemCategory = 'all', limit: number = DEFAULT_LIMIT) {
  // Map category to API type parameter
  const apiType =
    category === 'all'
      ? undefined
      : (() => {
          switch (category) {
            case 'music':
              return undefined; // Filter client-side for music types
            case 'lists':
              return 'music_list';
            case 'rehearsals':
              return undefined; // Filter client-side for rehearsal/concert
            default:
              return undefined;
          }
        })();

  // Fetch more items than needed for client-side filtering
  const fetchLimit = category === 'all' ? limit : limit * 3;

  const { views, isLoading, error } = useRecentViews(apiType, fetchLimit);

  const items: RecentItem[] = useMemo(() => {
    if (!views) return [];

    let filtered = views;

    // Client-side filtering for categories that span multiple types
    if (category === 'music') {
      filtered = views.filter((v) => v.itemType === 'music_piece' || v.itemType === 'music_title');
    } else if (category === 'rehearsals') {
      filtered = views.filter((v) => v.itemType === 'rehearsal' || v.itemType === 'concert');
    }

    return filtered.slice(0, limit).map((view) => ({
      id: view.id,
      type: view.itemType,
      itemId: view.itemId,
      title: view.itemTitle,
      viewedAt: new Date(view.viewedAt),
      category: typeToCategory[view.itemType],
      path: typeToPaths[view.itemType](view.itemId),
      icon: typeToIcon[view.itemType],
    }));
  }, [views, category, limit]);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups: Record<ItemCategory, RecentItem[]> = {
      all: [],
      music: [],
      lists: [],
      rehearsals: [],
    };

    items.forEach((item) => {
      groups[item.category].push(item);
      groups.all.push(item);
    });

    return groups;
  }, [items]);

  return {
    items,
    groupedItems,
    isLoading,
    error,
  };
}

// Helper function to format relative time
export function formatRelativeTime(date: Date, t: (key: string, options?: Record<string, unknown>) => string): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return t('recentItems.time.justNow');
  } else if (diffMins < 60) {
    return t('recentItems.time.minutesAgo', { count: diffMins });
  } else if (diffHours < 24) {
    return t('recentItems.time.hoursAgo', { count: diffHours });
  } else if (diffDays === 1) {
    return t('recentItems.time.yesterday');
  } else if (diffDays < 7) {
    return t('recentItems.time.daysAgo', { count: diffDays });
  } else {
    return date.toLocaleDateString();
  }
}

export default useRecentItems;
