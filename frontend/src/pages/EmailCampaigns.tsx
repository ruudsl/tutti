import { useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '../hooks/useConfirm';
import { Icon, IconName } from '../components/Icon';
import {
  getEmailCampaigns,
  getEmailCampaign,
  createEmailCampaign,
  deleteEmailCampaign,
  previewRecipients,
  scheduleCampaign,
  cancelCampaign,
  sendCampaign,
  sendTestEmail,
  getEmailTemplates,
  getCampaignAttachments,
  uploadCampaignAttachment,
  deleteCampaignAttachment,
  getCampaignRecipients,
  EmailCampaign,
  EmailCampaignDetail,
  CampaignStatus,
  CreateCampaignData,
  EmailTemplate,
  CampaignAttachment,
  CampaignRecipient,
  RecipientDeliveryStatus,
} from '../api/email-campaigns';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';

const STATUS_ICONS: Record<CampaignStatus, IconName> = {
  draft: 'fileText',
  scheduled: 'clock',
  sending: 'refresh',
  sent: 'checkCircle',
  cancelled: 'close',
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'badge-secondary',
  scheduled: 'badge-info',
  sending: 'badge-warning',
  sent: 'badge-success',
  cancelled: 'badge-error',
};

export default function EmailCampaigns() {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  useDocumentTitle('pageTitle.emailCampaigns');
  const queryClient = useQueryClient();

  const [filterStatus, setFilterStatus] = useState<CampaignStatus | ''>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<EmailCampaign | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['email-campaigns', filterStatus],
    queryFn: () => getEmailCampaigns(filterStatus || undefined),
  });

  const { data: campaignDetail } = useQuery({
    queryKey: ['email-campaign', selectedCampaign?.id],
    queryFn: () => (selectedCampaign ? getEmailCampaign(selectedCampaign.id) : null),
    enabled: !!selectedCampaign,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: getEmailTemplates,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmailCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
      showSuccess(t('emailCampaigns.deleted'));
      setSelectedCampaign(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('emailCampaigns.errorDelete'));
    },
  });

  const filteredCampaigns = campaigns.filter((campaign) =>
    searchTerm
      ? campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        campaign.subject.toLowerCase().includes(searchTerm.toLowerCase())
      : true,
  );

  const getStatusBadge = (status: CampaignStatus) => (
    <span className={`badge ${STATUS_COLORS[status]} gap-1`}>
      <Icon name={STATUS_ICONS[status]} size={12} />
      {t(`emailCampaigns.status.${status}`)}
    </span>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="text-2xl font-bold">{t('emailCampaigns.title')}</h1>
        <button className="btn btn-primary gap-2" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" size={16} />
          {t('emailCampaigns.createCampaign')}
        </button>
      </div>

      {/* Filters */}
      <div className="card bg-base-200 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('emailCampaigns.filterStatus')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as CampaignStatus | '')}
            >
              <option value="">{t('common.all')}</option>
              <option value="draft">{t('emailCampaigns.status.draft')}</option>
              <option value="scheduled">{t('emailCampaigns.status.scheduled')}</option>
              <option value="sent">{t('emailCampaigns.status.sent')}</option>
              <option value="cancelled">{t('emailCampaigns.status.cancelled')}</option>
            </select>
          </div>

          <div className="form-control flex-1 min-w-[200px]">
            <label className="label">
              <span className="label-text">{t('common.search')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder={t('emailCampaigns.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <SkeletonTable rows={5} columns={5} />
      ) : filteredCampaigns.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="send" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('emailCampaigns.noCampaigns')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCampaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedCampaign(campaign)}
            >
              <div className="card-body">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="card-title text-lg line-clamp-1">{campaign.name}</h3>
                  {getStatusBadge(campaign.status)}
                </div>

                <p className="text-sm text-base-content/70 line-clamp-2">{campaign.subject}</p>

                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="badge badge-outline badge-sm gap-1">
                    <Icon name="users" size={12} />
                    {campaign.totalRecipients} {t('emailCampaigns.recipients')}
                  </span>
                </div>

                {/* Stats for sent campaigns */}
                {campaign.status === 'sent' && (
                  <div className="flex gap-3 mt-3 text-xs">
                    <span className="flex items-center gap-1 text-success">
                      <Icon name="checkCircle" size={12} />
                      {campaign.deliveredCount} {t('emailCampaigns.delivered')}
                    </span>
                    <span className="flex items-center gap-1 text-info">
                      <Icon name="eye" size={12} />
                      {campaign.openedCount} {t('emailCampaigns.opened')}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center mt-4 text-sm text-base-content/60">
                  <span className="flex items-center gap-1">
                    <Icon name="calendar" size={14} />
                    {campaign.sentAt
                      ? formatDateTime(campaign.sentAt)
                      : campaign.scheduledAt
                        ? formatDateTime(campaign.scheduledAt)
                        : formatDateTime(campaign.createdAt)}
                  </span>
                </div>

                <div className="mt-2 text-xs text-base-content/50">{campaign.createdByName}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign Detail Modal */}
      {selectedCampaign && campaignDetail && (
        <CampaignDetailModal
          campaign={campaignDetail}
          onClose={() => setSelectedCampaign(null)}
          onDelete={async () => {
            if (await confirmDialog(t('emailCampaigns.confirmDelete'))) {
              deleteMutation.mutate(selectedCampaign.id);
            }
          }}
          onSchedule={() => {
            queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
            queryClient.invalidateQueries({ queryKey: ['email-campaign', selectedCampaign.id] });
          }}
        />
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <CreateCampaignModal
          templates={templates}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['email-campaigns'] });
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// Campaign Detail Modal
function CampaignDetailModal({
  campaign,
  onClose,
  onDelete,
  onSchedule,
}: {
  campaign: EmailCampaignDetail;
  onClose: () => void;
  onDelete: () => void;
  onSchedule: () => void;
}) {
  const { t } = useTranslation();
  const [showRecipientsDialog, setShowRecipientsDialog] = useState(false);

  const { data: recipientsPreview } = useQuery({
    queryKey: ['campaign-recipients-preview', campaign.id],
    queryFn: () => previewRecipients(campaign.id),
    enabled: campaign.status === 'draft',
  });

  const scheduleMutation = useMutation({
    mutationFn: () => scheduleCampaign(campaign.id),
    onSuccess: () => {
      showSuccess(t('emailCampaigns.scheduled'));
      onSchedule();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('emailCampaigns.errorSchedule'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelCampaign(campaign.id),
    onSuccess: () => {
      showSuccess(t('emailCampaigns.cancelled'));
      onSchedule();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('emailCampaigns.errorCancel'));
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => sendCampaign(campaign.id),
    onSuccess: () => {
      showSuccess(t('emailCampaigns.sendingStarted'));
      onSchedule();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('emailCampaigns.errorSend'));
    },
  });

  const [testEmail, setTestEmail] = useState('');
  const [showTestInput, setShowTestInput] = useState(false);

  const testMutation = useMutation({
    mutationFn: (email: string) => sendTestEmail(campaign.id, email),
    onSuccess: () => {
      showSuccess(t('emailCampaigns.testSent'));
      setShowTestInput(false);
      setTestEmail('');
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('emailCampaigns.errorTest'));
    },
  });

  const canEdit = campaign.status === 'draft';

  return (
    <>
      <Modal onClose={onClose} size="large" title={campaign.name}>
        <div className="space-y-6">
          {/* Status and meta */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`badge ${STATUS_COLORS[campaign.status]} gap-1`}>
              <Icon name={STATUS_ICONS[campaign.status]} size={12} />
              {t(`emailCampaigns.status.${campaign.status}`)}
            </span>
            <span className="text-sm text-base-content/60">
              {t('emailCampaigns.createdBy', {
                name: campaign.createdByName,
                date: formatDateTime(campaign.createdAt),
              })}
            </span>
          </div>

          {/* Subject */}
          <div className="bg-base-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-base-content/70 mb-1">{t('emailCampaigns.subject')}</h4>
            <p className="text-lg">{campaign.subject}</p>
          </div>

          {/* Content preview */}
          <div>
            <h4 className="text-sm font-semibold text-base-content/70 mb-2">{t('emailCampaigns.content')}</h4>
            <div className="bg-base-200 p-4 rounded-lg max-h-64 overflow-y-auto border border-base-300">
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(campaign.bodyHtml) }} />
            </div>
          </div>

          {/* Attachments Section */}
          <EmailAttachmentsSection campaignId={campaign.id} canEdit={canEdit} />

          {/* Recipients Preview (for drafts) */}
          {campaign.status === 'draft' && recipientsPreview && (
            <div>
              <div className="page-header">
                <h4 className="text-sm font-semibold text-base-content/70">
                  {t('emailCampaigns.recipientsPreview', { count: recipientsPreview.count })}
                </h4>
              </div>
              <div className="bg-base-200 p-4 rounded-lg max-h-40 overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {recipientsPreview.recipients.slice(0, 20).map((r) => (
                    <span key={r.id} className="badge badge-ghost">
                      {r.name}
                    </span>
                  ))}
                  {recipientsPreview.count > 20 && (
                    <span className="badge badge-outline">
                      +{recipientsPreview.count - 20} {t('emailCampaigns.more')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stats for sent campaigns */}
          {campaign.status === 'sent' && (
            <div>
              <div className="page-header">
                <h4 className="text-sm font-semibold text-base-content/70">{t('emailCampaigns.stats.total')}</h4>
                <button className="btn btn-sm btn-outline gap-1" onClick={() => setShowRecipientsDialog(true)}>
                  <Icon name="users" size={14} />
                  {t('emailCampaigns.viewRecipients')}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-base-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{campaign.totalRecipients}</div>
                  <div className="text-xs text-base-content/60 mt-1">{t('emailCampaigns.totalSent')}</div>
                </div>
                <div className="bg-success/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-success">{campaign.deliveredCount}</div>
                  <div className="text-xs text-base-content/60 mt-1">{t('emailCampaigns.delivered')}</div>
                </div>
                <div className="bg-info/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-info">{campaign.openedCount}</div>
                  <div className="text-xs text-base-content/60 mt-1">{t('emailCampaigns.opened')}</div>
                </div>
                <div className="bg-error/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-error">{campaign.bouncedCount}</div>
                  <div className="text-xs text-base-content/60 mt-1">{t('emailCampaigns.bounced')}</div>
                </div>
              </div>
            </div>
          )}

          {/* Test Email Section */}
          {campaign.status === 'draft' && (
            <div className="border-t border-base-300 pt-4">
              <h4 className="text-sm font-semibold text-base-content/70 mb-2">{t('emailCampaigns.testEmail')}</h4>
              {showTestInput ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="input input-bordered flex-1"
                    placeholder={t('emailCampaigns.testEmailPlaceholder')}
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                  <button
                    className="btn btn-outline"
                    onClick={() => testMutation.mutate(testEmail)}
                    disabled={!testEmail || testMutation.isPending}
                  >
                    {testMutation.isPending ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      t('emailCampaigns.sendTest')
                    )}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowTestInput(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button className="btn btn-outline btn-sm gap-2" onClick={() => setShowTestInput(true)}>
                  <Icon name="envelope" size={14} />
                  {t('emailCampaigns.sendTestEmail')}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-base-300 pt-4 flex flex-wrap gap-2">
            {campaign.status === 'draft' && (
              <>
                <button
                  className="btn btn-primary gap-2"
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending || scheduleMutation.isPending}
                >
                  {sendMutation.isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <Icon name="send" size={16} />
                  )}
                  {t('emailCampaigns.sendNow')}
                </button>
                <button
                  className="btn btn-outline gap-2"
                  onClick={() => scheduleMutation.mutate()}
                  disabled={scheduleMutation.isPending || sendMutation.isPending}
                >
                  {scheduleMutation.isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <Icon name="clock" size={16} />
                  )}
                  {t('emailCampaigns.schedule')}
                </button>
                <button className="btn btn-error btn-outline gap-2" onClick={onDelete}>
                  <Icon name="trash" size={16} />
                  {t('common.delete')}
                </button>
              </>
            )}
            {campaign.status === 'scheduled' && (
              <>
                <button
                  className="btn btn-primary gap-2"
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                >
                  {sendMutation.isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <Icon name="send" size={16} />
                  )}
                  {t('emailCampaigns.sendNow')}
                </button>
                <button
                  className="btn btn-warning gap-2"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <Icon name="close" size={16} />
                  )}
                  {t('emailCampaigns.cancel')}
                </button>
              </>
            )}
            <button className="btn btn-ghost ml-auto" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Recipients Dialog */}
      {showRecipientsDialog && (
        <CampaignRecipientsDialog campaignId={campaign.id} onClose={() => setShowRecipientsDialog(false)} />
      )}
    </>
  );
}

