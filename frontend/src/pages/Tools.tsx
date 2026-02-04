import { useTranslation } from 'react-i18next';
import { MusicTools } from '../components/MusicTools';

export default function Tools() {
  const { t } = useTranslation();

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('tools.title')}</h1>
      </div>

      <p className="text-light" style={{ marginBottom: '1.5rem' }}>
        {t('tools.description')}
      </p>

      <MusicTools />
    </div>
  );
}
