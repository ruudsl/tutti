import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

interface ChatChannel {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  instrument: {
    id: string;
    name: string;
    tuning?: string;
  };
  orchestra: {
    id: string;
    name: string;
  };
  messageCount: number;
  unreadCount: number;
  lastMessageAt?: string;
}

interface ChatMessage {
  id: string;
  content: string;
  isPinned: boolean;
  isEdited: boolean;
  editedAt?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    photo?: string;
  };
  replyTo?: {
    id: string;
    content: string;
    userName: string;
  };
}

export function useChatChannels(orchestraId?: string) {
  return useQuery({
    queryKey: ['chat-channels', orchestraId],
    queryFn: async () => {
      const params = orchestraId ? `?orchestraId=${orchestraId}` : '';
      const response = await api.get<ChatChannel[]>(`/section-chat/channels${params}`);
      return response.data;
    },
  });
}

export function useChatMessages(channelId: string, options?: { before?: string; limit?: number }) {
  return useQuery({
    queryKey: ['chat-messages', channelId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.before) params.append('before', options.before);
      if (options?.limit) params.append('limit', options.limit.toString());

      const response = await api.get<ChatMessage[]>(
        `/section-chat/channels/${channelId}/messages?${params}`
      );
      return response.data;
    },
    enabled: !!channelId,
  });
}

export function usePinnedMessages(channelId: string) {
  return useQuery({
    queryKey: ['pinned-messages', channelId],
    queryFn: async () => {
      const response = await api.get<ChatMessage[]>(`/section-chat/channels/${channelId}/pinned`);
      return response.data;
    },
    enabled: !!channelId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ channelId, content, replyToId }: {
      channelId: string;
      content: string;
      replyToId?: string;
    }) => {
      const response = await api.post<ChatMessage>(
        `/section-chat/channels/${channelId}/messages`,
        { content, replyToId }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.channelId] });
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    },
  });
}

export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const response = await api.patch(`/section-chat/messages/${messageId}`, { content });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
    },
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      await api.delete(`/section-chat/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    },
  });
}

export function usePinMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      const response = await api.post<{ pinned: boolean }>(`/section-chat/messages/${messageId}/pin`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
      queryClient.invalidateQueries({ queryKey: ['pinned-messages'] });
    },
  });
}

export function useEnsureChatChannels() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await api.post('/section-chat/channels/ensure');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    },
  });
}
