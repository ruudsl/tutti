import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from '../components/Icon';
import {
  getFieldDefinitions,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  CustomFieldDefinition,
  EntityType,
  FieldType,
  VisibilityType,
  CreateFieldDefinitionData,
} from '../api/custom-fields';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

const ENTITY_TYPES: { value: EntityType; labelKey: string; icon: IconName }[] = [
  { value: 'user', labelKey: 'customFields.entityTypes.user', icon: 'user' },
  { value: 'orchestra', labelKey: 'customFields.entityTypes.orchestra', icon: 'users' },
  { value: 'rehearsal', labelKey: 'customFields.entityTypes.rehearsal', icon: 'calendar' },
  { value: 'concert', labelKey: 'customFields.entityTypes.concert', icon: 'music' },
  { value: 'music_piece', labelKey: 'customFields.entityTypes.music_piece', icon: 'fileText' },
  { value: 'loan', labelKey: 'customFields.entityTypes.loan', icon: 'clipboard' },
  { value: 'instrument', labelKey: 'customFields.entityTypes.instrument', icon: 'music2' },
  { value: 'contact', labelKey: 'customFields.entityTypes.contact', icon: 'book' },
];

const FIELD_TYPES: { value: FieldType; labelKey: string }[] = [
  { value: 'text', labelKey: 'customFields.fieldTypes.text' },
  { value: 'textarea', labelKey: 'customFields.fieldTypes.textarea' },
  { value: 'number', labelKey: 'customFields.fieldTypes.number' },
  { value: 'date', labelKey: 'customFields.fieldTypes.date' },
  { value: 'datetime', labelKey: 'customFields.fieldTypes.datetime' },
  { value: 'boolean', labelKey: 'customFields.fieldTypes.boolean' },
  { value: 'select', labelKey: 'customFields.fieldTypes.select' },
  { value: 'multiselect', labelKey: 'customFields.fieldTypes.multiselect' },
  { value: 'email', labelKey: 'customFields.fieldTypes.email' },
  { value: 'phone', labelKey: 'customFields.fieldTypes.phone' },
  { value: 'url', labelKey: 'customFields.fieldTypes.url' },
];

const VISIBILITY_OPTIONS: { value: VisibilityType; labelKey: string }[] = [
  { value: 'all', labelKey: 'customFields.visibility.all' },
  { value: 'admin_only', labelKey: 'customFields.visibility.admin_only' },
  { value: 'committee_plus', labelKey: 'customFields.visibility.committee_plus' },
  { value: 'self_only', labelKey: 'customFields.visibility.self_only' },
];

