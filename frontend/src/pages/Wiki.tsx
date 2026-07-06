import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import {
  getWikiPages,
  getWikiPage,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  searchWikiPages,
  getWikiPageVersions,
  restoreWikiPageVersion,
  uploadWikiAttachment,
  getWikiAttachments,
  deleteWikiAttachment,
  WikiPage,
  CreateWikiPageData,
  UpdateWikiPageData,
  WikiAttachment,
} from '../api/wiki';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useConfirm } from '../hooks/useConfirm';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';
import { MarkdownPreview } from '../components/MarkdownPreview';

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'wiki.visibilityPublic',
  members: 'wiki.visibilityMembers',
  committee: 'wiki.visibilityCommittee',
  admin: 'wiki.visibilityAdmin',
};

export default function Wiki() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.wiki');
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentSlug = searchParams.get('page') || '';
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showVersionsModal, setShowVersionsModal] = useState(false);

  const [formData, setFormData] = useState<CreateWikiPageData>({
    title: '',
    slug: '',
    content: '',
    visibility: 'members',
    isPinned: false,
  });

  const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE || user?.role === ROLES.BOARD;
  const canDelete = user?.role === ROLES.ADMIN;

  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['wiki-pages'],
    queryFn: getWikiPages,
  });

  const { data: currentPage, isLoading: pageLoading } = useQuery({
    queryKey: ['wiki-page', currentSlug],
    queryFn: () => getWikiPage(currentSlug),
    enabled: !!currentSlug,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ['wiki-search', searchTerm],
    queryFn: () => searchWikiPages(searchTerm),
    enabled: searchTerm.length >= 2,
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['wiki-versions', currentSlug],
    queryFn: () => getWikiPageVersions(currentSlug),
    enabled: !!currentSlug && showVersionsModal,
  });

  const createMutation = useMutation({
    mutationFn: createWikiPage,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['wiki-pages'] });
      showSuccess(t('wiki.created'));
      setShowCreateModal(false);
      setSearchParams({ page: data.slug });
      resetForm();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('wiki.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: UpdateWikiPageData }) => updateWikiPage(slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki-pages'] });
      queryClient.invalidateQueries({ queryKey: ['wiki-page', currentSlug] });
      showSuccess(t('wiki.updated'));
      setShowEditModal(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('wiki.errorUpdate'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWikiPage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki-pages'] });
      showSuccess(t('wiki.deleted'));
      setSearchParams({});
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('wiki.errorDelete'));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ slug, versionId }: { slug: string; versionId: string }) => restoreWikiPageVersion(slug, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki-page', currentSlug] });
      queryClient.invalidateQueries({ queryKey: ['wiki-versions', currentSlug] });
      showSuccess(t('wiki.restored'));
      setShowVersionsModal(false);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('wiki.errorRestore'));
    },
  });

  const resetForm = () => {
    setFormData({ title: '', slug: '', content: '', visibility: 'members', isPinned: false });
  };

  const openEditModal = () => {
    if (currentPage) {
      setFormData({
        title: currentPage.title,
        slug: currentPage.slug,
        content: currentPage.content,
        visibility: currentPage.visibility,
        isPinned: currentPage.isPinned,
      });
      setShowEditModal(true);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const renderPageTree = (pageList: WikiPage[], level = 0) => {
    return pageList.map((page) => (
      <div key={page.id}>
        <button
          className={`w-full text-left px-3 py-2 rounded hover:bg-base-200 flex items-center gap-2 ${currentSlug === page.slug ? 'bg-base-200 font-medium' : ''}`}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => setSearchParams({ page: page.slug })}
        >
          {page.isPinned && <Icon name="bookmark" className="w-3 h-3 text-primary" />}
          <span className="truncate">{page.title}</span>
        </button>
        {page.children.length > 0 && renderPageTree(page.children, level + 1)}
      </div>
    ));
  };

  if (pagesLoading) {
    return (
      <div className="page-container">
        <h1>{t('wiki.title')}</h1>
        <SkeletonTable rows={5} columns={2} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header flex justify-between items-center mb-4">
        <h1>{t('wiki.title')}</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" className="w-4 h-4 mr-2" />
            {t('wiki.addPage')}
          </button>
        )}
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body p-3">
              <div className="form-control mb-3">
                <input
                  type="text"
                  className="input input-bordered input-sm"
                  placeholder={t('wiki.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {searchTerm.length >= 2 ? (
                <div className="space-y-1">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-base-content/60 px-3">{t('wiki.noResults')}</p>
                  ) : (
                    searchResults.map((result) => (
                      <button
                        key={result.id}
                        className="w-full text-left px-3 py-2 rounded hover:bg-base-200"
                        onClick={() => {
                          setSearchParams({ page: result.slug });
                          setSearchTerm('');
                        }}
                      >
                        <div className="font-medium text-sm">{result.title}</div>
                        <div className="text-xs text-base-content/60 line-clamp-1">{result.excerpt}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {pages.length === 0 ? (
                    <p className="text-sm text-base-content/60 px-3">{t('wiki.noPages')}</p>
                  ) : (
                    renderPageTree(pages)
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {currentSlug ? (
            pageLoading ? (
              <SkeletonTable rows={10} columns={1} />
            ) : currentPage ? (
              <div className="card bg-base-100 shadow-sm">
                <div className="card-body">
                  {/* Breadcrumbs */}
                  {currentPage.breadcrumbs.length > 0 && (
                    <div className="text-sm breadcrumbs mb-2">
                      <ul>
                        {currentPage.breadcrumbs.map((crumb) => (
                          <li key={crumb.slug}>
                            <button onClick={() => setSearchParams({ page: crumb.slug })} className="link link-hover">
                              {crumb.title}
                            </button>
                          </li>
                        ))}
                        <li>{currentPage.title}</li>
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold flex items-center gap-2">
                        {currentPage.isPinned && <Icon name="bookmark" className="w-5 h-5 text-primary" />}
                        {currentPage.title}
                      </h2>
                      <div className="text-sm text-base-content/60 mt-1">
                        {t('wiki.lastUpdated', {
                          date: formatDateTime(currentPage.updatedAt),
                          user: currentPage.updatedByName || currentPage.createdByName,
                        })}
                        {' · '}
                        <span className="badge badge-sm">{t(VISIBILITY_LABELS[currentPage.visibility])}</span>
                        {' · '}
                        {t('wiki.views', { count: currentPage.viewCount })}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="dropdown dropdown-end">
                        <label tabIndex={0} className="btn btn-ghost btn-sm">
                          <Icon name="menu" className="w-4 h-4" />
                        </label>
                        <ul tabIndex={0} className="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-10">
                          <li>
                            <button onClick={openEditModal}>
                              <Icon name="pencil" className="w-4 h-4" />
                              {t('common.edit')}
                            </button>
                          </li>
                          <li>
                            <button onClick={() => setShowVersionsModal(true)}>
                              <Icon name="clock" className="w-4 h-4" />
                              {t('wiki.history')}
                            </button>
                          </li>
                          {canDelete && (
                            <li>
                              <button
                                className="text-error"
                                onClick={async () => {
                                  if (await confirmDialog(t('wiki.confirmDelete'))) deleteMutation.mutate(currentSlug);
                                }}
                              >
                                <Icon name="trash" className="w-4 h-4" />
                                {t('common.delete')}
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  <MarkdownPreview content={currentPage.content} className="mb-6" />

                  {/* Attachments */}
                  <WikiAttachmentsSection slug={currentSlug} canEdit={canEdit} />

                  {/* Children */}
                  {currentPage.children && currentPage.children.length > 0 && (
                    <div className="mt-8 pt-4 border-t">
                      <h3 className="font-semibold mb-2">{t('wiki.subPages')}</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {currentPage.children.map((child: any) => (
                          <button
                            key={child.id}
                            className="text-left p-3 rounded bg-base-200 hover:bg-base-300"
                            onClick={() => setSearchParams({ page: child.slug })}
                          >
                            {child.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="card bg-base-100 shadow-sm p-8 text-center">
                <Icon name="fileText" className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
                <p>{t('wiki.pageNotFound')}</p>
              </div>
            )
          ) : (
            <div className="card bg-base-100 shadow-sm p-8 text-center">
              <Icon name="book" className="w-12 h-12 mx-auto mb-4 text-base-content/30" />
              <p className="text-base-content/60">{t('wiki.selectPage')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateEditWikiModal
          mode="create"
          formData={formData}
          setFormData={setFormData}
          onClose={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          onSubmit={() => createMutation.mutate(formData)}
          isPending={createMutation.isPending}
          generateSlug={generateSlug}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <CreateEditWikiModal
          mode="edit"
          formData={formData}
          setFormData={setFormData}
          onClose={() => setShowEditModal(false)}
          onSubmit={() =>
            updateMutation.mutate({
              slug: currentSlug,
              data: {
                title: formData.title,
                content: formData.content,
                visibility: formData.visibility,
                isPinned: formData.isPinned,
              },
            })
          }
          isPending={updateMutation.isPending}
        />
      )}

      {/* Versions Modal */}
      {showVersionsModal && (
        <Modal onClose={() => setShowVersionsModal(false)} title={t('wiki.history')} size="large">
          <div className="space-y-2">
            {versions.length === 0 ? (
              <p className="text-base-content/60">{t('wiki.noVersions')}</p>
            ) : (
              versions.map((version) => (
                <div key={version.id} className="flex justify-between items-center p-3 rounded bg-base-200">
                  <div>
                    <div className="font-medium">{t('wiki.version', { number: version.versionNumber })}</div>
                    <div className="text-sm text-base-content/60">
                      {formatDateTime(version.createdAt)} - {version.createdByName}
                      {version.changeSummary && <> · {version.changeSummary}</>}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => restoreMutation.mutate({ slug: currentSlug, versionId: version.id })}
                    disabled={restoreMutation.isPending}
                  >
                    {t('wiki.restore')}
                  </button>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

interface CreateEditWikiModalProps {
  mode: 'create' | 'edit';
  formData: CreateWikiPageData;
  setFormData: React.Dispatch<React.SetStateAction<CreateWikiPageData>>;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  generateSlug?: (title: string) => string;
}

function CreateEditWikiModal({
  mode,
  formData,
  setFormData,
  onClose,
  onSubmit,
  isPending,
  generateSlug,
}: CreateEditWikiModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Modal onClose={onClose} title={mode === 'create' ? t('wiki.addPage') : t('wiki.editPage')} size="large">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('wiki.pageTitle')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                title: e.target.value,
                ...(mode === 'create' && generateSlug ? { slug: generateSlug(e.target.value) } : {}),
              }))
            }
            required
          />
        </div>

        {mode === 'create' && (
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('wiki.slug')} *</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={formData.slug}
              onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
              pattern="^[a-z0-9-]+$"
              required
            />
            <label className="label">
              <span className="label-text-alt">{t('wiki.slugHelp')}</span>
            </label>
          </div>
        )}

        <div className="form-control">
          <div className="flex justify-between items-center mb-2">
            <label className="label py-0">
              <span className="label-text">{t('wiki.content')} *</span>
            </label>
            <div className="tabs tabs-boxed tabs-sm">
              <button
                type="button"
                className={`tab ${activeTab === 'edit' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('edit')}
              >
                <Icon name="pencil" className="w-3 h-3 mr-1" />
                {t('wiki.editTab')}
              </button>
              <button
                type="button"
                className={`tab ${activeTab === 'preview' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                <Icon name="eye" className="w-3 h-3 mr-1" />
                {t('wiki.previewTab')}
              </button>
            </div>
          </div>

          {activeTab === 'edit' ? (
            <textarea
              className="textarea textarea-bordered h-64 font-mono text-sm"
              value={formData.content}
              onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
              required
              placeholder={t('wiki.contentPlaceholder')}
            />
          ) : (
            <div className="border rounded-lg p-4 min-h-[16rem] bg-base-200 overflow-auto">
              {formData.content ? (
                <MarkdownPreview content={formData.content} />
              ) : (
                <p className="text-base-content/50 italic">{t('wiki.noPreview')}</p>
              )}
            </div>
          )}
          <label className="label">
            <span className="label-text-alt">{t('wiki.markdownSupport')}</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('wiki.visibility')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.visibility}
              onChange={(e) => setFormData((prev) => ({ ...prev, visibility: e.target.value as any }))}
            >
              <option value="public">{t('wiki.visibilityPublic')}</option>
              <option value="members">{t('wiki.visibilityMembers')}</option>
              <option value="committee">{t('wiki.visibilityCommittee')}</option>
              <option value="admin">{t('wiki.visibilityAdmin')}</option>
            </select>
          </div>

          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={formData.isPinned}
                onChange={(e) => setFormData((prev) => ({ ...prev, isPinned: e.target.checked }))}
              />
              <span className="label-text">{t('wiki.pinPage')}</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function WikiAttachmentsSection({ slug, canEdit }: { slug: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [] } = useQuery({
    queryKey: ['wiki-attachments', slug],
    queryFn: () => getWikiAttachments(slug),
    enabled: !!slug,
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => deleteWikiAttachment(slug, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki-attachments', slug] });
      showSuccess(t('wiki.attachmentDeleted'));
    },
    onError: () => showError(t('wiki.errorDeleteAttachment')),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadWikiAttachment(slug, file);
      }
      queryClient.invalidateQueries({ queryKey: ['wiki-attachments', slug] });
      showSuccess(t('wiki.attachmentUploaded'));
    } catch {
      showError(t('wiki.errorUploadAttachment'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isImage = (filename: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename);

  if (attachments.length === 0 && !canEdit) return null;

  return (
    <div className="border-t pt-4 mt-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">{t('wiki.attachments')}</h3>
        {canEdit && (
          <>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <button
              className="btn btn-sm btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Icon name="upload" className="w-4 h-4" />
              )}
              {t('wiki.uploadAttachment')}
            </button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-base-content/60">{t('wiki.noAttachments')}</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {attachments.map((att: WikiAttachment) => (
            <div key={att.id} className="card bg-base-200 overflow-hidden">
              {isImage(att.filename) ? (
                <a href={att.url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={att.url}
                    alt={att.filename}
                    className="h-24 w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              ) : (
                <div className="h-24 flex items-center justify-center bg-base-300">
                  <Icon name="fileText" className="w-10 h-10 opacity-50" />
                </div>
              )}
              <div className="p-2">
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium truncate block link link-hover"
                >
                  {att.filename}
                </a>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-base-content/60">{(att.fileSize / 1024).toFixed(1)} KB</span>
                  {canEdit && (
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      onClick={async () => {
                        if (await confirmDialog(t('wiki.confirmDeleteAttachment'))) {
                          deleteMutation.mutate(att.id);
                        }
                      }}
                    >
                      <Icon name="trash" className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-base-content/60">
        <p>{t('wiki.attachmentHint')}</p>
      </div>
    </div>
  );
}
