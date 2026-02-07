import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccess, showError } from '../utils/toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import PdfPagePreview from '../components/PdfPagePreview';
import { useOrchestras } from '../hooks/useOrchestras';
import { useMusicLists } from '../hooks/useMusicLists';
import { useInstruments } from '../hooks/useInstruments';
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
  instrumentId: string;
  number: number;
}

interface InstrumentOption {
  id: string;
  label: string;
  name: string;
  tuning: string;
  clef: string;
}

interface SplitResult {
  name: string;
  displayName: string;
  filename?: string;
  filepath?: string;
  pageCount?: number;
  error?: string;
  saved?: boolean;
  title?: string;
  arranger?: string;
  instrumentId?: string;
  tuning?: string;
  groupNumber?: string;
  clef?: string;
}

export default function PdfTools() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.pdfTools');
  const [activeTab, setActiveTab] = useState<'split' | 'a3' | 'merge'>('split');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [splitRanges, setSplitRanges] = useState<SplitRange[]>([{ start: 1, end: 1, name: '', instrumentId: '', number: 1 }]);
  const [splitTitle, setSplitTitle] = useState('');
  const [splitArranger, setSplitArranger] = useState('');
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [a3Result, setA3Result] = useState<{ filepath: string; filename: string; splitCount: number; newPageCount: number } | null>(null);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeResult, setMergeResult] = useState<{ filepath: string; filename: string; pageCount: number } | null>(null);
  const [thumbnailSize, setThumbnailSize] = useState(100);
  const [savingAsMusicPiece, setSavingAsMusicPiece] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedList, setSelectedList] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data for saving as music piece
  const { data: orchestras = [] } = useOrchestras();
  const { data: lists = [] } = useMusicLists(selectedOrchestra || undefined);
  const { data: instruments = [] } = useInstruments();
  const mergeInputRef = useRef<HTMLInputElement>(null);

  // Create instrument options with tuning and clef combinations
  const instrumentOptions = useMemo((): InstrumentOption[] => {
    return instruments.map(inst => ({
      id: inst.id,
      label: `${inst.name}${inst.tuning ? ` (${inst.tuning})` : ''}${inst.clef ? ` - ${inst.clef}` : ''}`,
      name: inst.name,
      tuning: inst.tuning || '',
      clef: inst.clef || '',
    }));
  }, [instruments]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}` };
  };

  // Extract clean base name from filename (remove extension, make human-readable)
  const getBaseFilename = (filename: string): string => {
    // Remove .pdf extension
    let base = filename.replace(/\.pdf$/i, '');
    // Replace underscores and hyphens with spaces
    base = base.replace(/[_\-]+/g, ' ');
    // Remove multiple spaces
    base = base.replace(/\s+/g, ' ');
    // Remove leading/trailing spaces
    base = base.trim();
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
        setSplitTitle(baseName);
        setSplitArranger('');
        setSplitRanges([{ start: 1, end: info.pageCount, name: '', instrumentId: '', number: 1 }]);
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
      // Transform ranges to include generated filenames and display names
      const displayNames = splitRanges.map(range => generateDisplayName(range));
      const rangesWithNames = splitRanges.map(range => ({
        start: range.start,
        end: range.end,
        name: generateFilename(range),
      }));

      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('ranges', JSON.stringify(rangesWithNames));

      const response = await fetch(`${API_BASE}/pdf-tools/split`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error(t('pdfTools.splitFailed'));
      }

      const data = await response.json();
      // Enrich results with display names and metadata
      const enrichedResults = data.results.map((result: SplitResult, index: number) => {
        const range = splitRanges[index];
        const instrument = range ? instrumentOptions.find(i => i.id === range.instrumentId) : null;
        return {
          ...result,
          displayName: displayNames[index] || result.name,
          saved: false,
          title: splitTitle,
          arranger: splitArranger,
          instrumentId: range?.instrumentId || undefined,
          tuning: instrument?.tuning || undefined,
          groupNumber: range ? String(range.number) : undefined,
          clef: instrument?.clef || undefined,
        };
      });
      setSplitResults(enrichedResults);
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
    if (!token) {
      showError(t('common.sessionExpired'));
      return;
    }
    window.open(`${API_BASE}/pdf-tools/download/${filepath}?token=${encodeURIComponent(token)}`, '_blank');
  };

  const handleSaveAsMusicPiece = async (filepath: string, filename: string, resultItem?: SplitResult) => {
    if (!selectedOrchestra) {
      showError(t('pdfTools.selectOrchestraFirst'));
      return;
    }

    setSavingAsMusicPiece(filepath);
    try {
      const metadata = resultItem ? {
        title: resultItem.title,
        arranger: resultItem.arranger,
        instrumentId: resultItem.instrumentId,
        tuning: resultItem.tuning,
        groupNumber: resultItem.groupNumber,
        clef: resultItem.clef,
      } : undefined;

      const result = await savePdfAsMusicPiece(filepath, filename, selectedList || undefined, metadata);
      if (result.success) {
        showSuccess(t('pdfTools.savedAsMusicPiece', { title: result.title }));
        // Mark as saved instead of removing
        setSplitResults(prev => prev.map(r => r.filepath === filepath ? { ...r, saved: true } : r));
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

  const handleDownloadAll = async () => {
    const filepaths = splitResults.filter(r => r.filepath).map(r => r.filepath!);
    if (filepaths.length === 0) return;

    setDownloadingAll(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showError(t('common.sessionExpired'));
        return;
      }

      const response = await fetch(`${API_BASE}/pdf-tools/download-zip`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filepaths }),
      });

      if (!response.ok) {
        throw new Error(t('pdfTools.downloadFailed'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${splitTitle.replace(/\s+/g, '_') || 'split'}_parts.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      showError(error.message || t('pdfTools.downloadFailed'));
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleSaveAllAsMusicPieces = async () => {
    if (!selectedOrchestra) {
      showError(t('pdfTools.selectOrchestraFirst'));
      return;
    }

    const toSave = splitResults.filter(r => r.filepath && !r.saved);
    if (toSave.length === 0) return;

    setSavingAll(true);
    let savedCount = 0;
    const savedFilepaths: string[] = [];

    for (const result of toSave) {
      try {
        const metadata = {
          title: result.title,
          arranger: result.arranger,
          instrumentId: result.instrumentId,
          tuning: result.tuning,
          groupNumber: result.groupNumber,
          clef: result.clef,
        };
        const saveResult = await savePdfAsMusicPiece(result.filepath!, result.filename!, selectedList || undefined, metadata);
        if (saveResult.success) {
          savedCount++;
          savedFilepaths.push(result.filepath!);
        }
      } catch (error: any) {
        showError(t('pdfTools.errorSavingAsMusicPiece') + `: ${result.displayName}`);
      }
    }

    if (savedCount > 0) {
      showSuccess(t('pdfTools.allSavedAsMusicPieces', { count: savedCount }));
      // Mark as saved instead of removing
      setSplitResults(prev => prev.map(r => savedFilepaths.includes(r.filepath!) ? { ...r, saved: true } : r));
    }
    setSavingAll(false);
  };

  const addSplitRange = () => {
    const lastRange = splitRanges[splitRanges.length - 1];
    const newStart = lastRange ? lastRange.end + 1 : 1;
    const newEnd = pdfInfo ? Math.min(newStart, pdfInfo.pageCount) : newStart;
    setSplitRanges([...splitRanges, {
      start: newStart,
      end: newEnd,
      name: '',
      instrumentId: '',
      number: 1,
    }]);
  };

  // Calculate the next number for an instrument based on previous selections
  const getNextNumberForInstrument = (instrumentId: string, currentIndex: number): number => {
    let count = 1;
    for (let i = 0; i < currentIndex; i++) {
      if (splitRanges[i].instrumentId === instrumentId) {
        count++;
      }
    }
    return count;
  };

  // Update instrument and auto-calculate number
  const updateInstrument = (index: number, instrumentId: string) => {
    const updated = [...splitRanges];
    updated[index].instrumentId = instrumentId;
    updated[index].number = getNextNumberForInstrument(instrumentId, index);

    // Recalculate numbers for all subsequent ranges with the same instrument
    for (let i = index + 1; i < updated.length; i++) {
      if (updated[i].instrumentId === instrumentId) {
        updated[i].number = getNextNumberForInstrument(instrumentId, i);
      }
    }

    setSplitRanges(updated);
  };

  // Generate filename (underscores only as separator between fields, spaces preserved within)
  const generateFilename = (range: SplitRange): string => {
    const instrument = instrumentOptions.find(i => i.id === range.instrumentId);
    if (!instrument) {
      return range.name || 'Deel';
    }

    const parts = [
      splitTitle || 'Untitled',
      splitArranger || 'Unknown',
      instrument.name,
      instrument.tuning || 'C',
      String(range.number),
      instrument.clef || 'sol',
    ];

    return parts.join('_');
  };

  // Generate display name (human-readable with spaces)
  const generateDisplayName = (range: SplitRange): string => {
    const instrument = instrumentOptions.find(i => i.id === range.instrumentId);
    if (!instrument) {
      return range.name || 'Deel';
    }

    const title = splitTitle || 'Untitled';
    const arranger = splitArranger || 'Unknown';
    const tuning = instrument.tuning || 'C';
    const clef = instrument.clef || 'sol';

    return `${title} - ${arranger} - ${instrument.name.replace(/_/g, ' ')} (${tuning}) ${range.number} [${clef}]`;
  };

  const removeSplitRange = (index: number) => {
    const removedInstrumentId = splitRanges[index].instrumentId;
    const filtered = splitRanges.filter((_, i) => i !== index);

    // Recalculate numbers for remaining ranges with the same instrument
    if (removedInstrumentId) {
      let count = 0;
      for (let i = 0; i < filtered.length; i++) {
        if (filtered[i].instrumentId === removedInstrumentId) {
          count++;
          filtered[i].number = count;
        }
      }
    }

    setSplitRanges(filtered);
  };

  const updateSplitRange = (index: number, field: keyof SplitRange, value: string | number) => {
    const updated = [...splitRanges];
    if (field === 'start' || field === 'end') {
      updated[index][field] = Math.max(1, Math.min(pdfInfo?.pageCount || 1, Number(value)));
    } else if (field === 'number') {
      updated[index][field] = Math.max(1, Number(value));
    } else if (field === 'instrumentId') {
      // Use updateInstrument for instrument changes
      updateInstrument(index, value as string);
      return;
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
                      selectedRanges={splitRanges.map(range => ({
                        start: range.start,
                        end: range.end,
                        name: generateFilename(range),
                      }))}
                      thumbnailWidth={thumbnailSize}
                    />
                  </div>

                  <h4 style={{ marginBottom: '1rem' }}>{t('pdfTools.splitIntoParts')}</h4>

                  {/* General title and arranger fields */}
                  <div style={{
                    padding: '1rem',
                    background: 'var(--background)',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <div className="grid grid-2" style={{ gap: '1rem' }}>
                      <div className="form-group mb-0">
                        <label className="form-label">{t('pdfTools.musicTitle')}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={splitTitle}
                          onChange={(e) => setSplitTitle(e.target.value)}
                          placeholder={t('pdfTools.musicTitlePlaceholder')}
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="form-label">{t('pdfTools.arranger')}</label>
                        <input
                          type="text"
                          className="form-control"
                          value={splitArranger}
                          onChange={(e) => setSplitArranger(e.target.value)}
                          placeholder={t('pdfTools.arrangerPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>

                  {splitRanges.map((range, index) => (
                    <div key={index} className="flex gap-2 mb-2 items-end" style={{ flexWrap: 'wrap' }}>
                      <div className="form-group mb-0" style={{ flex: 2, minWidth: '200px' }}>
                        <label className="form-label">{t('pdfTools.instrument')}</label>
                        <select
                          className="form-control form-select"
                          value={range.instrumentId}
                          onChange={(e) => updateInstrument(index, e.target.value)}
                        >
                          <option value="">{t('pdfTools.selectInstrument')}</option>
                          {instrumentOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group mb-0" style={{ width: '70px' }}>
                        <label className="form-label">{t('pdfTools.number')}</label>
                        <input
                          type="number"
                          className="form-control"
                          value={range.number}
                          onChange={(e) => updateSplitRange(index, 'number', e.target.value)}
                          min={1}
                        />
                      </div>
                      <div className="form-group mb-0" style={{ width: '80px' }}>
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
                      <div className="form-group mb-0" style={{ width: '80px' }}>
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

                      {/* Bulk action buttons */}
                      {splitResults.filter(r => r.filepath).length > 1 && (
                        <div className="flex gap-2 mb-2">
                          <button
                            className="btn btn-outline"
                            onClick={handleDownloadAll}
                            disabled={downloadingAll}
                          >
                            {downloadingAll ? t('pdfTools.downloading') : t('pdfTools.downloadAll')}
                          </button>
                          <button
                            className="btn btn-primary"
                            onClick={handleSaveAllAsMusicPieces}
                            disabled={!selectedOrchestra || savingAll || splitResults.every(r => r.saved)}
                            title={!selectedOrchestra ? t('pdfTools.selectOrchestraFirst') : ''}
                          >
                            {savingAll ? t('pdfTools.saving') : t('pdfTools.saveAllAsMusicPieces')}
                          </button>
                        </div>
                      )}

                      <div className="grid" style={{ gap: '0.5rem' }}>
                        {splitResults.map((result, index) => (
                          <div
                            key={index}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem',
                              background: result.error ? 'var(--danger-light)' : result.saved ? 'var(--info-light, #d1ecf1)' : 'var(--success-light)',
                              borderRadius: '0.25rem',
                              flexWrap: 'wrap',
                              gap: '0.5rem'
                            }}
                          >
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <strong>{result.displayName}</strong>
                              {result.pageCount && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem' }}>
                                  ({result.pageCount} {t('pdfTools.pages')})
                                </span>
                              )}
                              {result.saved && (
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.875rem', color: 'var(--success, green)' }}>
                                  — {t('pdfTools.saved')}
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
                                  onClick={() => handleSaveAsMusicPiece(result.filepath!, result.filename!, result)}
                                  disabled={result.saved || !selectedOrchestra || savingAsMusicPiece === result.filepath}
                                  title={!selectedOrchestra ? t('pdfTools.selectOrchestraFirst') : ''}
                                >
                                  {savingAsMusicPiece === result.filepath ? '...' : result.saved ? t('pdfTools.saved') : t('pdfTools.saveAsMusicPiece')}
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
