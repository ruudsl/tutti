import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '../utils/toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PdfPagePreview from '../components/PdfPagePreview';
import { useOrchestras } from '../hooks/useOrchestras';
import { useMusicLists } from '../hooks/useMusicLists';
import { savePdfAsMusicPiece } from '../api';

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
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.pdfTools');
  const [activeTab, setActiveTab] = useState<'split' | 'a3' | 'merge'>('split');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [splitRanges, setSplitRanges] = useState<SplitRange[]>([{ start: 1, end: 1, name: 'Part 1' }]);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [a3Result, setA3Result] = useState<{ filepath: string; filename: string; splitCount: number; newPageCount: number } | null>(null);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeResult, setMergeResult] = useState<{ filepath: string; filename: string; pageCount: number } | null>(null);
  const [thumbnailSize, setThumbnailSize] = useState(100);
  const [savingAsMusicPiece, setSavingAsMusicPiece] = useState<string | null>(null);
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedList, setSelectedList] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data for saving as music piece
  const { data: orchestras = [] } = useOrchestras();
  const { data: lists = [] } = useMusicLists(selectedOrchestra || undefined);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  // Extract clean base name from filename (remove extension, clean up)
  const getBaseFilename = (filename: string): string => {
    // Remove .pdf extension
    let base = filename.replace(/\.pdf$/i, '');
    // Replace spaces and special characters with underscores
    base = base.replace(/[\s\-]+/g, '_');
    // Remove multiple underscores
    base = base.replace(/_+/g, '_');
    // Remove leading/trailing underscores
    base = base.replace(/^_+|_+$/g, '');
    return base;
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
        throw new Error(t('pdfTools.couldNotReadPdf'));
      }

      const info = await response.json();
      setPdfInfo(info);

      // Initialize split ranges based on page count
      if (info.pageCount > 0) {
        const baseName = getBaseFilename(file.name);
        setSplitRanges([{ start: 1, end: info.pageCount, name: `${baseName}_Deel1` }]);
      }
    } catch (error: any) {
      showError(error.message || t('pdfTools.errorReadingPdf'));
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
        throw new Error(t('pdfTools.splitFailed'));
      }

      const data = await response.json();
      setSplitResults(data.results);
      showSuccess(t('pdfTools.pdfSplitSuccess', { count: data.results.length }));
    } catch (error: any) {
      showError(error.message || t('pdfTools.errorSplitting'));
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
        throw new Error(t('pdfTools.a3SplitFailed'));
      }

      const data = await response.json();
      setA3Result(data);

      if (data.splitCount > 0) {
        showSuccess(t('pdfTools.a3SplitSuccess', { count: data.splitCount }));
      } else {
        showSuccess(t('pdfTools.noA3Found'));
      }
    } catch (error: any) {
      showError(error.message || t('pdfTools.errorA3Split'));
    } finally {
      setProcessing(false);
    }
  };

  const handleMerge = async () => {
    if (mergeFiles.length < 2) {
      showError(t('pdfTools.selectMinTwoFiles'));
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
        throw new Error(t('pdfTools.mergeFailed'));
      }

      const data = await response.json();
      setMergeResult(data);
      showSuccess(t('pdfTools.mergeSuccess', { count: mergeFiles.length }));
    } catch (error: any) {
      showError(error.message || t('pdfTools.errorMerging'));
    } finally {
      setProcessing(false);
    }
  };

  const downloadFile = (filepath: string, _filename: string) => {
    const token = localStorage.getItem('token');
    window.open(`${API_BASE}/pdf-tools/download/${filepath}?token=${token}`, '_blank');
  };

  const handleSaveAsMusicPiece = async (filepath: string, filename: string) => {
    if (!selectedOrchestra) {
      showError(t('pdfTools.selectOrchestraFirst'));
      return;
    }

    setSavingAsMusicPiece(filepath);
    try {
      const result = await savePdfAsMusicPiece(filepath, filename, selectedList || undefined);
      if (result.success) {
        showSuccess(t('pdfTools.savedAsMusicPiece', { title: result.title }));
        // Remove the saved result from splitResults
        setSplitResults(prev => prev.filter(r => r.filepath !== filepath));
      }
    } catch (error: any) {
      showError(error.response?.data?.error || t('pdfTools.errorSavingAsMusicPiece'));
    } finally {
      setSavingAsMusicPiece(null);
    }
  };

  const handleOrchestraChange = (orchestraId: string) => {
    setSelectedOrchestra(orchestraId);
    setSelectedList('');
  };

  const addSplitRange = () => {
    const lastRange = splitRanges[splitRanges.length - 1];
    const newStart = lastRange ? lastRange.end + 1 : 1;
    const newEnd = pdfInfo ? Math.min(newStart, pdfInfo.pageCount) : newStart;
    const baseName = pdfFile ? getBaseFilename(pdfFile.name) : '';
    const partNumber = splitRanges.length + 1;
    setSplitRanges([...splitRanges, {
      start: newStart,
      end: newEnd,
      name: baseName ? `${baseName}_Deel${partNumber}` : `Deel${partNumber}`,
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
        <h1>{t('pdfTools.title')}</h1>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="flex gap-2 mb-3">
            <button
              className={`btn ${activeTab === 'split' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('split')}
            >
              {t('pdfTools.split')}
            </button>
            <button
              className={`btn ${activeTab === 'a3' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('a3')}
            >
              {t('pdfTools.a3ToA4')}
            </button>
            <button
              className={`btn ${activeTab === 'merge' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setActiveTab('merge')}
            >
              {t('pdfTools.merge')}
            </button>
          </div>

          {/* Split Tab */}
          {activeTab === 'split' && (
            <>
              <div className="form-group">
                <label className="form-label">{t('pdfTools.pdfFile')}</label>
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
                  <p>{t('pdfTools.analyzing')}</p>
                </div>
              )}

              {pdfInfo && pdfFile && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: 'var(--background)',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <strong>{pdfInfo.filename}</strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                      {pdfInfo.pageCount} {t('pdfTools.pages')} |{' '}
                      {pdfInfo.pages.map(p => p.paperSize).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0 }}>{t('pdfTools.preview')}</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
                          {t('pdfTools.size')}:
                        </span>
                        <input
                          type="range"
                          min="60"
                          max="200"
                          value={thumbnailSize}
                          onChange={(e) => setThumbnailSize(Number(e.target.value))}
                          style={{ width: '120px' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', minWidth: '40px' }}>
                          {thumbnailSize}px
                        </span>
                      </div>
                    </div>
                    <PdfPagePreview
                      file={pdfFile}
                      selectedRanges={splitRanges}
                      thumbnailWidth={thumbnailSize}
                    />
                  </div>

                  <h4 style={{ marginBottom: '1rem' }}>{t('pdfTools.splitIntoParts')}</h4>

                  {splitRanges.map((range, index) => (
                    <div key={index} className="flex gap-2 mb-2 items-end">
                      <div className="form-group mb-0" style={{ flex: 1 }}>
                        <label className="form-label">{t('pdfTools.partName')}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={range.name}
                          onChange={(e) => updateSplitRange(index, 'name', e.target.value)}
                          placeholder={t('pdfTools.partNamePlaceholder')}
                        />
                      </div>
                      <div className="form-group mb-0" style={{ width: '100px' }}>
                        <label className="form-label">{t('pdfTools.from')}</label>
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
                        <label className="form-label">{t('pdfTools.to')}</label>
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
                        title={t('common.delete')}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-outline" onClick={addSplitRange}>
                      {t('pdfTools.addPart')}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSplit}
                      disabled={processing}
                    >
                      {processing ? t('pdfTools.splitting') : t('pdfTools.splitPdf')}
                    </button>
                  </div>

                  {splitResults.length > 0 && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <h4>{t('pdfTools.results')}</h4>

                      {/* Orchestra/List selection for saving as music piece */}
                      <div style={{
                        padding: '1rem',
                        background: 'var(--background)',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem',
                        marginTop: '0.5rem'
                      }}>
                        <div style={{ marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.875rem' }}>
                          {t('pdfTools.saveAsMusicPieceDescription')}
                        </div>
                        <div className="grid grid-2" style={{ gap: '0.5rem' }}>
                          <select
                            className="form-control form-select"
                            value={selectedOrchestra}
                            onChange={(e) => handleOrchestraChange(e.target.value)}
                          >
                            <option value="">{t('pdfTools.selectOrchestra')}</option>
                            {orchestras.map((orchestra) => (
                              <option key={orchestra.id} value={orchestra.id}>
                                {orchestra.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="form-control form-select"
                            value={selectedList}
                            onChange={(e) => setSelectedList(e.target.value)}
                            disabled={!selectedOrchestra}
                          >
                            <option value="">{t('pdfTools.noList')}</option>
                            {lists.map((list) => (
                              <option key={list.id} value={list.id}>
                                {list.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid" style={{ gap: '0.5rem' }}>
                        {splitResults.map((result, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem',
                              background: result.error ? 'var(--danger-light)' : 'var(--success-light)',
                              borderRadius: '0.25rem',
                              flexWrap: 'wrap',
                              gap: '0.5rem'
                            }}
                          >
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <strong>{result.name}</strong>
                              {result.pageCount && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                  ({result.pageCount} {t('pdfTools.pages')})
                                </span>
                              )}
                              {result.error && (
                                <span style={{ color: 'var(--danger)' }}> - {result.error}</span>
                              )}
                            </div>
                            {result.filepath && (
                              <div className="flex gap-1">
                                <button
                                  className="btn btn-sm btn-outline"
                                  onClick={() => downloadFile(result.filepath!, result.filename!)}
                                >
                                  {t('pdfTools.download')}
                                </button>
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleSaveAsMusicPiece(result.filepath!, result.filename!)}
                                  disabled={!selectedOrchestra || savingAsMusicPiece === result.filepath}
                                  title={!selectedOrchestra ? t('pdfTools.selectOrchestraFirst') : ''}
                                >
                                  {savingAsMusicPiece === result.filepath ? '...' : t('pdfTools.saveAsMusicPiece')}
                                </button>
                              </div>
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
                {t('pdfTools.a3Description')}
              </p>

              <div className="form-group">
                <label className="form-label">{t('pdfTools.pdfFile')}</label>
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
                  <p>{t('pdfTools.analyzing')}</p>
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
                      {pdfInfo.pageCount} {t('pdfTools.pages')}
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
                    {processing ? t('pdfTools.processing') : t('pdfTools.splitA3ToA4')}
                  </button>

                  {a3Result && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1rem',
                      background: 'var(--success-light)',
                      borderRadius: '0.5rem'
                    }}>
                      <strong>{t('pdfTools.done')}</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {t('pdfTools.a3PagesSplit', { count: a3Result.splitCount })}
                        <br />
                        {t('pdfTools.newDocument', { count: a3Result.newPageCount })}
                      </div>
                      <button
                        className="btn btn-primary mt-2"
                        onClick={() => downloadFile(a3Result.filepath, a3Result.filename)}
                      >
                        {t('pdfTools.downloadResult')}
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
                {t('pdfTools.mergeDescription')}
              </p>

              <div className="form-group">
                <label className="form-label">{t('pdfTools.pdfFiles')}</label>
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
                  <strong>{t('pdfTools.filesSelected', { count: mergeFiles.length })}</strong>
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
                {processing ? t('pdfTools.merging') : t('pdfTools.mergeFiles')}
              </button>

              {mergeResult && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: 'var(--success-light)',
                  borderRadius: '0.5rem'
                }}>
                  <strong>{t('pdfTools.done')}</strong>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    {t('pdfTools.mergedDocument', { count: mergeResult.pageCount })}
                  </div>
                  <button
                    className="btn btn-primary mt-2"
                    onClick={() => downloadFile(mergeResult.filepath, mergeResult.filename)}
                  >
                    {t('pdfTools.downloadResult')}
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
