import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
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

  const getStatusBadge = (status: CampaignStatus) => (
    <span className={`badge ${STATUS_COLORS[status]}`}>
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
        </div>
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <SkeletonTable rows={5} columns={5} />
      ) : campaigns.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="send" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('emailCampaigns.noCampaigns')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-zebra">
            <thead>
              <tr>
                <th>{t('emailCampaigns.campaignName')}</th>
                <th>{t('emailCampaigns.subject')}</th>
                <th>{t('common.status')}</th>
                <th>{t('emailCampaigns.recipients')}</th>
                <th>{t('emailCampaigns.stats')}</th>
                <th>{t('common.date')}</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="cursor-pointer hover"
                  onClick={() => setSelectedCampaign(campaign)}
                >
                  <td className="font-medium">{campaign.name}</td>
                  <td className="max-w-xs truncate">{campaign.subject}</td>
                  <td>{getStatusBadge(campaign.status)}</td>
                  <td>{campaign.totalRecipients}</td>
                  <td>
                    {campaign.status === 'sent' && (
                      <div className="flex gap-2 text-xs">
                        <span className="text-success">{campaign.deliveredCount} {t('emailCampaigns.delivered')}</span>
                        <span className="text-info">{campaign.openedCount} {t('emailCampaigns.opened')}</span>
                      </div>
                    )}
                  </td>
                  <td className="text-sm text-base-content/60">
                    {campaign.sentAt
                      ? formatDateTime(campaign.sentAt)
                      : campaign.scheduledAt
                      ? formatDateTime(campaign.scheduledAt)
                      : formatDateTime(campaign.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="flex flex-wrap gap-4 items-center">
          <span className={`badge ${STATUS_COLORS[campaign.status]}`}>
            {t(`emailCampaigns.status.${campaign.status}`)}
          </span>
          <span className="text-sm text-base-content/60">
            {t('emailCampaigns.createdBy', { name: campaign.createdByName, date: formatDateTime(campaign.createdAt) })}
          </span>
        </div>

        {/* Subject */}
        <div>
          <h4 className="font-semibold mb-1">{t('emailCampaigns.subject')}</h4>
          <p>{campaign.subject}</p>
        </div>

        {/* Content preview */}
        <div>
          <h4 className="font-semibold mb-1">{t('emailCampaigns.content')}</h4>
          <div className="bg-base-200 p-4 rounded-lg max-h-64 overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: campaign.bodyHtml }} />
          </div>
        </div>

        {/* Recipients */}
        {campaign.status === 'draft' && recipients && (
          <div>
            <h4 className="font-semibold mb-2">
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
          <div className="grid grid-cols-4 gap-4">
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-title text-xs">{t('emailCampaigns.totalSent')}</div>
              <div className="stat-value text-lg">{campaign.totalRecipients}</div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-title text-xs">{t('emailCampaigns.delivered')}</div>
              <div className="stat-value text-lg text-success">{campaign.deliveredCount}</div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-title text-xs">{t('emailCampaigns.opened')}</div>
              <div className="stat-value text-lg text-info">{campaign.openedCount}</div>
            </div>
            <div className="stat bg-base-200 rounded-lg p-4">
              <div className="stat-title text-xs">{t('emailCampaigns.bounced')}</div>
              <div className="stat-value text-lg text-error">{campaign.bouncedCount}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="border-t pt-4 flex flex-wrap gap-2">
          {campaign.status === 'draft' && (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => scheduleMutation.mutate()}
                disabled={scheduleMutation.isPending}
              >
                <Icon name="send" size={14} className="mr-1" />
                {t('emailCampaigns.sendNow')}
              </button>
              <button className="btn btn-error btn-sm" onClick={onDelete}>
                <Icon name="trash" size={14} className="mr-1" />
                {t('common.delete')}
              </button>
            </>
          )}
          {campaign.status === 'scheduled' && (
            <button
              className="btn btn-warning btn-sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <Icon name="close" size={14} className="mr-1" />
              {t('emailCampaigns.cancel')}
            </button>
          )}
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
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('emailCampaigns.campaignName')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder={t('emailCampaigns.namePlaceholder')}
          />
        </div>

        {templates.length > 0 && (
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('emailCampaigns.useTemplate')}</span>
            </label>
            <select
              className="select select-bordered"
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

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('emailCampaigns.subject')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.subject}
            onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
            placeholder={t('emailCampaigns.subjectPlaceholder')}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('emailCampaigns.content')} *</span>
          </label>
          <textarea
            className="textarea textarea-bordered font-mono"
            value={formData.bodyHtml}
            onChange={(e) => setFormData((prev) => ({ ...prev, bodyHtml: e.target.value }))}
            placeholder={t('emailCampaigns.contentPlaceholder')}
            rows={10}
          />
          <label className="label">
            <span className="label-text-alt">{t('emailCampaigns.htmlHint')}</span>
          </label>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('emailCampaigns.targetType')}</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.targetType}
            onChange={(e) => setFormData((prev) => ({ ...prev, targetType: e.target.value as any }))}
          >
            <option value="all">{t('emailCampaigns.targetAll')}</option>
            <option value="orchestras">{t('emailCampaigns.targetOrchestras')}</option>
            <option value="roles">{t('emailCampaigns.targetRoles')}</option>
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => createMutation.mutate(formData)}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <>
                <Icon name="plus" size={16} className="mr-1" />
                {t('emailCampaigns.createCampaign')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
