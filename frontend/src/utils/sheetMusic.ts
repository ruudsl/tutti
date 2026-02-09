/**
 * Generate search URLs for sheet music websites
 */
export function searchSheetMusicWebsites(title: string) {
  const encodedTitle = encodeURIComponent(title);
  return [
    { name: 'De Haske', url: `https://www.dehaske.com/en-gb/search?q=${encodedTitle}` },
    { name: 'Molenaar Edition', url: `https://www.molenaar.com/search?q=${encodedTitle}` },
    { name: 'Hal Leonard', url: `https://www.halleonard.com/search/search.action?_requestid=2&subsiteid=1&seriesfeature=CONCERTBAND&keywords=${encodedTitle}` },
    { name: 'Beriato Music', url: `https://www.beriato.com/search?q=${encodedTitle}` },
    { name: 'MusicaInfo', url: `https://en.musicainfo.net/ergebnis.php?kat=2&tit=${encodedTitle}` },
    { name: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodedTitle}+concert+band` },
  ];
}
