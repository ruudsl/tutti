import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import db from '../database/connection';
import logger from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  associationId?: string;
  orchestraIds?: string[];
}

interface JwtPayload {
  id: string;
  associationId: string;
}

let io: Server | null = null;

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as JwtPayload;
      socket.userId = decoded.id;
      socket.associationId = decoded.associationId;

      // Get user's orchestra memberships
      const orchestras = db.prepare('SELECT orchestra_id FROM user_orchestras WHERE user_id = ?').all(decoded.id) as {
        orchestra_id: string;
      }[];
      socket.orchestraIds = orchestras.map((o) => o.orchestra_id);

      next();
    } catch (err) {
      logger.warn('WebSocket authentication failed', { error: (err as Error).message });
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info('WebSocket client connected', { userId: socket.userId });

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Join association room
    if (socket.associationId) {
      socket.join(`association:${socket.associationId}`);
    }

    // Join orchestra rooms
    if (socket.orchestraIds) {
      socket.orchestraIds.forEach((id) => socket.join(`orchestra:${id}`));
    }

    // Handle chat messages
    socket.on('chat:message', async (data: { orchestraId?: string; content: string }) => {
      if (!socket.userId || !socket.associationId) return;

      try {
        const room = data.orchestraId ? `orchestra:${data.orchestraId}` : `association:${socket.associationId}`;

        // Get user info
        const user = db.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(socket.userId) as any;

        const message = {
          id: crypto.randomUUID(),
          userId: socket.userId,
          userName: user ? `${user.first_name} ${user.last_name}` : 'Unknown',
          content: data.content,
          orchestraId: data.orchestraId || null,
          timestamp: new Date().toISOString(),
        };

        // Store message in database
        db.prepare(
          `
          INSERT INTO chat_messages (id, association_id, orchestra_id, user_id, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).run(
          message.id,
          socket.associationId,
          data.orchestraId || null,
          socket.userId,
          data.content,
          message.timestamp,
        );

        // Broadcast to room
        io?.to(room).emit('chat:message', message);
      } catch (err) {
        logger.error('Chat message error', { error: (err as Error).message });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('chat:typing', (data: { orchestraId?: string; isTyping: boolean }) => {
      if (!socket.userId || !socket.associationId) return;

      const room = data.orchestraId ? `orchestra:${data.orchestraId}` : `association:${socket.associationId}`;
      socket.to(room).emit('chat:typing', {
        userId: socket.userId,
        isTyping: data.isTyping,
      });
    });

    // Handle seating updates
    socket.on('seating:update', (data: { concertId: string; seatId: string; userId: string | null }) => {
      if (!socket.associationId) return;

      io?.to(`association:${socket.associationId}`).emit('seating:updated', {
        concertId: data.concertId,
        seatId: data.seatId,
        userId: data.userId,
        updatedBy: socket.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle presence updates
    socket.on('presence:update', (data: { page: string }) => {
      if (!socket.associationId) return;

      socket.to(`association:${socket.associationId}`).emit('presence:updated', {
        userId: socket.userId,
        page: data.page,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', { userId: socket.userId });

      if (socket.associationId) {
        io?.to(`association:${socket.associationId}`).emit('presence:offline', {
          userId: socket.userId,
        });
      }
    });
  });

  logger.info('WebSocket server initialized');
  return io;
}

export function getIO(): Server | null {
  return io;
}

// Helper functions for emitting events from other parts of the app
export function emitToUser(userId: string, event: string, data: any): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export function emitToAssociation(associationId: string, event: string, data: any): void {
  io?.to(`association:${associationId}`).emit(event, data);
}

export function emitToOrchestra(orchestraId: string, event: string, data: any): void {
  io?.to(`orchestra:${orchestraId}`).emit(event, data);
}

export function emitNotification(
  userId: string,
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    data?: any;
  },
): void {
  io?.to(`user:${userId}`).emit('notification:new', notification);
}
