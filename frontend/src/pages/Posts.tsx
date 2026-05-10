import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import {
  getPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  getPostCategories,
  addPostComment,
  deletePostComment,
  Post,
  PostDetail,
  PostStatus,
  PostCategory,
  CreatePostData,
} from '../api/posts';
import { showSuccess, showError } from '../utils/toast';
import { SkeletonTable } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROLES } from '../utils/constants';
import { Modal } from '../components/Modal';
import { formatDateTime } from '../utils/dateFormat';
import { PostCategoriesManager } from '../components/PostCategoriesManager';

const STATUS_COLORS: Record<PostStatus, string> = {
  draft: 'badge-secondary',
  scheduled: 'badge-info',
  published: 'badge-success',
  archived: 'badge-warning',
};

export default function Posts() {
  const { user } = useAuth();
  const { t } = useTranslation();
  useDocumentTitle('pageTitle.posts');
  const queryClient = useQueryClient();

  const [filterStatus, setFilterStatus] = useState<PostStatus | ''>('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCategoriesManager, setShowCategoriesManager] = useState(false);

  const canCreate = user?.role === ROLES.ADMIN || user?.role === ROLES.MUSIC_COMMITTEE;

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['posts', filterStatus, filterCategory, searchTerm],
    queryFn: () => getPosts({
      status: filterStatus || undefined,
      category: filterCategory || undefined,
      search: searchTerm || undefined,
    }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['post-categories'],
    queryFn: getPostCategories,
  });

  const { data: postDetail } = useQuery({
    queryKey: ['post', selectedPost?.id],
    queryFn: () => selectedPost ? getPost(selectedPost.id) : null,
    enabled: !!selectedPost,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      showSuccess(t('posts.deleted'));
      setSelectedPost(null);
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.errorDelete'));
    },
  });

  const getStatusBadge = (status: PostStatus) => (
    <span className={`badge ${STATUS_COLORS[status]}`}>
      {t(`posts.status.${status}`)}
    </span>
  );

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">{t('posts.title')}</h1>
        {canCreate && (
          <div className="flex gap-2">
            <button
              className="btn btn-outline btn-sm gap-1"
              onClick={() => setShowCategoriesManager(true)}
              title={t('posts.categories.manage')}
            >
              <Icon name="folder" size={16} />
              {t('posts.categories.title')}
            </button>
            <button
              className="btn btn-primary gap-2"
              onClick={() => setShowCreateModal(true)}
            >
              <Icon name="plus" size={16} />
              {t('posts.createPost')}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card bg-base-200 p-4">
        <div className="flex flex-wrap gap-4">
          {canCreate && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('posts.filterStatus')}</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as PostStatus | '')}
              >
                <option value="">{t('common.all')}</option>
                <option value="draft">{t('posts.status.draft')}</option>
                <option value="scheduled">{t('posts.status.scheduled')}</option>
                <option value="published">{t('posts.status.published')}</option>
                <option value="archived">{t('posts.status.archived')}</option>
              </select>
            </div>
          )}

          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('posts.filterCategory')}</span>
            </label>
            <select
              className="select select-bordered select-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">{t('common.all')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="form-control flex-1 min-w-[200px]">
            <label className="label">
              <span className="label-text">{t('common.search')}</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-sm"
              placeholder={t('posts.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Posts list */}
      {isLoading ? (
        <SkeletonTable rows={5} columns={4} />
      ) : posts.length === 0 ? (
        <div className="card bg-base-200 p-8 text-center">
          <Icon name="fileText" size={48} className="mx-auto opacity-50 mb-4" />
          <p className="text-base-content/70">{t('posts.noPosts')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedPost(post)}
            >
              <div className="card-body p-4">
                <div className="flex items-start gap-4">
                  {/* Featured image thumbnail */}
                  {post.featuredImage && (
                    <div className="w-24 h-16 rounded overflow-hidden flex-shrink-0">
                      <img
                        src={post.featuredImage}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {post.isPinned && (
                        <Icon name="bookmark" size={14} className="text-warning" />
                      )}
                      {post.isFeatured && (
                        <Icon name="heart" size={14} className="text-warning" />
                      )}
                      <h3 className={`font-semibold ${!post.isRead ? 'text-primary' : ''}`}>
                        {post.title}
                      </h3>
                      {canCreate && getStatusBadge(post.status)}
                    </div>

                    {post.excerpt && (
                      <p className="text-sm text-base-content/70 line-clamp-2">{post.excerpt}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                      {post.categories.map((cat) => (
                        <span
                          key={cat.id}
                          className="badge badge-sm"
                          style={{ backgroundColor: cat.color || undefined }}
                        >
                          {cat.name}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-base-content/50">
                      <span className="flex items-center gap-1">
                        <Icon name="user" size={12} />
                        {post.authorName}
                      </span>
                      {post.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Icon name="calendar" size={12} />
                          {new Date(post.publishedAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Icon name="eye" size={12} />
                        {post.viewCount}
                      </span>
                      {post.allowComments && (
                        <span className="flex items-center gap-1">
                          <Icon name="message" size={12} />
                          {post.commentCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Detail Modal */}
      {selectedPost && postDetail && (
        <PostDetailModal
          post={postDetail}
          categories={categories}
          canEdit={canCreate}
          onClose={() => setSelectedPost(null)}
          onEdit={() => setShowEditModal(true)}
          onDelete={() => {
            if (confirm(t('posts.confirmDelete'))) {
              deleteMutation.mutate(selectedPost.id);
            }
          }}
        />
      )}

      {/* Create Post Modal */}
      {showCreateModal && (
        <CreatePostModal
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['posts'] });
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Edit Post Modal */}
      {showEditModal && postDetail && (
        <EditPostModal
          post={postDetail}
          categories={categories}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['posts'] });
            queryClient.invalidateQueries({ queryKey: ['post', selectedPost?.id] });
            setShowEditModal(false);
          }}
        />
      )}

      {/* Categories Manager Modal */}
      {showCategoriesManager && (
        <PostCategoriesManager onClose={() => setShowCategoriesManager(false)} />
      )}
    </div>
  );
}

// Post Detail Modal
function PostDetailModal({
  post,
  canEdit,
  onClose,
  onEdit,
  onDelete,
}: {
  post: PostDetail;
  categories: PostCategory[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');

  const commentMutation = useMutation({
    mutationFn: (content: string) => addPostComment(post.id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', post.id] });
      setNewComment('');
      showSuccess(t('posts.commentAdded'));
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.errorComment'));
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deletePostComment(post.id, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', post.id] });
      showSuccess(t('posts.commentDeleted'));
    },
  });

  return (
    <Modal onClose={onClose} size="large" title={post.title}>
      <div className="space-y-6">
        {/* Meta info */}
        <div className="flex flex-wrap gap-4 text-sm text-base-content/60">
          <span className="flex items-center gap-1">
            <Icon name="user" size={14} />
            {post.authorName}
          </span>
          {post.publishedAt && (
            <span className="flex items-center gap-1">
              <Icon name="calendar" size={14} />
              {formatDateTime(post.publishedAt)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Icon name="eye" size={14} />
            {post.viewCount} {t('posts.views')}
          </span>
        </div>

        {/* Categories */}
        {post.categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.categories.map((cat) => (
              <span
                key={cat.id}
                className="badge"
                style={{ backgroundColor: cat.color || undefined }}
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}

        {/* Featured image */}
        {post.featuredImage && (
          <div className="rounded-lg overflow-hidden">
            <img src={post.featuredImage} alt="" className="w-full max-h-64 object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="prose max-w-none">
          {post.contentFormat === 'markdown' ? (
            <div className="whitespace-pre-wrap">{post.content}</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: post.content }} />
          )}
        </div>

        {/* Comments section */}
        {post.allowComments && (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-semibold">{t('posts.comments')}</h4>

            {post.comments.length === 0 ? (
              <p className="text-sm text-base-content/60">{t('posts.noComments')}</p>
            ) : (
              <div className="space-y-3">
                {post.comments.map((comment) => (
                  <div key={comment.id} className="bg-base-200 p-3 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{comment.authorName}</span>
                        <span className="text-xs text-base-content/50 ml-2">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      </div>
                      {(comment.authorId === user?.id || canEdit) && (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            if (confirm(t('posts.confirmDeleteComment'))) {
                              deleteCommentMutation.mutate(comment.id);
                            }
                          }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{comment.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form */}
            <div className="flex gap-2">
              <input
                type="text"
                className="input input-bordered flex-1"
                placeholder={t('posts.addCommentPlaceholder')}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newComment.trim()) {
                    commentMutation.mutate(newComment.trim());
                  }
                }}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (newComment.trim()) {
                    commentMutation.mutate(newComment.trim());
                  }
                }}
                disabled={!newComment.trim() || commentMutation.isPending}
              >
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Admin actions */}
        {canEdit && (
          <div className="border-t pt-4 flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={onEdit}>
              <Icon name="pencil" size={14} className="mr-1" />
              {t('common.edit')}
            </button>
            <button className="btn btn-error btn-sm" onClick={onDelete}>
              <Icon name="trash" size={14} className="mr-1" />
              {t('common.delete')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Create Post Modal
function CreatePostModal({
  categories,
  onClose,
  onSuccess,
}: {
  categories: PostCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreatePostData>({
    title: '',
    excerpt: '',
    content: '',
    contentFormat: 'markdown',
    status: 'draft',
    isPinned: false,
    isFeatured: false,
    allowComments: true,
    categoryIds: [],
  });

  const createMutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      showSuccess(t('posts.created'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.errorCreate'));
    },
  });

  const canSubmit = formData.title.trim() && formData.content.trim();

  const toggleCategory = (catId: string) => {
    setFormData((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds?.includes(catId)
        ? prev.categoryIds.filter((id) => id !== catId)
        : [...(prev.categoryIds || []), catId],
    }));
  };

  return (
    <Modal onClose={onClose} size="large" title={t('posts.createPost')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.postTitle')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={t('posts.titlePlaceholder')}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.excerpt')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.excerpt}
            onChange={(e) => setFormData((prev) => ({ ...prev, excerpt: e.target.value }))}
            placeholder={t('posts.excerptPlaceholder')}
            rows={2}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.content')} *</span>
          </label>
          <textarea
            className="textarea textarea-bordered font-mono"
            value={formData.content}
            onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
            placeholder={t('posts.contentPlaceholder')}
            rows={10}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.categories')}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <label
                key={cat.id}
                className={`badge badge-lg cursor-pointer ${
                  formData.categoryIds?.includes(cat.id) ? 'badge-primary' : 'badge-outline'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={formData.categoryIds?.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                />
                {cat.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t('posts.status.label')}</span>
            </label>
            <select
              className="select select-bordered"
              value={formData.status}
              onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as PostStatus }))}
            >
              <option value="draft">{t('posts.status.draft')}</option>
              <option value="scheduled">{t('posts.status.scheduled')}</option>
              <option value="published">{t('posts.status.published')}</option>
            </select>
          </div>
          {formData.status === 'scheduled' && (
            <div className="form-control">
              <label className="label">
                <span className="label-text">{t('posts.scheduledAt')} *</span>
              </label>
              <input
                type="datetime-local"
                className="input input-bordered"
                value={formData.scheduledAt ? formData.scheduledAt.slice(0, 16) : ''}
                onChange={(e) => setFormData((prev) => ({
                  ...prev,
                  scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : undefined
                }))}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.isPinned}
              onChange={(e) => setFormData((prev) => ({ ...prev, isPinned: e.target.checked }))}
            />
            <span className="text-sm">{t('posts.pinPost')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.isFeatured}
              onChange={(e) => setFormData((prev) => ({ ...prev, isFeatured: e.target.checked }))}
            />
            <span className="text-sm">{t('posts.featurePost')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.allowComments}
              onChange={(e) => setFormData((prev) => ({ ...prev, allowComments: e.target.checked }))}
            />
            <span className="text-sm">{t('posts.allowComments')}</span>
          </label>
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
                {t('posts.createPost')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Edit Post Modal
function EditPostModal({
  post,
  categories,
  onClose,
  onSuccess,
}: {
  post: PostDetail;
  categories: PostCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreatePostData>({
    title: post.title,
    excerpt: post.excerpt || '',
    content: post.content,
    contentFormat: post.contentFormat,
    status: post.status,
    isPinned: post.isPinned,
    isFeatured: post.isFeatured,
    allowComments: post.allowComments,
    categoryIds: post.categories.map((c) => c.id),
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreatePostData) => updatePost(post.id, data),
    onSuccess: () => {
      showSuccess(t('posts.updated'));
      onSuccess();
    },
    onError: (error: any) => {
      showError(error.response?.data?.error || t('posts.errorUpdate'));
    },
  });

  const canSubmit = formData.title.trim() && formData.content.trim();

  const toggleCategory = (catId: string) => {
    setFormData((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds?.includes(catId)
        ? prev.categoryIds.filter((id) => id !== catId)
        : [...(prev.categoryIds || []), catId],
    }));
  };

  return (
    <Modal onClose={onClose} size="large" title={t('posts.editPost')}>
      <div className="space-y-4">
        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.postTitle')} *</span>
          </label>
          <input
            type="text"
            className="input input-bordered"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.excerpt')}</span>
          </label>
          <textarea
            className="textarea textarea-bordered"
            value={formData.excerpt}
            onChange={(e) => setFormData((prev) => ({ ...prev, excerpt: e.target.value }))}
            rows={2}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.content')} *</span>
          </label>
          <textarea
            className="textarea textarea-bordered font-mono"
            value={formData.content}
            onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
            rows={10}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.categories')}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <label
                key={cat.id}
                className={`badge badge-lg cursor-pointer ${
                  formData.categoryIds?.includes(cat.id) ? 'badge-primary' : 'badge-outline'
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={formData.categoryIds?.includes(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                />
                {cat.name}
              </label>
            ))}
          </div>
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">{t('posts.status.label')}</span>
          </label>
          <select
            className="select select-bordered"
            value={formData.status}
            onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as PostStatus }))}
          >
            <option value="draft">{t('posts.status.draft')}</option>
            <option value="published">{t('posts.status.published')}</option>
            <option value="archived">{t('posts.status.archived')}</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.isPinned}
              onChange={(e) => setFormData((prev) => ({ ...prev, isPinned: e.target.checked }))}
            />
            <span className="text-sm">{t('posts.pinPost')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.isFeatured}
              onChange={(e) => setFormData((prev) => ({ ...prev, isFeatured: e.target.checked }))}
            />
            <span className="text-sm">{t('posts.featurePost')}</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={formData.allowComments}
              onChange={(e) => setFormData((prev) => ({ ...prev, allowComments: e.target.checked }))}
            />
            <span className="text-sm">{t('posts.allowComments')}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => updateMutation.mutate(formData)}
            disabled={!canSubmit || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <>
                <Icon name="check" size={16} className="mr-1" />
                {t('common.save')}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
