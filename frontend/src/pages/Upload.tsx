import { useState, useEffect, useRef, type DragEvent, type ChangeEvent } from 'react';
import { getOrchestras, getMusicLists, uploadMusicPieces } from '../api';
import type { Orchestra, MusicList } from '../types';

interface FileItem {
  file: File;
}

export default function Upload() {
  const [orchestras, setOrchestras] = useState<Orchestra[]>([]);
  const [lists, setLists] = useState<MusicList[]>([]);
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOrchestras();
  }, []);

  useEffect(() => {
    if (selectedOrchestra) {
      loadLists(selectedOrchestra);
    } else {
      setLists([]);
      setSelectedList('');
    }
  }, [selectedOrchestra]);

  const loadOrchestras = async () => {
    try {
      const data = await getOrchestras();
      setOrchestras(data);
    } catch (error) {
      console.error('Error loading orchestras:', error);
    }
  };

  const loadLists = async (orchestraId: string) => {
    try {
      const data = await getMusicLists(orchestraId);
      setLists(data);
    } catch (error) {
      console.error('Error loading lists:', error);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf'
    );

    addFiles(droppedFiles);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(
        (file) => file.type === 'application/pdf'
      );
      addFiles(selectedFiles);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const newFileItems = newFiles.map((file) => ({ file }));

    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.file.name));
      const uniqueNew = newFileItems.filter((f) => !existingNames.has(f.file.name));
      return [...prev, ...uniqueNew];
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await uploadMusicPieces(
        files.map((f) => f.file),
        selectedList || undefined
      );

      setUploadResult({
        success: result.uploaded.length,
        errors: result.errors?.map((e: any) => `${e.filename}: ${e.error}`) || [],
      });

      if (result.errors?.length === 0 || !result.errors) {
        setFiles([]);
      }
    } catch (error: any) {
      setUploadResult({
        success: 0,
        errors: [error.response?.data?.error || 'Upload mislukt'],
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-3">Muziekstukken uploaden</h1>

      <div className="card mb-2">
        <div className="card-header">
          <h2 className="card-title">1. Selecteer orkest en lijst (optioneel)</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-2">
            <div className="form-group mb-0">
              <label className="form-label">Orkest</label>
              <select
                className="form-control form-select"
                value={selectedOrchestra}
                onChange={(e) => setSelectedOrchestra(e.target.value)}
              >
                <option value="">Selecteer orkest...</option>
                {orchestras.map((orchestra) => (
                  <option key={orchestra.id} value={orchestra.id}>
                    {orchestra.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label">Muzieklijst</label>
              <select
                className="form-control form-select"
                value={selectedList}
                onChange={(e) => setSelectedList(e.target.value)}
                disabled={!selectedOrchestra}
              >
                <option value="">Geen lijst (alleen uploaden)</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2 className="card-title">2. Selecteer bestanden</h2>
        </div>
        <div className="card-body">
          <div
            className={`upload-area ${isDragging ? 'dragover' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">📄</div>
            <p className="upload-text">
              Sleep PDF bestanden hierheen of klik om te selecteren
            </p>
            <p className="upload-text" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Bestandsnaam format: Titel_arrangeur_instrument_stemming_groepnummer_sleutel.pdf
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {files.length > 0 && (
            <div className="upload-list">
              <h4 className="mb-1">{files.length} bestanden geselecteerd</h4>
              {files.map((fileItem, index) => (
                <div key={index} className="upload-item">
                  <div style={{ flex: 1 }}>
                    <strong>{fileItem.file.name}</strong>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeFile(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <p className="piece-meta mt-1">
                YouTube links, speelduur en beschrijving kunnen na upload worden toegevoegd via Lijstbeheer.
              </p>
            </div>
          )}
        </div>
      </div>

      {uploadResult && (
        <div className={`alert ${uploadResult.errors.length > 0 ? 'alert-warning' : 'alert-success'}`}>
          <strong>{uploadResult.success} bestand(en) succesvol geüpload.</strong>
          {uploadResult.errors.length > 0 && (
            <ul className="mt-1 mb-0">
              {uploadResult.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
          >
            {isUploading ? 'Bezig met uploaden...' : `Upload ${files.length} bestand(en)`}
          </button>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header">
          <h2 className="card-title">Bestandsnaam formaat</h2>
        </div>
        <div className="card-body">
          <p>De bestandsnaam wordt automatisch geparseerd om metadata te extraheren:</p>
          <code>Titel_arrangeur_instrument_stemming_groepnummer_muzieksleutel.pdf</code>

          <h4 className="mt-2">Voorbeelden:</h4>
          <ul>
            <li><code>The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf</code></li>
            <li><code>Shannon Song_Rowwen Heze_Alto Saxophone_Eb_1.pdf</code></li>
            <li><code>Shannon Song_Rowwen Heze_Alto Saxophone_Eb_2.pdf</code></li>
            <li><code>The Pacific_Ted Ricketts_Altsax_Eb_1.pdf</code></li>
          </ul>

          <p className="mt-2">
            <strong>Tip:</strong> Het instrument wordt automatisch herkend via de instrumentenlijst
            en aliassen. "Altsax" wordt bijvoorbeeld automatisch gekoppeld aan "Alto Saxophone".
          </p>
        </div>
      </div>
    </div>
  );
}
