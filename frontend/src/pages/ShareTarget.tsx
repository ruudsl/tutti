import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { showSuccess, showError } from '../utils/toast';
import { uploadSharedPdf } from '../api/music';

export default function ShareTarget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');

  // Elke afloop van deze pagina eindigt in een doorverwijzing na een paar
  // tellen. Die tellers moeten opgeruimd worden: klikt iemand binnen die
  // seconden zelf een menu-item aan, dan sleurde de wachtende timer hem
  // alsnog naar /my-music of naar de startpagina - een sprong waar hij niet
  // om gevraagd heeft, op een pagina die hij al verlaten had.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verlatenRef = useRef(false);

  useEffect(() => {
    handleSharedContent();
    return () => {
      verlatenRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /**
   * Plant een doorverwijzing.
   *
   * De vlag is er naast de clearTimeout omdat de laatste teller pas gezet
   * wordt nadat het uploaden klaar is: op dat moment kan de opruiming van het
   * effect al gedraaid hebben, en dan valt er niets meer te wissen.
   */
  function verwijsDoorNa(ms: number, doel: string, opties?: { state: unknown }) {
    timerRef.current = setTimeout(() => {
      if (verlatenRef.current) return;
      navigate(doel, opties);
    }, ms);
  }

  async function handleSharedContent() {
    try {
      const url = new URL(window.location.href);
      const title = url.searchParams.get('title');
      const text = url.searchParams.get('text');
      const sharedUrl = url.searchParams.get('url');

      if (title || text || sharedUrl) {
        setMessage(t('shareTarget.receivedText', 'Gedeelde tekst ontvangen'));
        setStatus('success');

        verwijsDoorNa(1500, '/my-music', {
          state: { sharedContent: { title, text, url: sharedUrl } },
        });
        return;
      }

      if ('launchQueue' in window && 'LaunchParams' in window) {
        (window as any).launchQueue.setConsumer(async (launchParams: any) => {
          if (launchParams.files && launchParams.files.length > 0) {
            const fileHandles = launchParams.files;
            for (const handle of fileHandles) {
              const file = await handle.getFile();
              await uploadFile(file);
            }
          }
        });
      }

      const cache = await caches.open('share-target-cache');
      const requests = await cache.keys();

      if (requests.length > 0) {
        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            const formData = await response.formData();
            const files = formData.getAll('files');

            for (const file of files) {
              if (file instanceof File) {
                await uploadFile(file);
              }
            }

            await cache.delete(request);
          }
        }

        // De melding hoorde ook in de kaart te staan. Zonder deze regel bleef
        // `message` leeg en las de gebruiker alleen "Gelukt!" met een lege
        // regel eronder; wat er gelukt was stond dan uitsluitend in de toast,
        // die na een paar tellen weg is.
        const gelukt = t('shareTarget.filesUploaded', 'Bestanden geüpload');
        setMessage(gelukt);
        setStatus('success');
        showSuccess(gelukt);
        verwijsDoorNa(2000, '/my-music');
      } else {
        setMessage(t('shareTarget.noContent', 'Geen gedeelde inhoud gevonden'));
        setStatus('error');
        verwijsDoorNa(2000, '/');
      }
    } catch (error) {
      console.error('Share target error:', error);
      setStatus('error');
      setMessage(t('shareTarget.error', 'Fout bij verwerken'));
      showError(t('errors.generic'));
      verwijsDoorNa(2000, '/');
    }
  }

  async function uploadFile(file: File) {
    return uploadSharedPdf(file);
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
        <div className="card-body">
          {status === 'processing' && (
            <>
              <div className="spinner mb-3" style={{ margin: '0 auto' }} />
              <h2>{t('shareTarget.processing', 'Verwerken...')}</h2>
              <p className="text-muted">{t('shareTarget.processingMessage', 'Je gedeelde bestand wordt verwerkt')}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ color: 'var(--success)', marginBottom: '1rem' }}>
                <Icon name="check" size={48} />
              </div>
              <h2>{t('shareTarget.success', 'Gelukt!')}</h2>
              <p className="text-muted">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
                <Icon name="warning" size={48} />
              </div>
              <h2>{t('shareTarget.failed', 'Mislukt')}</h2>
              <p className="text-muted">{message}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
