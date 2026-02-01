import { useCallback } from 'react';
import { useDropzone, FileRejection, Accept } from 'react-dropzone';
import { showError } from '../utils/toast';
import { formatFileSize } from '../utils/format';

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
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        const errors = rejectedFiles.map((rejection) => {
          const errorMessages = rejection.errors.map((e) => {
            if (e.code === 'file-too-large') {
              return `${rejection.file.name} is te groot (max ${formatFileSize(maxSize)})`;
            }
            if (e.code === 'file-invalid-type') {
              return `${rejection.file.name} heeft een ongeldig bestandstype`;
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
    [onFilesAccepted, maxSize]
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
    >
      <input {...getInputProps()} />
      {children || (
        <>
          <div className="dropzone-icon">📁</div>
          <p className="dropzone-text">
            {isDragActive ? (
              'Laat bestanden hier los...'
            ) : (
              <>
                Sleep bestanden hierheen of <strong>klik om te selecteren</strong>
              </>
            )}
          </p>
          <p className="dropzone-text" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Alleen PDF bestanden, max {formatFileSize(maxSize)} per bestand
          </p>
        </>
      )}
    </div>
  );
}

export default FileDropzone;
