import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { getEnabledModules } from '../api/modules';
import { useAuth } from './AuthContext';

interface ModulesContextType {
  /** Sleutels van de modules die voor deze vereniging aan staan. */
  enabled: string[];
  /** Nog aan het ophalen? Zolang dit waar is, is `enabled` de laatst bekende stand. */
  loading: boolean;
  /**
   * Is de stand ooit opgehaald in deze sessie?
   *
   * Belangrijk voor het verbergen van routes: zolang dit onwaar is, weten we
   * niet welke modules uit staan en mag er niets worden weggehaald. Anders
   * stuurt de eerste keer inloggen een gebruiker weg van een pagina die
   * gewoon mag.
   */
  loaded: boolean;
  /**
   * Staat deze module aan?
   *
   * Een sleutel die de server niet noemt telt als uit: die module bestaat voor
   * deze vereniging niet. Let op dat paden andersom werken - een pad dat niet
   * in `utils/modules.ts` staat, is juist altijd zichtbaar.
   */
  isEnabled: (key: string) => boolean;
  /** Haal de stand opnieuw op, bijvoorbeeld na wijzigen in het beheerscherm. */
  refresh: () => Promise<void>;
}

const ModulesContext = createContext<ModulesContextType | undefined>(undefined);

/** Onthoud de laatste stand, zodat de navigatie bij een herstart niet opspringt. */
const STORAGE_KEY = 'enabledModules';

/**
 * Alleen een lijst met sleutels overhouden, wat er ook staat.
 *
 * `JSON.parse` gooit alleen bij kapotte tekst. Een geldige waarde van de
 * verkeerde soort ('null', '123', '"ticketing"', een object) kwam er ongemoeid
 * doorheen en werd daarna als lijst gebruikt. `enabled.includes(...)` gooit dan
 * tijdens het renderen van de zijbalk: geen foutmelding maar een wit scherm,
 * dat pas weggaat als de gebruiker zijn sitegegevens wist.
 *
 * Wat in localStorage staat is bovendien door de gebruiker zelf te bewerken,
 * dus de vorm is nooit gegeven.
 */
function alleenSleutels(waarde: unknown): string[] {
  if (!Array.isArray(waarde)) {
    return [];
  }
  return waarde.filter((item): item is string => typeof item === 'string');
}

function readCached(): string[] {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    return cached ? alleenSleutels(JSON.parse(cached)) : [];
  } catch {
    return [];
  }
}

/**
 * De aan/uit-stand van de modules, opgehaald zodra er een gebruiker is.
 *
 * De stand komt uit localStorage zodat de zijbalk bij het laden meteen klopt
 * en niet eerst de uitgezette onderdelen laat zien om ze daarna weg te halen.
 */
export function ModulesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<string[]>(readCached);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      return;
    }

    setLoading(true);
    try {
      // Ook hier de vorm afdwingen: een proxy of inlogportaal antwoordt soms
      // met een HTML-pagina en status 200, en dan is `enabled` geen lijst.
      const keys = alleenSleutels(await getEnabledModules());
      setEnabled(keys);
      setLoaded(true);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
      } catch {
        // Zonder opslag werkt alles nog, alleen zonder voorsprong bij de start.
      }
    } catch {
      // Bij een netwerkfout blijft de laatst bekende stand staan. Alles
      // onzichtbaar maken zou erger zijn dan een module te veel tonen.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setEnabled([]);
      setLoaded(false);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore localStorage errors
      }
      return;
    }
    void refresh();
  }, [user, refresh]);

  const isEnabled = useCallback((key: string) => enabled.includes(key), [enabled]);

  return (
    <ModulesContext.Provider value={{ enabled, loading, loaded, isEnabled, refresh }}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules(): ModulesContextType {
  const context = useContext(ModulesContext);
  if (!context) {
    throw new Error('useModules moet binnen een ModulesProvider worden gebruikt');
  }
  return context;
}
