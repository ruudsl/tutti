import { useEffect, useState } from 'react';

/**
 * Of de browser denkt online te zijn.
 *
 * Staat bewust in een eigen bestand en niet bij de rest van de offline-haken.
 * `useOfflineData.ts` trekt `lib/offlineStorage` mee en daarmee dexie - 94 KB
 * IndexedDB-laag. De offline-melder in het schild gebruikt alleen deze hook,
 * maar door hem daaruit te importeren stond die hele laag in de hoofdbundel,
 * en werd hij dus ook opgehaald en ontleed door iemand die alleen het
 * inlogscherm te zien krijgt. Deze hook luistert naar twee vensterevents en
 * heeft verder niets nodig.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
