import dns from 'dns';
import mongoose, { ClientSession, ConnectOptions } from 'mongoose';
import { getServerEnv } from './env';
import { logger } from './logger';

const PUBLIC_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var __mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.__mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.__mongooseCache) {
  global.__mongooseCache = cached;
}

function isSrvLookupError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const errno = err as NodeJS.ErrnoException;
  return errno.syscall === 'querySrv' || err.message.includes('querySrv');
}

/**
 * Resolve a `mongodb+srv://` URI via an isolated public DNS Resolver when Node's
 * default c-ares resolver refuses SRV queries (e.g. loopback DNS on Windows).
 */
async function resolveSrvUriWithPublicDns(srvUri: string): Promise<string> {
  const url = new URL(srvUri);
  const resolver = new dns.promises.Resolver();
  resolver.setServers(PUBLIC_DNS_SERVERS);

  const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${url.hostname}`);
  if (srvRecords.length === 0) {
    throw new Error(`No SRV records found for ${url.hostname}`);
  }

  const mergedParams = new URLSearchParams();
  try {
    const txtRecords = await resolver.resolveTxt(url.hostname);
    if (txtRecords.length > 0) {
      const txtParams = new URLSearchParams(txtRecords[0].join(''));
      txtParams.forEach((value, key) => {
        mergedParams.set(key, value);
      });
    }
  } catch (txtErr) {
    const code = (txtErr as NodeJS.ErrnoException).code;
    if (code !== 'ENODATA' && code !== 'ENOTFOUND') {
      throw txtErr;
    }
  }

  url.searchParams.forEach((value, key) => {
    mergedParams.set(key, value);
  });

  // mongodb+srv:// implies TLS unless explicitly disabled by query params
  if (!mergedParams.has('tls') && !mergedParams.has('ssl')) {
    mergedParams.set('tls', 'true');
  }

  const hosts = srvRecords
    .map((record) => `${record.name}:${record.port || 27017}`)
    .join(',');
  const auth = url.username
    ? `${url.username}${url.password ? `:${url.password}` : ''}@`
    : '';
  const query = mergedParams.toString();

  return `mongodb://${auth}${hosts}${url.pathname || '/'}${query ? `?${query}` : ''}`;
}

async function connectMongoose(
  uri: string,
  options: ConnectOptions
): Promise<typeof mongoose> {
  try {
    return await mongoose.connect(uri, options);
  } catch (err) {
    if (!uri.startsWith('mongodb+srv://') || !isSrvLookupError(err)) {
      throw err;
    }
    logger.warn(
      { err },
      'MongoDB SRV lookup failed with default DNS; retrying with public DNS resolver'
    );
    const directUri = await resolveSrvUriWithPublicDns(uri);
    return await mongoose.connect(directUri, options);
  }
}

/**
 * Connect to MongoDB Atlas (or configured MongoDB URI) using a cached singleton connection.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  const env = getServerEnv();
  const uri = env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not configured in environment variables.');
  }

  // On Windows, Node's c-ares resolver can default to loopback DNS (127.0.0.1 / ::1),
  // which rejects mongodb+srv:// SRV lookups with querySrv ECONNREFUSED.
  // Guard against environments like Cloudflare Workers where dns.getServers is undefined.
  if (uri.startsWith('mongodb+srv://') && typeof dns?.getServers === 'function') {
    try {
      const servers = dns.getServers();
      if (servers.length > 0 && servers.every((s) => s === '127.0.0.1' || s === '::1')) {
        dns.setServers(PUBLIC_DNS_SERVERS);
      }
    } catch {
      // Ignore if global c-ares has in-flight queries or runs on Cloudflare Workers
    }
  }

  if (!cached.promise) {
    cached.promise = connectMongoose(uri, {
      dbName: env.MONGODB_DB_NAME,
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 30000,
    })
      .then((m) => {
        logger.info({ db: env.MONGODB_DB_NAME }, 'MongoDB connected');
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        logger.error({ err }, 'MongoDB connection error');
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Execute an operation inside a MongoDB ACID multi-document transaction.
 * Requires MongoDB Atlas or a replica set configuration.
 */
export async function withMongoTransaction<T>(
  work: (session: ClientSession) => Promise<T>
): Promise<T> {
  const conn = await connectDB();
  const session = await conn.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
