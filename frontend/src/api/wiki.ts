import api from './client';

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  parentId?: string;
  visibility: 'public' | 'members' | 'committee' | 'admin';
  isPinned: boolean;
  isPublished: boolean;
  sortOrder: number;
  viewCount: number;
  updatedAt: string;
  children: WikiPage[];
}

export interface WikiPageDetail extends WikiPage {
  content: string;
  contentFormat?: string;
  parentTitle?: string;
  parentSlug?: string;
  allowComments: boolean;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: string;
  breadcrumbs: { slug: string; title: string }[];
}

export interface WikiVersion {
  id: string;
  versionNumber: number;
  title: string;
  changeSummary?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface WikiVersionDetail extends WikiVersion {
  content: string;
}

export interface CreateWikiPageData {
  title: string;
  slug: string;
  content: string;
  parentId?: string;
  visibility?: 'public' | 'members' | 'committee' | 'admin';
  allowComments?: boolean;
  isPinned?: boolean;
}

export interface UpdateWikiPageData {
  title?: string;
  content?: string;
  parentId?: string | null;
  visibility?: 'public' | 'members' | 'committee' | 'admin';
  allowComments?: boolean;
  isPinned?: boolean;
  isPublished?: boolean;
  changeSummary?: string;
}

export const getWikiPages = async (): Promise<WikiPage[]> => {
  const { data } = await api.get('/wiki');
  return data;
};

export const searchWikiPages = async (query: string): Promise<{ id: string; slug: string; title: string; excerpt: string; updatedAt: string }[]> => {
  const { data } = await api.get('/wiki/search', { params: { q: query } });
  return data;
};

export const getWikiPage = async (slug: string): Promise<WikiPageDetail> => {
  const { data } = await api.get(`/wiki/${slug}`);
  return data;
};

export const createWikiPage = async (page: CreateWikiPageData): Promise<{ id: string; slug: string; message: string }> => {
  const { data } = await api.post('/wiki', page);
  return data;
};

export const updateWikiPage = async (slug: string, updates: UpdateWikiPageData): Promise<{ message: string }> => {
  const { data } = await api.patch(`/wiki/${slug}`, updates);
  return data;
};

export const deleteWikiPage = async (slug: string): Promise<{ message: string }> => {
  const { data } = await api.delete(`/wiki/${slug}`);
  return data;
};

export const getWikiPageVersions = async (slug: string): Promise<WikiVersion[]> => {
  const { data } = await api.get(`/wiki/${slug}/versions`);
  return data;
};

export const getWikiPageVersion = async (slug: string, versionId: string): Promise<WikiVersionDetail> => {
  const { data } = await api.get(`/wiki/${slug}/versions/${versionId}`);
  return data;
};

export const restoreWikiPageVersion = async (slug: string, versionId: string): Promise<{ message: string }> => {
  const { data } = await api.post(`/wiki/${slug}/versions/${versionId}/restore`);
  return data;
};
