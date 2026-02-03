import { useState, useRef } from 'react';
import { showSuccess, showError } from '../utils/toast';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface PageInfo {
  pageNumber: number;
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
  paperSize: string;
  isLandscape: boolean;
}

interface PdfInfo {
  pageCount: number;
  pages: PageInfo[];
  filename: string;
}

interface SplitRange {
  start: number;
  end: number;
  name: string;
}

interface SplitResult {
  name: string;
  filename?: string;
  filepath?: string;
  pageCount?: number;
  error?: string;
}

export default function PdfTools() {
  const [activeTab, setActiveTab] = useState<'split' | 'a3' | 'merge'>('split');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [splitRanges, setSplitRanges] = useState<SplitRange[]>([{ start: 1, end: 1, name: 'Deel 1' }]);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [a3Result, setA3Result] = useState<{ filepath: string; filename: string; splitCount: number; newPageCount: number } | null>(null);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeResult, setMergeResult] = useState<{ filepath: string; filename: string; pageCount: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPdfFile(file);
    setPdfInfo(null);
    setSplitResults([]);
    setA3Result(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch(`${API_BASE}/pdf-tools/info`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Kon PDF niet lezen');
      }

      const info = await response.json();
      setPdfInfo(info);

      // Initialize split ranges based on page count
      if (info.pageCount > 0) {
        setSplitRanges([{ start: 1, end: info.pageCount, name: 'Deel 1' }]);
      }
    } catch (error: any) {
      showError(error.message || 'Fout bij lezen PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleSplit = async () => {
    if (!pdfFile || splitRanges.length === 0) return;

    setProcessing(true);
    setSplitResults([]);

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('ranges', JSON.stringify(splitRanges));

      const response = await fetch(`${API_BASE}/pdf-tools/split`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Splitsen mislukt');
      }

      const data = await response.json();
      setSplitResults(data.results);
      showSuccess(`PDF gesplitst in ${data.results.length} delen`);
    } catch (error: any) {
      showError(error.message || 'Fout bij splitsen');
    } finally {
      setProcessing(false);
    }
  };

  const handleA3Split = async () => {
    if (!pdfFile) return;

    setProcessing(true);
    setA3Result(null);

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);

      const response = await fetch(`${API_BASE}/pdf-tools/split-a3`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error('A3 splitsen mislukt');
      }

      const data = await response.json();
      setA3Result(data);

      if (data.splitCount > 0) {
        showSuccess(`${data.splitCount} A3 pagina's gesplitst naar A4`);
      } else {
        showSuccess('Geen A3 pagina\'s gevonden om te splitsen');
      }
    } catch (error: any) {
      showError(error.message || 'Fout bij A3 splitsen');
    } finally {
      setProcessing(false);
    }
  };

  const handleMerge = async () => {
    if (mergeFiles.length < 2) {
      showError('Selecteer minimaal 2 PDF bestanden');
      return;
    }

    setProcessing(true);
    setMergeResult(null);

    try {
      const formData = new FormData();
      mergeFiles.forEach((file) => formData.append('pdfs', file));

      const response = await fetch(`${API_BASE}/pdf-tools/merge`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Samenvoegen mislukt');
      }

      const data = await response.json();
      setMergeResult(data);
      showSuccess(`${mergeFiles.length} bestanden samengevoegd`);
    } catch (error: any) {
      showError(error.message || 'Fout bij samenvoegen');
    } finally {
      setProcessing(false);
    }
  };

  const downloadFile = (filepath: string, filename: string) => {
    const token = localStorage.getItem('token');
    window.open(`${API_BASE}/pdf-tools/download/${filepath}?token=${token}`, '_blank');
  };

  const addSplitRange = () => {
    const lastRange = splitRanges[splitRanges.length - 1];
    const newStart = lastRange ? lastRange.end + 1 : 1;
    const newEnd = pdfInfo ? Math.min(newStart, pdfInfo.pageCount) : newStart;
    setSplitRanges([...splitRanges, {
      start: newStart,
      end: newEnd,
      name: `Deel ${splitRanges.length + 1}`,
    }]);
  };

  const removeSplitRange = (index: number) => {
    setSplitRanges(splitRanges.filter((_, i) => i !== index));
  };

  const updateSplitRange = (index: number, field: keyof SplitRange, value: string | number) => {
    const updated = [...splitRanges];
    if (field === 'start' || field === 'end') {
      updated[index][field] = Math.max(1, Math.min(pdfInfo?.pageCount || 1, Number(value)));
    } else {
      updated[index][field] = value as string;
    }
    setSplitRanges(updated);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>PDF Tools</h1>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="flex gap-2 mb-3">
            <button
              className={`btn ${activeTab === 'split' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('split')}
            >
              Splitsen
            </button>
            <button
              className={`btn ${activeTab === 'a3' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('a3')}
            >
              A3 naar A4
            </button>
            <button
              className={`btn ${activeTab === 'merge' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('merge')}
            >
              Samenvoegen
            </button>
          </div>

          {/* Split Tab */}
          {activeTab === 'split' && (
            <>
              <div className="form-group">
                <label className="form-label">PDF bestand</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelect}
                  className="form-control"
                />
              </div>

              {loading && (
                <div className="text-center" style={{ padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p>PDF analyseren...</p>
                </div>
              )}

              {pdfInfo && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: 'var(--background)',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <strong>{pdfInfo.filename}</strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                      {pdfInfo.pageCount} pagina's |{' '}
                      {pdfInfo.pages.map(p => p.paperSize).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                    </div>
                  </div>

                  <h4 style={{ marginBottom: '1rem' }}>Splits in delen:</h4>

                  {splitRanges.map((range, index) => (
                    <div key={index} className="flex gap-2 mb-2 items-end">
                      <div className="form-group mb-0" style={{ flex: 1 }}>
                        <label className="form-label">Naam</label>
                        <input
                          type="text"
                          className="form-control"
                          value={range.name}
                          onChange={(e) => updateSplitRange(index, 'name', e.target.value)}
                          placeholder="Bijv. Fluit 1"
                        />
                      </div>
                      <div className="form-group mb-0" style={{ width: '100px' }}>
                        <label className="form-label">Van</label>
                        <input
                          type="number"
                          className="form-control"
                          value={range.start}
                          onChange={(e) => updateSplitRange(index, 'start', e.target.value)}
                          min={1}
                          max={pdfInfo.pageCount}
                        />
                      </div>
                      <div className="form-group mb-0" style={{ width: '100px' }}>
                        <label className="form-label">Tot</label>
                        <input
                          type="number"
                          className="form-control"
                          value={range.end}
                          onChange={(e) => updateSplitRange(index, 'end', e.target.value)}
                          min={1}
                          max={pdfInfo.pageCount}
                        />
                      </div>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => removeSplitRange(index)}
                        disabled={splitRanges.length === 1}
                        title="Verwijderen"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-outline" onClick={addSplitRange}>
                      + Deel toevoegen
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSplit}
                      disabled={processing}
                    >
                      {processing ? 'Splitsen...' : 'PDF Splitsen'}
                    </button>
                  </div>

                  {splitResults.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <h4>Resultaten:</h4>
                      <div className="grid" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
                        {splitResults.map((result, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem',
                              background: result.error ? 'var(--danger-light)' : 'var(--success-light)',
                              borderRadius: '0.25rem'
                            }}
                          >
                            <div>
                              <strong>{result.name}</strong>
                              {result.pageCount && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                  ({result.pageCount} pagina's)
                                </span>
                              )}
                              {result.error && (
                                <span style={{ color: 'var(--danger)' }}> - {result.error}</span>
                              )}
                            </div>
                            {result.filepath && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => downloadFile(result.filepath!, result.filename!)}
                              >
                                Download
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* A3 to A4 Tab */}
          {activeTab === 'a3' && (
            <>
              <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                Upload een PDF met A3 pagina's om deze automatisch te splitsen naar A4 formaat.
                Elke A3 pagina wordt in twee A4 pagina's geknipt.
              </p>

              <div className="form-group">
                <label className="form-label">PDF bestand</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelect}
                  className="form-control"
                />
              </div>

              {loading && (
                <div className="text-center" style={{ padding: '2rem' }}>
                  <div className="spinner"></div>
                  <p>PDF analyseren...</p>
                </div>
              )}

              {pdfInfo && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: 'var(--background)',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <strong>{pdfInfo.filename}</strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
                      {pdfInfo.pageCount} pagina's
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                      {pdfInfo.pages.map((page, i) => (
                        <span
                          key={i}
                          className={`badge ${page.paperSize.includes('A3') ? 'badge-warning' : 'badge-secondary'}`}
                          style={{ marginRight: '0.25rem' }}
                        >
                          P{page.pageNumber}: {page.paperSize}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={handleA3Split}
                    disabled={processing}
                  >
                    {processing ? 'Verwerken...' : 'A3 paginas splitsen naar A4'}
                  </button>

                  {a3Result && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1rem',
                      background: 'var(--success-light)',
                      borderRadius: '0.5rem'
                    }}>
                      <strong>Klaar!</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {a3Result.splitCount} A3 pagina's gesplitst
                        <br />
                        Nieuw document: {a3Result.newPageCount} pagina's
                      </div>
                      <button
                        className="btn btn-primary mt-2"
                        onClick={() => downloadFile(a3Result.filepath, a3Result.filename)}
                      >
                        Download resultaat
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Merge Tab */}
          {activeTab === 'merge' && (
            <>
              <p style={{ marginBottom: '1rem', color: 'var(--text-light)' }}>
                Selecteer meerdere PDF bestanden om samen te voegen tot een enkel document.
              </p>

              <div className="form-group">
                <label className="form-label">PDF bestanden (selecteer meerdere)</label>
                <input
                  ref={mergeInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setMergeFiles(files);
                    setMergeResult(null);
                  }}
                  className="form-control"
                />
              </div>

              {mergeFiles.length > 0 && (
                <div style={{
                  padding: '1rem',
                  background: 'var(--background)',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem'
                }}>
                  <strong>{mergeFiles.length} bestanden geselecteerd:</strong>
                  <ol style={{ marginTop: '0.5rem', marginBottom: 0, paddingLeft: '1.5rem' }}>
                    {mergeFiles.map((file, i) => (
                      <li key={i} style={{ fontSize: '0.875rem' }}>{file.name}</li>
                    ))}
                  </ol>
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleMerge}
                disabled={processing || mergeFiles.length < 2}
              >
                {processing ? 'Samenvoegen...' : 'Bestanden samenvoegen'}
              </button>

              {mergeResult && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: 'var(--success-light)',
                  borderRadius: '0.5rem'
                }}>
                  <strong>Klaar!</strong>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Samengevoegd document: {mergeResult.pageCount} pagina's
                  </div>
                  <button
                    className="btn btn-primary mt-2"
                    onClick={() => downloadFile(mergeResult.filepath, mergeResult.filename)}
                  >
                    Download resultaat
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
