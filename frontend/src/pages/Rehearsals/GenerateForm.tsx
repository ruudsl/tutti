/** Het formulier dat repetities genereert uit de vaste repetitiedagen. Letterlijk overgenomen uit Rehearsals.tsx. */

import { useTranslation } from 'react-i18next';

export function GenerateForm({
  genFrom,
  setGenFrom,
  genTo,
  setGenTo,
  handleGenerate,
  isGenerating,
}: {
  genFrom: string;
  setGenFrom: (waarde: string) => void;
  genTo: string;
  setGenTo: (waarde: string) => void;
  handleGenerate: () => void;
  isGenerating: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="card mb-3">
      <div className="card-header">
        <h2 className="card-title">{t('rehearsals.generate')}</h2>
      </div>
      <div className="card-body">
        <p className="piece-meta mb-2">{t('rehearsals.generateDescription')}</p>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">{t('rehearsals.generateFrom')}</label>
            <input type="date" className="form-control" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">{t('rehearsals.generateTo')}</label>
            <input type="date" className="form-control" value={genTo} onChange={(e) => setGenTo(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={!genFrom || !genTo || isGenerating}>
            {isGenerating ? t('common.loading') : t('rehearsals.generateButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
