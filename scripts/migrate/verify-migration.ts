import '../load-env';
import { connectDB } from '../../src/lib/db';
import {
  Chat,
  Comment,
  JobListing,
  Media,
  Message,
  Post,
  Product,
  User,
  Wallet,
  WalletTransaction,
} from '../../src/models';

async function main() {
  await connectDB();

  const [
    users,
    usersWithFirebase,
    posts,
    comments,
    products,
    jobs,
    chats,
    messages,
    wallets,
    transactions,
    mediaCount,
  ] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    User.countDocuments({ deletedAt: null, firebaseUid: { $nin: [null, ''] } }),
    Post.countDocuments({}),
    Comment.countDocuments({}),
    Product.countDocuments({}),
    JobListing.countDocuments({}),
    Chat.countDocuments({}),
    Message.countDocuments({}),
    Wallet.countDocuments({}),
    WalletTransaction.countDocuments({}),
    Media.countDocuments({}),
  ]);

  console.table({
    users,
    usersWithFirebase,
    posts,
    comments,
    products,
    jobs,
    chats,
    messages,
    wallets,
    transactions,
    mediaCount,
  });

  if (users > 0 && usersWithFirebase < users) {
    console.warn(`Warning: ${users - usersWithFirebase} migrated users still lack a Firebase UID.`);
  }

  console.log('Migration verification check finished.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
