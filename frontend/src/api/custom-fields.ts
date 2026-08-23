import api from './client';

export type EntityType =
  'user' | 'orchestra' | 'rehearsal' | 'concert' | 'music_piece' | 'loan' | 'instrument' | 'contact';
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'email'
  | 'phone'
  | 'url'
  | 'file';
export type VisibilityType = 'all' | 'admin_only' | 'committee_plus' | 'self_only';

export interface CustomFieldDefinition {
  id: string;
  entityType: EntityType;
  fieldKey: string;
  fieldLabel: string;
  fieldType: FieldType;
  fieldOptions?: string[];
  isRequired: boolean;
  isUnique: boolean;
  visibility: VisibilityType;
  selfEditable: boolean;
  sortOrder: number;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  validationRegex?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateFieldDefinitionData {
  entityType: EntityType;
  fieldKey: string;
  fieldLabel: string;
  fieldType: FieldType;
  fieldOptions?: string[];
  isRequired?: boolean;
  isUnique?: boolean;
  visibility?: VisibilityType;
  selfEditable?: boolean;
  sortOrder?: number;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  validationRegex?: string;
}

export interface FieldValueMeta {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  required: boolean;
  editable: boolean;
}

export interface FieldValuesResponse {
  values: Record<string, any>;
  meta: Record<string, FieldValueMeta>;
}

// Field Definitions
export const getFieldDefinitions = async (entityType?: EntityType): Promise<CustomFieldDefinition[]> => {
  const params = entityType ? { entityType } : {};
  const { data } = await api.get('/custom-fields/definitions', { params });
  return data;
};

export const getFieldDefinitionsForEntity = async (entityType: EntityType): Promise<CustomFieldDefinition[]> => {
  const { data } = await api.get(`/custom-fields/definitions/${entityType}`);
  return data;
};

export const createFieldDefinition = async (
  definition: CreateFieldDefinitionData,
): Promise<{ id: string; message: string }> => {
  const { data } = await api.post('/custom-fields/definitions', definition);
  return data;
};

/**
 * Wat je van een bestaande velddefinitie nog mag wijzigen.
 *
 * `entityType` en `fieldKey` staan er bewust niet in. De server laat de
 * wijzigingsbody door een zod-schema gaan dat die twee expliciet weglaat
 * (`.omit({ entityType: true, fieldKey: true })`), en zod verwijdert onbekende
 * sleutels zonder klacht. Wie ze toch meestuurde, kreeg een 200 terug terwijl
 * er niets veranderde - een hernoemde veldsleutel die stilzwijgend de oude
 * bleef. Het type sluit dat nu uit in plaats van het toe te staan.
 *
 * Een sleutel achteraf wijzigen kan trouwens ook echt niet: alle opgeslagen
 * waarden hangen aan die sleutel.
 */
export type UpdateFieldDefinitionData = Partial<Omit<CreateFieldDefinitionData, 'entityType' | 'fieldKey'>>;

export const updateFieldDefinition = async (id: string, definition: UpdateFieldDefinitionData): Promise<void> => {
  await api.patch(`/custom-fields/definitions/${id}`, definition);
};

export const deleteFieldDefinition = async (id: string): Promise<void> => {
  await api.delete(`/custom-fields/definitions/${id}`);
};

export const reorderFieldDefinitions = async (entityType: EntityType, fieldIds: string[]): Promise<void> => {
  await api.post('/custom-fields/definitions/reorder', { entityType, fieldIds });
};

// Field Values
export const getFieldValues = async (entityType: EntityType, entityId: string): Promise<FieldValuesResponse> => {
  const { data } = await api.get(`/custom-fields/values/${entityType}/${entityId}`);
  return data;
};

export const setFieldValues = async (
  entityType: EntityType,
  entityId: string,
  values: Record<string, any>,
): Promise<void> => {
  await api.post('/custom-fields/values', { entityType, entityId, values });
};

export const deleteFieldValue = async (entityType: EntityType, entityId: string, fieldKey: string): Promise<void> => {
  await api.delete(`/custom-fields/values/${entityType}/${entityId}/${fieldKey}`);
};
