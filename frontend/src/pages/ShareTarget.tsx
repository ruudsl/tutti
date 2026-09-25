import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { showError } from '../utils/toast';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../utils/constants';

/** Waar de service worker (sw-custom.ts) de gedeelde formulieren bewaart. */
const DEELCACHE = 'share-target-cache';

/** Wie bladmuziek mag uploaden; dezelfde rollen als de route /upload. */
const MAG_UPLOADEN: string[] = [ROLES.ADMIN, ROLES.MUSIC_COMMITTEE];

function isPdf(bestand: File): boolean {
  return bestand.type === 'application/pdf' || bestand.name.toLowerCase().endsWith('.pdf');
}

/**
 * Het landingspunt van de deel-actie: iemand kiest in een andere app "delen"
 * met een of meer PDF's en kiest Tutti.
 *
 * De service worker heeft het formulier in de cache gezet. Deze pagina haalt
 * de PDF's eruit, leegt de cache, en zet ze klaar op de uploadpagina. Daar
 * kiest de gebruiker zelf het orkest en de lijst en drukt op uploaden: een
 * gedeeld bestand verdwijnt dus niet ongezien in de bibliotheek.
 *
 * Niet ingelogd: eerst naar het inlogscherm, en daarna terug hierheen. De
 * bestanden blijven zolang in de cache staan.
 */
export default function ShareTarget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [message, setMessage] = useState('');

  // Een foutmelding eindigt na een paar tellen in een doorverwijzing. Die
  // teller wordt opgeruimd als de gebruiker de pagina zelf al verlaten heeft,
  // anders sleurt hij hem alsnog weg van waar hij inmiddels is.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verlatenRef = useRef(false);

  useEffect(() => {
    verlatenRef.current = false;
    if (!user) {
      navigate('/login', { replace: true, state: { terug: '/share-target' } });
      return;
    }
    verwerk();
    return () => {
      verlatenRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function mislukt(melding: string, metToast = false) {
    setMessage(melding);
    setStatus('error');
    if (metToast) showError(melding);
    timerRef.current = setTimeout(() => {
      if (!verlatenRef.current) navigate('/', { replace: true });
    }, 2500);
  }

  /** Alle gedeelde bestanden uit de cache, waarna de cache leeg is. */
  async function haalGedeeldeBestanden(): Promise<File[]> {
    if (typeof caches === 'undefined') return [];
    const cache = await caches.open(DEELCACHE);
    const bestanden: File[] = [];
    for (const verzoek of await cache.keys()) {
      const antwoord = await cache.match(verzoek);
      if (antwoord) {
        const formulier = await antwoord.formData();
        for (const waarde of formulier.getAll('files')) {
          if (waarde instanceof File) bestanden.push(waarde);
        }
      }
      await cache.delete(verzoek);
    }
    return bestanden;
  }

  async function verwerk() {
    try {
      const bestanden = await haalGedeeldeBestanden();
      if (verlatenRef.current) return;

      if (!MAG_UPLOADEN.includes(user!.role)) {
        mislukt(t('shareTarget.geenRechten'));
        return;
      }
      const pdfs = bestanden.filter(isPdf);
      if (pdfs.length === 0) {
        mislukt(t(bestanden.length > 0 ? 'shareTarget.geenPdf' : 'shareTarget.noContent'));
        return;
      }
      navigate('/upload', { replace: true, state: { gedeeldeBestanden: pdfs } });
    } catch (fout) {
      console.error('Deel-actie:', fout);
      if (!verlatenRef.current) mislukt(t('shareTarget.error'), true);
    }
  }

  return (
    <div
      className="page-container"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <div className="card" style={{ maxWidth: '400px', textAlign: 'center' }}>
        <div className="card-body" role="status">
          {status === 'processing' && (
            <>
              <div className="spinner mb-3" style={{ margin: '0 auto' }} />
              <h2>{t('shareTarget.processing')}</h2>
              <p className="text-muted">{t('shareTarget.processingMessage')}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
                <Icon name="warning" size={48} />
              </div>
              <h2>{t('shareTarget.failed')}</h2>
              <p className="text-muted">{message}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