export default function CustomFieldsAdmin() {
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.customFields');
  const queryClient = useQueryClient();

  const [selectedEntityType, setSelectedEntityType] = useState<EntityType>('user');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [deletingField, setDeletingField] = useState<CustomFieldDefinition | null>(null);

  const { data: definitions = [], isLoading } = useQuery({
    queryKey: ['custom-field-definitions', selectedEntityType],
    queryFn: () => getFieldDefinitions(selectedEntityType),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFieldDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-definitions'] });
      showSuccess(t('customFields.deleted'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('customFields.errorDelete'));
    },
  });

  const handleDelete = (field: CustomFieldDefinition) => {
    setDeletingField(field);
  };

  const entityTypeInfo = ENTITY_TYPES.find((e) => e.value === selectedEntityType);

  if (isLoading) {
    return (
      <div>
        <h1>{t('customFields.title')}</h1>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          {t('customFields.title')}
          <span className="badge badge-primary badge-title-count">{definitions.length}</span>
        </h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" /> {t('customFields.addField')}
        </button>
      </div>

      <div className="card mb-2">
        <div className="card-body">
          <div className="form-group mb-0">
            <label>{t('customFields.entityType')}</label>
            <div className="button-group-tabs">
              {ENTITY_TYPES.map((type) => (
                <button
                  key={type.value}
                  className={`btn ${selectedEntityType === type.value ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setSelectedEntityType(type.value)}
                >
                  <Icon name={type.icon} /> {t(type.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <Icon name={entityTypeInfo?.icon || 'settings'} /> {t(entityTypeInfo?.labelKey || '')}
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>{t('customFields.fieldKey')}</th>
                <th>{t('customFields.fieldLabel')}</th>
                <th>{t('customFields.fieldType')}</th>
                <th>{t('customFields.visibility.label')}</th>
                <th>{t('customFields.required')}</th>
                <th className="actions-column">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {definitions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    {t('customFields.noFields')}
                  </td>
                </tr>
              ) : (
                definitions.map((field) => (
                  <tr key={field.id}>
                    <td>
                      <code>{field.fieldKey}</code>
                    </td>
                    <td>{field.fieldLabel}</td>
                    <td>{t(FIELD_TYPES.find((f) => f.value === field.fieldType)?.labelKey || field.fieldType)}</td>
                    <td>
                      <span className="badge badge-outline">
                        {t(VISIBILITY_OPTIONS.find((v) => v.value === field.visibility)?.labelKey || field.visibility)}
                      </span>
                    </td>
                    <td>
                      {field.isRequired ? (
                        <Icon name="check" className="text-success" />
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="button-group">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => setEditingField(field)}
                          title={t('common.edit')}
                        >
                          <Icon name="pencil" />
                        </button>
                        <button
                          className="btn btn-sm btn-danger-outline"
                          onClick={() => handleDelete(field)}
                          title={t('common.delete')}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && <FieldFormModal entityType={selectedEntityType} onClose={() => setShowCreateModal(false)} />}

      {editingField && (
        <FieldFormModal field={editingField} entityType={selectedEntityType} onClose={() => setEditingField(null)} />
      )}

      {/* Delete Field Confirmation */}
      {deletingField && (
        <ConfirmDialog
          title={t('customFields.deleteTitle')}
          message={t('customFields.confirmDelete', { name: deletingField.fieldLabel })}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.mutate(deletingField.id, {
              onSuccess: () => setDeletingField(null),
            });
          }}
          onCancel={() => setDeletingField(null)}
        />
      )}
    </div>
  );
}

function FieldFormModal({
  field,
  entityType,
  onClose,
}: {
  field?: CustomFieldDefinition;
  entityType: EntityType;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<CreateFieldDefinitionData>({
    entityType,
    fieldKey: field?.fieldKey || '',
    fieldLabel: field?.fieldLabel || '',
    fieldType: field?.fieldType || 'text',
    fieldOptions: field?.fieldOptions || [],
    isRequired: field?.isRequired || false,
    isUnique: field?.isUnique || false,
    visibility: field?.visibility || 'all',
    selfEditable: field?.selfEditable || false,
    sortOrder: field?.sortOrder || 0,
    description: field?.description || '',
    placeholder: field?.placeholder || '',
    defaultValue: field?.defaultValue || '',
    validationRegex: field?.validationRegex || '',
  });
  const [optionsText, setOptionsText] = useState((field?.fieldOptions || []).join('\n'));

  const createMutation = useMutation({
    mutationFn: createFieldDefinition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-definitions'] });
      showSuccess(t('customFields.created'));
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('customFields.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateFieldDefinitionData>) => updateFieldDefinition(field!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-field-definitions'] });
      showSuccess(t('customFields.updated'));
      onClose();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('customFields.errorUpdate'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const options = optionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const data = { ...formData, fieldOptions: options.length > 0 ? options : undefined };

    if (field) {
      const { entityType: _, fieldKey: __, ...updateData } = data;
      updateMutation.mutate(updateData);
    } else {
      createMutation.mutate(data);
    }
  };

  const needsOptions = formData.fieldType === 'select' || formData.fieldType === 'multiselect';

  return (
    <Modal onClose={onClose} title={field ? t('customFields.editField') : t('customFields.addField')} size="large">
      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label>{t('customFields.fieldKey')} *</label>
              <input
                type="text"
                className="form-control"
                value={formData.fieldKey}
                onChange={(e) =>
                  setFormData({ ...formData, fieldKey: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })
                }
                disabled={!!field}
                placeholder="my_field_key"
                required
              />
              <small className="text-muted">{t('customFields.fieldKeyHelp')}</small>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label>{t('customFields.fieldLabel')} *</label>
              <input
                type="text"
                className="form-control"
                value={formData.fieldLabel}
                onChange={(e) => setFormData({ ...formData, fieldLabel: e.target.value })}
                required
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label>{t('customFields.fieldType')} *</label>
              <select
                className="form-control"
                value={formData.fieldType}
                onChange={(e) => setFormData({ ...formData, fieldType: e.target.value as FieldType })}
                disabled={!!field}
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {t(type.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label>{t('customFields.visibility.label')}</label>
              <select
                className="form-control"
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value as VisibilityType })}
              >
                {VISIBILITY_OPTIONS.map((vis) => (
                  <option key={vis.value} value={vis.value}>
                    {t(vis.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {needsOptions && (
          <div className="form-group">
            <label>{t('customFields.options')}</label>
            <textarea
              className="form-control"
              rows={4}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder={t('customFields.optionsPlaceholder')}
            />
            <small className="text-muted">{t('customFields.optionsHelp')}</small>
          </div>
        )}

        <div className="form-group">
          <label>{t('customFields.description')}</label>
          <input
            type="text"
            className="form-control"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>{t('customFields.placeholder')}</label>
          <input
            type="text"
            className="form-control"
            value={formData.placeholder}
            onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
          />
        </div>

        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.isRequired}
                  onChange={(e) => setFormData({ ...formData, isRequired: e.target.checked })}
                />
                {t('customFields.isRequired')}
              </label>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.isUnique}
                  onChange={(e) => setFormData({ ...formData, isUnique: e.target.checked })}
                />
                {t('customFields.isUnique')}
              </label>
            </div>
          </div>
        </div>

        {entityType === 'user' && (
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.selfEditable}
                onChange={(e) => setFormData({ ...formData, selfEditable: e.target.checked })}
              />
              {t('customFields.selfEditable')}
            </label>
            <small className="text-muted d-block">{t('customFields.selfEditableHelp')}</small>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
