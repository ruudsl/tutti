/**
 * Sheet Music Utilities Module
 *
 * Provides utilities for searching sheet music across various online retailers
 * and resources.
 *
 * @module utils/sheetMusic
 */

/**
 * Search result containing a website name and search URL.
 */
export interface SheetMusicSearchResult {
  /** Display name of the website */
  name: string;
  /** Full search URL with encoded query */
  url: string;
}

/**
 * Generates search URLs for multiple sheet music websites.
 *
 * @description Creates search URLs for popular sheet music retailers and resources
 * including De Haske, Molenaar, Hal Leonard, Beriato, MusicaInfo, and YouTube.
 * URLs are properly encoded for direct use.
 * @param {string} title - The music title to search for
 * @returns {SheetMusicSearchResult[]} Array of search results with website names and URLs
 * @example
 * const results = searchSheetMusicWebsites('The Lord of the Rings');
 * // Open first result in new tab
 * window.open(results[0].url, '_blank');
 *
 * // Display as links
 * results.map(r => <a href={r.url}>{r.name}</a>);
 */
export function searchSheetMusicWebsites(title: string): SheetMusicSearchResult[] {
  const encodedTitle = encodeURIComponent(title);
  return [
    { name: 'De Haske', url: `https://www.dehaske.com/en-gb/search?q=${encodedTitle}` },
    { name: 'Molenaar Edition', url: `https://www.molenaar.com/search?q=${encodedTitle}` },
    { name: 'Hal Leonard', url: `https://www.halleonard.com/search/search.action?_requestid=2&subsiteid=1&seriesfeature=CONCERTBAND&keywords=${encodedTitle}` },
    { name: 'Beriato Music', url: `https://www.beriato.com/search?q=${encodedTitle}` },
    { name: 'MusicaInfo', url: `https://en.musicainfo.net/ergebnis.php?kat=2&vol=${encodedTitle}` },
    { name: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodedTitle}+concert+band` },
  ];
}
