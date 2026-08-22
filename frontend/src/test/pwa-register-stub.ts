/**
 * Vervanger voor de virtuele module `virtual:pwa-register/react`.
 *
 * Die module wordt tijdens het bouwen door vite-plugin-pwa aangemaakt. De
 * testopstelling laadt alleen de react-plugin, dus zonder deze vervanger is de
 * import onvindbaar. Het gevolg was niet een falende test maar iets stillers:
 * de v8-dekkingsprovider viel voor PWAUpdatePrompt.tsx terug op het rauw
 * ontleden van het bestand met Rollup, die geen JSX kent, en meldde
 * "Failed to parse ... Excluding it from coverage". Dat bestand verdween
 * daarmee uit de noemer in plaats van als nul mee te tellen - precies het
 * gedrag waar de `include`-regel in vitest.config.ts voor bedoeld is om te
 * voorkomen.
 *
 * De vervanger doet niets: er is in een testomgeving geen service worker om te
 * registreren. Hij is er alleen zodat het bestand normaal getransformeerd en
 * meegeteld wordt.
 */

export function useRegisterSW(): {
  needRefresh: [boolean, (waarde: boolean) => void];
  offlineReady: [boolean, (waarde: boolean) => void];
  updateServiceWorker: (herlaadPagina?: boolean) => Promise<void>;
} {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  };
}
