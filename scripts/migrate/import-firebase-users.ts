import '../load-env';
import { connectDB } from '../../src/lib/db';
import { getFirebaseAuth } from '../../src/lib/firebase/admin';
import { User } from '../../src/models';

async function main() {
  await connectDB();
  const auth = getFirebaseAuth();

  const users = await User.find({
    deletedAt: null,
    $or: [{ firebaseUid: null }, { firebaseUid: '' }],
  })
    .select('+legacyPasswordHash email firstName lastName avatar emailVerifiedAt')
    .lean();

  console.log(`Found ${users.length} users to import into Firebase Auth.`);
  if (users.length === 0) process.exit(0);

  const batchSize = 100;
  for (let i = 0; i < users.length; i += batchSize) {
    const chunk = users.slice(i, i + batchSize);
    const importPayload = chunk.map((u) => {
      const uid = `cp_${String(u._id)}`;
      const base = {
        uid,
        email: u.email,
        displayName: `${u.firstName} ${u.lastName}`.trim(),
        emailVerified: Boolean(u.emailVerifiedAt),
      };
      if (u.legacyPasswordHash) {
        return {
          ...base,
          passwordHash: Buffer.from(u.legacyPasswordHash),
        };
      }
      return base;
    });

    const result = await auth.importUsers(importPayload, {
      hash: { algorithm: 'BCRYPT' },
    });

    const failedIndices = new Set(result.errors.map((e) => e.index));
    for (let j = 0; j < chunk.length; j++) {
      if (failedIndices.has(j)) continue;
      await User.updateOne(
        { _id: chunk[j]._id },
        { $set: { firebaseUid: `cp_${String(chunk[j]._id)}` } }
      );
    }

    console.log(
      `Batch ${i / batchSize + 1}: imported=${result.successCount}, failed=${result.failureCount}`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Firebase user import failed:', err);
  process.exit(1);
});
