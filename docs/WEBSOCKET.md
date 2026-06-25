# WebSocket Real-Time Features

This document describes the WebSocket implementation for real-time features in the Harmonie Muziek application.

## Overview

The application uses Socket.IO for real-time bidirectional communication, enabling:
- Live chat messaging
- Typing indicators
- Real-time seating updates
- Push notifications
- User presence tracking

## Server Setup

### Initialization

```typescript
// backend/src/websocket/index.ts
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

export function initWebSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ... authentication and event handlers
  
  return io;
}
```

### Authentication Middleware

WebSocket connections require JWT authentication:

```typescript
interface AuthenticatedSocket extends Socket {
  userId?: string;
  associationId?: string;
  orchestraIds?: string[];
}

io.use(async (socket: AuthenticatedSocket, next) => {
  try {
    const token = socket.handshake.auth.token || 
                  socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    socket.userId = decoded.id;
    socket.associationId = decoded.associationId;

    // Get user's orchestra memberships
    const orchestras = db.prepare(
      'SELECT orchestra_id FROM user_orchestras WHERE user_id = ?'
    ).all(decoded.id);
    socket.orchestraIds = orchestras.map(o => o.orchestra_id);

    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});
```

### Room Management

Users are automatically joined to relevant rooms on connection:

```typescript
io.on('connection', (socket: AuthenticatedSocket) => {
  // Join user-specific room (for private notifications)
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }

  // Join association room (for organization-wide updates)
  if (socket.associationId) {
    socket.join(`association:${socket.associationId}`);
  }

  // Join orchestra rooms (for orchestra-specific chat)
  if (socket.orchestraIds) {
    socket.orchestraIds.forEach(id => socket.join(`orchestra:${id}`));
  }
});
```

## Events

### Server-Emitted Events

| Event | Room | Payload | Description |
|-------|------|---------|-------------|
| `chat:message` | `orchestra:{id}` or `association:{id}` | `ChatMessage` | New chat message |
| `chat:typing` | `orchestra:{id}` or `association:{id}` | `TypingIndicator` | User typing status |
| `seating:updated` | `association:{id}` | `SeatingUpdate` | Seat assignment change |
| `notification:new` | `user:{id}` | `Notification` | New notification |
| `presence:updated` | `association:{id}` | `PresenceUpdate` | User online/page update |
| `presence:offline` | `association:{id}` | `{ userId }` | User disconnected |
| `error` | `user:{id}` | `{ message }` | Error message |

### Client-Emitted Events

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ content, orchestraId? }` | Send chat message |
| `chat:typing` | `{ isTyping, orchestraId? }` | Update typing indicator |
| `seating:update` | `{ concertId, seatId, userId }` | Update seat assignment |
| `presence:update` | `{ page }` | Update current page/presence |

## Event Payloads

### ChatMessage

```typescript
interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  orchestraId: string | null;
  timestamp: string;
}
```

### TypingIndicator

```typescript
interface TypingIndicator {
  userId: string;
  isTyping: boolean;
}
```

### SeatingUpdate

```typescript
interface SeatingUpdate {
  concertId: string;
  seatId: string;
  userId: string | null;
  updatedBy: string;
  timestamp: string;
}
```

### Notification

```typescript
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: any;
}
```

## Client Integration

### useWebSocket Hook

```typescript
// frontend/src/hooks/useWebSocket.ts
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 
                   import.meta.env.VITE_API_URL?.replace('/api', '') || 
                   'http://localhost:3001';

export function useWebSocket() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
  });

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token || !user || socketRef.current?.connected) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Event handlers...
    socketRef.current = socket;
  }, [user]);

  // ... rest of hook
}
```

### Usage Examples

#### Chat Integration

```tsx
import { useWebSocket } from '../hooks/useWebSocket';

function ChatComponent({ orchestraId }: { orchestraId?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const { 
    isConnected, 
    sendChatMessage, 
    setTyping, 
    onChatMessage, 
    onTyping 
  } = useWebSocket();

  useEffect(() => {
    // Subscribe to new messages
    const unsubMessage = onChatMessage((message) => {
      setMessages(prev => [...prev, message]);
    });

    // Subscribe to typing indicators
    const unsubTyping = onTyping(({ userId, isTyping }) => {
      setTypingUsers(prev => {
        const next = new Set(prev);
        if (isTyping) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
    });

    return () => {
      unsubMessage();
      unsubTyping();
    };
  }, [onChatMessage, onTyping]);

  const handleSend = (content: string) => {
    sendChatMessage(content, orchestraId);
  };

  const handleTyping = (isTyping: boolean) => {
    setTyping(isTyping, orchestraId);
  };

  return (
    <div>
      <ConnectionStatus connected={isConnected} />
      <MessageList messages={messages} />
      {typingUsers.size > 0 && <TypingIndicator users={typingUsers} />}
      <MessageInput onSend={handleSend} onTyping={handleTyping} />
    </div>
  );
}
```

#### Seating Updates

```tsx
function SeatingChart({ concertId }: { concertId: string }) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const { updateSeating, onSeatingUpdate } = useWebSocket();

  useEffect(() => {
    const unsubscribe = onSeatingUpdate((update) => {
      if (update.concertId === concertId) {
        setSeats(prev => prev.map(seat => 
          seat.id === update.seatId 
            ? { ...seat, userId: update.userId }
            : seat
        ));
      }
    });

    return unsubscribe;
  }, [concertId, onSeatingUpdate]);

  const handleSeatAssign = (seatId: string, userId: string | null) => {
    updateSeating(concertId, seatId, userId);
  };

  return (
    <div className="seating-chart">
      {seats.map(seat => (
        <SeatButton 
          key={seat.id}
          seat={seat}
          onAssign={handleSeatAssign}
        />
      ))}
    </div>
  );
}
```

#### Real-time Notifications

```tsx
function NotificationListener() {
  const { onNotification } = useWebSocket();
  const { addNotification } = useNotifications();

  useEffect(() => {
    const unsubscribe = onNotification((notification) => {
      // Add to notification store
      addNotification(notification);
      
      // Show toast
      toast({
        title: notification.title,
        description: notification.body,
      });
      
      // Trigger browser notification if permitted
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.body,
          icon: '/icon-192.png',
        });
      }
    });

    return unsubscribe;
  }, [onNotification, addNotification]);

  return null; // This is a listener-only component
}
```

## Server-Side Emission

### Helper Functions

```typescript
// Emit to specific user
export function emitToUser(userId: string, event: string, data: any): void {
  io?.to(`user:${userId}`).emit(event, data);
}

