/**
 * Een YouTube-verwijzing omzetten naar iets dat veilig in te sluiten is.
 *
 * Bij een oproep mag een vereniging een link of een filmpje meegeven. Die tekst
 * komt van een andere vereniging, en een adres uit zo'n veld rechtstreeks in de
 * `src` van een iframe zetten is precies wat je niet wilt: `javascript:` en
 * `data:` voeren dan code uit in de context van de pagina.
 *
 * Daarom werkt het andersom. We halen alleen het video-id uit het adres - elf
 * tekens uit een vaste verzameling - en bouwen de insluit-url daar zelf mee op.
 * Wat niet als YouTube te herkennen is, wordt geen iframe maar een gewone link.
 */

/** Een video-id bij YouTube: elf tekens, letters, cijfers, streepje, liggend streepje. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'];

/**
 * Het video-id in een YouTube-adres, of null.
 *
 * Herkent de drie vormen die mensen plakken: /watch?v=, youtu.be/ en /embed/.
 */
export function youtubeVideoId(adres: string | null | undefined): string | null {
  if (!adres) return null;

  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    return null;
  }

  // Alleen http en https. Zonder deze regel komen javascript: en data: erdoor
  // zodra ze toevallig de rest van de vorm hebben.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!YOUTUBE_HOSTS.includes(url.hostname.toLowerCase())) return null;

  const kandidaat = url.hostname.toLowerCase().endsWith('youtu.be')
    ? url.pathname.slice(1)
    : url.pathname.startsWith('/embed/')
      ? url.pathname.slice('/embed/'.length)
      : (url.searchParams.get('v') ?? '');

  return VIDEO_ID.test(kandidaat) ? kandidaat : null;
}

/** De insluit-url voor een video-id, zelf opgebouwd. */
export function youtubeInsluitUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

/** Is dit adres veilig genoeg om als gewone link te tonen? */
export function isVeiligeLink(adres: string | null | undefined): boolean {
  if (!adres) return false;
  try {
    const url = new URL(adres);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
