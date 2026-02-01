import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrchestras } from '../hooks/useOrchestras';
import { useMusicLists } from '../hooks/useMusicLists';
import { uploadMusicPieces } from '../api';
import { FileDropzone } from '../components/FileDropzone';
import { SkeletonCard } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';

interface FileItem {
  file: File;
}

export default function Upload() {
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);

  const queryClient = useQueryClient();

  // TanStack Query hooks
  const { data: orchestras = [], isLoading: orchestrasLoading } = useOrchestras();
  const { data: lists = [] } = useMusicLists(selectedOrchestra || undefined);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (uploadFiles: File[]) =>
      uploadMusicPieces(uploadFiles, selectedList || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });

      if (result.errors && result.errors.length > 0) {
        showError(`${result.errors.length} bestand(en) mislukt:\n${result.errors.map((e: any) => e.filename).join(', ')}`);
      }

      if (result.uploaded.length > 0) {
        showSuccess(`${result.uploaded.length} bestand(en) succesvol geüpload`);
        setFiles([]);
      }
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });

  const handleFilesAccepted = useCallback((acceptedFiles: File[]) => {
    const newFileItems = acceptedFiles.map((file) => ({ file }));

    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.file.name));
      const uniqueNew = newFileItems.filter((f) => !existingNames.has(f.file.name));
      return [...prev, ...uniqueNew];
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (files.length === 0) return;
    uploadMutation.mutate(files.map((f) => f.file));
  };

  const handleOrchestraChange = (orchestraId: string) => {
    setSelectedOrchestra(orchestraId);
    setSelectedList('');
  };

  if (orchestrasLoading) {
    return (
      <div>
        <h1 className="mb-3">Muziekstukken uploaden</h1>
        <SkeletonCard />
      </div>
    );
  }

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
                onChange={(e) => handleOrchestraChange(e.target.value)}
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
          <FileDropzone
            onFilesAccepted={handleFilesAccepted}
            disabled={uploadMutation.isPending}
          >
            <div className="dropzone-icon">📄</div>
            <p className="dropzone-text">
              Sleep PDF bestanden hierheen of <strong>klik om te selecteren</strong>
            </p>
            <p className="dropzone-text" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Bestandsnaam format: Titel_arrangeur_instrument_stemming_groepnummer_sleutel.pdf
            </p>
          </FileDropzone>

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
                    disabled={uploadMutation.isPending}
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

      <div className="card">
        <div className="card-body">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleUpload}
            disabled={files.length === 0 || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? 'Bezig met uploaden...' : `Upload ${files.length} bestand(en)`}
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
