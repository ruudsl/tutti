import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

interface WebSocketState {
  isConnected: boolean;
  lastMessage: any;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  orchestraId: string | null;
  timestamp: string;
}

interface TypingIndicator {
  userId: string;
  isTyping: boolean;
}

interface SeatingUpdate {
  concertId: string;
  seatId: string;
  userId: string | null;
  updatedBy: string;
  timestamp: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: any;
}

type EventCallback<T> = (data: T) => void;

const SOCKET_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export function useWebSocket() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
  });

  const listenersRef = useRef<Map<string, Set<EventCallback<any>>>>(new Map());
  const isAuthenticated = user !== null;

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || !isAuthenticated || socketRef.current?.connected) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      setState(prev => ({ ...prev, isConnected: true }));
    });

    socket.on('disconnect', () => {
      setState(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
    });

    // Set up event forwarding to registered listeners
    const events = [
      'chat:message',
      'chat:typing',
      'seating:updated',
      'notification:new',
      'presence:updated',
      'presence:offline',
    ];

    events.forEach(event => {
      socket.on(event, (data: any) => {
        setState(prev => ({ ...prev, lastMessage: { event, data } }));
        const callbacks = listenersRef.current.get(event);
        if (callbacks) {
          callbacks.forEach(cb => cb(data));
        }
      });
    });

    socketRef.current = socket;
  }, [isAuthenticated]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setState({ isConnected: false, lastMessage: null });
    }
  }, []);

  const subscribe = useCallback(<T,>(event: string, callback: EventCallback<T>) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);

    return () => {
      listenersRef.current.get(event)?.delete(callback);
    };
  }, []);

  const emit = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  }, []);

  // Chat-specific methods
  const sendChatMessage = useCallback((content: string, orchestraId?: string) => {
    emit('chat:message', { content, orchestraId });
  }, [emit]);

  const setTyping = useCallback((isTyping: boolean, orchestraId?: string) => {
    emit('chat:typing', { isTyping, orchestraId });
  }, [emit]);

  const onChatMessage = useCallback((callback: EventCallback<ChatMessage>) => {
    return subscribe('chat:message', callback);
  }, [subscribe]);

  const onTyping = useCallback((callback: EventCallback<TypingIndicator>) => {
    return subscribe('chat:typing', callback);
  }, [subscribe]);

  // Seating-specific methods
  const updateSeating = useCallback((concertId: string, seatId: string, userId: string | null) => {
    emit('seating:update', { concertId, seatId, userId });
  }, [emit]);

  const onSeatingUpdate = useCallback((callback: EventCallback<SeatingUpdate>) => {
    return subscribe('seating:updated', callback);
  }, [subscribe]);

  // Notification methods
  const onNotification = useCallback((callback: EventCallback<Notification>) => {
    return subscribe('notification:new', callback);
  }, [subscribe]);

  // Presence methods
  const updatePresence = useCallback((page: string) => {
    emit('presence:update', { page });
  }, [emit]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  return {
    isConnected: state.isConnected,
    lastMessage: state.lastMessage,
    connect,
    disconnect,
    emit,
    subscribe,
    // Chat
    sendChatMessage,
    setTyping,
    onChatMessage,
    onTyping,
    // Seating
    updateSeating,
    onSeatingUpdate,
    // Notifications
    onNotification,
    // Presence
    updatePresence,
  };
}

export type { ChatMessage, TypingIndicator, SeatingUpdate, Notification };
