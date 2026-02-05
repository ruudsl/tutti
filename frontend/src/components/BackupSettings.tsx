import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getBackupInfo, downloadBackup, restoreBackup, BackupInfo } from '../api';
import { showSuccess, showError } from '../utils/toast';
import { ConfirmDialog } from './ConfirmDialog';

export default function BackupSettings() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      showSuccess(t('backup.downloaded'));
    } catch (error: any) {
      showError(error.response?.data?.error || t('backup.errorDownload'));
    } finally {
      setDownloading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setShowRestoreConfirm(true);
    }
  };

  const handleRestore = async () => {
    if (!selectedFile) return;

    setShowRestoreConfirm(false);
    setRestoring(true);
    try {
      await restoreBackup(selectedFile);
      showSuccess(t('backup.restored'));
      // Reload the page after restore to refresh all data
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      showError(error.response?.data?.error || t('backup.errorRestore'));
    } finally {
      setRestoring(false);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const cancelRestore = () => {
    setShowRestoreConfirm(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('backup.title')}</h3>
        </div>
        <div className="card-body">
          <p className="text-light">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{t('backup.title')}</h3>
      </div>
      <div className="card-body">
        <p style={{ marginBottom: '1rem' }}>
          {t('backup.description')}
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
                <div className="text-light" style={{ fontSize: '0.875rem' }}>{t('backup.database')}</div>
                <div style={{ fontWeight: 'bold' }}>{info.database.sizeFormatted}</div>
              </div>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>{t('backup.pdfFiles')}</div>
                <div style={{ fontWeight: 'bold' }}>{info.pdfFiles.count} ({info.pdfFiles.sizeFormatted})</div>
              </div>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>{t('backup.mp3Files')}</div>
                <div style={{ fontWeight: 'bold' }}>{info.mp3Files.count} ({info.mp3Files.sizeFormatted})</div>
              </div>
              <div>
                <div className="text-light" style={{ fontSize: '0.875rem' }}>{t('backup.total')}</div>
                <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{info.total.sizeFormatted}</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={handleDownload}
            disabled={downloading || restoring}
          >
            {downloading ? t('backup.downloading') : t('backup.download')}
          </button>

          <button
            className="btn btn-outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={downloading || restoring}
          >
            {restoring ? t('backup.restoring') : t('backup.restore')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--text-light)' }}>
          {t('backup.restoreDescription')}
        </p>
      </div>

      {showRestoreConfirm && (
        <ConfirmDialog
          title={t('backup.restore')}
          message={t('backup.confirmRestore')}
          confirmLabel={t('backup.restoreButton')}
          onConfirm={handleRestore}
          onCancel={cancelRestore}
          isLoading={restoring}
          variant="danger"
        />
      )}
    </div>
  );
}
