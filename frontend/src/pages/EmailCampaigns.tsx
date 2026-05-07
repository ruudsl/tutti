import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, IconName } from '../components/Icon';
import {
  getEmailCampaigns,
  getEmailCampaign,
  createEmailCampaign,
  deleteEmailCampaign,
  previewRecipients,
  scheduleCampaign,
  cancelCampaign,
  getEmailTemplates,
  EmailCampaign,
  EmailCampaignDetail,
  CampaignStatus,
  CreateCampaignData,
  EmailTemplate,
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
    queryFn: () => selectedCampaign ? getEmailCampaign(selectedCampaign.id) : null,
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
      : true
  );

  const getStatusBadge = (status: CampaignStatus) => (
    <span className={`badge ${STATUS_COLORS[status]} gap-1`}>
      <Icon name={STATUS_ICONS[status]} size={12} />
      {t(`emailCampaigns.status.${status}`)}
    </span>
  );

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('emailCampaigns.title')}</h1>
        <button
          className="btn btn-primary gap-2"
          onClick={() => setShowCreateModal(true)}
        >
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

                <div className="mt-2 text-xs text-base-content/50">
                  {campaign.createdByName}
                </div>
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
          onDelete={() => {
            if (confirm(t('emailCampaigns.confirmDelete'))) {
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

  const { data: recipients } = useQuery({
    queryKey: ['campaign-recipients', campaign.id],
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

  return (
    <Modal onClose={onClose} size="large" title={campaign.name}>
      <div className="space-y-6">
        {/* Status and meta */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`badge ${STATUS_COLORS[campaign.status]} gap-1`}>
            <Icon name={STATUS_ICONS[campaign.status]} size={12} />
            {t(`emailCampaigns.status.${campaign.status}`)}
          </span>
          <span className="text-sm text-base-content/60">
            {t('emailCampaigns.createdBy', { name: campaign.createdByName, date: formatDateTime(campaign.createdAt) })}
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
            <div dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }} />
          </div>
        </div>

        {/* Recipients */}
        {campaign.status === 'draft' && recipients && (
          <div>
            <h4 className="text-sm font-semibold text-base-content/70 mb-2">
              {t('emailCampaigns.recipientsPreview', { count: recipients.count })}
            </h4>
            <div className="bg-base-200 p-4 rounded-lg max-h-40 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {recipients.recipients.slice(0, 20).map((r) => (
                  <span key={r.id} className="badge badge-ghost">
                    {r.name}
                  </span>
                ))}
                {recipients.count > 20 && (
                  <span className="badge badge-outline">
                    +{recipients.count - 20} {t('emailCampaigns.more')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats for sent campaigns */}
        {campaign.status === 'sent' && (
          <div>
            <h4 className="text-sm font-semibold text-base-content/70 mb-3">{t('emailCampaigns.stats.total')}</h4>
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

        {/* Actions */}
        <div className="border-t border-base-300 pt-4 flex flex-wrap gap-2">
          {campaign.status === 'draft' && (
            <>
              <button
                className="btn btn-primary gap-2"
                onClick={() => scheduleMutation.mutate()}
                disabled={scheduleMutation.isPending}
              >
                {scheduleMutation.isPending ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <Icon name="send" size={16} />
                )}
                {t('emailCampaigns.sendNow')}
              </button>
              <button className="btn btn-error btn-outline gap-2" onClick={onDelete}>
                <Icon name="trash" size={16} />
                {t('common.delete')}
              </button>
            </>
          )}
          {campaign.status === 'scheduled' && (
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
          )}
          <button className="btn btn-ghost ml-auto" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Modal>
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
