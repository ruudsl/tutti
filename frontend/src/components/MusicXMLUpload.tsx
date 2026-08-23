/**
 * MusicXML Upload Component (WP5)
 *
 * Drag & drop component for uploading MusicXML files.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { useUploadMusicXML, useDeleteMusicXML } from '../hooks/useVocabulary';
import { Icon } from './Icon';
import { ConfirmDialog } from './ConfirmDialog';

interface MusicXMLUploadProps {
  titleId: string;
  hasExistingData?: boolean;
  onSuccess?: () => void;
  /**
   * Id voor het bestandsveld in het sleepvlak, zodat een `<label htmlFor>`
   * erbuiten er echt naartoe kan wijzen. Optioneel, want niet elke aanroeper
   * heeft een label nodig.
   */
  id?: string;
}

export function MusicXMLUpload({ titleId, hasExistingData, onSuccess, id }: MusicXMLUploadProps) {
  const { t } = useTranslation();
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    metadata?: Record<string, unknown>;
    warnings?: string[];
  } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const uploadMutation = useUploadMusicXML();
  const deleteMutation = useDeleteMusicXML();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploadResult(null);

      try {
        const result = await uploadMutation.mutateAsync({ titleId, file });
        setUploadResult({
          success: true,
          message: result.message,
          metadata: result.metadata,
          warnings: result.warnings,
        });
        onSuccess?.();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Upload mislukt';
        setUploadResult({
          success: false,
          message,
        });
      }
    },
    [titleId, uploadMutation, onSuccess],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/xml': ['.xml', '.musicxml'],
      'text/xml': ['.xml'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    disabled: uploadMutation.isPending,
  });

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(titleId);
      setUploadResult({
        success: true,
        message: t('metadata.musicXMLDeleted'),
      });
      onSuccess?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('errors.deleteFailed');
      setUploadResult({
        success: false,
        message,
      });
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      {/*
        Zonder rol en naam is dit sleepvlak een doodlopende tabstop.
        react-dropzone geeft het namelijk wél tabIndex 0 én role="presentation",
        en die twee vloeken: je landt er met de tab-toets op, maar de rol haalt
        de betekenis er juist af, dus een schermlezer kondigt niets aan. Het
        bestandsveld erbinnen krijgt tabIndex -1 en wordt dus overgeslagen - de
        toetsenbordweg liep daardoor nergens naartoe, ook al werkt de muisweg
        via het label nu wel.
        Met role="button" is het weer een knop, en de Enter- en spatie-
        afhandeling die react-dropzone al meelevert opent dan de bestandskiezer.
        De naam komt uit `aria-label` en niet uit de inhoud van het vlak: die
        inhoud bevat het verborgen bestandsveld, en dat telt in de naamberekening
        mee als besturingselement (browsers plakken er "geen bestand gekozen" en
        dergelijke bij). De gekozen tekst is exact wat er zichtbaar staat, zodat
        wie het vlak ziet en wie het hoort dezelfde naam gebruikt.
      */}
      <div
        {...getRootProps({ role: 'button', 'aria-label': t('metadata.dragMusicXML') })}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/10' : 'border-base-300 hover:border-primary/50'
        } ${uploadMutation.isPending ? 'opacity-50 cursor-wait' : ''}`}
      >
        {/*
          Het id hoort hier en niet op het sleepvlak eromheen. Dat vlak blijft
          een <div>, en een <label> kan alleen naar een echt besturingselement
          wijzen - naar een div wijst hij nergens heen, ook niet met role="button".
          react-dropzone verbergt dit bestandsveld met een clip-truc en niet met
          display:none, dus het blijft een echt veld dat de aanwijzer kan
          ontvangen en dat bij een klik op het label de bestandskiezer opent.
        */}
        <input {...getInputProps()} id={id} />
        <div className="flex flex-col items-center gap-2">
          {uploadMutation.isPending ? (
            <>
              <span className="loading loading-spinner loading-lg" />
              <p>{t('metadata.uploading')}</p>
            </>
          ) : (
            <>
              <Icon name="upload" size={32} className="text-base-content/60" />
              {isDragActive ? (
                <p>{t('metadata.dropHere')}</p>
              ) : (
                <>
                  <p>{t('metadata.dragMusicXML')}</p>
                  <p className="text-sm text-base-content/60">{t('metadata.musicXMLFormats')}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Existing data notice */}
      {hasExistingData && !uploadResult && (
        <div className="alert alert-info">
          <Icon name="fileText" size={20} />
          <span>{t('metadata.hasMusicXML')}</span>
          <div className="flex gap-2">
            <a href={`/api/music-pieces/title-musicxml/${titleId}`} download className="btn btn-sm btn-ghost">
              <Icon name="download" size={16} />
              {t('common.download')}
            </a>
            <button
              type="button"
              className="btn btn-sm btn-ghost text-error"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending}
            >
              <Icon name="trash" size={16} />
              {t('common.delete')}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {uploadResult && (
        <div className={`alert ${uploadResult.success ? 'alert-success' : 'alert-error'}`}>
          <Icon name={uploadResult.success ? 'check' : 'warning'} size={20} />
          <div className="flex-1">
            <p>{uploadResult.message}</p>

            {/* Show extracted metadata */}
            {uploadResult.success && uploadResult.metadata && (
              <div className="mt-2 text-sm">
                <p className="font-medium">{t('metadata.extractedData')}:</p>
                <ul className="list-disc list-inside mt-1">
                  {uploadResult.metadata.composer ? (
                    <li>
                      {t('metadata.composer')}: {String(uploadResult.metadata.composer)}
                    </li>
                  ) : null}
                  {uploadResult.metadata.arranger ? (
                    <li>
                      {t('metadata.arranger')}: {String(uploadResult.metadata.arranger)}
                    </li>
                  ) : null}
                  {uploadResult.metadata.workNumber ? (
                    <li>
                      {t('metadata.workNumber')}: {String(uploadResult.metadata.workNumber)}
                    </li>
                  ) : null}
                  {Number(uploadResult.metadata.partsCount) > 0 ? (
                    <li>
                      {t('metadata.partsCount')}: {String(uploadResult.metadata.partsCount)}
                    </li>
                  ) : null}
                </ul>
              </div>
            )}

            {/* Show warnings */}
            {uploadResult.warnings && uploadResult.warnings.length > 0 && (
              <div className="mt-2 text-sm text-warning">
                <p className="font-medium">{t('common.warnings')}:</p>
                <ul className="list-disc list-inside">
                  {uploadResult.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUploadResult(null)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('metadata.confirmDeleteMusicXML')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
