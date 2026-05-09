import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone, FileRejection, Accept } from 'react-dropzone';
import { showError } from '../utils/toast';
import { formatFileSize } from '../utils/format';
import { Icon } from '../components/Icon';

interface FileDropzoneProps {
  onFilesAccepted: (files: File[]) => void;
  accept?: Accept;
  maxFiles?: number;
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * File dropzone component using react-dropzone
 */
export function FileDropzone({
  onFilesAccepted,
  accept = { 'application/pdf': ['.pdf'] },
  maxFiles = 100,
  maxSize = 50 * 1024 * 1024, // 50MB
  multiple = true,
  disabled = false,
  children,
}: FileDropzoneProps) {
  const { t } = useTranslation();
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const errors = rejectedFiles.map((rejection) => {
          const errorMessages = rejection.errors.map((e) => {
            if (e.code === 'file-too-large') {
              return t('fileDropzone.fileTooLarge', { fileName: rejection.file.name, maxSize: formatFileSize(maxSize) });
            }
            if (e.code === 'file-invalid-type') {
              return t('fileDropzone.invalidFileType', { fileName: rejection.file.name });
            }
            return e.message;
          });
          return errorMessages.join(', ');
        });
        showError(errors.join('\n'));
      }

      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }
    },
    [onFilesAccepted, maxSize, t]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize,
    multiple,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? 'drag-active' : ''} ${isDragReject ? 'drag-reject' : ''} ${disabled ? 'disabled' : ''}`}
      role="button"
      aria-label={t('fileDropzone.ariaLabel')}
    >
      <input {...getInputProps()} />
      {children || (
        <>
          <div className="dropzone-icon" aria-hidden="true"><Icon name="folder" size={48} /></div>
          <p className="dropzone-text">
            {isDragActive ? (
              t('fileDropzone.dropHere')
            ) : (
              <>
                {t('fileDropzone.dragOrClick')}
              </>
            )}
          </p>
          <p className="dropzone-text" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
            {t('fileDropzone.pdfOnly', { maxSize: formatFileSize(maxSize) })}
          </p>
        </>
      )}
    </div>
  );
}

export default FileDropzone;
