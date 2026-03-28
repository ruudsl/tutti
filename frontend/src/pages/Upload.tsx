import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrchestras } from '../hooks/useOrchestras';
import { useMusicLists, useCreateMusicList } from '../hooks/useMusicLists';
import { uploadMusicPieces } from '../api';
import { FileDropzone } from '../components/FileDropzone';
import { SkeletonCard } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ImslpSearch } from '../components/ImslpSearch';

interface FileItem {
  file: File;
}

export default function Upload() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.upload');
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showImslpSearch, setShowImslpSearch] = useState(false);

  const queryClient = useQueryClient();

  // TanStack Query hooks
  const { data: orchestras = [], isLoading: orchestrasLoading } = useOrchestras();
  const { data: lists = [] } = useMusicLists(selectedOrchestra || undefined);
  const createListMutation = useCreateMusicList();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (uploadFiles: File[]) =>
      uploadMusicPieces(uploadFiles, selectedList || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });

      if (result.errors && result.errors.length > 0) {
        showError(`${result.errors.length} ${t('upload.filesFailed')}:\n${result.errors.map((e: any) => e.filename).join(', ')}`);
      }

      if (result.uploaded.length > 0) {
        showSuccess(`${result.uploaded.length} ${t('upload.filesUploaded')}`);
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
    setShowNewList(false);
    setNewListName('');
  };

  const handleCreateList = () => {
    if (!newListName.trim() || !selectedOrchestra) return;
    createListMutation.mutate(
      { name: newListName.trim(), orchestraId: selectedOrchestra },
      {
        onSuccess: (result) => {
          setSelectedList(result.id);
          setShowNewList(false);
          setNewListName('');
        },
      }
    );
  };

  if (orchestrasLoading) {
    return (
      <div>
        <h1 className="mb-3">{t('upload.title')}</h1>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h1>{t('upload.title')}</h1>
        <button
          className="btn btn-outline"
          onClick={() => setShowImslpSearch(true)}
        >
          {t('imslp.searchOnImslp')}
        </button>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2 className="card-title">{t('upload.step1')}</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-2">
            <div className="form-group mb-0">
              <label className="form-label">{t('upload.orchestra')}</label>
              <select
                className="form-control form-select"
                value={selectedOrchestra}
                onChange={(e) => handleOrchestraChange(e.target.value)}
              >
                <option value="">{t('upload.selectOrchestra')}</option>
                {orchestras.map((orchestra) => (
                  <option key={orchestra.id} value={orchestra.id}>
                    {orchestra.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label">{t('upload.musicList')}</label>
              {showNewList ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    className="form-control"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t('upload.newListPlaceholder')}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleCreateList(); }
                      if (e.key === 'Escape') { setShowNewList(false); setNewListName(''); }
                    }}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleCreateList}
                    disabled={!newListName.trim() || createListMutation.isPending}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {createListMutation.isPending ? '...' : t('common.save')}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setShowNewList(false); setNewListName(''); }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select
                    className="form-control form-select"
                    value={selectedList}
                    onChange={(e) => setSelectedList(e.target.value)}
                    disabled={!selectedOrchestra}
                    style={{ flex: 1 }}
                  >
                    <option value="">{t('upload.noListUploadOnly')}</option>
                    {lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowNewList(true)}
                    disabled={!selectedOrchestra}
                    title={t('upload.newList')}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + {t('upload.newList')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2 className="card-title">{t('upload.step2')}</h2>
        </div>
        <div className="card-body">
          <FileDropzone
            onFilesAccepted={handleFilesAccepted}
            disabled={uploadMutation.isPending}
          >
            <div className="dropzone-icon">📄</div>
            <p className="dropzone-text">
              {t('upload.dragPdfHere')} <strong>{t('upload.clickToSelect')}</strong>
            </p>
            <p className="dropzone-text" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {t('upload.filenameFormat')}: Titel_arrangeur_instrument_stemming_groepnummer_sleutel.pdf
            </p>
          </FileDropzone>

          {files.length > 0 && (
            <div className="upload-list">
              <h4 className="mb-1">{files.length} {t('upload.filesSelected')}</h4>
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
                {t('upload.metadataNote')}
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
            {uploadMutation.isPending ? t('upload.uploading2') : `${t('upload.uploadFiles')} ${files.length} ${t('upload.files')}`}
          </button>
        </div>
      </div>

      <div className="card mt-2">
        <div className="card-header">
          <h2 className="card-title">{t('upload.filenameFormatTitle')}</h2>
        </div>
        <div className="card-body">
          <p>{t('upload.filenameFormatDesc')}</p>
          <code>Titel_arrangeur_instrument_stemming_groepnummer_muzieksleutel.pdf</code>

          <h4 className="mt-2">{t('upload.examples')}:</h4>
          <ul>
            <li><code>The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf</code></li>
            <li><code>Shannon Song_Rowwen Heze_Alto Saxophone_Eb_1.pdf</code></li>
            <li><code>Shannon Song_Rowwen Heze_Alto Saxophone_Eb_2.pdf</code></li>
            <li><code>The Pacific_Ted Ricketts_Altsax_Eb_1.pdf</code></li>
          </ul>

          <p className="mt-2">
            <strong>{t('upload.tip')}:</strong> {t('upload.instrumentTip')}
          </p>
        </div>
      </div>
    </div>
  );
}
