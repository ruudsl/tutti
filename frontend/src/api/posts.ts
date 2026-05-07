import api from './client';

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type ContentFormat = 'markdown' | 'html';

export interface PostCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  postCount: number;
  createdAt: string;
}

export interface PostComment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  parentId?: string;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  featuredImage?: string;
  status: PostStatus;
  isPinned: boolean;
  isFeatured: boolean;
  allowComments: boolean;
  viewCount: number;
  authorId: string;
  authorName: string;
  publishedAt?: string;
  createdAt: string;
  categories: { id: string; name: string; slug: string; color?: string }[];
  commentCount: number;
  isRead: boolean;
}

export interface PostDetail extends Omit<Post, 'commentCount' | 'isRead'> {
  content: string;
  contentFormat: ContentFormat;
  targetOrchestras?: string[];
  targetRoles?: string[];
  updatedAt: string;
  comments: PostComment[];
}

export interface CreatePostData {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  contentFormat?: ContentFormat;
  featuredImage?: string;
  status?: PostStatus;
  isPinned?: boolean;
  isFeatured?: boolean;
  allowComments?: boolean;
  categoryIds?: string[];
  targetOrchestras?: string[];
  targetRoles?: string[];
  publishedAt?: string;
  scheduledAt?: string;
}

export interface UpdatePostData extends Partial<CreatePostData> {}

export interface PostFilters {
  status?: PostStatus;
  category?: string;
  search?: string;
  featured?: boolean;
  pinned?: boolean;
}

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  icon?: string;
}

// Categories
export async function getPostCategories(): Promise<PostCategory[]> {
  const response = await api.get('/posts/categories');
  return response.data;
}

export async function createPostCategory(data: CreateCategoryData): Promise<{ id: string; message: string }> {
  const response = await api.post('/posts/categories', data);
  return response.data;
}

export async function updatePostCategory(id: string, data: Partial<CreateCategoryData>): Promise<{ message: string }> {
  const response = await api.put(`/posts/categories/${id}`, data);
  return response.data;
}

export async function deletePostCategory(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/posts/categories/${id}`);
  return response.data;
}

// Posts
export async function getPosts(filters?: PostFilters): Promise<Post[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.featured) params.set('featured', 'true');
  if (filters?.pinned) params.set('pinned', 'true');

  const query = params.toString();
  const response = await api.get(`/posts${query ? `?${query}` : ''}`);
  return response.data;
}

export async function getPost(idOrSlug: string): Promise<PostDetail> {
  const response = await api.get(`/posts/${idOrSlug}`);
  return response.data;
}

export async function createPost(data: CreatePostData): Promise<{ id: string; slug: string; message: string }> {
  const response = await api.post('/posts', data);
  return response.data;
}

export async function updatePost(id: string, data: UpdatePostData): Promise<{ message: string }> {
  const response = await api.put(`/posts/${id}`, data);
  return response.data;
}

export async function deletePost(id: string): Promise<{ message: string }> {
  const response = await api.delete(`/posts/${id}`);
  return response.data;
}

// Comments
export async function addPostComment(postId: string, data: { content: string; parentId?: string }): Promise<PostComment & { message: string }> {
  const response = await api.post(`/posts/${postId}/comments`, data);
  return response.data;
}

export async function deletePostComment(postId: string, commentId: string): Promise<{ message: string }> {
  const response = await api.delete(`/posts/${postId}/comments/${commentId}`);
  return response.data;
}
