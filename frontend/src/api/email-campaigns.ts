import api from './client';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
export type TargetType = 'all' | 'orchestras' | 'roles' | 'custom';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  isSystem: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  targetType: TargetType;
  scheduledAt?: string;
  sentAt?: string;
  totalRecipients: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface EmailCampaignDetail extends EmailCampaign {
  bodyHtml: string;
  bodyText?: string;
  templateId?: string;
  targetOrchestras?: string[];
  targetRoles?: string[];
  targetUserIds?: string[];
  updatedAt: string;
  recipientStats: Record<string, number>;
}

export interface CreateTemplateData {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

export interface CreateCampaignData {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  templateId?: string;
  targetType: TargetType;
  targetOrchestras?: string[];
  targetRoles?: string[];
  targetUserIds?: string[];
  scheduledAt?: string;
}

export interface RecipientPreview {
  count: number;
  recipients: { id: string; email: string; name: string }[];
}

// Templates
export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const response = await api.get('/email-campaigns/templates');
  return response.data;
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate> {
  const response = await api.get(`/email-campaigns/templates/${id}`);
  return response.data;
}

export async function createEmailTemplate(data: CreateTemplateData): Promise<{ id: string; message: string }> {
  const response = await api.post('/email-campaigns/templates', data);
  return response.data;
}

export async function updateEmailTemplate(id: string, data: Partial<CreateTemplateData>): Promise<{ message: string }> {
  const response = await api.put(`/email-campaigns/templates/${id}`, data);
  return response.data;
}

export async function deleteEmailTemplate(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/email-campaigns/templates/${id}`);
  return response.data;
}

// Campaigns
export async function getEmailCampaigns(status?: CampaignStatus): Promise<EmailCampaign[]> {
  const params = status ? `?status=${status}` : '';
  const response = await api.get(`/email-campaigns${params}`);
  return response.data;
}

export async function getEmailCampaign(id: string): Promise<EmailCampaignDetail> {
  const response = await api.get(`/email-campaigns/${id}`);
  return response.data;
}

export async function createEmailCampaign(data: CreateCampaignData): Promise<{ id: string; message: string }> {
  const response = await api.post('/email-campaigns', data);
  return response.data;
}

export async function updateEmailCampaign(id: string, data: Partial<CreateCampaignData>): Promise<{ message: string }> {
  const response = await api.put(`/email-campaigns/${id}`, data);
  return response.data;
}

export async function deleteEmailCampaign(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/email-campaigns/${id}`);
  return response.data;
}

export async function previewRecipients(campaignId: string): Promise<RecipientPreview> {
  const response = await api.get(`/email-campaigns/${campaignId}/preview-recipients`);
  return response.data;
}

export async function scheduleCampaign(campaignId: string, scheduledAt?: string): Promise<{ message: string }> {
  const response = await api.post(`/email-campaigns/${campaignId}/schedule`, { scheduledAt });
  return response.data;
}

export async function cancelCampaign(campaignId: string): Promise<{ message: string }> {
  const response = await api.post(`/email-campaigns/${campaignId}/cancel`);
  return response.data;
}

export async function sendCampaign(campaignId: string): Promise<{ message: string }> {
  const response = await api.post(`/email-campaigns/${campaignId}/send`);
  return response.data;
}

export async function sendTestEmail(campaignId: string, email: string): Promise<{ message: string }> {
  const response = await api.post(`/email-campaigns/${campaignId}/test`, { email });
  return response.data;
}

// Attachments
export interface CampaignAttachment {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName?: string;
  uploadedAt: string;
}

export async function getCampaignAttachments(campaignId: string): Promise<CampaignAttachment[]> {
  const response = await api.get(`/email-campaigns/${campaignId}/attachments`);
  return response.data;
}

export async function uploadCampaignAttachment(
  campaignId: string,
  file: File,
): Promise<{ id: string; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/email-campaigns/${campaignId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteCampaignAttachment(campaignId: string, attachmentId: string): Promise<{ message: string }> {
  const response = await api.delete(`/email-campaigns/${campaignId}/attachments/${attachmentId}`);
  return response.data;
}

// Recipients
export type RecipientDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';

export interface CampaignRecipient {
  id: string;
  email: string;
  name: string;
  status: RecipientDeliveryStatus;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bouncedAt?: string;
  bounceReason?: string;
}

export interface CampaignRecipientsResponse {
  recipients: CampaignRecipient[];
  total: number;
  byStatus: Record<RecipientDeliveryStatus, number>;
}

export async function getCampaignRecipients(campaignId: string): Promise<CampaignRecipientsResponse> {
  const response = await api.get(`/email-campaigns/${campaignId}/recipients`);
  return response.data;
}
