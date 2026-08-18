import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { showSuccess, showError } from '../utils/toast';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function ShareTarget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    handleSharedContent();
  }, []);

  async function handleSharedContent() {
    try {
      const url = new URL(window.location.href);
      const title = url.searchParams.get('title');
      const text = url.searchParams.get('text');
      const sharedUrl = url.searchParams.get('url');

      if (title || text || sharedUrl) {
        setMessage(t('shareTarget.receivedText', 'Gedeelde tekst ontvangen'));
        setStatus('success');

        setTimeout(() => {
          navigate('/my-music', {
            state: { sharedContent: { title, text, url: sharedUrl } },
          });
        }, 1500);
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

        setStatus('success');
        showSuccess(t('shareTarget.filesUploaded', 'Bestanden geüpload'));
        setTimeout(() => navigate('/my-music'), 2000);
      } else {
        setMessage(t('shareTarget.noContent', 'Geen gedeelde inhoud gevonden'));
        setStatus('error');
        setTimeout(() => navigate('/'), 2000);
      }
    } catch (error) {
      console.error('Share target error:', error);
      setStatus('error');
      setMessage(t('shareTarget.error', 'Fout bij verwerken'));
      showError(t('errors.generic'));
      setTimeout(() => navigate('/'), 2000);
    }
  }

  async function uploadFile(file: File) {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload/pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    return response.json();
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
