import '../scripts/load-env';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import * as admin from 'firebase-admin';
import mongoose from 'mongoose';

const PORT = Number(process.env.REALTIME_PORT || 4000);
const CORS_ORIGIN = process.env.REALTIME_CORS_ORIGIN || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function initFirebase() {
  if (admin.apps.length > 0) return;
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
}

async function bootstrap() {
  initFirebase();

  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'colibriplus',
    });
  }

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'colibriplus-realtime' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(httpServer, {
    cors: {
      origin: CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const pubClient = new Redis(REDIS_URL);
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => console.warn('[realtime] Redis pub error:', err.message));
  subClient.on('error', (err) => console.warn('[realtime] Redis sub error:', err.message));

  io.adapter(createAdapter(pubClient, subClient));

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Unauthorized: missing token'));
      }

      if (admin.apps.length === 0) {
        return next(new Error('Firebase Admin not configured'));
      }

      const decoded = await admin.auth().verifyIdToken(token, true);
      const userDoc = await mongoose.connection
        .collection('users')
        .findOne({ firebaseUid: decoded.uid, deletedAt: null });

      if (!userDoc || userDoc.status === 'blocked' || userDoc.status === 'suspended') {
        return next(new Error('Forbidden: account unavailable'));
      }

      socket.data.userId = String(userDoc._id);
      socket.data.username = userDoc.username;
      socket.data.hideOnline = Boolean(userDoc.privacySettings?.onlinePrivacy);
      next();
    } catch {
      next(new Error('Unauthorized: invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    const hideOnline = Boolean(socket.data.hideOnline);

    socket.join(`user:${userId}`);

    if (!hideOnline) {
      await pubClient.sadd('online_users', userId).catch(() => {});
      socket.broadcast.emit('presence:update', { userId, online: true });
    }

    socket.on('chat:join', async (chatId: string) => {
      if (!mongoose.Types.ObjectId.isValid(chatId)) return;
      const chat = await mongoose.connection.collection('chats').findOne({
        _id: new mongoose.Types.ObjectId(chatId),
        'participants.userId': new mongoose.Types.ObjectId(userId),
      });
      if (chat) {
        socket.join(`chat:${chatId}`);
      }
    });

    socket.on('chat:leave', (chatId: string) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on('chat:typing:start', (payload: { chatId: string }) => {
      if (!payload?.chatId) return;
      socket.to(`chat:${payload.chatId}`).emit('chat:typing', {
        chatId: payload.chatId,
        userId,
        username: socket.data.username,
        typing: true,
      });
    });

    socket.on('chat:typing:stop', (payload: { chatId: string }) => {
      if (!payload?.chatId) return;
      socket.to(`chat:${payload.chatId}`).emit('chat:typing', {
        chatId: payload.chatId,
        userId,
        username: socket.data.username,
        typing: false,
      });
    });

    socket.on('chat:message:delivered', async (payload: { chatId: string; messageId: string }) => {
      if (!payload?.chatId || !payload?.messageId) return;
      if (
        !mongoose.Types.ObjectId.isValid(payload.chatId) ||
        !mongoose.Types.ObjectId.isValid(payload.messageId)
      ) {
        return;
      }

      await mongoose.connection.collection('messages').updateOne(
        { _id: new mongoose.Types.ObjectId(payload.messageId) },
        { $addToSet: { deliveredTo: new mongoose.Types.ObjectId(userId) } }
      );

      socket.to(`chat:${payload.chatId}`).emit('chat:message:delivered', {
        chatId: payload.chatId,
        messageId: payload.messageId,
        userId,
      });
    });

    socket.on('post:watch', (postId: string) => {
      if (postId) socket.join(`post:${postId}`);
    });

    socket.on('post:unwatch', (postId: string) => {
      if (postId) socket.leave(`post:${postId}`);
    });

    socket.on('disconnect', async () => {
      if (!hideOnline) {
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        if (sockets.length === 0) {
          await pubClient.srem('online_users', userId).catch(() => {});
          await mongoose.connection
            .collection('users')
            .updateOne(
              { _id: new mongoose.Types.ObjectId(userId) },
              { $set: { lastActive: new Date() } }
            )
            .catch(() => {});
          socket.broadcast.emit('presence:update', { userId, online: false });
        }
      }
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`[realtime] Weto Socket.IO listening on :${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[realtime] Fatal startup error:', err);
  process.exit(1);
});
