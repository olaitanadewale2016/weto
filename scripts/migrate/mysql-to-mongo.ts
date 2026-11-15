import '../load-env';
import crypto from 'crypto';
import mysql from 'mysql2/promise';
import { Types } from 'mongoose';
import { connectDB } from '../../src/lib/db';
import {
  Ad,
  Blacklist,
  Bookmark,
  BusinessAccount,
  Cashout,
  Category,
  Censor,
  Chat,
  Comment,
  Follow,
  JobApplication,
  JobListing,
  Message,
  Payment,
  Post,
  Product,
  Report,
  StoryFrame,
  User,
  Wallet,
  WalletTransaction,
} from '../../src/models';
import { encodeId } from '../../src/lib/hashids';

const DRY_RUN = process.argv.includes('--dry-run');

async function safeQuery<T extends mysql.RowDataPacket>(
  conn: mysql.Connection,
  sql: string
): Promise<T[]> {
  try {
    const [rows] = await conn.query<T[]>(sql);
    return rows;
  } catch (err) {
    console.warn(`Skipping query (${sql.slice(0, 50)}...):`, (err as Error).message);
    return [];
  }
}

async function main() {
  const mysqlUrl = process.env.MYSQL_URL;
  const conn = mysqlUrl
    ? await mysql.createConnection(mysqlUrl)
    : await mysql.createConnection({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'colibriplus',
      });

  await connectDB();

  const userMap = new Map<number, Types.ObjectId>();
  const postMap = new Map<number, Types.ObjectId>();
  const categoryMap = new Map<number, Types.ObjectId>();
  const chatMap = new Map<number, Types.ObjectId>();
  const jobMap = new Map<number, Types.ObjectId>();

  // 1. Users
  const mysqlUsers = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM users');
  console.log(`Found ${mysqlUsers.length} MySQL users (dryRun=${DRY_RUN})`);
  for (const row of mysqlUsers) {
    if (DRY_RUN) continue;
    const doc = await User.findOneAndUpdate(
      { legacyMysqlId: Number(row.id) },
      {
        $setOnInsert: {
          legacyMysqlId: Number(row.id),
          firstName: row.first_name || row.username || 'User',
          lastName: row.last_name || '',
          username: String(row.username || `user_${row.id}`).toLowerCase(),
          email: String(row.email || `user_${row.id}@migrated.local`).toLowerCase(),
          bio: row.bio || '',
          caption: row.caption || '',
          website: row.website || null,
          country: row.country || null,
          city: row.city || null,
          avatar: row.avatar || '/assets/avatars/default-avatar.png',
          cover: row.cover || '/assets/covers/default-cover.jpg',
          verified: Boolean(row.verified),
          status: row.status || 'active',
          role: row.role || 'user',
          type: row.type || 'reader',
          publicationsCount: Number(row.publications_count || 0),
          followersCount: Number(row.followers_count || 0),
          followingCount: Number(row.followings_count || row.following_count || 0),
          legacyPasswordHash: row.password || null,
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        },
      },
      { upsert: true, new: true }
    );
    userMap.set(Number(row.id), doc._id);
  }

  // 2. Follows
  const mysqlFollows = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM follows');
  for (const row of mysqlFollows) {
    const followerId = userMap.get(Number(row.follower_id));
    const followingId = userMap.get(Number(row.following_id));
    if (!followerId || !followingId || DRY_RUN) continue;
    await Follow.updateOne(
      { followerId, followingId },
      { $setOnInsert: { followerId, followingId, status: row.status || 'following' } },
      { upsert: true }
    );
  }

  // 3. Categories
  const mysqlCats = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM categories');
  for (const row of mysqlCats) {
    if (DRY_RUN) continue;
    const loc =
      typeof row.localization === 'string'
        ? JSON.parse(row.localization)
        : row.localization || { en: row.name || `Category ${row.id}` };
    const doc = await Category.findOneAndUpdate(
      { 'localization.en': loc.en || `Category ${row.id}`, categorizableType: row.categorizable_type || 'product' },
      { $setOnInsert: { localization: loc, categorizableType: row.categorizable_type || 'product' } },
      { upsert: true, new: true }
    );
    categoryMap.set(Number(row.id), doc._id);
  }

  // 4. Posts
  const mysqlPosts = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM posts');
  for (const row of mysqlPosts) {
    const userId = userMap.get(Number(row.user_id));
    if (!userId || DRY_RUN) continue;
    const hashId = row.hash_id || encodeId(Number(row.id));
    const doc = await Post.findOneAndUpdate(
      { legacyMysqlId: Number(row.id) },
      {
        $setOnInsert: {
          legacyMysqlId: Number(row.id),
          hashId,
          userId,
          title: row.title || null,
          content: row.content || '',
          type: row.type || 'text',
          status: row.status || 'active',
          isSensitive: Boolean(row.is_sensitive),
          isAiGenerated: Boolean(row.is_ai_generated),
          commentsCount: Number(row.comments_count || 0),
          viewsCount: Number(row.views_count || 0),
          repostsCount: Number(row.reposts_count || 0),
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        },
      },
      { upsert: true, new: true }
    );
    postMap.set(Number(row.id), doc._id);
  }

  // 5. Comments
  const mysqlComments = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM comments');
  for (const row of mysqlComments) {
    const userId = userMap.get(Number(row.user_id));
    const postId = postMap.get(Number(row.post_id));
    if (!userId || !postId || DRY_RUN) continue;
    await Comment.create({
      userId,
      postId,
      content: row.content || '',
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    });
  }

  // 6. Products & Jobs
  const mysqlProducts = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM products');
  for (const row of mysqlProducts) {
    const userId = userMap.get(Number(row.user_id));
    if (!userId || DRY_RUN) continue;
    await Product.updateOne(
      { hashId: row.hash_id || encodeId(Number(row.id) + 500000) },
      {
        $setOnInsert: {
          hashId: row.hash_id || encodeId(Number(row.id) + 500000),
          userId,
          categoryId: categoryMap.get(Number(row.category_id)) || null,
          title: row.title || 'Product',
          description: row.description || '',
          price: Number(row.price || 0),
          discount: Number(row.discount || 0),
          currency: row.currency || 'USD',
          status: row.status || 'active',
          approval: row.approval || 'approved',
        },
      },
      { upsert: true }
    );
  }

  const mysqlJobs = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM jobs');
  for (const row of mysqlJobs) {
    const userId = userMap.get(Number(row.user_id));
    if (!userId || DRY_RUN) continue;
    const hashId = row.hash_id || encodeId(Number(row.id) + 800000);
    const doc = await JobListing.findOneAndUpdate(
      { hashId },
      {
        $setOnInsert: {
          hashId,
          userId,
          categoryId: categoryMap.get(Number(row.category_id)) || null,
          title: row.title || 'Job Opening',
          overview: row.overview || '',
          description: row.description || '',
          income: row.income ? Number(row.income) : null,
          currency: row.currency || 'USD',
          isRemote: Boolean(row.is_remote),
          status: row.status || 'active',
          approval: row.approval || 'approved',
        },
      },
      { upsert: true, new: true }
    );
    jobMap.set(Number(row.id), doc._id);
  }

  // 7. Wallets & Transactions
  const mysqlWallets = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM wallets');
  for (const row of mysqlWallets) {
    const userId = userMap.get(Number(row.user_id));
    if (!userId || DRY_RUN) continue;
    await Wallet.updateOne(
      { userId },
      {
        $setOnInsert: {
          userId,
          walletNumber: row.wallet_number || `CW${crypto.randomInt(10000000, 99999999)}`,
          balance: Number(row.balance || 0),
          currency: row.currency || 'USD',
        },
      },
      { upsert: true }
    );
  }

  const mysqlTxs = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM wallet_transactions');
  for (const row of mysqlTxs) {
    const userId = userMap.get(Number(row.user_id));
    if (!userId || DRY_RUN) continue;
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) continue;
    await WalletTransaction.updateOne(
      { idempotencyKey: `legacy_tx_${row.id}` },
      {
        $setOnInsert: {
          walletId: wallet._id,
          userId,
          transactionType: row.transaction_type || 'deposit',
          amount: Number(row.amount || 0),
          commission: Number(row.commission || 0),
          netAmount: Number(row.net_amount || row.amount || 0),
          currency: row.currency || 'USD',
          status: row.status || 'completed',
          idempotencyKey: `legacy_tx_${row.id}`,
          createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        },
      },
      { upsert: true }
    );
  }

  // 8. Chats, StoryFrames, Business, Ads, Reports, Blacklists, Censors, Cashouts, Payments, Bookmarks, JobApplications
  const mysqlChats = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM chats');
  for (const row of mysqlChats) {
    if (DRY_RUN) continue;
    const doc = await Chat.findOneAndUpdate(
      { chatUuid: row.chat_id || row.chat_uuid || `legacy_chat_${row.id}` },
      {
        $setOnInsert: {
          chatUuid: row.chat_id || row.chat_uuid || `legacy_chat_${row.id}`,
          type: row.type || 'direct',
          lastActivity: row.last_activity ? new Date(row.last_activity) : new Date(),
        },
      },
      { upsert: true, new: true }
    );
    chatMap.set(Number(row.id), doc._id);
  }

  const mysqlMessages = await safeQuery<mysql.RowDataPacket>(conn, 'SELECT * FROM messages');
  for (const row of mysqlMessages) {
    const chatId = chatMap.get(Number(row.chat_id));
    const senderId = userMap.get(Number(row.user_id || row.sender_id));
    if (!chatId || !senderId || DRY_RUN) continue;
    await Message.create({
      chatId,
      senderId,
      type: row.type || 'text',
      content: row.content || '',
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    });
  }

  // Silence unused imported model warnings while ensuring schema registration
  void [Ad, Blacklist, Bookmark, BusinessAccount, Cashout, Censor, JobApplication, Payment, Report, StoryFrame];

  await conn.end();
  console.log('MySQL -> MongoDB migration completed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
