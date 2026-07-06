import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { nl, enUS } from 'date-fns/locale';
import { Icon } from './Icon';
import { ConfirmDialog } from './ConfirmDialog';
import {
  useChatChannels,
  useChatMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  usePinMessage,
  usePinnedMessages,
} from '../hooks/useSectionChat';
import { useAuth } from '../context/AuthContext';

interface SectionChatProps {
  orchestraId?: string;
}

export function SectionChat({ orchestraId }: SectionChatProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; userName: string } | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showPinned, setShowPinned] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channels, isLoading: channelsLoading } = useChatChannels(orchestraId);
  const { data: messages, isLoading: messagesLoading } = useChatMessages(selectedChannelId || '');
  const { data: pinnedMessages } = usePinnedMessages(selectedChannelId || '');
  const sendMessage = useSendMessage();
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();
  const pinMessage = usePinMessage();

  const locale = i18n.language === 'nl' ? nl : enUS;

  useEffect(() => {
    if (channels && channels.length > 0 && !selectedChannelId) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannelId || !message.trim()) return;

    await sendMessage.mutateAsync({
      channelId: selectedChannelId,
      content: message.trim(),
      replyToId: replyTo?.id,
    });
    setMessage('');
    setReplyTo(null);
  };

  const handleEdit = async (messageId: string) => {
    if (!editContent.trim()) return;
    await editMessage.mutateAsync({ messageId, content: editContent.trim() });
    setEditingMessage(null);
    setEditContent('');
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteMessage.mutateAsync(confirmDeleteId);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handlePin = async (messageId: string) => {
    await pinMessage.mutateAsync(messageId);
  };

  const selectedChannel = channels?.find((c) => c.id === selectedChannelId);
  const canModerate = user?.role && ['admin', 'conductor', 'music_committee'].includes(user.role);

  if (channelsLoading) {
    return (
      <div className="flex justify-center p-8">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return (
      <div className="text-center p-8 text-base-content/60">
        <p>{t('chat.noChannels')}</p>
        <p className="text-sm mt-2">{t('chat.noChannelsHint')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] border rounded-lg overflow-hidden">
      {/* Channel List */}
      <div className="w-64 border-r bg-base-200 flex flex-col">
        <div className="p-3 border-b bg-base-300 font-semibold">{t('chat.channels')}</div>
        <div className="flex-1 overflow-y-auto">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setSelectedChannelId(channel.id)}
              className={`w-full p-3 text-left hover:bg-base-300 border-b border-base-300 ${
                selectedChannelId === channel.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="font-medium truncate">{channel.name}</div>
                {channel.unreadCount > 0 && <span className="badge badge-primary badge-sm">{channel.unreadCount}</span>}
              </div>
              <div className="text-sm text-base-content/60 truncate">{channel.orchestra.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        {selectedChannel && (
          <div className="p-3 border-b bg-base-200 flex justify-between items-center">
            <div>
              <div className="font-semibold">{selectedChannel.name}</div>
              <div className="text-sm text-base-content/60">{selectedChannel.orchestra.name}</div>
            </div>
            <button
              className={`btn btn-sm ${showPinned ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setShowPinned(!showPinned)}
            >
              <Icon name="bookmark" size={16} />
              {pinnedMessages?.length || 0}
            </button>
          </div>
        )}

        {/* Pinned Messages */}
        {showPinned && pinnedMessages && pinnedMessages.length > 0 && (
          <div className="p-3 bg-warning/10 border-b max-h-40 overflow-y-auto">
            <div className="text-sm font-semibold mb-2">{t('chat.pinnedMessages')}</div>
            {pinnedMessages.map((pm) => (
              <div key={pm.id} className="text-sm p-2 bg-base-100 rounded mb-1">
                <span className="font-medium">{pm.user.name}:</span> {pm.content}
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messagesLoading ? (
            <div className="flex justify-center">
              <span className="loading loading-spinner" />
            </div>
          ) : messages?.length === 0 ? (
            <div className="text-center text-base-content/60 py-8">{t('chat.noMessages')}</div>
          ) : (
            messages?.map((msg) => (
              <div key={msg.id} className={`flex ${msg.user.id === user?.id ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] ${
                    msg.user.id === user?.id ? 'bg-primary text-primary-content' : 'bg-base-200'
                  } rounded-lg p-3`}
                >
                  {/* Reply indicator */}
                  {msg.replyTo && (
                    <div className="text-xs opacity-70 border-l-2 pl-2 mb-2">
                      <span className="font-medium">{msg.replyTo.userName}:</span>{' '}
                      {msg.replyTo.content.substring(0, 50)}...
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{msg.user.name}</span>
                    {msg.isPinned && <Icon name="bookmark" size={12} />}
                    <span className="text-xs opacity-60">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true, locale })}
                    </span>
                    {msg.isEdited && <span className="text-xs opacity-60">({t('chat.edited')})</span>}
                  </div>

                  {/* Content */}
                  {editingMessage === msg.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input input-sm input-bordered flex-1"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEdit(msg.id);
                          if (e.key === 'Escape') setEditingMessage(null);
                        }}
                        autoFocus
                      />
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditingMessage(null)}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <div>{msg.content}</div>
                  )}

                  {/* Actions */}
                  {!editingMessage && (
                    <div className="flex gap-2 mt-2 text-xs opacity-60">
                      <button
                        className="hover:opacity-100"
                        onClick={() => setReplyTo({ id: msg.id, content: msg.content, userName: msg.user.name })}
                      >
                        {t('chat.reply')}
                      </button>
                      {msg.user.id === user?.id && (
                        <>
                          <button
                            className="hover:opacity-100"
                            onClick={() => {
                              setEditingMessage(msg.id);
                              setEditContent(msg.content);
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            className="hover:opacity-100 hover:text-error"
                            onClick={() => setConfirmDeleteId(msg.id)}
                          >
                            {t('common.delete')}
                          </button>
                        </>
                      )}
                      {canModerate && (
                        <button className="hover:opacity-100" onClick={() => handlePin(msg.id)}>
                          {msg.isPinned ? t('chat.unpin') : t('chat.pin')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply indicator */}
        {replyTo && (
          <div className="px-4 py-2 bg-base-200 border-t flex justify-between items-center">
            <div className="text-sm">
              <span className="opacity-60">{t('chat.replyingTo')}</span>{' '}
              <span className="font-medium">{replyTo.userName}</span>
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => setReplyTo(null)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend} className="p-3 border-t bg-base-200">
          <div className="flex gap-2">
            <input
              type="text"
              className="input input-bordered flex-1"
              placeholder={t('chat.placeholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sendMessage.isPending}
            />
            <button type="submit" className="btn btn-primary" disabled={!message.trim() || sendMessage.isPending}>
              {sendMessage.isPending ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <Icon name="send" size={20} />
              )}
            </button>
          </div>
        </form>
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          title={t('common.confirmDeleteTitle')}
          message={t('chat.confirmDelete')}
          confirmLabel={t('common.delete')}
          variant="danger"
          isLoading={deleteMessage.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