// Create Campaign Modal
function CreateCampaignModal({
  templates,
  onClose,
  onSuccess,
}: {
  templates: EmailTemplate[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateCampaignData>({
    name: '',
    subject: '',
    bodyHtml: '',
    targetType: 'all',
  });

  const createMutation = useMutation({
    mutationFn: createEmailCampaign,
    onSuccess: () => {
      showSuccess(t('emailCampaigns.created'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('emailCampaigns.errorCreate'));
    },
  });

  const applyTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setFormData((prev) => ({
        ...prev,
        templateId,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
      }));
    }
  };

  const canSubmit = formData.name.trim() && formData.subject.trim() && formData.bodyHtml.trim();

  return (
    <Modal onClose={onClose} size="large" title={t('emailCampaigns.createCampaign')}>
      <div className="space-y-4">
        {/* Campaign Name */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('emailCampaigns.campaignName')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={t('emailCampaigns.namePlaceholder')}
          />
        </div>

        {/* Template Selection */}
        {templates.length > 0 && (
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium">{t('emailCampaigns.useTemplate')}</span>
            </label>
            <select
              className="select select-bordered w-full"
              onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            >
              <option value="">{t('emailCampaigns.selectTemplate')}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subject */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('emailCampaigns.subject')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered w-full"
            value={formData.subject}
            onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
            placeholder={t('emailCampaigns.subjectPlaceholder')}
          />
        </div>

        {/* Content */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('emailCampaigns.content')} *</span>
          </label>
          <textarea
            className="textarea textarea-bordered w-full font-mono text-sm"
            value={formData.bodyHtml}
            onChange={(e) => setFormData((prev) => ({ ...prev, bodyHtml: e.target.value }))}
            placeholder={t('emailCampaigns.contentPlaceholder')}
            rows={10}
          />
          <label className="label">
            <span className="label-text-alt text-base-content/50">{t('emailCampaigns.htmlHint')}</span>
          </label>
        </div>

        {/* Target Type */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">{t('emailCampaigns.targetType')}</span>
          </label>
          <select
            className="select select-bordered w-full"
            value={formData.targetType}
            onChange={(e) => setFormData((prev) => ({ ...prev, targetType: e.target.value as any }))}
          >
            <option value="all">{t('emailCampaigns.targetAll')}</option>
            <option value="orchestras">{t('emailCampaigns.targetOrchestras')}</option>
            <option value="roles">{t('emailCampaigns.targetRoles')}</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-base-300">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary gap-2"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Icon name="plus" size={16} />
            )}
            {t('emailCampaigns.createCampaign')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Email Attachments Section
function EmailAttachmentsSection({ campaignId, canEdit }: { campaignId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const confirmDialog = useConfirm();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [] } = useQuery({
    queryKey: ['campaign-attachments', campaignId],
    queryFn: () => getCampaignAttachments(campaignId),
    enabled: !!campaignId,
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteCampaignAttachment(campaignId, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-attachments', campaignId] });
      showSuccess(t('emailCampaigns.attachmentDeleted'));
    },
    onError: () => showError(t('emailCampaigns.errorDeleteAttachment')),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadCampaignAttachment(campaignId, file);
      }
      queryClient.invalidateQueries({ queryKey: ['campaign-attachments', campaignId] });
      showSuccess(t('emailCampaigns.attachmentUploaded'));
    } catch {
      showError(t('emailCampaigns.errorUploadAttachment'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (attachments.length === 0 && !canEdit) return null;

  return (
    <div className="border-t border-base-300 pt-4 mt-4">
      <div className="page-header">
        <h4 className="text-sm font-semibold text-base-content/70">
          {t('emailCampaigns.attachments')} ({attachments.length})
        </h4>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <button
              className="btn btn-sm btn-outline gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <span className="loading loading-spinner loading-xs" /> : <Icon name="upload" size={14} />}
              {t('emailCampaigns.addAttachment')}
            </button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-base-content/60">{t('emailCampaigns.noAttachments')}</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att: CampaignAttachment) => (
            <div key={att.id} className="flex items-center justify-between p-2 bg-base-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="paperclip" size={16} className="flex-shrink-0 text-base-content/60" />
                <span className="text-sm truncate">{att.originalFilename}</span>
                <span className="text-xs text-base-content/50">({formatFileSize(att.fileSize)})</span>
              </div>
              {canEdit && (
                <button
                  className="btn btn-ghost btn-xs text-error"
                  onClick={async () => {
                    if (await confirmDialog(t('emailCampaigns.confirmDeleteAttachment'))) {
                      deleteMutation.mutate(att.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Campaign Recipients Dialog
const RECIPIENT_STATUS_ICONS: Record<RecipientDeliveryStatus, IconName> = {
  pending: 'clock',
  sent: 'send',
  delivered: 'check',
  opened: 'eye',
  clicked: 'mousePointer',
  bounced: 'warning',
  failed: 'close',
};

const RECIPIENT_STATUS_COLORS: Record<RecipientDeliveryStatus, string> = {
  pending: 'text-base-content/60',
  sent: 'text-info',
  delivered: 'text-success',
  opened: 'text-primary',
  clicked: 'text-secondary',
  bounced: 'text-warning',
  failed: 'text-error',
};

function CampaignRecipientsDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [filterStatus, setFilterStatus] = useState<RecipientDeliveryStatus | ''>('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['campaign-recipients', campaignId],
    queryFn: () => getCampaignRecipients(campaignId),
    enabled: !!campaignId,
  });

  const recipients = data?.recipients ?? [];
  const byStatus = data?.byStatus ?? ({} as Record<RecipientDeliveryStatus, number>);

  const filteredRecipients = recipients.filter((r) => {
    const matchesStatus = !filterStatus || r.status === filterStatus;
    const matchesSearch =
      !searchTerm ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const allStatuses: RecipientDeliveryStatus[] = [
    'pending',
    'sent',
    'delivered',
    'opened',
    'clicked',
    'bounced',
    'failed',
  ];
  const statusCounts = allStatuses
    .map((status) => ({ status, count: byStatus[status] || 0 }))
    .filter((s) => s.count > 0);

  return (
    <Modal onClose={onClose} size="large" title={t('emailCampaigns.recipientDetails')}>
      <div className="space-y-4">
        {/* Status Summary */}
        {statusCounts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              className={`badge gap-1 cursor-pointer ${!filterStatus ? 'badge-primary' : 'badge-ghost'}`}
              onClick={() => setFilterStatus('')}
            >
              {t('common.all')} ({data?.total || 0})
            </button>
            {statusCounts.map(({ status, count }) => (
              <button
                key={status}
                className={`badge gap-1 cursor-pointer ${filterStatus === status ? 'badge-primary' : 'badge-ghost'}`}
                onClick={() => setFilterStatus(filterStatus === status ? '' : status)}
              >
                <Icon name={RECIPIENT_STATUS_ICONS[status]} size={12} className={RECIPIENT_STATUS_COLORS[status]} />
                {t(`emailCampaigns.recipientStatus.${status}`)} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="form-control">
          <input
            type="text"
            className="input input-bordered input-sm"
            placeholder={t('emailCampaigns.searchRecipients')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Recipients List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : filteredRecipients.length === 0 ? (
          <div className="text-center py-8 text-base-content/60">
            <Icon name="users" size={32} className="mx-auto mb-2 opacity-50" />
            <p>{t('emailCampaigns.noRecipientsFound')}</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="table table-sm">
              <thead className="sticky top-0 bg-base-100">
                <tr>
                  <th>{t('emailCampaigns.recipientName')}</th>
                  <th>{t('emailCampaigns.recipientEmail')}</th>
                  <th>{t('emailCampaigns.recipientStatusLabel')}</th>
                  <th>{t('emailCampaigns.recipientDetails')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecipients.map((recipient: CampaignRecipient) => (
                  <tr key={recipient.id}>
                    <td className="font-medium">{recipient.name}</td>
                    <td className="text-base-content/70">{recipient.email}</td>
                    <td>
                      <span className={`flex items-center gap-1 ${RECIPIENT_STATUS_COLORS[recipient.status]}`}>
                        <Icon name={RECIPIENT_STATUS_ICONS[recipient.status]} size={14} />
                        {t(`emailCampaigns.recipientStatus.${recipient.status}`)}
                      </span>
                    </td>
                    <td className="text-xs text-base-content/60">
                      {recipient.status === 'bounced' && recipient.bounceReason && (
                        <span className="text-warning">{recipient.bounceReason}</span>
                      )}
                      {recipient.openedAt && (
                        <span>{t('emailCampaigns.openedAt', { date: formatDateTime(recipient.openedAt) })}</span>
                      )}
                      {recipient.deliveredAt && !recipient.openedAt && (
                        <span>{t('emailCampaigns.deliveredAt', { date: formatDateTime(recipient.deliveredAt) })}</span>
                      )}
                      {recipient.sentAt && !recipient.deliveredAt && !recipient.openedAt && (
                        <span>{t('emailCampaigns.sentAt', { date: formatDateTime(recipient.sentAt) })}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-base-300">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
