import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EntityType, FieldType, FieldValueMeta, getFieldValues, setFieldValues } from '../api/custom-fields';
import { showSuccess, showError } from '../utils/toast';
import { formatDate, formatDateTime } from '../utils/dateFormat';

interface CustomFieldRendererProps {
  entityType: EntityType;
  entityId: string;
  className?: string;
  layout?: 'vertical' | 'horizontal' | 'inline';
  showEmpty?: boolean;
}

export function CustomFieldRenderer({
  entityType,
  entityId,
  className = '',
  layout = 'vertical',
  showEmpty = false,
}: CustomFieldRendererProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    queryFn: () => getFieldValues(entityType, entityId),
    enabled: !!entityId,
  });

  if (isLoading) {
    return <div className="animate-pulse h-4 bg-base-300 rounded w-32" />;
  }

  if (!data || Object.keys(data.values).length === 0) {
    return null;
  }

  const fields = Object.entries(data.meta).map(([key, meta]) => ({
    key,
    value: data.values[key],
    meta,
  }));

  const visibleFields = showEmpty
    ? fields
    : fields.filter((f) => f.value !== null && f.value !== undefined && f.value !== '');

  if (visibleFields.length === 0) {
    return null;
  }

  const layoutClass = {
    vertical: 'space-y-2',
    horizontal: 'grid grid-cols-2 gap-x-4 gap-y-2',
    inline: 'flex flex-wrap gap-4',
  }[layout];

  return (
    <div className={`custom-fields-display ${layoutClass} ${className}`}>
      {visibleFields.map(({ key, value, meta }) => (
        <div key={key} className={layout === 'inline' ? 'flex items-center gap-2' : ''}>
          <span className="text-sm text-base-content/60">{meta.label}:</span>
          <span className="text-sm font-medium">
            <FieldValueDisplay value={value} type={meta.type} options={meta.options} />
          </span>
        </div>
      ))}
    </div>
  );
}

interface FieldValueDisplayProps {
  value: any;
  type: FieldType;
  options?: string[];
}

function FieldValueDisplay({ value, type }: FieldValueDisplayProps) {
  const { t } = useTranslation();

  if (value === null || value === undefined || value === '') {
    return <span className="text-base-content/40">-</span>;
  }

  switch (type) {
    case 'boolean':
      return <span>{value ? t('common.yes') : t('common.no')}</span>;

    case 'date':
      return <span>{formatDate(value)}</span>;

    case 'datetime':
      return <span>{formatDateTime(value)}</span>;

    case 'multiselect':
      if (Array.isArray(value)) {
        return <span>{value.join(', ')}</span>;
      }
      return <span>{value}</span>;

    case 'url':
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="link link-primary">
          {value}
        </a>
      );

    case 'email':
      return (
        <a href={`mailto:${value}`} className="link link-primary">
          {value}
        </a>
      );

    case 'phone':
      return (
        <a href={`tel:${value}`} className="link link-primary">
          {value}
        </a>
      );

    case 'textarea':
      return <span className="whitespace-pre-wrap">{value}</span>;

    default:
      return <span>{String(value)}</span>;
  }
}

interface CustomFieldFormSectionProps {
  entityType: EntityType;
  entityId: string;
  className?: string;
  onSaved?: () => void;
  autoSave?: boolean;
  disabled?: boolean;
}

export function CustomFieldFormSection({
  entityType,
  entityId,
  className = '',
  onSaved,
  autoSave = false,
  disabled = false,
}: CustomFieldFormSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [localValues, setLocalValues] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // De laatst ingevulde waarden, buiten de tekening om. De tijdklok van het
  // vanzelf opslaan leest hieruit, want wat in de sluiting van `handleChange`
  // staat is een momentopname van voor de wijziging.
  const laatsteWaarden = useRef<Record<string, any>>({});
  const opslaanKlok = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    queryFn: () => getFieldValues(entityType, entityId),
    enabled: !!entityId,
  });

  useEffect(() => {
    if (data) {
      laatsteWaarden.current = data.values;
      setLocalValues(data.values);
      setHasChanges(false);
    }
  }, [data]);

  // Een lopende tijdklok hoort niet af te gaan als het formulier al van het
  // scherm is; anders vertrekt er een seconde na het sluiten alsnog een
  // opslagverzoek.
  useEffect(() => {
    return () => {
      if (opslaanKlok.current) {
        clearTimeout(opslaanKlok.current);
        opslaanKlok.current = null;
      }
    };
  }, []);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, any>) => setFieldValues(entityType, entityId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-values', entityType, entityId] });
      showSuccess(t('customFields.saved'));
      setHasChanges(false);
      onSaved?.();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('customFields.errorSave'));
    },
  });

  const handleChange = (key: string, value: any) => {
    const volgende = { ...laatsteWaarden.current, [key]: value };
    laatsteWaarden.current = volgende;
    setLocalValues(volgende);
    setHasChanges(true);

    if (autoSave) {
      // Wachten tot het typen een seconde stilligt. De vorige klok moet dus
      // weg: hier stond `return () => clearTimeout(timeoutId)`, maar een
      // gewone afhandelaar is geen effect en React doet niets met wat eruit
      // komt. Er werd nooit iets afgebroken, dus elke toetsaanslag stuurde een
      // eigen opslagverzoek - en elk van die verzoeken vertrok met de
      // momentopname van de waarden van voor die toetsaanslag.
      if (opslaanKlok.current) {
        clearTimeout(opslaanKlok.current);
      }
      opslaanKlok.current = setTimeout(() => {
        opslaanKlok.current = null;
        saveMutation.mutate(laatsteWaarden.current);
      }, 1000);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(localValues);
  };

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-base-300 rounded w-24 mb-1" />
            <div className="h-10 bg-base-300 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || Object.keys(data.meta).length === 0) {
    return null;
  }

  const editableFields = Object.entries(data.meta).filter(([_, meta]) => meta.editable);

  if (editableFields.length === 0) {
    return <CustomFieldRenderer entityType={entityType} entityId={entityId} />;
  }

  return (
    <div className={`custom-fields-form ${className}`}>
      <div className="space-y-4">
        {editableFields.map(([key, meta]) => (
          <FieldInput
            key={key}
            fieldKey={key}
            meta={meta}
            value={localValues[key]}
            onChange={(value) => handleChange(key, value)}
            disabled={disabled || saveMutation.isPending}
          />
        ))}
      </div>

      {!autoSave && hasChanges && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? t('common.saving') : t('customFields.saveFields')}
          </button>
        </div>
      )}
    </div>
  );
}

