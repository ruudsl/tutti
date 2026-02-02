import { useState, useEffect } from 'react';
import { getBackupInfo, downloadBackup, BackupInfo } from '../api';
import { showSuccess, showError } from '../utils/toast';

export default function BackupSettings() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    try {
      const data = await getBackupInfo();
      setInfo(data);
    } catch (error) {
      console.error('Error loading backup info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBackup();
      showSuccess('Backup gedownload');
    } catch (error: any) {
      showError(error.response?.data?.error || 'Fout bij downloaden backup');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Backup</h3>
        </div>
        <div className="card-body">
          <p className="text-light">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Backup</h3>
      </div>
      <div className="card-body">
        <p style={{ marginBottom: '1rem' }}>
          Maak een complete backup van de database en alle geüploade bestanden (PDF's en MP3's).
        </p>

        {info && (
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '1rem',
            borderRadius: '0.25rem',
            marginBottom: '1rem',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>Database</div>
                <div style={{ fontWeight: 'bold' }}>{info.database.sizeFormatted}</div>
              </div>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>PDF bestanden</div>
                <div style={{ fontWeight: 'bold' }}>{info.pdfFiles.count} ({info.pdfFiles.sizeFormatted})</div>
              </div>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>MP3 bestanden</div>
                <div style={{ fontWeight: 'bold' }}>{info.mp3Files.count} ({info.mp3Files.sizeFormatted})</div>
              </div>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>Totaal</div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{info.total.sizeFormatted}</div>
              </div>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Bezig met downloaden...' : 'Download backup'}
        </button>
      </div>
    </div>
  );
}
