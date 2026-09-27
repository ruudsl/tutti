import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { getMp3Url } from '../api';

/** Iets onder de vijf minuten dat het download-token geldt. */
const VERNIEUW_NA_MS = 4 * 60 * 1000;

interface Mp3SpelerProps {
  /** Bestandsnaam van de mp3 (music_titles.mp3_file_path). */
  bestand: string;
  style?: CSSProperties;
}

/**
 * Een <audio>-speler voor een mp3 bij een titel.
 *
 * <audio src> kan geen Authorization-kopregel meesturen. Het adres krijgt
 * daarom een download-token voor alleen dit bestand (getMp3Url), nooit het
 * sessietoken. Dat token verloopt na vijf minuten; laadt de browser het
 * bestand later opnieuw (terugspoelen, pas veel later op afspelen drukken) en
 * weigert de server, dan haalt de speler een vers adres op.
 */
export function Mp3Speler({ bestand, style }: Mp3SpelerProps) {
  // Het adres hoort bij één bestand: bij een ander bestand geldt het niet meer.
  const [stand, setStand] = useState<{ bestand: string; adres: string } | null>(null);
  const opgehaaldOp = useRef(0);
  const actief = useRef(true);

  const haalAdresOp = useCallback(() => {
    getMp3Url(bestand)
      .then((adres) => {
        if (!actief.current) return;
        opgehaaldOp.current = Date.now();
        setStand({ bestand, adres });
      })
      .catch(() => {
        // Geen adres: de speler blijft leeg. Een verlopen sessie handelt
        // api/client.ts af.
      });
  }, [bestand]);

  useEffect(() => {
    actief.current = true;
    haalAdresOp();
    return () => {
      actief.current = false;
    };
  }, [haalAdresOp]);

  const adres = stand?.bestand === bestand ? stand.adres : undefined;

  const bijFout = () => {
    // Alleen als het token verlopen kan zijn; anders is er iets anders mis en
    // zou opnieuw ophalen blijven herhalen.
    if (Date.now() - opgehaaldOp.current > VERNIEUW_NA_MS) {
      haalAdresOp();
    }
  };

  return <audio controls src={adres} style={style} onError={bijFout} />;
}