// Emit to entire association
export function emitToAssociation(associationId: string, event: string, data: any): void {
  io?.to(`association:${associationId}`).emit(event, data);
}

// Emit to specific orchestra
export function emitToOrchestra(orchestraId: string, event: string, data: any): void {
  io?.to(`orchestra:${orchestraId}`).emit(event, data);
}

// Send notification to user
export function emitNotification(userId: string, notification: {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: any;
}): void {
  io?.to(`user:${userId}`).emit('notification:new', notification);
}
```

### Usage in Route Handlers

```typescript
import { emitNotification, emitToAssociation } from '../websocket';

router.post('/concerts/:id/attendance', authenticateToken, async (req, res) => {
  // ... create attendance record ...
  
  // Notify user
  emitNotification(userId, {
    id: crypto.randomUUID(),
    type: 'attendance_confirmed',
    title: 'Aanwezigheid bevestigd',
    body: `Je aanwezigheid voor ${concert.name} is bevestigd.`,
    data: { concertId: concert.id },
  });
  
  // Broadcast to association
  emitToAssociation(req.user.associationId, 'attendance:updated', {
    concertId: concert.id,
    userId,
    status: 'present',
  });
  
  res.json({ success: true });
});
```

## Reconnection Handling

The client automatically handles reconnection:

```typescript
const socket = io(SOCKET_URL, {
  reconnection: true,
  reconnectionAttempts: 5,     // Try 5 times
  reconnectionDelay: 1000,     // Start with 1s delay
  reconnectionDelayMax: 5000,  // Max 5s delay
});

// Connection events
socket.on('connect', () => {
  setState(prev => ({ ...prev, isConnected: true }));
});

socket.on('disconnect', () => {
  setState(prev => ({ ...prev, isConnected: false }));
});

socket.on('connect_error', (error) => {
  console.error('WebSocket connection error:', error.message);
});
```

### Reconnection UI

```tsx
function ConnectionStatus({ connected }: { connected: boolean }) {
  if (connected) return null;
  
  return (
    <div className="connection-banner warning">
      <WarningIcon />
      <span>Verbinding verbroken. Proberen opnieuw te verbinden...</span>
    </div>
  );
}
```

## Security Considerations

1. **Authentication Required** - All WebSocket connections require a valid JWT
2. **Room Isolation** - Users can only join rooms for their association/orchestras
3. **Tenant Isolation** - Events are scoped to appropriate rooms
4. **Input Validation** - All incoming event data should be validated
5. **Rate Limiting** - Consider implementing rate limiting for chat messages

## Performance Considerations

1. **Ping/Pong** - Configured with 25s interval, 60s timeout to detect dead connections
2. **Room Usage** - Efficient broadcast using Socket.IO rooms
3. **Transports** - Prefers WebSocket, falls back to polling
4. **Connection Pooling** - Single connection per user, multiplexed for all features

## Testing

### Manual Testing

1. Open two browser windows with different users
2. Send chat message - verify it appears in both windows
3. Disconnect network - verify reconnection works
4. Test typing indicators - verify they appear/disappear correctly

### Integration Testing

```typescript
import { io as ioClient, Socket } from 'socket.io-client';

describe('WebSocket', () => {
  let socket: Socket;
  
  beforeEach((done) => {
    socket = ioClient('http://localhost:3001', {
      auth: { token: testUserToken },
    });
    socket.on('connect', done);
  });
  
  afterEach(() => {
    socket.disconnect();
  });
  
  it('should receive chat messages', (done) => {
    socket.on('chat:message', (message) => {
      expect(message).toHaveProperty('id');
      expect(message).toHaveProperty('content', 'Test message');
      done();
    });
    
    socket.emit('chat:message', { content: 'Test message' });
  });
});
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `JWT_SECRET` | Secret for JWT verification | Required |
| `VITE_WS_URL` | WebSocket server URL (frontend) | Derived from API URL |
