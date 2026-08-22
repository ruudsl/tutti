import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'harmonie-pwa-install-dismissed';

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (!dismissed) return false;
    // Check if dismissed less than 7 days ago
    const dismissedAt = parseInt(dismissed, 10);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return dismissedAt > sevenDaysAgo;
  });

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Also check for iOS standalone mode
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    // Beide luisteraars moeten een naam hebben, anders is er bij het opruimen
    // niets om los te halen. Een anonieme luisteraar op 'appinstalled' blijft
    // hangen: hij stapelt op bij elk scherm dat deze hook gebruikt en wist ook
    // na het opruimen nog de bewaarde keuze van de gebruiker.
    const installedHandler = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      localStorage.removeItem(DISMISSED_KEY);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;

    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === 'accepted') {
      setInstallPrompt(null);
      return true;
    }
    return false;
  }, [installPrompt]);

  const dismissPrompt = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  }, []);

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    isDismissed,
    promptInstall,
    dismissPrompt,
  };
}