interface FieldInputProps {
  fieldKey: string;
  meta: FieldValueMeta;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}

function FieldInput({ fieldKey, meta, value, onChange, disabled }: FieldInputProps) {
  const { t } = useTranslation();

  const inputId = `custom-field-${fieldKey}`;
  const isRequired = meta.required;

  const baseInputClass = 'input input-bordered w-full';
  const baseSelectClass = 'select select-bordered w-full';

  switch (meta.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <input
            id={inputId}
            type={
              meta.type === 'email' ? 'email' : meta.type === 'url' ? 'url' : meta.type === 'phone' ? 'tel' : 'text'
            }
            className={baseInputClass}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={isRequired}
            disabled={disabled}
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <textarea
            id={inputId}
            className="textarea textarea-bordered w-full"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={isRequired}
            disabled={disabled}
            rows={3}
          />
        </div>
      );

    case 'number':
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <input
            id={inputId}
            type="number"
            className={baseInputClass}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            required={isRequired}
            disabled={disabled}
          />
        </div>
      );

    case 'date':
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <input
            id={inputId}
            type="date"
            className={baseInputClass}
            value={value ? value.split('T')[0] : ''}
            onChange={(e) => onChange(e.target.value || null)}
            required={isRequired}
            disabled={disabled}
          />
        </div>
      );

    case 'datetime':
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <input
            id={inputId}
            type="datetime-local"
            className={baseInputClass}
            value={value ? value.slice(0, 16) : ''}
            onChange={(e) => onChange(e.target.value || null)}
            required={isRequired}
            disabled={disabled}
          />
        </div>
      );

    case 'boolean':
      return (
        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3" htmlFor={inputId}>
            <input
              id={inputId}
              type="checkbox"
              className="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
            />
            <span className="label-text">{meta.label}</span>
          </label>
        </div>
      );

    case 'select':
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <select
            id={inputId}
            className={baseSelectClass}
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
            required={isRequired}
            disabled={disabled}
          >
            <option value="">{t('common.select')}</option>
            {meta.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );

    case 'multiselect': {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <div className="form-control">
          <label className="label">
            <span className="label-text">
              {meta.label}
              {isRequired && <span className="text-error ml-1">*</span>}
            </span>
          </label>
          <div className="flex flex-wrap gap-2 p-2 border rounded-lg border-base-300 min-h-[2.5rem]">
            {meta.options?.map((opt) => {
              const isSelected = selectedValues.includes(opt);
              return (
                <label key={opt} className={`badge cursor-pointer ${isSelected ? 'badge-primary' : 'badge-outline'}`}>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange([...selectedValues, opt]);
                      } else {
                        onChange(selectedValues.filter((v: string) => v !== opt));
                      }
                    }}
                    disabled={disabled}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="form-control">
          <label className="label" htmlFor={inputId}>
            <span className="label-text">{meta.label}</span>
          </label>
          <input
            id={inputId}
            type="text"
            className={baseInputClass}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      );
  }
}

interface CustomFieldsSectionProps {
  entityType: EntityType;
  entityId: string;
  title?: string;
  editable?: boolean;
  className?: string;
}

export function CustomFieldsSection({
  entityType,
  entityId,
  title,
  editable = false,
  className = '',
}: CustomFieldsSectionProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);

  const { data } = useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    queryFn: () => getFieldValues(entityType, entityId),
    enabled: !!entityId,
  });

  if (!data || Object.keys(data.meta).length === 0) {
    return null;
  }

  return (
    <div className={`card bg-base-100 shadow-sm ${className}`}>
      <div className="card-body">
        <div className="flex justify-between items-center mb-2">
          <h3 className="card-title text-base">{title || t('customFields.additionalFields')}</h3>
          {editable && !isEditing && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
              {t('common.edit')}
            </button>
          )}
        </div>

        {isEditing ? (
          <CustomFieldFormSection entityType={entityType} entityId={entityId} onSaved={() => setIsEditing(false)} />
        ) : (
          <CustomFieldRenderer entityType={entityType} entityId={entityId} layout="horizontal" showEmpty={false} />
        )}

        {isEditing && (
          <div className="mt-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomFieldsSection;
