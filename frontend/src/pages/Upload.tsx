import { useState, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrchestras } from '../hooks/useOrchestras';
import { FormField } from '../components/FormField';
import { useMusicLists, useCreateMusicList } from '../hooks/useMusicLists';
import { uploadMusicPieces, uploadMusicPiecesZip } from '../api';
import { FileDropzone } from '../components/FileDropzone';
import { SkeletonCard } from '../components/Skeleton';
import { showSuccess, showError } from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ImslpSearch } from '../components/ImslpSearch';
import { CloudFilePicker } from '../components/CloudFilePicker';
import { Icon } from '../components/Icon';

interface FileItem {
  file: File;
}

export default function Upload() {
  const { t } = useTranslation();
  const lijstId = useId();
  useDocumentTitle('pageTitle.upload');
  const [selectedOrchestra, setSelectedOrchestra] = useState('');
  const [selectedList, setSelectedList] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showImslpSearch, setShowImslpSearch] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const queryClient = useQueryClient();

  // TanStack Query hooks
  const { data: orchestras = [], isLoading: orchestrasLoading } = useOrchestras();
  const { data: lists = [] } = useMusicLists(selectedOrchestra || undefined);
  const createListMutation = useCreateMusicList();

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (uploadFiles: File[]) => uploadMusicPieces(uploadFiles, selectedList || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });

      if (result.errors && result.errors.length > 0) {
        showError(
          `${result.errors.length} ${t('upload.filesFailed')}:\n${result.errors.map((e: any) => e.filename).join(', ')}`,
        );
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

  // ZIP upload mutation
  const zipUploadMutation = useMutation({
    mutationFn: (file: File) => uploadMusicPiecesZip(file, selectedList || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
      queryClient.invalidateQueries({ queryKey: ['musicLists'] });

      if (result.errors && result.errors.length > 0) {
        showError(`${result.errors.length} ${t('upload.filesFailed')}`);
      }
      if (result.skipped && result.skipped.length > 0) {
        showError(`${result.skipped.length} bestanden overgeslagen (geen PDF)`);
      }
      if (result.uploaded.length > 0) {
        showSuccess(`${result.uploaded.length} ${t('upload.filesUploaded')} vanuit ZIP`);
        setZipFile(null);
      }
    },
    onError: (error) => {
      showError(getErrorMessage(error));
    },
  });

  const handleZipUpload = () => {
    if (!zipFile) return;
    zipUploadMutation.mutate(zipFile);
  };

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
      },
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
      <div className="page-header">
        <h1>{t('upload.title')}</h1>
        <button className="btn btn-outline" onClick={() => setShowImslpSearch(true)}>
          {t('imslp.searchOnImslp')}
        </button>
      </div>

      <div className="card mb-2">
        <div className="card-header">
          <h2 className="card-title">{t('upload.step1')}</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-2">
            <FormField className="form-group mb-0" label={t('upload.orchestra')}>
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
            </FormField>
            {/* Met de hand gekoppeld: onder dit label staat óf een nieuw-veld
                met twee knoppen, óf een keuzelijst met een knop. FormField
                kloont maar één kind. Er staat er altijd precies één van de twee
                op het scherm, dus beide dragen hetzelfde id. */}
            <div className="form-group mb-0">
              <label className="form-label" htmlFor={lijstId}>
                {t('upload.musicList')}
              </label>
              {showNewList ? (
                <div className="flex gap-1">
                  <input
                    id={lijstId}
                    type="text"
                    className="form-control"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t('upload.newListPlaceholder')}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateList();
                      }
                      if (e.key === 'Escape') {
                        setShowNewList(false);
                        setNewListName('');
                      }
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
                    onClick={() => {
                      setShowNewList(false);
                      setNewListName('');
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select
                    id={lijstId}
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
          <FileDropzone onFilesAccepted={handleFilesAccepted} disabled={uploadMutation.isPending}>
            <div className="dropzone-icon">
              <Icon name="fileText" size={48} />
            </div>
            <p className="dropzone-text">
              {t('upload.dragPdfHere')} <strong>{t('upload.clickToSelect')}</strong>
            </p>
            <p className="dropzone-text" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {t('upload.filenameFormat')}: Titel_arrangeur_instrument_stemming_groepnummer_sleutel.pdf
            </p>
          </FileDropzone>

          {/* ZIP Upload Section */}
          <div
            className="mt-2 p-2"
            style={{ backgroundColor: 'var(--bg-alt)', border: '2px dashed var(--border)', borderRadius: '8px' }}
          >
            <h4 className="mb-1">
              <Icon name="archive" size={20} /> ZIP Bulk Upload
            </h4>
            <p className="text-light mb-1" style={{ fontSize: '0.875rem' }}>
              {t('upload.zipBulkDescription')}
            </p>

            <div className="flex gap-1 items-center" style={{ flexWrap: 'wrap' }}>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
                id="zip-upload"
              />
              <label htmlFor="zip-upload" className="btn btn-outline" style={{ cursor: 'pointer' }}>
                <Icon name="upload" size={16} /> Selecteer ZIP
              </label>
              {zipFile && (
                <>
                  <span className="text-light">
                    {zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                  <button className="btn btn-primary" onClick={handleZipUpload} disabled={zipUploadMutation.isPending}>
                    {zipUploadMutation.isPending ? 'Uploaden...' : 'Upload ZIP'}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setZipFile(null)}
                    disabled={zipUploadMutation.isPending}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-2">
            <CloudFilePicker
              listId={selectedList || undefined}
              onImported={() => {
                queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
                queryClient.invalidateQueries({ queryKey: ['musicLists'] });
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="upload-list">
              <h4 className="mb-1">
                {files.length} {t('upload.filesSelected')}
              </h4>
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
              <p className="piece-meta mt-1">{t('upload.metadataNote')}</p>
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
            {uploadMutation.isPending
              ? t('upload.uploading2')
              : `${t('upload.uploadFiles')} ${files.length} ${t('upload.files')}`}
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
            <li>
              <code>The Pacific_Ted Ricketts_Bariton_Bb__sol.pdf</code>
            </li>
            <li>
              <code>Shannon Song_Rowwen Heze_Alto Saxophone_Eb_1.pdf</code>
            </li>
            <li>
              <code>Shannon Song_Rowwen Heze_Alto Saxophone_Eb_2.pdf</code>
            </li>
            <li>
              <code>The Pacific_Ted Ricketts_Altsax_Eb_1.pdf</code>
            </li>
          </ul>

          <p className="mt-2">
            <strong>{t('upload.tip')}:</strong> {t('upload.instrumentTip')}
          </p>
        </div>
      </div>

      {showImslpSearch && (
        <ImslpSearch
          onClose={() => setShowImslpSearch(false)}
          onImportSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['musicPieces'] });
          }}
        />
      )}
    </div>
  );
}
