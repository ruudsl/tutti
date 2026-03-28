import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportUserData } from '../api';
import { showSuccess, showError } from '../utils/toast';

export function GdprExport() {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportUserData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mijn-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Data gedownload');
    } catch (error: any) {
      showError(error.response?.data?.error || 'Fout bij exporteren');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <h3>{t('gdpr.title')}</h3>
      <p className="mb-2" style={{ color: 'var(--text-light)' }}>
        {t('gdpr.description')}
      </p>
      <button
        className="btn btn-outline"
        onClick={handleExport}
        disabled={isExporting}
      >
        {isExporting ? t('gdpr.exporting') : t('gdpr.export')}
      </button>
    </div>
  );
}
